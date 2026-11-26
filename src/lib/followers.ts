import "server-only";

import { db } from "./db";
import { dmUser, fetchFollowers, fetchMyProfile, fetchProfile, followUser, instagramConnected } from "./instagram";
import { parisDayStart } from "./publish-limits";

/**
 * Croissance Instagram : l'agent repère les nouveaux abonnés (toutes les 2 heures environ),
 * les suit en retour, suit aussi les personnes engagées (qui écrivent en privé ou commentent),
 * et peut leur envoyer un message de bienvenue. Tout se fait au compte-gouttes, avec un délai
 * humain, des plafonds par jour qui montent doucement, et un filtre contre les faux comptes.
 * Les abonnés déjà présents au premier passage ne sont jamais concernés (point de départ).
 * Un relevé quotidien (abonnés, abonnements, publications) alimente les statistiques.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS ig_people (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    full_name TEXT,
    picture TEXT,
    is_follower INTEGER NOT NULL DEFAULT 0,
    baseline INTEGER NOT NULL DEFAULT 0,
    followed_us_at INTEGER,
    engaged_at INTEGER,
    engaged_via TEXT,
    i_follow INTEGER NOT NULL DEFAULT 0,
    follow_status TEXT,
    follow_due INTEGER,
    follow_reason TEXT,
    follow_note TEXT,
    followed_at INTEGER,
    welcome_status TEXT,
    welcome_due INTEGER,
    welcomed_at INTEGER,
    welcome_jid TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ig_people_follow ON ig_people(follow_status, follow_due);
  CREATE INDEX IF NOT EXISTS ig_people_welcome ON ig_people(welcome_status, welcome_due);
  CREATE TABLE IF NOT EXISTS ig_stats_daily (
    day TEXT PRIMARY KEY,
    followers INTEGER NOT NULL,
    following INTEGER NOT NULL,
    posts INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// ---------- Réglages ----------

export type GrowthSettings = {
  followBack: boolean; // suivre en retour les nouveaux abonnés
  followEngaged: boolean; // suivre les personnes qui écrivent ou commentent
  welcome: boolean; // message de bienvenue aux nouveaux abonnés
  welcomeText: string; // {prénom} est remplacé par le prénom
  maxFollowsPerDay: number;
  maxWelcomesPerDay: number;
  skipSuspicious: boolean; // filtre anti-faux comptes
};

export const DEFAULT_GROWTH: GrowthSettings = {
  followBack: true,
  followEngaged: true,
  welcome: false,
  welcomeText: "Hello {prénom}, merci pour ton abonnement ! N'hésite pas à m'écrire ici si tu as la moindre question 🙂",
  maxFollowsPerDay: 20,
  maxWelcomesPerDay: 10,
  skipSuspicious: true,
};

export const GROWTH_CAPS = { follows: 40, welcomes: 25 }; // au-delà, Instagram bloque vite un compte personnel

type GrowthState = { startedAt: number | null; pausedUntil: number | null; pauseReason: string | null; lastScanAt: number | null; lastFollowAt: number | null; lastWelcomeAt: number | null };

function readKey<T>(key: string, fallback: T): T {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key) as { value: string } | undefined;
  try {
    return row ? { ...fallback, ...JSON.parse(row.value) } : fallback;
  } catch {
    return fallback;
  }
}
function writeKey(key: string, value: unknown) {
  db.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, JSON.stringify(value));
}

export function getGrowth(): GrowthSettings {
  return readKey("ig_growth", DEFAULT_GROWTH);
}

export function setGrowth(raw: Partial<GrowthSettings>): GrowthSettings {
  const cur = getGrowth();
  const int = (v: unknown, d: number, max: number) => Math.min(max, Math.max(0, Math.round(Number(v ?? d)) || 0));
  const next: GrowthSettings = {
    followBack: raw.followBack ?? cur.followBack,
    followEngaged: raw.followEngaged ?? cur.followEngaged,
    welcome: raw.welcome ?? cur.welcome,
    welcomeText: (raw.welcomeText ?? cur.welcomeText).toString().trim().slice(0, 500) || DEFAULT_GROWTH.welcomeText,
    maxFollowsPerDay: int(raw.maxFollowsPerDay, cur.maxFollowsPerDay, GROWTH_CAPS.follows),
    maxWelcomesPerDay: int(raw.maxWelcomesPerDay, cur.maxWelcomesPerDay, GROWTH_CAPS.welcomes),
    skipSuspicious: raw.skipSuspicious ?? cur.skipSuspicious,
  };
  // Réactiver le message de bienvenue ne doit pas inonder d'anciens abonnés : seuls les suivants le recevront.
  if (next.welcome && !cur.welcome) db.prepare(`UPDATE ig_people SET welcome_status = 'skipped' WHERE welcome_status IS NULL AND is_follower = 1`).run();
  if (!next.welcome) db.prepare(`UPDATE ig_people SET welcome_status = NULL, welcome_due = NULL WHERE welcome_status = 'due'`).run();
  if (!next.followBack) db.prepare(`UPDATE ig_people SET follow_status = NULL, follow_due = NULL WHERE follow_status = 'due' AND follow_reason = 'follower'`).run();
  if (!next.followEngaged) db.prepare(`UPDATE ig_people SET follow_status = NULL, follow_due = NULL WHERE follow_status = 'due' AND follow_reason != 'follower'`).run();
  writeKey("ig_growth", next);
  return next;
}

const getState = () => readKey<GrowthState>("ig_growth_state", { startedAt: null, pausedUntil: null, pauseReason: null, lastScanAt: null, lastFollowAt: null, lastWelcomeAt: null });
const patchState = (p: Partial<GrowthState>) => writeKey("ig_growth_state", { ...getState(), ...p });

/** Montée en charge : les 14 premiers jours, les plafonds augmentent progressivement (compte qui « se réveille »). */
function warmCap(max: number, startedAt: number | null, now = Date.now()) {
  const days = startedAt ? Math.floor((now - startedAt) / DAY) : 0;
  const factor = Math.min(1, 0.35 + (days / 14) * 0.65);
  return Math.max(1, Math.round(max * factor));
}

export type GrowthToday = { follows: number; welcomes: number; followCap: number; welcomeCap: number };

export function growthToday(now = Date.now()): GrowthToday {
  const start = parisDayStart(now);
  const g = getGrowth();
  const st = getState();
  const follows = (db.prepare(`SELECT COUNT(*) AS n FROM ig_people WHERE followed_at >= ?`).get(start) as { n: number }).n;
  const welcomes = (db.prepare(`SELECT COUNT(*) AS n FROM ig_people WHERE welcomed_at >= ?`).get(start) as { n: number }).n;
  return { follows, welcomes, followCap: warmCap(g.maxFollowsPerDay, st.startedAt, now), welcomeCap: warmCap(g.maxWelcomesPerDay, st.startedAt, now) };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const firstName = (fullName: string | null, username: string) => {
  const f = (fullName ?? "").trim().split(/\s+/)[0];
  return f && /\p{L}/u.test(f) ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : `@${username}`;
};
export const welcomeFor = (text: string, fullName: string | null, username: string) => text.replace(/\{pr[ée]nom\}/gi, firstName(fullName, username));

// ---------- Personnes engagées ----------

type Who = { userId: string; username: string; fullName: string | null; picture: string | null };

/** Quelqu'un a écrit en privé ou commenté : on le note, et l'agent le suivra (si activé), avec un délai humain. */
export function noteInteraction(who: Who, via: "dm" | "comment") {
  try {
    if (!who.userId) return;
    const now = Date.now();
    db.prepare(
      `INSERT INTO ig_people (user_id, username, full_name, picture, engaged_at, engaged_via, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, full_name = COALESCE(excluded.full_name, full_name), picture = COALESCE(excluded.picture, picture),
         engaged_at = excluded.engaged_at, engaged_via = COALESCE(engaged_via, excluded.engaged_via)`,
    ).run(who.userId, who.username, who.fullName, who.picture, now, via, now);
    if (!getGrowth().followEngaged) return;
    db.prepare(`UPDATE ig_people SET follow_status = 'due', follow_due = ?, follow_reason = ? WHERE user_id = ? AND i_follow = 0 AND follow_status IS NULL`).run(
      now + rand(20 * MIN, 3 * HOUR),
      via,
      who.userId,
    );
  } catch (err) {
    console.error(`[croissance] ${err instanceof Error ? err.message : err}`);
  }
}

// ---------- Relevé des abonnés ----------

const todayKey = (now = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);

async function snapshot() {
  const me = await fetchMyProfile();
  db.prepare(
    `INSERT INTO ig_stats_daily (day, followers, following, posts, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET followers = excluded.followers, following = excluded.following, posts = excluded.posts, updated_at = excluded.updated_at`,
  ).run(todayKey(), me.followers, me.following, me.posts, Date.now());
}

async function scan() {
  const g = getGrowth();
  const st = getState();
  const users = await fetchFollowers(st.lastScanAt ? 60 : 200);
  const known = db.prepare(`SELECT COUNT(*) AS n FROM ig_people WHERE is_follower = 1`).get() as { n: number };
  const baseline = known.n === 0; // premier passage : point de départ, on n'agit pas sur les abonnés existants
  const now = Date.now();
  let fresh = 0;
  for (const u of users) {
    const row = db.prepare(`SELECT is_follower, i_follow, follow_status, welcome_status FROM ig_people WHERE user_id = ?`).get(u.pk) as
      | { is_follower: number; i_follow: number; follow_status: string | null; welcome_status: string | null }
      | undefined;
    if (row?.is_follower) {
      if (u.following && !row.i_follow) db.prepare(`UPDATE ig_people SET i_follow = 1 WHERE user_id = ?`).run(u.pk);
      continue;
    }
    fresh += baseline ? 0 : 1;
    db.prepare(
      `INSERT INTO ig_people (user_id, username, full_name, picture, is_follower, baseline, followed_us_at, i_follow, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, full_name = COALESCE(excluded.full_name, full_name), picture = COALESCE(excluded.picture, picture),
         is_follower = 1, followed_us_at = excluded.followed_us_at, i_follow = MAX(i_follow, excluded.i_follow)`,
    ).run(u.pk, u.username, u.fullName, u.picture, baseline ? 1 : 0, baseline ? null : now, u.following ? 1 : 0, now);
    if (baseline) continue;
    if (g.followBack && !u.following && !row?.follow_status) {
      db.prepare(`UPDATE ig_people SET follow_status = 'due', follow_due = ?, follow_reason = 'follower' WHERE user_id = ?`).run(now + rand(10 * MIN, 3 * HOUR), u.pk);
    }
    if (g.welcome && !row?.welcome_status) {
      db.prepare(`UPDATE ig_people SET welcome_status = 'due', welcome_due = ? WHERE user_id = ?`).run(now + rand(5 * MIN, 90 * MIN), u.pk);
    }
  }
  patchState({ lastScanAt: now, startedAt: st.startedAt ?? now });
  if (baseline) console.log(`[croissance] point de départ : ${users.length} abonnés existants (aucune action sur eux)`);
  else if (fresh) console.log(`[croissance] ${fresh} nouvel(s) abonné(s)`);
}

// ---------- Actions (suivre, bienvenue) ----------

/** Faux compte probable : pas de photo et aucune publication, ou « suit tout le monde » sans être suivi. */
function suspicious(p: { posts: number; followers: number; following: number; picture: string | null }, noPicture: boolean) {
  if (noPicture && p.posts === 0) return "Pas de photo ni de publication";
  if (p.following > 3000 && p.followers < p.following / 20) return "Suit des milliers de comptes (robot probable)";
  if (p.posts === 0 && p.following > 500 && p.followers < 20) return "Compte vide qui suit beaucoup";
  return null;
}

/** Instagram demande de ralentir : pause de 24 h pour protéger le compte. */
function isBlock(err: unknown) {
  const m = err instanceof Error ? err.message : String(err);
  return /feedback_required|action.*bloqu|blocked|try again later|réessa|limit|challenge|vérif/i.test(m);
}

async function doFollow() {
  const now = Date.now();
  const st = getState();
  if (st.lastFollowAt && now - st.lastFollowAt < rand(4, 9) * MIN) return; // jamais en rafale
  const t = growthToday(now);
  if (t.follows >= t.followCap) return;
  const p = db.prepare(`SELECT user_id, username, picture FROM ig_people WHERE follow_status = 'due' AND follow_due <= ? ORDER BY follow_due LIMIT 1`).get(now) as
    | { user_id: string; username: string; picture: string | null }
    | undefined;
  if (!p) return;
  try {
    if (getGrowth().skipSuspicious) {
      const prof = await fetchProfile(p.user_id);
      const why = suspicious(prof, !prof.picture || /44884218_345707102882519_2446069589734326272/.test(prof.picture));
      if (why) {
        db.prepare(`UPDATE ig_people SET follow_status = 'skipped', follow_due = NULL, follow_note = ? WHERE user_id = ?`).run(why, p.user_id);
        return;
      }
      await new Promise((r) => setTimeout(r, rand(4, 12) * 1000)); // le temps de « regarder le profil »
    }
    await followUser(p.user_id);
    db.prepare(`UPDATE ig_people SET follow_status = 'done', i_follow = 1, followed_at = ?, follow_due = NULL WHERE user_id = ?`).run(Date.now(), p.user_id);
    patchState({ lastFollowAt: Date.now() });
    console.log(`[croissance] abonné à @${p.username}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isBlock(err)) {
      patchState({ pausedUntil: Date.now() + DAY, pauseReason: `Instagram a demandé de ralentir : ${msg.slice(0, 160)}` });
      console.error(`[croissance] pause 24 h : ${msg}`);
    } else {
      db.prepare(`UPDATE ig_people SET follow_status = 'failed', follow_due = NULL, follow_note = ? WHERE user_id = ?`).run(msg.slice(0, 200), p.user_id);
    }
  }
}

async function doWelcome() {
  const g = getGrowth();
  if (!g.welcome) return;
  const now = Date.now();
  const st = getState();
  if (st.lastWelcomeAt && now - st.lastWelcomeAt < rand(6, 12) * MIN) return;
  const t = growthToday(now);
  if (t.welcomes >= t.welcomeCap) return;
  const p = db.prepare(`SELECT user_id, username, full_name, engaged_via FROM ig_people WHERE welcome_status = 'due' AND welcome_due <= ? ORDER BY welcome_due LIMIT 1`).get(now) as
    | { user_id: string; username: string; full_name: string | null; engaged_via: string | null }
    | undefined;
  if (!p) return;
  if (p.engaged_via === "dm") {
    // Déjà en conversation avec nous : pas de message de bienvenue en plus.
    db.prepare(`UPDATE ig_people SET welcome_status = 'skipped', welcome_due = NULL WHERE user_id = ?`).run(p.user_id);
    return;
  }
  try {
    const jid = await dmUser(p.user_id, welcomeFor(g.welcomeText, p.full_name, p.username), p.full_name || `@${p.username}`);
    db.prepare(`UPDATE ig_people SET welcome_status = 'done', welcomed_at = ?, welcome_due = NULL, welcome_jid = ? WHERE user_id = ?`).run(Date.now(), jid, p.user_id);
    patchState({ lastWelcomeAt: Date.now() });
    console.log(`[croissance] bienvenue envoyée à @${p.username}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isBlock(err)) {
      patchState({ pausedUntil: Date.now() + DAY, pauseReason: `Instagram a demandé de ralentir : ${msg.slice(0, 160)}` });
      console.error(`[croissance] pause 24 h : ${msg}`);
    } else {
      db.prepare(`UPDATE ig_people SET welcome_status = 'failed', welcome_due = NULL WHERE user_id = ?`).run(p.user_id);
    }
  }
}

/** Reprendre après une pause (bouton dans les réglages). */
export function resumeGrowth() {
  patchState({ pausedUntil: null, pauseReason: null });
}

// ---------- Planificateur ----------

const g = globalThis as typeof globalThis & { __growthTimer?: NodeJS.Timeout; __growthBusy?: boolean };

export function startGrowthScheduler() {
  if (g.__growthTimer) return;
  const tick = async () => {
    if (g.__growthBusy) return;
    g.__growthBusy = true;
    try {
      if (!instagramConnected()) return;
      const st = getState();
      const now = Date.now();
      // Relevé des abonnés et des chiffres du compte toutes les 2 heures environ.
      if (!st.lastScanAt || now - st.lastScanAt > rand(100, 140) * MIN) {
        await snapshot().catch((e) => console.error(`[croissance] relevé : ${e instanceof Error ? e.message : e}`));
        await scan().catch((e) => {
          patchState({ lastScanAt: now }); // on réessaiera au prochain créneau, sans insister
          console.error(`[croissance] abonnés : ${e instanceof Error ? e.message : e}`);
        });
        return;
      }
      if (st.pausedUntil && now < st.pausedUntil) return;
      // Nuit (heure de Paris, 0 h – 7 h) : pas d'action, comme une vraie personne.
      const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(now)) % 24;
      if (hour < 7) return;
      await doFollow();
      await doWelcome();
    } finally {
      g.__growthBusy = false;
    }
  };
  g.__growthTimer = setInterval(() => void tick(), 3 * MIN);
  setTimeout(() => void tick(), 90_000);
}

// ---------- Statistiques ----------

export type GrowthOverview = {
  settings: GrowthSettings;
  caps: typeof GROWTH_CAPS;
  today: GrowthToday;
  paused: { until: number; reason: string | null } | null;
  started: boolean;
  lastScanAt: number | null;
  totals: { newFollowers: number; followBacks: number; engagedFollows: number; welcomes: number; skipped: number };
  queue: { follows: number; welcomes: number; next: { username: string; picture: string | null; action: "follow" | "welcome"; reason: string | null; at: number }[] };
  recent: { username: string; fullName: string | null; picture: string | null; at: number; followedBack: boolean; welcomed: boolean }[];
};

export function growthOverview(): GrowthOverview {
  const st = getState();
  const n = (sql: string, ...args: (string | number)[]) => (db.prepare(sql).get(...args) as { n: number }).n;
  const since = Date.now() - 30 * DAY;
  const next = db
    .prepare(
      `SELECT username, picture, 'follow' AS action, follow_reason AS reason, follow_due AS at FROM ig_people WHERE follow_status = 'due'
       UNION ALL SELECT username, picture, 'welcome', NULL, welcome_due FROM ig_people WHERE welcome_status = 'due'
       ORDER BY at LIMIT 6`,
    )
    .all() as GrowthOverview["queue"]["next"];
  const recent = (
    db
      .prepare(`SELECT username, full_name, picture, followed_us_at, follow_status, welcome_status FROM ig_people WHERE followed_us_at IS NOT NULL ORDER BY followed_us_at DESC LIMIT 8`)
      .all() as { username: string; full_name: string | null; picture: string | null; followed_us_at: number; follow_status: string | null; welcome_status: string | null }[]
  ).map((r) => ({ username: r.username, fullName: r.full_name, picture: r.picture, at: r.followed_us_at, followedBack: r.follow_status === "done", welcomed: r.welcome_status === "done" }));
  return {
    settings: getGrowth(),
    caps: GROWTH_CAPS,
    today: growthToday(),
    paused: st.pausedUntil && st.pausedUntil > Date.now() ? { until: st.pausedUntil, reason: st.pauseReason } : null,
    started: Boolean(st.startedAt),
    lastScanAt: st.lastScanAt,
    totals: {
      newFollowers: n(`SELECT COUNT(*) AS n FROM ig_people WHERE followed_us_at >= ?`, since),
      followBacks: n(`SELECT COUNT(*) AS n FROM ig_people WHERE followed_at >= ? AND follow_reason = 'follower'`, since),
      engagedFollows: n(`SELECT COUNT(*) AS n FROM ig_people WHERE followed_at >= ? AND follow_reason != 'follower'`, since),
      welcomes: n(`SELECT COUNT(*) AS n FROM ig_people WHERE welcomed_at >= ?`, since),
      skipped: n(`SELECT COUNT(*) AS n FROM ig_people WHERE follow_status = 'skipped' AND created_at >= ?`, since),
    },
    queue: {
      follows: n(`SELECT COUNT(*) AS n FROM ig_people WHERE follow_status = 'due'`),
      welcomes: n(`SELECT COUNT(*) AS n FROM ig_people WHERE welcome_status = 'due'`),
      next,
    },
    recent,
  };
}
