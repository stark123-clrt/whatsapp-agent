import "server-only";

import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { instructionsText } from "./agent-settings";
import { generateReply } from "./ai";
import {
  campaignWithDefaults,
  type Campaign,
  type CampaignPost,
  type CampaignSettings,
  type CampaignStatus,
  type PostKind,
  type PostStatus,
  type VisualSource,
} from "./campaign-types";
import { renderProductVisual, renderVisual } from "./campaign-visuals";
import { formatPrice, freshCatalog, getProduct, listProducts, type Product } from "./catalog";
import { db, MEDIA_DIR } from "./db";
import { instagramConnected, publishInstagram } from "./instagram";
import { getAgent } from "./kb";
import { canPublish } from "./publish-limits";

/**
 * Campagnes Instagram : l'IA prépare 1 à 3 contenus par jour (publications et stories) aux heures choisies,
 * tu les valides (ou publication automatique), puis ils sont publiés sur le compte Instagram connecté.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    agent_id INTEGER,
    status TEXT NOT NULL DEFAULT 'draft',
    starts_on TEXT NOT NULL,
    ends_on TEXT NOT NULL,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS campaign_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    slot_key TEXT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    scheduled_at INTEGER NOT NULL,
    headline TEXT,
    caption TEXT,
    visual TEXT NOT NULL,
    image_file TEXT,
    background_file TEXT,
    media_id TEXT,
    media_code TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    published_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS campaign_posts_slot ON campaign_posts(campaign_id, slot_key);
`);
{
  const cols = new Set((db.prepare(`PRAGMA table_info(campaign_posts)`).all() as { name: string }[]).map((c) => c.name));
  if (!cols.has("product_id")) db.exec(`ALTER TABLE campaign_posts ADD COLUMN product_id INTEGER`);
  if (!cols.has("product_title")) db.exec(`ALTER TABLE campaign_posts ADD COLUMN product_title TEXT`);
  if (!cols.has("price_cents")) db.exec(`ALTER TABLE campaign_posts ADD COLUMN price_cents INTEGER`);
}

type CampaignRow = { id: number; name: string; agent_id: number | null; status: CampaignStatus; starts_on: string; ends_on: string; settings: string; created_at: number; updated_at: number };
type PostRow = {
  id: number;
  campaign_id: number;
  kind: PostKind;
  status: PostStatus;
  scheduled_at: number;
  headline: string | null;
  caption: string | null;
  visual: VisualSource;
  image_file: string | null;
  background_file: string | null;
  media_id: string | null;
  media_code: string | null;
  error: string | null;
  created_at: number;
  published_at: number | null;
  product_id: number | null;
  product_title: string | null;
  price_cents: number | null;
};

const toCampaign = (r: CampaignRow): Campaign => {
  let raw: unknown = {};
  try {
    raw = JSON.parse(r.settings);
  } catch {
    raw = {};
  }
  return { id: r.id, name: r.name, agentId: r.agent_id, status: r.status, startsOn: r.starts_on, endsOn: r.ends_on, settings: campaignWithDefaults(raw), createdAt: r.created_at, updatedAt: r.updated_at };
};
const toPost = (r: PostRow): CampaignPost => ({
  id: r.id,
  campaignId: r.campaign_id,
  kind: r.kind,
  status: r.status,
  scheduledAt: r.scheduled_at,
  headline: r.headline,
  caption: r.caption,
  visual: r.visual,
  imageFile: r.image_file,
  mediaId: r.media_id,
  mediaCode: r.media_code,
  error: r.error,
  createdAt: r.created_at,
  publishedAt: r.published_at,
  productId: r.product_id,
  productTitle: r.product_title,
});

export function listCampaigns(): Campaign[] {
  return (db.prepare(`SELECT * FROM campaigns ORDER BY created_at DESC`).all() as CampaignRow[]).map(toCampaign);
}
export function getCampaign(id: number): Campaign | null {
  const r = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id) as CampaignRow | undefined;
  return r ? toCampaign(r) : null;
}
export function listPosts(campaignId: number): CampaignPost[] {
  return (db.prepare(`SELECT * FROM campaign_posts WHERE campaign_id = ? ORDER BY scheduled_at`).all(campaignId) as PostRow[]).map(toPost);
}
export function getPost(id: number): CampaignPost | null {
  const r = db.prepare(`SELECT * FROM campaign_posts WHERE id = ?`).get(id) as PostRow | undefined;
  return r ? toPost(r) : null;
}
export function postCounts(): Record<number, Partial<Record<PostStatus, number>>> {
  const rows = db.prepare(`SELECT campaign_id, status, COUNT(*) AS n FROM campaign_posts GROUP BY campaign_id, status`).all() as { campaign_id: number; status: PostStatus; n: number }[];
  const out: Record<number, Partial<Record<PostStatus, number>>> = {};
  for (const r of rows) (out[r.campaign_id] ??= {})[r.status] = r.n;
  return out;
}

export type CampaignInput = { name?: string; agentId?: number | null; startsOn?: string; endsOn?: string; settings?: Partial<CampaignSettings>; status?: CampaignStatus };
const dateOk = (d?: string) => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d));

export function createCampaign(input: CampaignInput): Campaign {
  const now = Date.now();
  const today = parisDate(now);
  const startsOn = dateOk(input.startsOn) ? input.startsOn! : today;
  const endsOn = dateOk(input.endsOn) && input.endsOn! >= startsOn ? input.endsOn! : addDays(startsOn, 30);
  const id = Number(
    db
      .prepare(`INSERT INTO campaigns (name, agent_id, status, starts_on, ends_on, settings, created_at, updated_at) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?)`)
      .run((input.name ?? "").trim().slice(0, 80) || "Nouvelle campagne", input.agentId ?? null, startsOn, endsOn, JSON.stringify(campaignWithDefaults(input.settings)), now, now).lastInsertRowid,
  );
  return getCampaign(id)!;
}

export function updateCampaign(id: number, input: CampaignInput): Campaign | null {
  const c = getCampaign(id);
  if (!c) return null;
  const startsOn = dateOk(input.startsOn) ? input.startsOn! : c.startsOn;
  const endsOn = dateOk(input.endsOn) ? input.endsOn! : c.endsOn;
  const settings = input.settings ? campaignWithDefaults({ ...c.settings, ...input.settings }) : c.settings;
  db.prepare(`UPDATE campaigns SET name = ?, agent_id = ?, status = ?, starts_on = ?, ends_on = ?, settings = ?, updated_at = ? WHERE id = ?`).run(
    input.name !== undefined ? input.name.trim().slice(0, 80) || c.name : c.name,
    input.agentId !== undefined ? input.agentId : c.agentId,
    input.status ?? c.status,
    startsOn,
    endsOn < startsOn ? startsOn : endsOn,
    JSON.stringify(settings),
    Date.now(),
    id,
  );
  // Réglages changés : les contenus pas encore validés seront préparés à nouveau.
  if (input.settings) db.prepare(`DELETE FROM campaign_posts WHERE campaign_id = ? AND status IN ('pending', 'generating') AND scheduled_at > ?`).run(id, Date.now());
  return getCampaign(id);
}

export async function deleteCampaign(id: number) {
  for (const p of listPosts(id)) await removeFiles(p.id);
  db.prepare(`DELETE FROM campaign_posts WHERE campaign_id = ?`).run(id);
  db.prepare(`DELETE FROM campaigns WHERE id = ?`).run(id);
}

async function removeFiles(postId: number) {
  const r = db.prepare(`SELECT image_file, background_file FROM campaign_posts WHERE id = ?`).get(postId) as { image_file: string | null; background_file: string | null } | undefined;
  for (const f of [r?.image_file, r?.background_file]) if (f) await rm(path.join(MEDIA_DIR, path.basename(f)), { force: true });
}

// ---------- Heures (fuseau de Paris) ----------

const TZ = "Europe/Paris";
function parisDate(ts: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(ts);
}
function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** « 2026-11-27 » + « 13:00 » (heure de Paris) → horodatage. */
function parisTime(date: string, hhmm: string) {
  const guess = Date.parse(`${date}T${hhmm}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asParis = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return guess - (asParis - guess);
}

// ---------- Calendrier ----------

/** Crée les contenus des prochaines 36 h (sans doublon) pour une campagne active. */
export function planCampaign(c: Campaign): number {
  if (c.status !== "active") return 0;
  const now = Date.now();
  let created = 0;
  for (const offset of [0, 1]) {
    const day = addDays(parisDate(now), offset);
    if (day < c.startsOn || day > c.endsOn) continue;
    // Montée en douceur : 1 contenu par jour la première semaine.
    const warm = day < addDays(c.startsOn, 7);
    const perDay = warm ? 1 : c.settings.perDay;
    const slots = (c.settings.slots.length ? c.settings.slots : ["09:30", "13:00", "19:00"]).slice(0, perDay);
    const dayIndex = Math.round((Date.parse(day) - Date.parse(c.startsOn)) / 86_400_000);
    slots.forEach((hhmm, i) => {
      const at = parisTime(day, hhmm) + Math.floor(Math.random() * 12) * 60_000; // quelques minutes de hasard
      if (at < now + 10 * 60_000 || at > now + 36 * 3_600_000) return;
      const kinds: PostKind[] = [c.settings.formats.post ? "post" : null, c.settings.formats.story ? "story" : null].filter(Boolean) as PostKind[];
      if (!kinds.length) return;
      const kind = kinds[(dayIndex + i) % kinds.length];
      if (db.prepare(`SELECT 1 FROM campaign_posts WHERE campaign_id = ? AND slot_key = ?`).get(c.id, `${day}#${i}`)) return;
      const product = c.settings.objective === "sales" ? pickProduct(c) : null;
      const res = db
        .prepare(`INSERT OR IGNORE INTO campaign_posts (campaign_id, slot_key, kind, status, scheduled_at, visual, product_id, product_title, created_at) VALUES (?, ?, ?, 'generating', ?, ?, ?, ?, ?)`)
        .run(c.id, `${day}#${i}`, kind, at, product ? "product" : "card", product?.id ?? null, product?.title ?? null, now);
      created += Number(res.changes);
    });
  }
  return created;
}

// ---------- Produits (campagnes de vente) ----------

/** Produits utilisables : sélection de la campagne (ou tout le catalogue), disponibles, avec photo et prix. */
export function campaignProducts(c: Campaign): Product[] {
  if (!c.agentId) return [];
  const all = listProducts(c.agentId).filter((p) => p.available && p.imageFile && p.priceCents);
  const picked = c.settings.productIds.length ? all.filter((p) => c.settings.productIds.includes(p.id)) : all;
  return picked;
}

/** Rotation : le produit le moins mis en avant dans cette campagne (jamais le même deux fois de suite). */
function pickProduct(c: Campaign): Product | null {
  const products = campaignProducts(c);
  if (!products.length) return null;
  const uses = new Map(
    (db.prepare(`SELECT product_id, COUNT(*) AS n, MAX(created_at) AS last FROM campaign_posts WHERE campaign_id = ? AND product_id IS NOT NULL GROUP BY product_id`).all(c.id) as {
      product_id: number;
      n: number;
      last: number;
    }[]).map((r) => [r.product_id, r]),
  );
  return [...products].sort((x, y) => {
    const ux = uses.get(x.id);
    const uy = uses.get(y.id);
    return (ux?.n ?? 0) - (uy?.n ?? 0) || (ux?.last ?? 0) - (uy?.last ?? 0) || Math.random() - 0.5;
  })[0];
}

// ---------- Rédaction et visuel ----------

type Draft = { headline: string; caption: string; hashtags: string[] };

function parseDraft(text: string): Draft {
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const d = JSON.parse(json) as Partial<Draft>;
  if (!d.headline || !d.caption) throw new Error("Réponse de l'IA incomplète.");
  return {
    headline: String(d.headline).slice(0, 110),
    caption: String(d.caption).slice(0, 1800),
    hashtags: (Array.isArray(d.hashtags) ? d.hashtags : []).map((h) => String(h).replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean).slice(0, 12),
  };
}

/** Lien suivi (pour mesurer les visites venues d'Instagram) : fiche produit, sinon le site. */
function trackedLink(c: Campaign, url?: string | null) {
  const link = (url || c.settings.link).trim();
  if (!/^https?:\/\//.test(link)) return "";
  try {
    const u = new URL(link);
    if (!u.searchParams.has("utm_source")) {
      u.searchParams.set("utm_source", "instagram");
      u.searchParams.set("utm_medium", "social");
      u.searchParams.set("utm_campaign", c.name.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "campagne");
    }
    return u.toString();
  } catch {
    return "";
  }
}

async function writeDraft(c: Campaign, kind: PostKind, product: Product | null): Promise<Draft> {
  const agent = c.agentId ? getAgent(c.agentId) : null;
  const s = c.settings;
  const recent = (db.prepare(`SELECT headline FROM campaign_posts WHERE campaign_id = ? AND headline IS NOT NULL ORDER BY id DESC LIMIT 12`).all(c.id) as { headline: string }[]).map((r) => `- ${r.headline}`);
  const brief = [
    `Marque : ${agent?.name ?? c.name}${agent?.website ? ` (${agent.website})` : ""}.`,
    `Objectif : ${{ sales: "vendre", traffic: "amener des visites sur le site", awareness: "faire connaître la marque", promo: "mettre en avant une promotion / un événement" }[s.objective]}.`,
    s.audience && `Public visé : ${s.audience}.`,
    `Ton : ${{ pro: "professionnel", warm: "chaleureux et proche", fun: "fun et dynamique", luxury: "haut de gamme, élégant" }[s.tone]}.`,
    s.offer.enabled && s.offer.text && `Offre à mettre en avant : ${s.offer.text}${s.offer.code ? ` (code ${s.offer.code})` : ""}${s.offer.until ? `, valable jusqu'au ${s.offer.until}` : ""}.`,
    s.mentions && `À mentionner quand c'est pertinent : ${s.mentions}.`,
    s.forbidden && `Sujets INTERDITS : ${s.forbidden}.`,
    product &&
      [
        `PRODUIT MIS EN AVANT : « ${product.title} ».`,
        product.description && `Description du site : ${product.description}`,
        "Le prix est affiché sur l'image : ne l'écris PAS dans le titre ni dans la légende (il peut changer).",
      ]
        .filter(Boolean)
        .join("\n"),
  ].filter(Boolean);

  const system = [
    "Tu es le community manager Instagram de cette marque. Tu écris en français, avec des contenus variés, concrets et qui donnent envie, jamais génériques.",
    "Informations sur l'entreprise (instructions de son agent IA) :",
    agent ? instructionsText(agent.settings).slice(0, 6000) : "(aucune)",
  ].join("\n\n");

  const headlineSpec = product
    ? "phrase d'accroche affichée au-dessus du nom du produit, 4 à 8 mots, sans le nom ni le prix"
    : `titre accrocheur affiché sur l'image, ${kind === "story" ? "6 à 10" : "4 à 9"} mots`;
  const user = [
    `Crée ${kind === "story" ? "une STORY Instagram (le texte est uniquement sur l'image, très court)" : "une PUBLICATION Instagram (image + légende)"}.`,
    ...brief,
    recent.length ? `Accroches déjà utilisées (ne les répète pas, change d'angle) :\n${recent.join("\n")}` : "",
    "Réponds UNIQUEMENT avec un objet JSON :",
    `{"headline": "${headlineSpec}", "caption": "${kind === "story" ? "une phrase" : "légende de 3 à 6 courtes lignes, avec 1 ou 2 émojis et un appel à l'action (écrire en message privé ou commenter)"}", "hashtags": ["5 à 8 hashtags pertinents, sans #"]}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseDraft(await generateReply([{ role: "system", content: system }, { role: "user", content: user }], { temperature: 0.9, maxTokens: 2500 }));
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("Rédaction impossible.");
}

/** « https://www.ubfparis.com/boutique » → « ubfparis.com » (affiché sur les visuels et dans les légendes). */
export function siteName(link: string | null | undefined): string {
  try {
    return link ? new URL(link).hostname.replace(/^www[.]/, "") : "";
  } catch {
    return "";
  }
}

function fullCaption(c: Campaign, kind: PostKind, d: Draft) {
  if (kind === "story") return d.caption;
  const tags = [...c.settings.hashtags, ...(c.settings.autoHashtags ? d.hashtags : [])];
  const unique = [...new Set(tags.map((t) => t.toLowerCase()))].slice(0, 15);
  // Le lien n'est pas cliquable dans une légende Instagram : le nom du site reste lisible et facile à taper.
  const site = siteName(c.settings.link);
  return [d.caption, site ? `👉 ${site} · lien en bio` : "", unique.length ? unique.map((t) => `#${t}`).join(" ") : ""].filter(Boolean).join("\n\n");
}

async function dataUrl(file: string | null | undefined) {
  if (!file) return null;
  const data = await readFile(path.join(MEDIA_DIR, path.basename(file))).catch(() => null);
  if (!data) return null;
  const type = file.endsWith(".png") ? "image/png" : file.endsWith(".svg") ? "image/svg+xml" : "image/jpeg";
  return `data:${type};base64,${data.toString("base64")}`;
}

/** Crée le visuel (fiche produit ou carte de marque) ; renvoie le PNG et le prix affiché. */
async function makeVisual(c: Campaign, kind: PostKind, headline: string, product: Product | null): Promise<{ png: Buffer; priceCents: number | null }> {
  const agent = c.agentId ? getAgent(c.agentId) : null;
  const logo = await dataUrl(c.settings.brand.logo);
  const brandName = agent?.name ?? c.name;
  const badge = c.settings.offer.enabled && c.settings.offer.code ? `Code ${c.settings.offer.code}` : null;
  const image = product ? await dataUrl(product.imageFile) : null;
  if (product && image && product.priceCents) {
    const promo = product.compareCents && product.compareCents > product.priceCents;
    return {
      priceCents: product.priceCents,
      png: await renderProductVisual({
        kind,
        hook: headline,
        title: product.title,
        price: formatPrice(product.priceCents, product.currency),
        compareAt: promo ? formatPrice(product.compareCents, product.currency) : null,
        discount: promo ? `-${Math.round((1 - product.priceCents / product.compareCents!) * 100)} %` : null,
        image,
        brandName,
        logo,
        color: c.settings.brand.color,
        textColor: c.settings.brand.textColor,
        badge,
        footer: kind === "post" ? siteName(product.url || c.settings.link) || "Lien en bio" : null,
      }),
    };
  }
  return {
    priceCents: null,
    png: await renderVisual({
      kind,
      headline,
      brandName,
      logo,
      color: c.settings.brand.color,
      textColor: c.settings.brand.textColor,
      badge,
      footer: kind === "post" ? siteName(c.settings.link) || null : null,
    }),
  };
}

/** Rédige le contenu et crée son visuel ; le contenu passe « à valider » (ou « programmé » en automatique). */
export async function generatePost(postId: number, keepText = false) {
  const p = getPost(postId);
  const c = p ? getCampaign(p.campaignId) : null;
  if (!p || !c) return;
  try {
    // Produit retiré ou indisponible : on en choisit un autre.
    let product = p.productId ? getProduct(p.productId) : null;
    if (p.visual === "product" && (!product || !product.available || !product.imageFile)) {
      product = c.settings.objective === "sales" ? pickProduct(c) : null;
      keepText = false;
    }
    const draft: Draft = keepText && p.headline && p.caption ? { headline: p.headline, caption: p.caption, hashtags: [] } : await writeDraft(c, p.kind, product);
    const caption = keepText && p.caption ? p.caption : fullCaption(c, p.kind, draft);
    const { png, priceCents } = await makeVisual(c, p.kind, draft.headline, product);
    await removeFiles(postId);
    const image = `campaign-${c.id}-${postId}-${Date.now()}.png`;
    await writeFile(path.join(MEDIA_DIR, image), png);
    const next: PostStatus = c.settings.approval === "auto" ? "scheduled" : "pending";
    db.prepare(
      `UPDATE campaign_posts SET headline = ?, caption = ?, image_file = ?, background_file = NULL, visual = ?, product_id = ?, product_title = ?, price_cents = ?, status = ?, error = NULL WHERE id = ?`,
    ).run(draft.headline, caption, image, product ? "product" : "card", product?.id ?? null, product?.title ?? null, priceCents, p.status === "scheduled" ? "scheduled" : next, postId);
  } catch (err) {
    db.prepare(`UPDATE campaign_posts SET status = 'failed', error = ? WHERE id = ?`).run(err instanceof Error ? err.message.slice(0, 300) : "Préparation impossible.", postId);
  }
}

/** Modification à la main : nouveau titre et/ou légende (le visuel est refait). */
export async function editPost(postId: number, patch: { headline?: string; caption?: string }) {
  const p = getPost(postId);
  if (!p || p.status === "published" || p.status === "publishing") return;
  db.prepare(`UPDATE campaign_posts SET headline = ?, caption = ? WHERE id = ?`).run(
    patch.headline?.trim().slice(0, 110) || p.headline,
    patch.caption?.trim().slice(0, 2200) || p.caption,
    postId,
  );
  await generatePost(postId, true);
}

export function setPostStatus(postId: number, status: PostStatus, scheduledAt?: number) {
  db.prepare(`UPDATE campaign_posts SET status = ?, scheduled_at = COALESCE(?, scheduled_at), error = NULL WHERE id = ?`).run(status, scheduledAt ?? null, postId);
}

/** « Préparer un contenu maintenant » (hors calendrier, pour essayer). */
export function addManualPost(campaignId: number, kind: PostKind): number {
  const c = getCampaign(campaignId);
  if (!c) return 0;
  const product = c.settings.objective === "sales" ? pickProduct(c) : null;
  const res = db
    .prepare(`INSERT INTO campaign_posts (campaign_id, slot_key, kind, status, scheduled_at, visual, product_id, product_title, created_at) VALUES (?, NULL, ?, 'generating', ?, ?, ?, ?, ?)`)
    .run(campaignId, kind, Date.now() + 3_600_000, product ? "product" : "card", product?.id ?? null, product?.title ?? null, Date.now());
  return Number(res.lastInsertRowid);
}

// ---------- Publication ----------

async function publish(post: CampaignPost) {
  let p = post;
  const c = getCampaign(p.campaignId);
  if (!c || !p.imageFile) return;
  if (p.productId && c.agentId) {
    await freshCatalog(c.agentId); // catalogue de plus de 6 h : relu sur le site
    const product = getProduct(p.productId);
    if (!product || !product.available) {
      db.prepare(`UPDATE campaign_posts SET status = 'failed', error = ? WHERE id = ?`).run("Produit plus disponible sur le site : contenu non publié. Régénère-le pour un autre produit.", p.id);
      return;
    }
    const shown = (db.prepare(`SELECT price_cents FROM campaign_posts WHERE id = ?`).get(p.id) as { price_cents: number | null }).price_cents;
    if (product.priceCents !== shown) {
      // Le prix a changé sur le site : le visuel est refait avec le bon prix avant de publier.
      await generatePost(p.id, true);
      const fresh = getPost(p.id);
      if (!fresh?.imageFile || fresh.status === "failed") return;
      p = fresh;
    }
  }
  if (!p.imageFile) return;
  const file = path.join(MEDIA_DIR, path.basename(p.imageFile));
  if (!existsSync(file)) {
    db.prepare(`UPDATE campaign_posts SET status = 'failed', error = 'Visuel introuvable : régénère le contenu.' WHERE id = ?`).run(p.id);
    return;
  }
  db.prepare(`UPDATE campaign_posts SET status = 'publishing' WHERE id = ?`).run(p.id);
  try {
    const productUrl = p.productId ? getProduct(p.productId)?.url : null;
    const res = await publishInstagram(p.kind, file, p.caption ?? "", p.kind === "story" ? trackedLink(c, productUrl) : "");
    db.prepare(`UPDATE campaign_posts SET status = 'published', media_id = ?, media_code = ?, published_at = ?, error = NULL WHERE id = ?`).run(res.id, res.code ?? null, Date.now(), p.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Publication impossible.";
    db.prepare(`UPDATE campaign_posts SET status = 'failed', error = ? WHERE id = ?`).run(msg.slice(0, 300), p.id);
    // Instagram se méfie (vérification, limite) : on met la campagne en pause pour protéger le compte.
    if (/vérif|limit|session|patienter|challenge|login/i.test(msg)) {
      db.prepare(`UPDATE campaigns SET status = 'paused', updated_at = ? WHERE id = ?`).run(Date.now(), c.id);
    }
  }
}

export async function publishNow(postId: number) {
  const p = getPost(postId);
  if (!p || !["pending", "scheduled", "failed"].includes(p.status)) throw new Error("Ce contenu ne peut pas être publié.");
  if (!instagramConnected()) throw new Error("Instagram n'est pas connecté.");
  const verdict = canPublish(p.kind);
  if (!verdict.ok) throw new Error(`${verdict.reason} Tu peux le valider : il partira dès que possible.`);
  await publish(p);
  const after = getPost(postId);
  if (after?.status === "failed") throw new Error(after.error ?? "Publication impossible.");
}

// ---------- Tâche de fond ----------

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const today = parisDate(Date.now());
    for (const c of listCampaigns()) {
      if (c.status === "active" && c.endsOn < today) {
        db.prepare(`UPDATE campaigns SET status = 'ended', updated_at = ? WHERE id = ?`).run(Date.now(), c.id);
        continue;
      }
      planCampaign(c);
    }
    // Préparation : 2 contenus au maximum par minute (appels à l'IA).
    const todo = db.prepare(`SELECT id FROM campaign_posts WHERE status = 'generating' ORDER BY scheduled_at LIMIT 2`).all() as { id: number }[];
    for (const { id } of todo) await generatePost(id);
    // Publication : un contenu à la fois, seulement si la campagne est active et Instagram connecté.
    if (instagramConnected()) {
      const due = db
        .prepare(
          `SELECT p.* FROM campaign_posts p JOIN campaigns c ON c.id = p.campaign_id
           WHERE p.status = 'scheduled' AND p.scheduled_at <= ? AND c.status = 'active' ORDER BY p.scheduled_at LIMIT 1`,
        )
        .get(Date.now()) as PostRow | undefined;
      if (due) {
        // Rythme du compte (toutes campagnes) : quota du jour et écart minimum entre deux publications.
        const verdict = canPublish(due.kind);
        if (verdict.ok) await publish(toPost(due));
        else if (verdict.nextDay) {
          // Quota atteint : décalé au lendemain, à la même heure.
          const moved = due.scheduled_at + Math.ceil((verdict.retryAt - due.scheduled_at) / 86_400_000) * 86_400_000;
          db.prepare(`UPDATE campaign_posts SET scheduled_at = ?, error = ? WHERE id = ?`).run(moved, `Décalé : ${verdict.reason}`, due.id);
        }
        // Écart minimum pas encore atteint : le contenu attend la prochaine minute utile.
      }
    }
  } catch (err) {
    console.error(`[campagnes] ${err instanceof Error ? err.message : err}`);
  } finally {
    busy = false;
  }
}

const g = globalThis as typeof globalThis & { __campaignTimer?: NodeJS.Timeout };
export function startCampaignScheduler() {
  if (g.__campaignTimer) return;
  g.__campaignTimer = setInterval(() => void tick(), 60_000);
}
export const runCampaignTick = tick;
