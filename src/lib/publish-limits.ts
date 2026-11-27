import "server-only";

import { db } from "./db";

/**
 * Plafonds de sécurité du compte Instagram, toutes campagnes confondues.
 * En rythme automatique, l'agent décide combien publier chaque jour SOUS ces plafonds.
 * Au-delà, un contenu est décalé au lendemain ; trop proche du précédent, il attend.
 */

db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

export type PublishLimits = {
  maxPosts: number; // publications par jour (0 à 25)
  maxStories: number; // stories par jour (0 à 50)
  postGapHours: number; // écart minimum entre deux publications
  storyGapMinutes: number; // écart minimum entre deux contenus, quels qu'ils soient
};
export const DEFAULT_LIMITS: PublishLimits = { maxPosts: 3, maxStories: 10, postGapHours: 2, storyGapMinutes: 30 };
/** Valeurs conseillées, affichées sous les réglages (rien n'est bloqué en dessous des limites techniques d'Instagram). */
export const RECOMMENDED = { maxPosts: 3, maxStories: 10, postGapHours: 2, storyGapMinutes: 30 };

const clamp = (n: unknown, min: number, max: number, d: number, step = 1) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v / step) * step)) : d;
};

function normalize(raw: Partial<PublishLimits> & { maxPerDay?: number; minGapHours?: number }): PublishLimits {
  const d = DEFAULT_LIMITS;
  return {
    maxPosts: clamp(raw.maxPosts, 0, 25, d.maxPosts),
    maxStories: clamp(raw.maxStories, 0, 50, d.maxStories),
    postGapHours: clamp(raw.postGapHours ?? raw.minGapHours, 0, 12, d.postGapHours, 0.5),
    storyGapMinutes: clamp(raw.storyGapMinutes, 0, 240, d.storyGapMinutes, 5),
  };
}

export function getLimits(): PublishLimits {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'instagram_limits_v2'`).get() as { value: string } | undefined;
  try {
    return normalize(row ? JSON.parse(row.value) : {});
  } catch {
    return DEFAULT_LIMITS;
  }
}

export function setLimits(raw: Partial<PublishLimits>): PublishLimits {
  const limits = normalize({ ...getLimits(), ...raw });
  db.prepare(`INSERT INTO app_settings (key, value) VALUES ('instagram_limits_v2', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(limits));
  return limits;
}

/** Début de la journée (heure de Paris) contenant l'instant donné. */
export function parisDayStart(ts: number) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(ts);
  const guess = Date.parse(`${day}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
  const h = Number(parts.find((p) => p.type === "hour")?.value) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return guess - (h * 60 + m) * 60_000;
}

export type Today = { posts: number; stories: number; total: number; lastAt: number | null; lastPostAt: number | null };

export function todayCounts(now = Date.now()): Today {
  try {
    const start = parisDayStart(now);
    const rows = db.prepare(`SELECT kind, COUNT(*) AS n FROM campaign_posts WHERE status = 'published' AND published_at >= ? GROUP BY kind`).all(start) as { kind: string; n: number }[];
    const last = db.prepare(`SELECT MAX(published_at) AS t FROM campaign_posts WHERE status = 'published'`).get() as { t: number | null };
    const lastPost = db.prepare(`SELECT MAX(published_at) AS t FROM campaign_posts WHERE status = 'published' AND kind = 'post'`).get() as { t: number | null };
    const posts = rows.find((r) => r.kind === "post")?.n ?? 0;
    const stories = rows.find((r) => r.kind === "story")?.n ?? 0;
    return { posts, stories, total: posts + stories, lastAt: last?.t ?? null, lastPostAt: lastPost?.t ?? null };
  } catch {
    return { posts: 0, stories: 0, total: 0, lastAt: null, lastPostAt: null }; // aucune campagne encore
  }
}

export type Verdict = { ok: true } | { ok: false; reason: string; retryAt: number; nextDay: boolean };

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

/** Ce contenu peut-il partir maintenant ? Sinon : pourquoi, et quand réessayer. */
export function canPublish(kind: "post" | "story", now = Date.now()): Verdict {
  const l = getLimits();
  const t = todayCounts(now);
  const tomorrow = parisDayStart(now) + 86_400_000 + 9 * 3_600_000; // demain, 9 h
  if (kind === "post" && t.posts >= l.maxPosts) return { ok: false, reason: `Plafond de ${l.maxPosts} publication(s) par jour atteint pour ce compte.`, retryAt: tomorrow, nextDay: true };
  if (kind === "story" && t.stories >= l.maxStories) return { ok: false, reason: `Plafond de ${l.maxStories} stories par jour atteint pour ce compte.`, retryAt: tomorrow, nextDay: true };
  const anyGap = l.storyGapMinutes * 60_000;
  if (t.lastAt && now - t.lastAt < anyGap) {
    const at = t.lastAt + anyGap;
    return { ok: false, reason: `${l.storyGapMinutes} min d'écart minimum entre deux contenus : prochain envoi possible à ${hhmm(at)}.`, retryAt: at, nextDay: false };
  }
  const postGap = l.postGapHours * 3_600_000;
  if (kind === "post" && t.lastPostAt && now - t.lastPostAt < postGap) {
    const at = t.lastPostAt + postGap;
    return { ok: false, reason: `${String(l.postGapHours).replace(".", ",")} h d'écart minimum entre deux publications : prochaine possible à ${hhmm(at)}.`, retryAt: at, nextDay: false };
  }
  return { ok: true };
}
