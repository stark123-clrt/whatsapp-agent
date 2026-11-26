import "server-only";

import { db } from "./db";

/**
 * Rythme de publication du compte Instagram, toutes campagnes confondues :
 * maximum par jour (total, publications, stories) et écart minimum entre deux publications.
 * Un contenu qui dépasse le quota est décalé au lendemain ; un contenu trop proche du précédent attend.
 */

db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

export type PublishLimits = { maxPerDay: number; maxPosts: number; maxStories: number; minGapHours: number };
export const DEFAULT_LIMITS: PublishLimits = { maxPerDay: 3, maxPosts: 2, maxStories: 3, minGapHours: 2 };

const clamp = (n: unknown, min: number, max: number, d: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 2) / 2)) : d;
};

export function getLimits(): PublishLimits {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'instagram_limits'`).get() as { value: string } | undefined;
  let raw: Partial<PublishLimits> = {};
  try {
    raw = row ? JSON.parse(row.value) : {};
  } catch {
    raw = {};
  }
  return normalize(raw);
}

function normalize(raw: Partial<PublishLimits>): PublishLimits {
  const d = DEFAULT_LIMITS;
  return {
    maxPerDay: clamp(raw.maxPerDay, 1, 10, d.maxPerDay),
    maxPosts: clamp(raw.maxPosts, 0, 10, d.maxPosts),
    maxStories: clamp(raw.maxStories, 0, 10, d.maxStories),
    minGapHours: clamp(raw.minGapHours, 0, 12, d.minGapHours),
  };
}

export function setLimits(raw: Partial<PublishLimits>): PublishLimits {
  const limits = normalize({ ...getLimits(), ...raw });
  db.prepare(`INSERT INTO app_settings (key, value) VALUES ('instagram_limits', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(limits));
  return limits;
}

/** Début de la journée (heure de Paris) contenant l'instant donné. */
function parisDayStart(ts: number) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(ts);
  const guess = Date.parse(`${day}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
  const h = Number(parts.find((p) => p.type === "hour")?.value) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return guess - (h * 60 + m) * 60_000;
}

export type Today = { posts: number; stories: number; total: number; lastAt: number | null };

export function todayCounts(now = Date.now()): Today {
  try {
    const start = parisDayStart(now);
    const rows = db.prepare(`SELECT kind, COUNT(*) AS n FROM campaign_posts WHERE status = 'published' AND published_at >= ? GROUP BY kind`).all(start) as { kind: string; n: number }[];
    const last = db.prepare(`SELECT MAX(published_at) AS t FROM campaign_posts WHERE status = 'published'`).get() as { t: number | null };
    const posts = rows.find((r) => r.kind === "post")?.n ?? 0;
    const stories = rows.find((r) => r.kind === "story")?.n ?? 0;
    return { posts, stories, total: posts + stories, lastAt: last?.t ?? null };
  } catch {
    return { posts: 0, stories: 0, total: 0, lastAt: null }; // aucune campagne encore
  }
}

export type Verdict = { ok: true } | { ok: false; reason: string; retryAt: number; nextDay: boolean };

/** Ce contenu peut-il partir maintenant ? Sinon : pourquoi, et quand réessayer. */
export function canPublish(kind: "post" | "story", now = Date.now()): Verdict {
  const l = getLimits();
  const t = todayCounts(now);
  const tomorrow = parisDayStart(now) + 86_400_000 + 9 * 3_600_000; // demain, 9 h
  if (t.total >= l.maxPerDay) return { ok: false, reason: `Maximum de ${l.maxPerDay} contenus par jour atteint pour ce compte (toutes campagnes).`, retryAt: tomorrow, nextDay: true };
  if (kind === "post" && t.posts >= l.maxPosts) return { ok: false, reason: `Maximum de ${l.maxPosts} publication(s) par jour atteint.`, retryAt: tomorrow, nextDay: true };
  if (kind === "story" && t.stories >= l.maxStories) return { ok: false, reason: `Maximum de ${l.maxStories} story(s) par jour atteint.`, retryAt: tomorrow, nextDay: true };
  const gap = l.minGapHours * 3_600_000;
  if (t.lastAt && now - t.lastAt < gap) {
    const at = t.lastAt + gap;
    const time = new Date(at).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
    return { ok: false, reason: `Écart minimum de ${l.minGapHours} h entre deux publications : prochain envoi possible à ${time}.`, retryAt: at, nextDay: false };
  }
  return { ok: true };
}
