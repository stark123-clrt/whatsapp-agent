import "server-only";

import { db } from "./db";

/**
 * Ce que l'agent sait de SES campagnes et de SON catalogue, sur tous les canaux (WhatsApp, Instagram, site web) :
 * - les campagnes qui lui sont rattachées (objectif, offre, code promo, lien) ;
 * - ce qu'elles ont publié (publications et stories, avec produit, prix et lien) ;
 * - les produits de son catalogue (prix à jour, lien de la fiche).
 * Un agent ne voit jamais les campagnes ni les produits d'un autre agent.
 */

type Published = {
  kind: "post" | "story";
  headline: string | null;
  published_at: number;
  title: string | null;
  price_cents: number | null;
  currency: string | null;
  url: string | null;
};

const price = (cents: number | null, currency: string | null) =>
  cents === null ? "" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

function describe(p: Published) {
  const what = p.kind === "story" ? "Story" : "Publication";
  const when = new Date(p.published_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const product = p.title ? ` — produit « ${p.title} »${p.price_cents ? ` à ${price(p.price_cents, p.currency)}` : ""}${p.url ? `, fiche : ${p.url}` : ""}` : "";
  return `${what} Instagram du ${when} : « ${p.headline ?? ""} »${product}`;
}

const SELECT = `
  SELECT p.kind, p.headline, p.published_at, pr.title, COALESCE(pr.price_cents, p.price_cents) AS price_cents, pr.currency, pr.url
  FROM campaign_posts p
  JOIN campaigns c ON c.id = p.campaign_id
  LEFT JOIN products pr ON pr.id = p.product_id`;

/** Contenu publié correspondant à un identifiant Instagram (réponse à une story ou à une publication). */
export function publishedByMediaId(mediaId: string): string | null {
  try {
    const p = db.prepare(`${SELECT} WHERE p.status = 'published' AND (p.media_id = ? OR p.media_id LIKE ?) LIMIT 1`).get(mediaId, `${mediaId}_%`) as Published | undefined;
    return p ? describe(p) : null;
  } catch {
    return null; // campagnes pas encore utilisées
  }
}

type CampaignRow = { name: string; status: string; starts_on: string; ends_on: string; settings: string };
const OBJECTIVE: Record<string, string> = { sales: "vendre", traffic: "amener des visites sur le site", awareness: "faire connaître la marque", promo: "promotion / événement" };

/** Campagnes de l'agent (en cours ou récentes) et leurs contenus publiés des 7 derniers jours. */
function campaignsContext(agentId: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(Date.now());
  const campaigns = db
    .prepare(`SELECT name, status, starts_on, ends_on, settings FROM campaigns WHERE agent_id = ? AND status IN ('active', 'paused', 'ended') AND ends_on >= date(?, '-3 day') ORDER BY created_at DESC LIMIT 5`)
    .all(agentId, today) as CampaignRow[];
  const published = db.prepare(`${SELECT} WHERE c.agent_id = ? AND p.status = 'published' AND p.published_at > ? ORDER BY p.published_at DESC LIMIT 12`).all(agentId, Date.now() - 7 * 86_400_000) as Published[];
  if (!campaigns.length && !published.length) return "";

  const lines = ["TES CAMPAGNES INSTAGRAM (un client peut en parler sur n'importe quel canal : « j'ai vu votre pub », « ta story », « la promo ») :"];
  for (const c of campaigns) {
    let s: { objective?: string; link?: string; offer?: { enabled?: boolean; text?: string; code?: string; until?: string } } = {};
    try {
      s = JSON.parse(c.settings);
    } catch {
      s = {};
    }
    const live = c.status === "active" && c.starts_on <= today && c.ends_on >= today;
    const offer = s.offer?.enabled && s.offer.text ? ` Offre : ${s.offer.text}${s.offer.code ? ` avec le code ${s.offer.code}` : ""}${s.offer.until ? ` (valable jusqu'au ${s.offer.until})` : ""}.` : "";
    lines.push(`- « ${c.name} » (${live ? "en cours" : "terminée ou en pause : ne la présente plus comme actuelle"}, du ${c.starts_on} au ${c.ends_on}) — objectif : ${OBJECTIVE[s.objective ?? ""] ?? "?"}.${offer}${s.link ? ` Site : ${s.link}` : ""}`);
  }
  if (published.length) {
    lines.push("Contenus publiés récemment (le plus récent d'abord) :", ...published.map((p) => `- ${describe(p)}`));
    lines.push("Si un client parle d'une story ou d'une publication sans préciser, appuie-toi sur cette liste au lieu de dire que tu n'y as pas accès. En cas de doute entre plusieurs, propose-les brièvement.");
  }
  return lines.join("\n");
}

type ProductRow = { title: string; price_cents: number | null; compare_cents: number | null; currency: string; url: string | null; description: string | null };

/** Catalogue de l'agent : les produits les plus pertinents pour la conversation (prix à jour, liens). */
function catalogContext(agentId: number, recentText: string): string {
  const all = db.prepare(`SELECT title, price_cents, compare_cents, currency, url, description FROM products WHERE agent_id = ? AND available = 1 ORDER BY title COLLATE NOCASE`).all(agentId) as ProductRow[];
  if (!all.length) return "";
  let shown = all;
  if (all.length > 60) {
    // Grand catalogue : les produits qui correspondent aux mots du client d'abord.
    const plain = (t: string) => t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, ""); // sans accents
    const words = plain(recentText).match(/[a-z]{4,}/g) ?? [];
    const score = (p: ProductRow) => {
      const t = plain(`${p.title} ${p.description ?? ""}`);
      return words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
    };
    shown = [...all].sort((a, b) => score(b) - score(a)).slice(0, 40);
  }
  return [
    `TON CATALOGUE (${all.length} produits disponibles${shown.length < all.length ? `, les ${shown.length} plus pertinents ici` : ""}). Prix et liens à jour : utilise-les tels quels, n'invente jamais un produit ni un prix.`,
    ...shown.map((p) => {
      const promo = p.compare_cents && p.price_cents && p.compare_cents > p.price_cents ? ` (au lieu de ${price(p.compare_cents, p.currency)})` : "";
      return `- ${p.title} — ${price(p.price_cents, p.currency) || "prix sur le site"}${promo}${p.url ? ` — ${p.url}` : ""}`;
    }),
    "Quand un client est intéressé par un produit, envoie-lui le lien complet de sa fiche (https://…) dans ta réponse : il est cliquable en message privé.",
  ].join("\n");
}

/** Bloc ajouté aux instructions de l'agent, sur tous les canaux. */
export function agentMarketingContext(agentId: number, recentText = ""): string {
  try {
    return [campaignsContext(agentId), catalogContext(agentId, recentText)].filter(Boolean).join("\n\n");
  } catch {
    return ""; // tables pas encore créées (aucune campagne ni catalogue)
  }
}
