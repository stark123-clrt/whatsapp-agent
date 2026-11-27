import "server-only";

import { db, type Channel } from "./db";
import { channelAgent } from "./routing";

/**
 * Tableau de bord : chiffres de la messagerie sur une période, filtrés par agent et par tags,
 * comparés à la période précédente de même durée. Les discussions sans agent attribué comptent
 * pour l'agent de leur canal (celui qui leur répondrait).
 */

export type DashFilters = { from: number; to: number; agentId: number | null; tags: string[] };

export type Metric = { value: number; previous: number; series: number[] };

export type Dashboard = {
  range: { from: number; to: number; bucket: "hour" | "day" | "week" };
  labels: number[]; // début de chaque intervalle (série)
  metrics: {
    received: Metric;
    aiReplies: Metric;
    humanReplies: Metric;
    conversations: Metric; // discussions actives (au moins un message reçu)
    newChats: Metric;
    aiShare: Metric; // % des réponses écrites par l'IA
    responseTime: Metric; // médiane, en secondes
    delivered: Metric; // WhatsApp : messages envoyés délivrés
    read: Metric; // WhatsApp : messages envoyés lus
  };
  channels: { channel: Channel; received: number; replies: number }[];
  hours: number[]; // messages reçus par heure de la journée (heure de Paris)
  deals: { created: number; createdValue: number; won: number; wonValue: number; lost: number };
  instagram: { followers: number | null; published: number } | null;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const parisHour = (ts: number) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(ts)) % 24;

type ChatRow = { jid: string; channel: Channel; agent_id: number | null; tags: string; created_at: number; spam: number };
type MsgRow = { jid: string; sender: string; ts: number; status: number };

function parseTags(raw: string): string[] {
  try {
    const t = JSON.parse(raw);
    return Array.isArray(t) ? t.map(String) : [];
  } catch {
    return [];
  }
}

/** Discussions concernées par les filtres (agent, tags). Les discussions marquées spam sont exclues. */
function matchingChats(f: DashFilters): Map<string, ChatRow> {
  const rows = db.prepare(`SELECT jid, channel, agent_id, tags, created_at, spam FROM chats`).all() as ChatRow[];
  const defaults = new Map<Channel, number | null>();
  const effectiveAgent = (c: ChatRow) => {
    if (c.agent_id) return c.agent_id;
    if (!defaults.has(c.channel)) defaults.set(c.channel, channelAgent(c.channel)?.id ?? null);
    return defaults.get(c.channel) ?? null;
  };
  const wanted = f.tags.map((t) => t.toLowerCase());
  const out = new Map<string, ChatRow>();
  for (const c of rows) {
    if (c.spam) continue;
    if (f.agentId && effectiveAgent(c) !== f.agentId) continue;
    if (wanted.length && !parseTags(c.tags).some((t) => wanted.includes(t.toLowerCase()))) continue;
    out.set(c.jid, c);
  }
  return out;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function buildDashboard(f: DashFilters): Dashboard {
  const span = Math.max(HOUR, f.to - f.from);
  const prevFrom = f.from - span;
  const bucket: Dashboard["range"]["bucket"] = span <= 2 * DAY ? "hour" : span <= 100 * DAY ? "day" : "week";
  const step = bucket === "hour" ? HOUR : bucket === "day" ? DAY : 7 * DAY;
  const n = Math.max(1, Math.ceil(span / step));
  const labels = Array.from({ length: n }, (_, i) => f.from + i * step);
  const idx = (ts: number) => Math.min(n - 1, Math.max(0, Math.floor((ts - f.from) / step)));

  const chats = matchingChats(f);
  const msgs = (db.prepare(`SELECT jid, sender, ts, status FROM messages WHERE ts >= ? AND ts < ? AND deleted = 0 ORDER BY jid, ts`).all(prevFrom, f.to) as MsgRow[]).filter((m) => chats.has(m.jid));

  const zero = () => Array<number>(n).fill(0);
  const series = { received: zero(), ai: zero(), human: zero(), delivered: zero(), read: zero(), newChats: zero() };
  const cur = { received: 0, ai: 0, human: 0, delivered: 0, read: 0, newChats: 0 };
  const prev = { received: 0, ai: 0, human: 0, delivered: 0, read: 0, newChats: 0 };
  const activeCur = new Set<string>();
  const activePrev = new Set<string>();
  const activeSeries: Set<string>[] = Array.from({ length: n }, () => new Set());
  const waitsCur: number[] = [];
  const waitsPrev: number[] = [];
  const waitSeries: number[][] = Array.from({ length: n }, () => []);
  const channels = new Map<Channel, { received: number; replies: number }>();
  const hours = Array<number>(24).fill(0);

  let waitingSince: { jid: string; ts: number } | null = null;
  for (const m of msgs) {
    const inCur = m.ts >= f.from;
    const tgt = inCur ? cur : prev;
    const channel = chats.get(m.jid)!.channel;
    if (waitingSince && waitingSince.jid !== m.jid) waitingSince = null;
    if (m.sender === "contact") {
      tgt.received++;
      (inCur ? activeCur : activePrev).add(m.jid);
      if (inCur) {
        series.received[idx(m.ts)]++;
        activeSeries[idx(m.ts)].add(m.jid);
        hours[parisHour(m.ts)]++;
        const c = channels.get(channel) ?? { received: 0, replies: 0 };
        c.received++;
        channels.set(channel, c);
      }
      if (!waitingSince) waitingSince = { jid: m.jid, ts: m.ts };
      continue;
    }
    // Réponse (IA ou humain)
    const isAi = m.sender === "ai";
    if (isAi) tgt.ai++;
    else tgt.human++;
    if (waitingSince) {
      const wait = (m.ts - waitingSince.ts) / 1000;
      if (wait >= 0 && wait < 3 * 86_400) {
        (inCur ? waitsCur : waitsPrev).push(wait);
        if (inCur) waitSeries[idx(m.ts)].push(wait);
      }
      waitingSince = null;
    }
    if (channel === "whatsapp") {
      if (m.status >= 3) tgt.delivered++;
      if (m.status >= 4) tgt.read++;
    }
    if (inCur) {
      series[isAi ? "ai" : "human"][idx(m.ts)]++;
      if (channel === "whatsapp") {
        if (m.status >= 3) series.delivered[idx(m.ts)]++;
        if (m.status >= 4) series.read[idx(m.ts)]++;
      }
      const c = channels.get(channel) ?? { received: 0, replies: 0 };
      c.replies++;
      channels.set(channel, c);
    }
  }
  for (const c of chats.values()) {
    if (c.created_at >= f.from && c.created_at < f.to) {
      cur.newChats++;
      series.newChats[idx(c.created_at)]++;
    } else if (c.created_at >= prevFrom && c.created_at < f.from) prev.newChats++;
  }

  const pct = (a: number, h: number) => (a + h ? Math.round((a / (a + h)) * 100) : 0);
  const metric = (value: number, previous: number, s: number[]): Metric => ({ value, previous, series: s });

  // Opportunités liées aux discussions filtrées (sans filtre : toutes).
  const filtered = Boolean(f.agentId || f.tags.length);
  const deals = { created: 0, createdValue: 0, won: 0, wonValue: 0, lost: 0 };
  try {
    const rows = db.prepare(`SELECT jid, value, created_at, won_at, lost_at FROM deals WHERE created_at >= ? OR won_at >= ? OR lost_at >= ?`).all(f.from, f.from, f.from) as {
      jid: string | null;
      value: number;
      created_at: number;
      won_at: number | null;
      lost_at: number | null;
    }[];
    for (const d of rows) {
      if (filtered && !(d.jid && chats.has(d.jid))) continue;
      const within = (t: number | null) => t !== null && t >= f.from && t < f.to;
      if (within(d.created_at)) {
        deals.created++;
        deals.createdValue += d.value;
      }
      if (within(d.won_at)) {
        deals.won++;
        deals.wonValue += d.value;
      }
      if (within(d.lost_at)) deals.lost++;
    }
  } catch {
    /* opportunités jamais utilisées */
  }

  let instagram: Dashboard["instagram"] = null;
  try {
    const snap = db.prepare(`SELECT followers FROM ig_stats_daily ORDER BY day DESC LIMIT 1`).get() as { followers: number } | undefined;
    const pub = db.prepare(`SELECT COUNT(*) AS n FROM campaign_posts WHERE status = 'published' AND published_at >= ? AND published_at < ?`).get(f.from, f.to) as { n: number };
    instagram = { followers: snap?.followers ?? null, published: pub.n };
  } catch {
    instagram = null;
  }

  return {
    range: { from: f.from, to: f.to, bucket },
    labels,
    metrics: {
      received: metric(cur.received, prev.received, series.received),
      aiReplies: metric(cur.ai, prev.ai, series.ai),
      humanReplies: metric(cur.human, prev.human, series.human),
      conversations: metric(activeCur.size, activePrev.size, activeSeries.map((s) => s.size)),
      newChats: metric(cur.newChats, prev.newChats, series.newChats),
      aiShare: metric(pct(cur.ai, cur.human), pct(prev.ai, prev.human), series.ai.map((a, i) => pct(a, series.human[i]))),
      responseTime: metric(Math.round(median(waitsCur)), Math.round(median(waitsPrev)), waitSeries.map((w) => Math.round(median(w)))),
      delivered: metric(cur.delivered, prev.delivered, series.delivered),
      read: metric(cur.read, prev.read, series.read),
    },
    channels: [...channels.entries()].map(([channel, v]) => ({ channel, ...v })).sort((a, b) => b.received + b.replies - (a.received + a.replies)),
    hours,
    deals,
    instagram,
  };
}
