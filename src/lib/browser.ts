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
