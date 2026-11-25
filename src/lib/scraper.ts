import "server-only";

import { browserPath, renderPage } from "./browser";

/**
 * Lecture robuste d'un site web, quel que soit son type :
 *  1. lecture rapide du HTML (bon encodage, 2 tentatives) ;
 *  2. si la page est vide / faite en JavaScript (React, Vue, Wix, Shopify…) : affichage dans un
 *     vrai navigateur invisible (Chrome/Edge de la machine) qui fait défiler la page ;
 *  3. en secours : navigateur de Cloudflare (si la permission est active).
 * La découverte des pages combine robots.txt, sitemaps, liens de l'accueil, liens affichés
 * par JavaScript et une exploration d'un niveau supplémentaire.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_TEXT = 20_000;
const MIN_STATIC_TEXT = 400; // en dessous : on considère que la page a besoin de JavaScript
const SKIP_PATH =
  /\.(jpe?g|png|gif|webp|avif|svg|ico|zip|rar|mp4|mov|mp3|wav|css|js|mjs|xml|json|woff2?|ttf|eot|exe|dmg)$|\/(wp-admin|wp-json|wp-login|cart|panier|checkout|commande\/paiement|account|compte|login|connexion|logout|register|inscription|feed|tag|author|search|recherche|cdn-cgi)\b/i;

/** Normalise l'adresse saisie (« monsite.com » → « https://monsite.com/ »). */
export function normalizeSite(input: string): URL {
  const raw = input.trim();
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Adresse invalide");
  const h = url.hostname.toLowerCase();
  // On ne lit que des sites publics (pas l'ordinateur ni le réseau local).
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".localhost") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.includes(":") ||
    !h.includes(".")
  ) {
    throw new Error("Seuls les sites web publics peuvent être importés.");
  }
  url.hash = "";
  return url;
}

type Fetched = { text: string; type: string; finalUrl: string; status: number };

/** Télécharge une adresse avec le bon encodage, 2 tentatives en cas d'erreur réseau. */
async function get(url: string, accept = "text/html,application/xhtml+xml"): Promise<Fetched | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "fr,en;q=0.8" },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status >= 500 && attempt === 0) continue; // erreur serveur passagère : on réessaie
      if (!res.ok) return { text: "", type: res.headers.get("content-type") ?? "", finalUrl: res.url || url, status: res.status };
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) return null;
      const type = res.headers.get("content-type") ?? "";
      return { text: decodeBody(buf, type), type, finalUrl: res.url || url, status: res.status };
    } catch {
      if (attempt === 1) return null;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return null;
}

/** Décode le contenu selon son encodage (UTF-8, Latin-1/Windows-1252…). */
function decodeBody(buf: ArrayBuffer, type: string): string {
  const fromHeader = type.match(/charset=([\w-]+)/i)?.[1];
  const head = new TextDecoder("latin1").decode(buf.slice(0, 2048));
  const fromMeta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  const charset = (fromHeader || fromMeta || "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset === "iso-8859-1" ? "windows-1252" : charset).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

const sameSite = (a: string, b: string) => a.replace(/^www\./, "") === b.replace(/^www\./, "");

function cleanUrl(href: string, base: URL): string | null {
  try {
    const u = new URL(href.trim(), base);
    if (!/^https?:$/.test(u.protocol) || !sameSite(u.hostname, base.hostname)) return null;
    u.hash = "";
    // On garde la recherche seulement si elle change le contenu (ex. ?page=2 est ignoré).
    u.search = "";
    if (SKIP_PATH.test(u.pathname)) return null;
    if (/\/page\/\d+\/?$/.test(u.pathname)) return null; // pages de pagination : doublons
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function linksFromHtml(html: string, baseUrl: string): string[] {
  return [...html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#]+)["']/gi)].map((m) => {
    try {
      return new URL(m[1], baseUrl).toString();
    } catch {
      return "";
    }
  });
}

/** Trouve les pages d'un site. Renvoie au plus `limit` adresses, les principales d'abord. */
export async function discoverPages(site: string, limit = 60): Promise<{ site: string; pages: string[] }> {
  let base = normalizeSite(site);
  const found = new Set<string>();
  const add = (href: string, from: URL = base) => {
    const u = cleanUrl(href, from);
    if (u) found.add(u);
  };

  // 0) Accueil : suit les redirections (http → https, www → sans www…).
  const home = await get(base.toString());
  if (home?.finalUrl) base = new URL(home.finalUrl);

  // 1) Sitemaps : ceux déclarés dans robots.txt + les emplacements habituels.
  const sitemaps = new Set([`${base.origin}/sitemap.xml`, `${base.origin}/sitemap_index.xml`, `${base.origin}/wp-sitemap.xml`]);
  const robots = await get(`${base.origin}/robots.txt`, "text/plain");
  for (const m of robots?.text.matchAll(/^\s*sitemap:\s*(\S+)/gim) ?? []) sitemaps.add(m[1]);
  const queue = [...sitemaps];
  for (let i = 0; i < queue.length && i < 10 && found.size < 500; i++) {
    const res = await get(queue[i], "application/xml,text/xml");
    if (!res?.text.includes("<loc")) continue;
    for (const m of res.text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)/gi)) {
      const loc = m[1].replace(/&amp;/g, "&");
      if (/\.xml(\.gz)?(\?|$)/i.test(loc)) {
        if (!queue.includes(loc)) queue.push(loc);
      } else add(loc);
    }
  }

  // 2) Liens de la page d'accueil (HTML brut).
  if (!home?.text && found.size === 0) throw new Error("Impossible d'ouvrir ce site. Vérifie l'adresse.");
  found.add(cleanUrl(base.toString(), base) ?? base.toString());
  for (const l of linksFromHtml(home?.text ?? "", base.toString())) add(l);

  // 3) Site JavaScript : les liens n'apparaissent qu'une fois la page affichée.
  if (found.size < 8 && browserPath()) {
    const rendered = await renderPage(base.toString()).catch(() => null);
    for (const l of rendered?.links ?? []) add(l);
  }

  // 4) Peu de pages : on explore un niveau de plus (les pages liées depuis l'accueil).
  if (found.size < 15) {
    const level1 = [...found].slice(0, 12);
    for (const url of level1) {
      if (found.size >= limit) break;
      const page = await get(url);
      for (const l of linksFromHtml(page?.text ?? "", page?.finalUrl ?? url)) add(l);
    }
  }

  const pages = [...found].sort((a, b) => depth(a) - depth(b) || a.length - b.length || a.localeCompare(b)).slice(0, limit);
  return { site: base.hostname.replace(/^www\./, ""), pages };
}

const depth = (u: string) => new URL(u).pathname.split("/").filter(Boolean).length;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç", ocirc: "ô", ucirc: "û", ugrave: "ù", icirc: "î", iuml: "ï", euml: "ë", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", euro: "€", laquo: "«", raquo: "»", ndash: "–", mdash: "—", deg: "°", copy: "©", reg: "®", trade: "™" };
function decode(s: string) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

/** Nettoie un texte : espaces superflus, lignes vides et doublons retirés. */
function cleanLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l, i, all) => l && l !== "##" && l !== "-" && all.indexOf(l) === i)
    .join("\n");
}

/** Données structurées (JSON-LD) : produits, prix, entreprise, FAQ… très utiles pour l'IA. */
function structuredData(html: string): string {
  const out: string[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const items: unknown[] = Array.isArray(data) ? data : data["@graph"] ?? [data];
      for (const raw of items) {
        const it = raw as Record<string, unknown>;
        const type = String(it["@type"] ?? "");
        if (/Product/i.test(type)) {
          const offers = (Array.isArray(it.offers) ? it.offers[0] : it.offers) as Record<string, unknown> | undefined;
          out.push(
            `Produit : ${it.name ?? ""}${offers?.price ? ` — ${offers.price} ${offers.priceCurrency ?? ""}` : ""}${
              offers?.availability ? ` (${String(offers.availability).split("/").pop()})` : ""
            }${it.description ? ` — ${String(it.description).slice(0, 300)}` : ""}`,
          );
        } else if (/Organization|LocalBusiness|Store|Restaurant/i.test(type)) {
          const addr = it.address as Record<string, unknown> | undefined;
          out.push(
            `Entreprise : ${it.name ?? ""}${it.telephone ? ` — tél. ${it.telephone}` : ""}${it.email ? ` — ${it.email}` : ""}${
              addr ? ` — ${[addr.streetAddress, addr.postalCode, addr.addressLocality].filter(Boolean).join(" ")}` : ""
            }${it.openingHours ? ` — horaires : ${JSON.stringify(it.openingHours)}` : ""}`,
          );
        } else if (/FAQPage/i.test(type) && Array.isArray(it.mainEntity)) {
          for (const q of it.mainEntity as Record<string, unknown>[]) {
            const ans = q.acceptedAnswer as Record<string, unknown> | undefined;
            out.push(`Q : ${q.name ?? ""}\nR : ${String(ans?.text ?? "").replace(/<[^>]+>/g, " ")}`);
          }
        }
      }
    } catch {
      // JSON invalide : ignoré
    }
  }
  return out.slice(0, 80).join("\n");
}

/** Texte utile d'un HTML (sans menus, scripts, pieds de page…). */
function textFromHtml(html: string): string {
  const cleaned = html
    .replace(/<(script|style|noscript|svg|iframe|template|form|canvas)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|header|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const body =
    cleaned.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
    cleaned.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    cleaned.match(/<body[\s\S]*<\/body>/i)?.[0] ??
    cleaned;
  return cleanLines(
    decode(
      body
        .replace(/<h[1-6][^>]*>/gi, "\n\n## ")
        .replace(/<\/(h[1-6]|p|div|section|article|li|tr|ul|ol|table|blockquote|dd|dt)>/gi, "\n")
        .replace(/<(br|hr)\s*\/?>/gi, "\n")
        .replace(/<li[^>]*>/gi, "\n- ")
        .replace(/<t[dh][^>]*>/gi, " | ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

/** Secours : navigateur de Cloudflare (Browser Rendering), si la permission est active. */
async function renderWithCloudflare(url: string): Promise<string> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new Error("Cloudflare non configuré");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/markdown`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, gotoOptions: { waitUntil: "networkidle0", timeout: 30_000 } }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; result?: string } | null;
  if (!res.ok || !body?.success || typeof body.result !== "string") throw new Error(`Cloudflare : ${res.status}`);
  return cleanLines(body.result.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"));
}

/** Lit une page, quel que soit le type de site, et renvoie son titre et son texte utile. */
export async function fetchPageText(url: string): Promise<{ title: string | null; text: string }> {
  normalizeSite(url);
  const res = await get(url);
  if (res && res.status >= 400 && res.status !== 403 && res.status !== 429) throw new Error(`Page introuvable (erreur ${res.status})`);
  if (res?.text && res.type && !/html|xml|text\/plain/.test(res.type)) throw new Error("Ce n'est pas une page web");

  const html = res?.text ?? "";
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "") || null;
  const description = decode(
    html.match(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']*)/i)?.[1] ?? "",
  );
  const data = structuredData(html);
  const staticText = textFromHtml(html);

  // Page lisible directement (site classique) : c'est le plus rapide.
  if (staticText.length >= MIN_STATIC_TEXT && res?.status === 200) {
    const full = [description && `Description : ${description}`, staticText, data && `Données du site :\n${data}`].filter(Boolean).join("\n\n");
    return { title, text: full.slice(0, MAX_TEXT) };
  }

  // Site JavaScript, page protégée ou presque vide : on l'affiche dans un vrai navigateur.
  const reasons: string[] = [];
  try {
    const page = await renderPage(url);
    const text = cleanLines(page.text);
    if (text.length >= 80) {
      const full = [description && `Description : ${description}`, text, data && `Données du site :\n${data}`].filter(Boolean).join("\n\n");
      return { title: page.title || title, text: full.slice(0, MAX_TEXT) };
    }
    reasons.push("page vide même une fois affichée");
  } catch (err) {
    reasons.push(err instanceof Error ? err.message : String(err));
  }
  try {
    const text = await renderWithCloudflare(url);
    if (text.length >= 80) return { title, text: text.slice(0, MAX_TEXT) };
  } catch {
    // secours indisponible
  }
  // Dernier recours : le peu de texte disponible (description + données), s'il y en a.
  const fallback = [description && `Description : ${description}`, staticText, data].filter(Boolean).join("\n\n");
  if (fallback.length >= 200) return { title, text: fallback.slice(0, MAX_TEXT) };
  throw new Error(`Impossible de lire cette page (${reasons.join(" ; ")}).`);
}
