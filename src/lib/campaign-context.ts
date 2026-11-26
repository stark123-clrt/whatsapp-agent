import "server-only";

import { db } from "./db";

/**
 * Ce que l'IA sait des contenus publiés par les campagnes Instagram :
 * - quand un contact répond à une story, on retrouve laquelle (et son produit) ;
 * - la liste des publications et stories récentes est ajoutée aux instructions de l'IA sur Instagram.
 */

type Published = {
  kind: "post" | "story";
  headline: string | null;
  published_at: number;
  title: string | null;
  price_cents: number | null;
  currency: string | null;
  url: string | null;
  link: string | null;
};

const price = (cents: number | null, currency: string | null) =>
  cents === null ? "" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

function describe(p: Published) {
  const what = p.kind === "story" ? "Story" : "Publication";
  const when = new Date(p.published_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const product = p.title ? ` — produit « ${p.title} »${p.price_cents ? ` à ${price(p.price_cents, p.currency)}` : ""}${p.url ? `, fiche : ${p.url}` : ""}` : "";
  return `${what} du ${when} : « ${p.headline ?? ""} »${product}`;
}

const SELECT = `
  SELECT p.kind, p.headline, p.published_at, pr.title, COALESCE(pr.price_cents, p.price_cents) AS price_cents, pr.currency, pr.url,
         json_extract(c.settings, '$.link') AS link
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

/** Publications et stories des 3 derniers jours, pour les instructions de l'IA sur Instagram. */
export function recentPublishedContext(): string {
  try {
    const rows = db.prepare(`${SELECT} WHERE p.status = 'published' AND p.published_at > ? ORDER BY p.published_at DESC LIMIT 12`).all(Date.now() - 3 * 86_400_000) as Published[];
    if (!rows.length) return "";
    return [
      "CONTENUS QUE TU AS PUBLIÉS RÉCEMMENT SUR CE COMPTE INSTAGRAM (un contact peut en parler : « ta story », « ta publication », « le bijou que tu as mis ») :",
      ...rows.map((r) => `- ${describe(r)}`),
      "Si le contact parle d'une story ou d'une publication sans préciser, appuie-toi sur cette liste (la plus récente d'abord) au lieu de dire que tu n'y as pas accès. En cas de doute entre plusieurs, propose-les brièvement.",
    ].join("\n");
  } catch {
    return "";
  }
}
