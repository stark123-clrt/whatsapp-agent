import "server-only";

import { db } from "./db";
import "./followers"; // crée les tables de croissance si besoin

/** Tableau de bord Instagram : progression du compte et travail de l'agent, jour par jour (30 jours). */

export type DayStats = {
  day: string; // AAAA-MM-JJ (heure de Paris)
  followers: number | null; // relevé du jour (null si pas de relevé)
  newFollowers: number;
  follows: number; // abonnements faits par l'agent (retour + personnes engagées)
  welcomes: number;
  posts: number;
  stories: number;
  comments: number;
  dms: number; // messages privés reçus
};

export type IgStats = {
  days: DayStats[];
  followersNow: number | null;
  followingNow: number | null;
  gained: number | null; // abonnés gagnés sur la période (d'après les relevés)
  totals: { newFollowers: number; follows: number; welcomes: number; posts: number; stories: number; comments: number; answered: number; dms: number; pollVotes: number; conversations: number };
};

const DAY = 86_400_000;
const dayKey = (ts: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(ts);

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback; // table pas encore créée (fonction jamais utilisée)
  }
}

export function instagramStats(days = 30): IgStats {
  const now = Date.now();
  const since = now - days * DAY;
  const map = new Map<string, DayStats>();
  for (let i = days - 1; i >= 0; i--) {
    const d = dayKey(now - i * DAY);
    map.set(d, { day: d, followers: null, newFollowers: 0, follows: 0, welcomes: 0, posts: 0, stories: 0, comments: 0, dms: 0 });
  }
  const bump = (ts: number | null, key: keyof Omit<DayStats, "day" | "followers">) => {
    if (!ts) return;
    const row = map.get(dayKey(ts));
    if (row) row[key] += 1;
  };

  const snaps = safe(() => db.prepare(`SELECT day, followers, following FROM ig_stats_daily WHERE day >= ? ORDER BY day`).all(dayKey(since)) as { day: string; followers: number; following: number }[], []);
  for (const s of snaps) {
    const row = map.get(s.day);
    if (row) row.followers = s.followers;
  }

  const people = safe(
    () => db.prepare(`SELECT followed_us_at, followed_at, welcomed_at FROM ig_people WHERE followed_us_at >= ? OR followed_at >= ? OR welcomed_at >= ?`).all(since, since, since) as { followed_us_at: number | null; followed_at: number | null; welcomed_at: number | null }[],
    [],
  );
  for (const p of people) {
    if (p.followed_us_at && p.followed_us_at >= since) bump(p.followed_us_at, "newFollowers");
    if (p.followed_at && p.followed_at >= since) bump(p.followed_at, "follows");
    if (p.welcomed_at && p.welcomed_at >= since) bump(p.welcomed_at, "welcomes");
  }

  const published = safe(() => db.prepare(`SELECT kind, published_at, poll_results FROM campaign_posts WHERE status = 'published' AND published_at >= ?`).all(since) as { kind: string; published_at: number; poll_results: string | null }[], []);
  let pollVotes = 0;
  for (const p of published) {
    bump(p.published_at, p.kind === "story" ? "stories" : "posts");
    if (p.poll_results) pollVotes += safe(() => (JSON.parse(p.poll_results as string) as { count: number }[]).reduce((n, x) => n + (x.count || 0), 0), 0);
  }

  const comments = safe(() => db.prepare(`SELECT ts, status FROM campaign_comments WHERE ts >= ?`).all(since) as { ts: number; status: string }[], []);
  for (const c of comments) bump(c.ts, "comments");

  const dms = safe(
    () => db.prepare(`SELECT m.ts, m.jid FROM messages m JOIN chats c ON c.jid = m.jid WHERE c.channel = 'instagram' AND m.sender = 'contact' AND m.ts >= ?`).all(since) as { ts: number; jid: string }[],
    [],
  );
  for (const m of dms) bump(m.ts, "dms");

  const list = [...map.values()];
  const sum = (k: keyof Omit<DayStats, "day" | "followers">) => list.reduce((n, d) => n + d[k], 0);
  const latest = snaps.at(-1) ?? null;
  return {
    days: list,
    followersNow: latest?.followers ?? null,
    followingNow: latest?.following ?? null,
    gained: snaps.length >= 2 ? snaps[snaps.length - 1].followers - snaps[0].followers : null,
    totals: {
      newFollowers: sum("newFollowers"),
      follows: sum("follows"),
      welcomes: sum("welcomes"),
      posts: sum("posts"),
      stories: sum("stories"),
      comments: sum("comments"),
      answered: comments.filter((c) => c.status === "done").length,
      dms: sum("dms"),
      pollVotes,
      conversations: new Set(dms.map((m) => m.jid)).size,
    },
  };
}
