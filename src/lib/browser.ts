import "server-only";

import { existsSync } from "node:fs";
import type { Browser } from "puppeteer-core";

/**
 * Navigateur invisible (headless) pour lire les sites « JavaScript » (React, Vue, Wix…),
 * comme le fait DM Champ : la page est réellement affichée, puis on récupère son texte.
 * Utilise le Chrome / Edge / Chromium déjà installé (ou BROWSER_PATH dans .env.local).
 */

const CANDIDATES = [
  process.env.BROWSER_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

export function browserPath(): string | null {
  return CANDIDATES.find((p): p is string => Boolean(p) && existsSync(p!)) ?? null;
}

const IDLE_CLOSE_MS = 2 * 60_000; // on ferme le navigateur après 2 min sans utilisation

const g = globalThis as typeof globalThis & {
  __browser?: Promise<Browser>;
  __browserTimer?: NodeJS.Timeout;
  __browserBusy?: number;
};

async function getBrowser(): Promise<Browser> {
  const executablePath = browserPath();
  if (!executablePath) throw new Error("Aucun navigateur Chrome ou Edge trouvé sur cet ordinateur (indique BROWSER_PATH dans .env.local).");
  // Chargé seulement quand on lit un site : un souci ici ne bloque jamais le reste de l'appli.
  const { default: puppeteer } = await import("puppeteer-core");
  g.__browser ??= puppeteer
    .launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--mute-audio"],
    })
    .catch((err) => {
      g.__browser = undefined;
      throw err;
    });
  const browser = await g.__browser;
  if (!browser.connected) {
    g.__browser = undefined;
    return getBrowser();
  }
  return browser;
}

function scheduleClose() {
  if (g.__browserTimer) clearTimeout(g.__browserTimer);
  g.__browserTimer = setTimeout(async () => {
    if (g.__browserBusy) return scheduleClose();
    const b = g.__browser;
    g.__browser = undefined;
    await (await b?.catch(() => null))?.close().catch(() => {});
  }, IDLE_CLOSE_MS);
}

export type RenderedPage = { title: string | null; text: string; links: string[] };

/** Ouvre la page dans le navigateur invisible et renvoie son titre, son texte et ses liens. */
export async function renderPage(url: string): Promise<RenderedPage> {
  const browser = await getBrowser();
  g.__browserBusy = (g.__browserBusy ?? 0) + 1;
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    );
    // Pas besoin des images, polices et vidéos pour lire le texte : plus rapide.
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "media", "font"].includes(req.resourceType())) void req.abort();
      else void req.continue();
    });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 }).catch(async (err) => {
      // Certains sites ne « finissent » jamais de charger : on lit quand même ce qui est affiché.
      if (!(await page.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0))) throw err;
    });
    // Page de protection anti-robot (« Just a moment… », « Checking your browser ») : on attend.
    for (let i = 0; i < 8; i++) {
      const t = (await page.title().catch(() => "")).toLowerCase();
      if (!/just a moment|checking your browser|un instant|attention required|vérification/.test(t)) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    // Défilement progressif : charge le contenu qui n'apparaît qu'au scroll (lazy loading).
    await page
      .evaluate(async () => {
        for (let y = 0, i = 0; i < 25 && y < document.body.scrollHeight; i++) {
          y += window.innerHeight;
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 250));
        }
        window.scrollTo(0, 0);
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    return await page.evaluate(() => {
      // Bandeaux de cookies, pop-ups et éléments décoratifs : retirés (on ne clique sur rien).
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        const st = getComputedStyle(el);
        const label = `${el.id} ${el.className}`.toLowerCase();
        if ((st.position === "fixed" || st.position === "sticky") && /cookie|consent|gdpr|rgpd|popup|modal|newsletter|banner/.test(label)) el.remove();
      }
      for (const el of document.querySelectorAll("script, style, noscript, svg, iframe, nav, footer, header, [role=navigation], [aria-hidden=true]")) {
        el.remove();
      }
      const root = document.querySelector("main") ?? document.body;
      const text = (root as HTMLElement).innerText ?? "";
      const links = [...document.querySelectorAll("a[href]")].map((a) => (a as HTMLAnchorElement).href);
      return { title: document.title || null, text, links };
    });
  } finally {
    await page.close().catch(() => {});
    g.__browserBusy = Math.max(0, (g.__browserBusy ?? 1) - 1);
    scheduleClose();
  }
}

/** Liens de la page, après affichage (pour les sites JavaScript sans sitemap). */
export async function renderedLinks(url: string): Promise<string[]> {
  return (await renderPage(url)).links;
}

export type ScrapedProduct = { title: string; price: string | null; compareAt: string | null; image: string | null; url: string | null; description?: string | null; available?: boolean };

/**
 * Catalogue : ouvre une page de boutique et repère les produits affichés (photo, nom, prix, lien),
 * comme le verrait un visiteur. Lit aussi les fiches « Product » (JSON-LD) quand le site en fournit.
 */
export async function renderProducts(url: string): Promise<{ products: ScrapedProduct[]; links: string[] }> {
  const browser = await getBrowser();
  g.__browserBusy = (g.__browserBusy ?? 0) + 1;
  const page = await browser.newPage();
  try {
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36");
    await page.setViewport({ width: 1366, height: 900 });
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      // Les adresses des images suffisent : inutile de les télécharger ici.
      if (["media", "font"].includes(req.resourceType())) void req.abort();
      else void req.continue();
    });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 }).catch(async (err) => {
      if (!(await page.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0))) throw err;
    });
    await page
      .evaluate(async () => {
        for (let y = 0, i = 0; i < 30 && y < document.body.scrollHeight; i++) {
          y += window.innerHeight;
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 300));
        }
        window.scrollTo(0, 0);
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    const found = await page.evaluate(() => {
      const PRICE = /(?:€\s?\d{1,5}(?:[\s.]\d{3})*(?:[.,]\d{1,2})?|\d{1,5}(?:[\s.]\d{3})*(?:[.,]\d{1,2})?\s?(?:€|EUR|eur))/g;
      const abs = (u: string | null | undefined) => {
        if (!u) return null;
        try {
          return new URL(u, location.href).href;
        } catch {
          return null;
        }
      };
      const imgSrc = (img: HTMLImageElement) => {
        const set = img.getAttribute("srcset") || img.getAttribute("data-srcset");
        const best = set
          ?.split(",")
          .map((s) => s.trim().split(/\s+/))
          .sort((a, b) => (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0))[0]?.[0];
        return abs(best || img.getAttribute("data-src") || img.currentSrc || img.src);
      };
      const out: { title: string; price: string | null; compareAt: string | null; image: string | null; url: string | null; description?: string | null; available?: boolean }[] = [];

      // 1. Fiches produits structurées (JSON-LD).
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const data = JSON.parse(s.textContent || "null");
          const items = ([] as unknown[]).concat(data?.["@graph"] ?? data ?? []);
          for (const it of items as Record<string, unknown>[]) {
            const list = it?.["@type"] === "ItemList" ? ((it.itemListElement as Record<string, unknown>[]) ?? []).map((x) => (x.item as Record<string, unknown>) ?? x) : [it];
            for (const p of list) {
              if (!p || p["@type"] !== "Product") continue;
              const offer = ([] as Record<string, unknown>[]).concat((p.offers as Record<string, unknown>) ?? [])[0] ?? {};
              const img = ([] as unknown[]).concat(p.image ?? [])[0];
              out.push({
                title: String(p.name ?? "").trim(),
                price: offer.price != null ? `${offer.price} ${offer.priceCurrency ?? "€"}` : null,
                compareAt: null,
                image: abs(typeof img === "string" ? img : ((img as Record<string, string>)?.url ?? null)),
                url: abs((p.url as string) ?? (offer.url as string) ?? null),
                description: typeof p.description === "string" ? p.description.slice(0, 600) : null,
                available: typeof offer.availability === "string" ? !/OutOfStock|SoldOut/i.test(offer.availability) : true,
              });
            }
          }
        } catch {
          /* bloc illisible */
        }
      }

      // 2. Cartes produits visibles : une image et un prix dans le même bloc (le lien est facultatif).
      const skip = "header, nav, footer, aside, [role=navigation], [role=dialog]";
      const priceNodes = [...document.querySelectorAll<HTMLElement>("body *")].filter((el) => {
        if (el.children.length > 2 || el.closest(skip)) return false;
        const t = el.innerText?.trim() ?? "";
        PRICE.lastIndex = 0;
        return t.length > 0 && t.length < 40 && PRICE.test(t);
      });
      const seen = new Set<Element>();
      const meaningful = (t: string | null | undefined) => {
        const v = (t ?? "").trim();
        return v.length > 2 && !/^(image|photo|product|produit|img|picture)\b/i.test(v) ? v : "";
      };
      for (const node of priceNodes) {
        let card: HTMLElement | null = node;
        for (let i = 0; i < 6 && card; i++) {
          card = card.parentElement;
          if (!card || card === document.body) break;
          if (card.querySelector("img")) break;
        }
        if (!card || card === document.body || seen.has(card) || !card.querySelector("img")) continue;
        PRICE.lastIndex = 0;
        const prices = [...card.innerText.matchAll(PRICE)].map((m) => m[0]);
        // Un bloc qui contient plusieurs produits n'est pas une carte.
        if (card.querySelectorAll("img").length > 4 || prices.length > 3 || card.innerText.length > 600) continue;
        seen.add(card);
        const img = [...card.querySelectorAll("img")].sort((a, b) => b.width * b.height - a.width * a.height)[0];
        const link = (card.closest("a[href]") ?? card.querySelector("a[href]")) as HTMLAnchorElement | null;
        const heading = card.querySelector("h1,h2,h3,h4,h5,h6,[class*=title],[class*=name],[class*=Title],[class*=Name]") as HTMLElement | null;
        const lines = card.innerText
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => {
            PRICE.lastIndex = 0;
            return l && !PRICE.test(l) && !/ajouter|panier|acheter|add to cart|voir|nouveau|new|promo|solde|^-?\d+ ?%/i.test(l) && l !== l.toUpperCase();
          });
        const title = (meaningful(heading?.innerText) || meaningful(img?.alt) || lines.sort((a, b) => b.length - a.length)[0] || "").replace(/\s+/g, " ").slice(0, 120);
        if (!title || !prices.length) continue;
        const nums = prices.map((p) => parseFloat(p.replace(/[^\d,.]/g, "").replace(",", ".")));
        const max = Math.max(...nums);
        const min = Math.min(...nums);
        card.setAttribute("data-aw-card", String(out.length));
        out.push({
          title,
          price: prices.length > 1 && max !== min ? prices[nums.indexOf(min)] : prices[0],
          compareAt: prices.length > 1 && max !== min ? prices[nums.indexOf(max)] : null,
          image: img ? imgSrc(img) : null,
          url: link ? abs(link.getAttribute("href")) : null,
          available: !/rupture|épuisé|epuise|sold out|indisponible/i.test(card.innerText),
        });
      }
      const links = [...document.querySelectorAll("a[href]")].map((a) => (a as HTMLAnchorElement).href);
      return { products: out, links };
    });

    // Cartes sans lien (le clic est géré en JavaScript) : on clique comme un visiteur pour connaître
    // l'adresse de la fiche produit, puis on revient. 40 produits au maximum.
    const start = page.url();
    let clicks = 0;
    for (const p of found.products) {
      if (p.url || clicks >= 40) continue;
      clicks++;
      const clicked = await page
        .evaluate((title) => {
          const cards = [...document.querySelectorAll<HTMLElement>("main *, body > div *")].filter(
            (el) => el.querySelector("img") && (el.innerText ?? "").includes(title) && (el.innerText ?? "").length < 600,
          );
          const card = cards.sort((a, b) => (a.innerText?.length ?? 0) - (b.innerText?.length ?? 0))[0];
          const target = (card?.querySelector("img")?.closest("button, a, [role=button], [onclick]") ?? card?.querySelector("img")) as HTMLElement | null;
          if (!target) return false;
          target.click();
          return true;
        }, p.title)
        .catch(() => false);
      if (!clicked) continue;
      await new Promise((r) => setTimeout(r, 700));
      const now = page.url();
      if (now !== start) {
        p.url = now;
        await page.goBack({ waitUntil: "networkidle2", timeout: 15_000 }).catch(() => page.goto(start, { waitUntil: "networkidle2", timeout: 30_000 }).catch(() => null));
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    return found;
  } finally {
    await page.close().catch(() => {});
    g.__browserBusy = Math.max(0, (g.__browserBusy ?? 1) - 1);
    scheduleClose();
  }
}
