import "server-only";

import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderProducts, type ScrapedProduct } from "./browser";
import { db, MEDIA_DIR } from "./db";
import { convertToJpeg } from "./instagram";

/**
 * Catalogue produits d'un agent (campagnes de vente) : importé depuis le site e-commerce.
 * Ordre d'essai : Shopify, WooCommerce, puis lecture des pages boutique avec le navigateur local.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    price_cents INTEGER,
    compare_cents INTEGER,
    currency TEXT NOT NULL DEFAULT 'EUR',
    url TEXT,
    image_url TEXT,
    image_file TEXT,
    description TEXT,
    available INTEGER NOT NULL DEFAULT 1,
    manual INTEGER NOT NULL DEFAULT 0,
    seen_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS products_agent ON products(agent_id);
  CREATE TABLE IF NOT EXISTS catalog_imports (
    agent_id INTEGER PRIMARY KEY,
    site TEXT NOT NULL,
    source TEXT NOT NULL,
    imported_at INTEGER NOT NULL
  );
`);

export type Product = {
  id: number;
  agentId: number;
  title: string;
  priceCents: number | null;
  compareCents: number | null;
  currency: string;
  url: string | null;
  imageUrl: string | null;
  imageFile: string | null;
  description: string | null;
  available: boolean;
  manual: boolean;
  seenAt: number;
};
export type CatalogInfo = { site: string; source: string; importedAt: number } | null;

type Row = {
  id: number;
  agent_id: number;
  title: string;
  price_cents: number | null;
  compare_cents: number | null;
  currency: string;
  url: string | null;
  image_url: string | null;
  image_file: string | null;
  description: string | null;
  available: number;
  manual: number;
  seen_at: number;
};
const toProduct = (r: Row): Product => ({
  id: r.id,
  agentId: r.agent_id,
  title: r.title,
  priceCents: r.price_cents,
  compareCents: r.compare_cents,
  currency: r.currency,
  url: r.url,
  imageUrl: r.image_url,
  imageFile: r.image_file,
  description: r.description,
  available: r.available === 1,
  manual: r.manual === 1,
  seenAt: r.seen_at,
});

export function listProducts(agentId: number): Product[] {
  return (db.prepare(`SELECT * FROM products WHERE agent_id = ? ORDER BY available DESC, title COLLATE NOCASE`).all(agentId) as Row[]).map(toProduct);
}
export function getProduct(id: number): Product | null {
  const r = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id) as Row | undefined;
  return r ? toProduct(r) : null;
}
export function catalogInfo(agentId: number): CatalogInfo {
  const r = db.prepare(`SELECT site, source, imported_at FROM catalog_imports WHERE agent_id = ?`).get(agentId) as { site: string; source: string; imported_at: number } | undefined;
  return r ? { site: r.site, source: r.source, importedAt: r.imported_at } : null;
}

/** « 29,90 € » / « 1 299.00 » / « €45 » → centimes. */
export function parsePrice(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Math.round(raw * 100);
  let t = raw.replace(/[^\d,.\s]/g, "").trim().replace(/\s/g, "");
  if (!t) return null;
  // « 1.299,90 » ou « 1,299.90 » : le dernier séparateur est celui des centimes.
  const last = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  if (last >= 0 && t.length - last - 1 <= 2) t = `${t.slice(0, last).replace(/[.,]/g, "")}.${t.slice(last + 1)}`;
  else t = t.replace(/[.,]/g, "");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) : null;
}

export const formatPrice = (cents: number | null, currency = "EUR") =>
  cents === null ? "" : new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

type Found = { title: string; priceCents: number | null; compareCents: number | null; url: string | null; imageUrl: string | null; description: string | null; available: boolean };

const strip = (html: string | null | undefined) => (html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 600) || null;

async function json<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (StarkMarketing catalogue)" }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
  return (await res.json().catch(() => null)) as T | null;
}

async function fromShopify(origin: string): Promise<Found[] | null> {
  type P = { title: string; handle: string; body_html: string; variants: { price: string; compare_at_price: string | null; available?: boolean }[]; images: { src: string }[] };
  const data = await json<{ products?: P[] }>(`${origin}/products.json?limit=250`);
  if (!data?.products?.length) return null;
  return data.products.map((p) => ({
    title: p.title,
    priceCents: parsePrice(p.variants[0]?.price),
    compareCents: parsePrice(p.variants[0]?.compare_at_price),
    url: `${origin}/products/${p.handle}`,
    imageUrl: p.images[0]?.src ?? null,
    description: strip(p.body_html),
    available: p.variants.some((v) => v.available !== false),
  }));
}

async function fromWoo(origin: string): Promise<Found[] | null> {
  type P = { name: string; permalink: string; short_description: string; description: string; is_in_stock: boolean; images: { src: string }[]; prices: { price: string; regular_price: string; currency_code: string; currency_minor_unit: number } };
  const data = await json<P[]>(`${origin}/wp-json/wc/store/v1/products?per_page=100`);
  if (!Array.isArray(data) || !data.length) return null;
  return data.map((p) => {
    const unit = 10 ** (p.prices?.currency_minor_unit ?? 2);
    const price = p.prices?.price ? Math.round((Number(p.prices.price) / unit) * 100) : null;
    const regular = p.prices?.regular_price ? Math.round((Number(p.prices.regular_price) / unit) * 100) : null;
    return {
      title: strip(p.name) ?? p.name,
      priceCents: price,
      compareCents: regular && price && regular > price ? regular : null,
      url: p.permalink,
      imageUrl: p.images[0]?.src ?? null,
      description: strip(p.short_description || p.description),
      available: p.is_in_stock,
    };
  });
}

const SHOP_WORDS = /boutique|shop|store|collection|categor|produit|product|catalogue|bijou|article|nouveaut|soldes|promo/i;

async function fromPages(site: string): Promise<Found[]> {
  const origin = new URL(site).origin;
  const queue = [site];
  const visited = new Set<string>();
  const all: ScrapedProduct[] = [];
  while (queue.length && visited.size < 8 && all.length < 300) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    const { products, links } = await renderProducts(url).catch(() => ({ products: [], links: [] as string[] }));
    all.push(...products);
    for (const l of links) {
      try {
        const u = new URL(l);
        u.hash = "";
        if (u.origin === origin && SHOP_WORDS.test(u.pathname) && !visited.has(u.href) && !queue.includes(u.href) && !/panier|cart|compte|account|login|checkout/i.test(u.pathname)) queue.push(u.href);
      } catch {
        /* lien invalide */
      }
    }
  }
  return all.map((p) => ({
    title: p.title,
    priceCents: parsePrice(p.price),
    compareCents: parsePrice(p.compareAt),
    url: p.url,
    imageUrl: p.image,
    description: p.description ?? null,
    available: p.available !== false,
  }));
}

/** Image du produit gardée sur le serveur (JPEG, pour les visuels). */
async function downloadImage(productId: number, agentId: number, url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { Accept: "image/jpeg,image/png,image/*;q=0.8", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length < 1000 || data.length > 15 * 1024 * 1024) return null;
  const base = `product-${agentId}-${productId}-${Date.now()}`;
  if (/jpe?g/.test(type) || data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    await writeFile(path.join(MEDIA_DIR, `${base}.jpg`), data);
    return `${base}.jpg`;
  }
  if (/png/.test(type) || data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    await writeFile(path.join(MEDIA_DIR, `${base}.png`), data);
    return `${base}.png`;
  }
  // WebP, AVIF… : converties en JPEG (les visuels n'acceptent que JPEG et PNG).
  const tmp = path.join(MEDIA_DIR, `${base}.src`);
  await writeFile(tmp, data);
  try {
    await convertToJpeg(tmp, path.join(MEDIA_DIR, `${base}.jpg`));
    return `${base}.jpg`;
  } catch {
    return null;
  } finally {
    await rm(tmp, { force: true });
  }
}

const g = globalThis as typeof globalThis & { __catalogBusy?: Set<number> };
const busy = (g.__catalogBusy ??= new Set<number>());

/** Importe (ou actualise) le catalogue de l'agent depuis son site. */
export async function importCatalog(agentId: number, site: string): Promise<{ count: number; source: string }> {
  let origin: string;
  try {
    const u = new URL(/^https?:\/\//.test(site) ? site : `https://${site}`);
    origin = u.origin;
    site = u.href;
  } catch {
    throw new Error("Adresse du site invalide.");
  }
  if (busy.has(agentId)) throw new Error("Un import est déjà en cours pour cet agent.");
  busy.add(agentId);
  try {
    let source = "Shopify";
    let found = await fromShopify(origin);
    if (!found) {
      source = "WooCommerce";
      found = await fromWoo(origin);
    }
    if (!found) {
      source = "Lecture des pages";
      found = await fromPages(site);
    }
    // Nettoyage : un produit par lien (ou par nom), avec un nom et une image.
    const unique = new Map<string, Found>();
    for (const p of found) {
      if (!p.title || p.title.length < 2) continue;
      const key = (p.url && !/#$/.test(p.url) ? p.url : p.title).toLowerCase();
      const prev = unique.get(key);
      if (!prev || (!prev.imageUrl && p.imageUrl) || (!prev.priceCents && p.priceCents)) unique.set(key, { ...prev, ...p });
    }
    if (!unique.size) throw new Error("Aucun produit trouvé sur ce site. Vérifie l'adresse (ex. : la page Boutique) ou ajoute les produits à la main.");

    const now = Date.now();
    const existing = listProducts(agentId).filter((p) => !p.manual);
    for (const p of unique.values()) {
      const match = existing.find((e) => (p.url && e.url === p.url) || e.title.toLowerCase() === p.title.toLowerCase());
      let id: number;
      if (match) {
        id = match.id;
        db.prepare(`UPDATE products SET title = ?, price_cents = ?, compare_cents = ?, url = ?, image_url = ?, description = COALESCE(?, description), available = ?, seen_at = ? WHERE id = ?`).run(
          p.title, p.priceCents, p.compareCents, p.url, p.imageUrl, p.description, p.available ? 1 : 0, now, id,
        );
      } else {
        id = Number(
          db
            .prepare(`INSERT INTO products (agent_id, title, price_cents, compare_cents, url, image_url, description, available, seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(agentId, p.title, p.priceCents, p.compareCents, p.url, p.imageUrl, p.description, p.available ? 1 : 0, now, now).lastInsertRowid,
        );
      }
      const current = getProduct(id);
      const fileOk = current?.imageFile && existsSync(path.join(MEDIA_DIR, current.imageFile));
      if (p.imageUrl && (!fileOk || match?.imageUrl !== p.imageUrl)) {
        const file = await downloadImage(id, agentId, p.imageUrl);
        if (file) {
          if (current?.imageFile) await rm(path.join(MEDIA_DIR, current.imageFile), { force: true });
          db.prepare(`UPDATE products SET image_file = ? WHERE id = ?`).run(file, id);
        }
      }
    }
    // Produits disparus du site : marqués indisponibles (jamais publiés).
    db.prepare(`UPDATE products SET available = 0 WHERE agent_id = ? AND manual = 0 AND seen_at < ?`).run(agentId, now);
    db.prepare(`INSERT INTO catalog_imports (agent_id, site, source, imported_at) VALUES (?, ?, ?, ?) ON CONFLICT(agent_id) DO UPDATE SET site = excluded.site, source = excluded.source, imported_at = excluded.imported_at`).run(agentId, site, source, now);
    return { count: unique.size, source };
  } finally {
    busy.delete(agentId);
  }
}

/** Produit ajouté à la main (site sans catalogue lisible). */
export async function addManualProduct(agentId: number, p: { title: string; price?: string; url?: string; imageUrl?: string }): Promise<Product> {
  const now = Date.now();
  const id = Number(
    db
      .prepare(`INSERT INTO products (agent_id, title, price_cents, url, image_url, manual, seen_at, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
      .run(agentId, p.title.trim().slice(0, 120), parsePrice(p.price ?? null), p.url?.trim() || null, p.imageUrl?.trim() || null, now, now).lastInsertRowid,
  );
  if (p.imageUrl?.trim()) {
    const file = await downloadImage(id, agentId, p.imageUrl.trim());
    if (file) db.prepare(`UPDATE products SET image_file = ? WHERE id = ?`).run(file, id);
  }
  return getProduct(id)!;
}

export async function deleteProduct(id: number) {
  const p = getProduct(id);
  if (p?.imageFile) await rm(path.join(MEDIA_DIR, p.imageFile), { force: true });
  db.prepare(`DELETE FROM products WHERE id = ?`).run(id);
}

/** Avant une publication : catalogue réactualisé s'il date de plus de 6 h (prix et stock à jour). */
export async function freshCatalog(agentId: number) {
  const info = catalogInfo(agentId);
  if (!info || Date.now() - info.importedAt < 6 * 3_600_000 || busy.has(agentId)) return;
  await importCatalog(agentId, info.site).catch(() => {});
}

// ---------- Import en arrière-plan (la lecture des pages peut prendre quelques minutes) ----------

export type ImportJob = { state: "running" | "done" | "error"; message: string; startedAt: number; count?: number };
const jobs: Map<number, ImportJob> = ((globalThis as typeof globalThis & { __catalogJobs?: Map<number, ImportJob> }).__catalogJobs ??= new Map());

export function importJob(agentId: number): ImportJob | null {
  return jobs.get(agentId) ?? null;
}

export function startImport(agentId: number, site: string) {
  if (jobs.get(agentId)?.state === "running") return;
  jobs.set(agentId, { state: "running", message: "Lecture du site…", startedAt: Date.now() });
  void importCatalog(agentId, site)
    .then(({ count, source }) => jobs.set(agentId, { state: "done", message: `${count} produits importés (${source}).`, startedAt: Date.now(), count }))
    .catch((err) => jobs.set(agentId, { state: "error", message: err instanceof Error ? err.message : "Import impossible.", startedAt: Date.now() }));
}
