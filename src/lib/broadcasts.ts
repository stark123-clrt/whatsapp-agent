import "server-only";

import { sendBroadcastMessage } from "./agent";
import { generateReply } from "./ai";
import { broadcastWithDefaults, fillVariables, spin, spintaxCount, type Broadcast, type BroadcastSettings, type BroadcastStats, type BroadcastStatus } from "./broadcast-types";
import { getList, listMembers } from "./contact-lists";
import { listContacts } from "./contacts";
import { db, getChat, setAiPaused, setChatAgent } from "./db";
import { getAgent } from "./kb";
import { getSocket, getWhatsAppState } from "./whatsapp";

/**
 * Diffusions WhatsApp (numéro WhatsApp Web, non officiel) : un message à une liste de contacts,
 * envoyé comme le ferait une personne prudente pour protéger le numéro :
 * - une seule diffusion envoie à la fois, un message toutes les 30 à 90 s (pauses plus longues régulièrement) ;
 * - « en train d'écrire… » avant chaque message, texte différent pour chacun (variantes {a|b}) ;
 * - montée en charge sur 61 jours, surtout pour les contacts qui ne t'ont jamais écrit ;
 * - heures et jours d'envoi, mode progressif (N par jour), pause automatique si les erreurs s'enchaînent ;
 * - « STOP » désinscrit le contact de toutes les diffusions.
 * Les réponses arrivent dans Discussions : l'agent choisi répond, ou l'équipe (IA en pause).
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS broadcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    settings TEXT NOT NULL DEFAULT '{}',
    note TEXT,
    created_at INTEGER NOT NULL,
    launched_at INTEGER,
    finished_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS broadcast_recipients (
    broadcast_id INTEGER NOT NULL,
    jid TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    cold INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    reason TEXT,
    text TEXT,
    msg_id TEXT,
    sent_at INTEGER,
    replied_at INTEGER,
    followup_status TEXT,
    followup_msg_id TEXT,
    followup_at INTEGER,
    PRIMARY KEY (broadcast_id, jid)
  );
  CREATE INDEX IF NOT EXISTS broadcast_recipients_status ON broadcast_recipients(broadcast_id, status);
  CREATE INDEX IF NOT EXISTS broadcast_recipients_jid ON broadcast_recipients(jid, sent_at);
  CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
{
  const cols = new Set((db.prepare(`PRAGMA table_info(chats)`).all() as { name: string }[]).map((c) => c.name));
  if (!cols.has("broadcast_optout")) db.exec(`ALTER TABLE chats ADD COLUMN broadcast_optout INTEGER NOT NULL DEFAULT 0`);
  const bcols = new Set((db.prepare(`PRAGMA table_info(broadcasts)`).all() as { name: string }[]).map((c) => c.name));
  if (!bcols.has("updated_at")) db.exec(`ALTER TABLE broadcasts ADD COLUMN updated_at INTEGER`);
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const WARMUP_DAYS = 61;

// ---------- Protection du numéro : montée en charge ----------

function getKey<T>(key: string, fallback: T): T {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key) as { value: string } | undefined;
  try {
    return row ? (JSON.parse(row.value) as T) : fallback;
  } catch {
    return fallback;
  }
}
function setKey(key: string, value: unknown) {
  db.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, JSON.stringify(value));
}

const parisDay = (ts: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(ts);
function parisDayStart(ts: number) {
  const day = parisDay(ts);
  const guess = Date.parse(`${day}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
  const h = Number(parts.find((p) => p.type === "hour")?.value) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return guess - (h * 60 + m) * 60_000;
}

export type Quota = { day: number; totalDays: number; coldCap: number; coldLeft: number; dailyCap: number; dailyLeft: number };

/** Plafonds du jour : envois au total, et à des contacts qui ne t'ont jamais écrit (les plus risqués). */
export function quota(now = Date.now()): Quota {
  const started = getKey<number | null>("broadcast_started_at", null);
  const day = started ? Math.min(WARMUP_DAYS, Math.floor((parisDayStart(now) - parisDayStart(started)) / DAY) + 1) : 1;
  const t = (day - 1) / (WARMUP_DAYS - 1);
  const coldCap = Math.round(5 + t * 45); // 5 → 50 par jour
  const dailyCap = Math.round(60 + t * 240); // 60 → 300 par jour
  const start = parisDayStart(now);
  const sent = (db.prepare(`SELECT COUNT(*) AS n FROM broadcast_recipients WHERE sent_at >= ?`).get(start) as { n: number }).n;
  const fsent = (db.prepare(`SELECT COUNT(*) AS n FROM broadcast_recipients WHERE followup_at >= ? AND followup_status = 'sent'`).get(start) as { n: number }).n;
  const cold = (db.prepare(`SELECT COUNT(*) AS n FROM broadcast_recipients WHERE sent_at >= ? AND cold = 1`).get(start) as { n: number }).n;
  return { day, totalDays: WARMUP_DAYS, coldCap, coldLeft: Math.max(0, coldCap - cold), dailyCap, dailyLeft: Math.max(0, dailyCap - sent - fsent) };
}

// ---------- Lecture ----------

type Row = { id: number; name: string; status: BroadcastStatus; settings: string; note: string | null; created_at: number; updated_at: number | null; launched_at: number | null; finished_at: number | null };

function statsOf(id: number): BroadcastStats {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS total,
         SUM(r.status = 'pending') AS pending,
         SUM(r.status = 'sent') AS sent,
         SUM(r.status = 'sent' AND m.status >= 3) AS delivered,
         SUM(r.status = 'sent' AND m.status >= 4) AS read,
         SUM(r.replied_at IS NOT NULL) AS replied,
         SUM(r.status = 'failed') AS failed,
         SUM(r.status = 'skipped') AS skipped,
         SUM(c.broadcast_optout = 1 AND r.status = 'sent') AS optout
       FROM broadcast_recipients r LEFT JOIN messages m ON m.id = r.msg_id LEFT JOIN chats c ON c.jid = r.jid
       WHERE r.broadcast_id = ?`,
    )
    .get(id) as Record<keyof BroadcastStats, number | null>;
  const n = (k: keyof BroadcastStats) => Number(r[k] ?? 0);
  return { total: n("total"), pending: n("pending"), sent: n("sent"), delivered: n("delivered"), read: n("read"), replied: n("replied"), failed: n("failed"), skipped: n("skipped"), optout: n("optout") };
}

function toBroadcast(r: Row): Broadcast {
  const settings = broadcastWithDefaults(JSON.parse(r.settings || "{}"));
  const list = settings.listId ? (db.prepare(`SELECT name FROM contact_lists WHERE id = ?`).get(settings.listId) as { name: string } | undefined) : undefined;
  return { id: r.id, name: r.name, status: r.status, settings, note: r.note, createdAt: r.created_at, updatedAt: r.updated_at ?? r.created_at, launchedAt: r.launched_at, finishedAt: r.finished_at, stats: statsOf(r.id), listName: list?.name ?? null };
}

export function listBroadcasts(): Broadcast[] {
  return (db.prepare(`SELECT * FROM broadcasts ORDER BY created_at DESC`).all() as Row[]).map(toBroadcast);
}

export function getBroadcast(id: number): Broadcast | null {
  const r = db.prepare(`SELECT * FROM broadcasts WHERE id = ?`).get(id) as Row | undefined;
  return r ? toBroadcast(r) : null;
}

export type Recipient = { jid: string; name: string | null; phone: string | null; status: string; reason: string | null; text: string | null; sentAt: number | null; repliedAt: number | null; delivery: number; followup: string | null };

export function listRecipients(id: number): Recipient[] {
  return (
    db
      .prepare(
        `SELECT r.jid, r.name, r.phone, r.status, r.reason, r.text, r.sent_at, r.replied_at, r.followup_status, COALESCE(m.status, 0) AS delivery
         FROM broadcast_recipients r LEFT JOIN messages m ON m.id = r.msg_id WHERE r.broadcast_id = ? ORDER BY r.sent_at IS NULL, r.sent_at DESC, r.name`,
      )
      .all(id) as { jid: string; name: string | null; phone: string | null; status: string; reason: string | null; text: string | null; sent_at: number | null; replied_at: number | null; followup_status: string | null; delivery: number }[]
  ).map((r) => ({ jid: r.jid, name: r.name, phone: r.phone, status: r.status, reason: r.reason, text: r.text, sentAt: r.sent_at, repliedAt: r.replied_at, delivery: r.delivery, followup: r.followup_status }));
}

// ---------- Création, modification ----------

export function createBroadcast(name?: string): Broadcast {
  const today = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  const r = db.prepare(`INSERT INTO broadcasts (name, status, settings, created_at) VALUES (?, 'draft', ?, ?)`).run((name ?? "").trim() || `Diffusion du ${today}`, JSON.stringify(broadcastWithDefaults({})), Date.now());
  return getBroadcast(Number(r.lastInsertRowid))!;
}

export function updateBroadcast(id: number, patch: { name?: string; settings?: Partial<BroadcastSettings> }): Broadcast {
  const b = getBroadcast(id);
  if (!b) throw new Error("Diffusion introuvable.");
  if (b.status !== "draft" && b.status !== "scheduled") throw new Error("Une diffusion lancée ne se modifie plus (mets-la en pause ou annule-la).");
  const settings = broadcastWithDefaults({ ...b.settings, ...patch.settings });
  settings.message = settings.message.slice(0, 1600);
  settings.followup.message = settings.followup.message.slice(0, 1000);
  settings.followup.afterHours = Math.min(168, Math.max(12, Number(settings.followup.afterHours) || 48));
  settings.progressive.perDay = Math.min(500, Math.max(5, Number(settings.progressive.perDay) || 50));
  const name = (patch.name ?? b.name).trim().slice(0, 100) || b.name;
  db.prepare(`UPDATE broadcasts SET name = ?, settings = ?, updated_at = ? WHERE id = ?`).run(name, JSON.stringify(settings), Date.now(), id);
  return getBroadcast(id)!;
}

/** Copie d'une diffusion (brouillon, mêmes réglages, sans les envois). */
export function duplicateBroadcast(id: number): Broadcast {
  const b = getBroadcast(id);
  if (!b) throw new Error("Diffusion introuvable.");
  const s = { ...b.settings, schedule: { mode: "now" as const, at: null } };
  const r = db.prepare(`INSERT INTO broadcasts (name, status, settings, created_at, updated_at) VALUES (?, 'draft', ?, ?, ?)`).run(`${b.name} (copie)`.slice(0, 100), JSON.stringify(s), Date.now(), Date.now());
  return getBroadcast(Number(r.lastInsertRowid))!;
}

export function deleteBroadcast(id: number) {
  const b = getBroadcast(id);
  if (!b) return;
  if (b.status === "sending") throw new Error("Mets d'abord la diffusion en pause.");
  // Les messages déjà envoyés restent dans les discussions : seul le suivi de la diffusion est supprimé.
  db.prepare(`DELETE FROM broadcast_recipients WHERE broadcast_id = ?`).run(id);
  db.prepare(`DELETE FROM broadcasts WHERE id = ?`).run(id);
}

/** Ce qui bloque le lancement (vide = prêt). */
export function launchProblems(b: Broadcast): string[] {
  const s = b.settings;
  const out: string[] = [];
  if (!s.listId || !getList(s.listId)) out.push("Choisis une liste de contacts.");
  if (!s.message.trim()) out.push("Écris le message d'ouverture.");
  if (!s.identical && spintaxCount(s.message) < 2) out.push("Variantes de message requises : sans variantes, le même texte part à tout le monde, ce qui fait restreindre les numéros WhatsApp.");
  if (s.agentId && !getAgent(s.agentId)) out.push("L'agent choisi n'existe plus.");
  if (s.followup.enabled && !s.followup.message.trim()) out.push("Écris le message de relance (ou désactive la relance).");
  if (s.schedule.mode === "later" && (!s.schedule.at || s.schedule.at < Date.now() - MIN)) out.push("Choisis une date d'envoi dans le futur.");
  return out;
}

/** Destinataires figés au départ : WhatsApp uniquement, jamais les désinscrits ni « Ne pas déranger ». */
function prepareRecipients(b: Broadcast) {
  const list = getList(b.settings.listId!);
  if (!list) throw new Error("La liste n'existe plus.");
  const members = listMembers(list, listContacts());
  const optout = new Set((db.prepare(`SELECT jid FROM chats WHERE broadcast_optout = 1`).all() as { jid: string }[]).map((r) => r.jid));
  const insert = db.prepare(`INSERT OR IGNORE INTO broadcast_recipients (broadcast_id, jid, name, phone, cold, status, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const c of members) {
    let reason: string | null = null;
    if (c.channel !== "whatsapp" || !c.phone) reason = c.channel === "whatsapp" ? "Pas de numéro" : `Contact ${c.channel === "instagram" ? "Instagram" : "du site"} (WhatsApp uniquement)`;
    else if (optout.has(c.jid)) reason = "Désinscrit (STOP)";
    else if (c.dnd) reason = "« Ne pas déranger »";
    insert.run(b.id, c.jid, c.name, c.phone, c.received === 0 ? 1 : 0, reason ? "skipped" : "pending", reason);
  }
}

export function launchBroadcast(id: number): Broadcast {
  const b = getBroadcast(id);
  if (!b) throw new Error("Diffusion introuvable.");
  if (b.status !== "draft") throw new Error("Cette diffusion est déjà lancée.");
  const problems = launchProblems(b);
  if (problems.length) throw new Error(problems[0]);
  if (!getKey<number | null>("broadcast_started_at", null)) setKey("broadcast_started_at", Date.now());
  if (b.settings.schedule.mode === "later") {
    db.prepare(`UPDATE broadcasts SET status = 'scheduled', note = NULL, launched_at = ? WHERE id = ?`).run(Date.now(), id);
  } else {
    prepareRecipients(b);
    db.prepare(`UPDATE broadcasts SET status = 'sending', note = NULL, launched_at = ? WHERE id = ?`).run(Date.now(), id);
  }
  return getBroadcast(id)!;
}

export function setBroadcastState(id: number, action: "pause" | "resume" | "cancel"): Broadcast {
  const b = getBroadcast(id);
  if (!b) throw new Error("Diffusion introuvable.");
  if (action === "pause" && b.status === "sending") db.prepare(`UPDATE broadcasts SET status = 'paused', note = 'Mise en pause par toi.' WHERE id = ?`).run(id);
  if (action === "resume" && b.status === "paused") db.prepare(`UPDATE broadcasts SET status = 'sending', note = NULL WHERE id = ?`).run(id);
  if (action === "cancel" && ["scheduled", "sending", "paused"].includes(b.status)) {
    db.prepare(`UPDATE broadcast_recipients SET status = 'skipped', reason = 'Diffusion annulée' WHERE broadcast_id = ? AND status = 'pending'`).run(id);
    db.prepare(`UPDATE broadcasts SET status = 'cancelled', finished_at = ?, note = NULL WHERE id = ?`).run(Date.now(), id);
  }
  return getBroadcast(id)!;
}

// ---------- Réponses et désinscriptions ----------

const STOP = /^\s*(stop|arr[eê]te?r?|d[ée]sinscri(s|re|ption)|unsubscribe|ne plus recevoir)\b/i;

/** Un contact WhatsApp a écrit : réponse à une diffusion (stats), et « STOP » le désinscrit. */
export function noteBroadcastReply(jid: string, text: string) {
  try {
    const now = Date.now();
    db.prepare(`UPDATE broadcast_recipients SET replied_at = ? WHERE jid = ? AND status = 'sent' AND replied_at IS NULL AND sent_at > ?`).run(now, jid, now - 14 * DAY);
    if (text.length <= 40 && STOP.test(text)) {
      db.prepare(`UPDATE chats SET broadcast_optout = 1 WHERE jid = ?`).run(jid);
      db.prepare(`UPDATE broadcast_recipients SET status = 'skipped', reason = 'Désinscrit (STOP)' WHERE jid = ? AND status = 'pending'`).run(jid);
      console.log(`[diffusions] ${jid.split("@")[0].slice(-4).padStart(8, "•")} s'est désinscrit (STOP)`);
    }
  } catch {
    /* diffusions jamais utilisées */
  }
}

export function setOptout(jid: string, optout: boolean) {
  db.prepare(`UPDATE chats SET broadcast_optout = ? WHERE jid = ?`).run(optout ? 1 : 0, jid);
}

// ---------- Variantes par l'IA ----------

export async function addVariants(message: string): Promise<string> {
  const text = message.trim();
  if (!text) throw new Error("Écris d'abord ton message.");
  const out = await generateReply(
    [
      {
        role: "system",
        content:
          "Tu ajoutes des variantes (spintax) à un message WhatsApp en français. Format : {option1|option2|option3}, sans imbrication. " +
          "Mets des variantes sur la salutation, quelques verbes, adjectifs et la formule de fin (5 à 10 groupes), sans changer le sens, le ton ni les informations (prix, liens, codes, dates restent identiques). " +
          "Garde tel quel tout ce qui est entre doubles accolades, comme {{first_name}}. Réponds uniquement avec le message transformé, sans guillemets ni explication.",
      },
      { role: "user", content: text },
    ],
    { temperature: 0.7, maxTokens: 1500 },
  );
  const result = out.replace(/^["«\s]+|["»\s]+$/g, "").trim();
  if (spintaxCount(result) < 2) throw new Error("L'IA n'a pas réussi à ajouter de variantes : réessaie ou écris-les toi-même.");
  return result.slice(0, 1600);
}

// ---------- Envoi ----------

function inWindow(s: BroadcastSettings, now: number) {
  if (!s.window.enabled) return true;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.find((p) => p.type === "weekday")?.value ?? "") + 1;
  const hm = `${String(Number(parts.find((p) => p.type === "hour")?.value) % 24).padStart(2, "0")}:${parts.find((p) => p.type === "minute")?.value}`;
  return s.window.days.includes(wd) && hm >= s.window.start && hm < s.window.end;
}

function setNote(id: number, note: string | null) {
  db.prepare(`UPDATE broadcasts SET note = ? WHERE id = ? AND (note IS NOT ? )`).run(note, id, note);
}

type Pending = { jid: string; name: string | null; phone: string | null; cold: number };

const g = globalThis as typeof globalThis & { __bcTimer?: NodeJS.Timeout; __bcBusy?: boolean; __bcNextAt?: number; __bcFails?: number; __bcBurst?: number };

async function step() {
  const now = Date.now();
  // Diffusions programmées arrivées à l'heure : destinataires figés maintenant.
  for (const r of db.prepare(`SELECT * FROM broadcasts WHERE status = 'scheduled'`).all() as Row[]) {
    const b = toBroadcast(r);
    if ((b.settings.schedule.at ?? 0) <= now) {
      try {
        prepareRecipients(b);
        db.prepare(`UPDATE broadcasts SET status = 'sending', note = NULL WHERE id = ?`).run(b.id);
      } catch (err) {
        db.prepare(`UPDATE broadcasts SET status = 'paused', note = ? WHERE id = ?`).run(err instanceof Error ? err.message : String(err), b.id);
      }
    }
  }
  const sending = (db.prepare(`SELECT * FROM broadcasts WHERE status = 'sending' ORDER BY launched_at`).all() as Row[]).map(toBroadcast);
  if (!sending.length) return;
  const sock = getWhatsAppState().status === "open" ? getSocket() : null;
  if (!sock) {
    for (const b of sending) setNote(b.id, "WhatsApp est déconnecté : l'envoi reprendra tout seul à la reconnexion.");
    return;
  }
  if (now < (g.__bcNextAt ?? 0)) return;
  const q = quota(now);

  for (const b of sending) {
    const s = b.settings;
    // Fin de diffusion : plus personne à qui envoyer (les relances continuent ensuite, voir plus bas).
    if (!b.stats.pending) {
      db.prepare(`UPDATE broadcasts SET status = 'done', finished_at = ?, note = NULL WHERE id = ?`).run(now, b.id);
      continue;
    }
    if (!inWindow(s, now)) {
      setNote(b.id, `En attente des heures d'envoi (${s.window.start} – ${s.window.end}).`);
      continue;
    }
    if (q.dailyLeft <= 0) {
      setNote(b.id, `Plafond du jour atteint (${q.dailyCap} messages, jour ${q.day} sur ${q.totalDays} de la montée en charge) : reprise demain.`);
      continue;
    }
    if (s.progressive.enabled) {
      const today = (db.prepare(`SELECT COUNT(*) AS n FROM broadcast_recipients WHERE broadcast_id = ? AND sent_at >= ?`).get(b.id, parisDayStart(now)) as { n: number }).n;
      if (today >= s.progressive.perDay) {
        setNote(b.id, `Mode progressif : ${s.progressive.perDay} envois aujourd'hui, la suite demain.`);
        continue;
      }
    }
    const next = (
      q.coldLeft > 0
        ? db.prepare(`SELECT jid, name, phone, cold FROM broadcast_recipients WHERE broadcast_id = ? AND status = 'pending' ORDER BY cold, rowid LIMIT 1`).get(b.id)
        : db.prepare(`SELECT jid, name, phone, cold FROM broadcast_recipients WHERE broadcast_id = ? AND status = 'pending' AND cold = 0 ORDER BY rowid LIMIT 1`).get(b.id)
    ) as Pending | undefined;
    if (!next) {
      setNote(b.id, `Les contacts restants ne t'ont jamais écrit : ${q.coldCap} par jour au maximum pendant la montée en charge (jour ${q.day} sur ${q.totalDays}). Reprise demain.`);
      continue;
    }
    const chat = getChat(next.jid);
    const text = fillVariables(s.identical ? s.message : spin(s.message), { name: chat?.customName ?? next.name, phone: next.phone });
    try {
      if (s.agentId) setChatAgent(next.jid, s.agentId);
      else setAiPaused(next.jid, true); // l'équipe gère les réponses : pas d'IA dans ces discussions
      const id = await sendBroadcastMessage(sock, next.jid, text, s.media, s.agentId ? "ai" : "human", s.agentId);
      db.prepare(`UPDATE broadcast_recipients SET status = 'sent', text = ?, msg_id = ?, sent_at = ?, reason = NULL WHERE broadcast_id = ? AND jid = ?`).run(text, id, Date.now(), b.id, next.jid);
      g.__bcFails = 0;
      setNote(b.id, null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      db.prepare(`UPDATE broadcast_recipients SET status = 'failed', reason = ?, text = ? WHERE broadcast_id = ? AND jid = ?`).run(msg.slice(0, 200), text, b.id, next.jid);
      g.__bcFails = (g.__bcFails ?? 0) + 1;
      if (g.__bcFails >= 5) {
        db.prepare(`UPDATE broadcasts SET status = 'paused', note = ? WHERE id = ?`).run(`Pause automatique : 5 échecs d'affilée (dernier : ${msg.slice(0, 120)}). Vérifie WhatsApp puis reprends.`, b.id);
        g.__bcFails = 0;
      }
    }
    // Rythme humain : 30 à 90 s entre deux messages, une vraie pause tous les 15 à 25 envois.
    g.__bcBurst = (g.__bcBurst ?? 0) + 1;
    const longBreak = !s.urgent && g.__bcBurst >= 15 + Math.floor(Math.random() * 10);
    if (longBreak) g.__bcBurst = 0;
    g.__bcNextAt = Date.now() + (s.urgent ? 6_000 + Math.random() * 9_000 : longBreak ? 5 * MIN + Math.random() * 5 * MIN : 30_000 + Math.random() * 60_000);
    return; // un seul message par tour, toutes diffusions confondues
  }
}

/** Relances : une seule, aux personnes qui n'ont pas répondu après le délai choisi. */
async function followups() {
  const now = Date.now();
  if (now < (g.__bcNextAt ?? 0)) return;
  const sock = getWhatsAppState().status === "open" ? getSocket() : null;
  if (!sock) return;
  const rows = (db.prepare(`SELECT * FROM broadcasts WHERE status IN ('sending', 'done')`).all() as Row[]).map(toBroadcast).filter((b) => b.settings.followup.enabled);
  const q = quota(now);
  if (q.dailyLeft <= 0) return;
  for (const b of rows) {
    const s = b.settings;
    if (!inWindow(s, now)) continue;
    const r = db
      .prepare(
        `SELECT r.jid, r.name, r.phone FROM broadcast_recipients r JOIN chats c ON c.jid = r.jid
         WHERE r.broadcast_id = ? AND r.status = 'sent' AND r.replied_at IS NULL AND r.followup_status IS NULL AND r.sent_at <= ? AND r.sent_at > ? AND c.broadcast_optout = 0 AND c.dnd = 0
         ORDER BY r.sent_at LIMIT 1`,
      )
      .get(b.id, now - s.followup.afterHours * HOUR, now - (s.followup.afterHours + 72) * HOUR) as Pending | undefined;
    if (!r) continue;
    const chat = getChat(r.jid);
    // Le contact a écrit depuis (même sans être compté comme réponse) : pas de relance.
    const text = fillVariables(spin(s.followup.message), { name: chat?.customName ?? r.name, phone: r.phone });
    try {
      const id = await sendBroadcastMessage(sock, r.jid, text, null, s.agentId ? "ai" : "human", s.agentId);
      db.prepare(`UPDATE broadcast_recipients SET followup_status = 'sent', followup_msg_id = ?, followup_at = ? WHERE broadcast_id = ? AND jid = ?`).run(id, Date.now(), b.id, r.jid);
    } catch {
      db.prepare(`UPDATE broadcast_recipients SET followup_status = 'failed', followup_at = ? WHERE broadcast_id = ? AND jid = ?`).run(Date.now(), b.id, r.jid);
    }
    g.__bcNextAt = Date.now() + 30_000 + Math.random() * 60_000;
    return;
  }
}

export function startBroadcastScheduler() {
  if (g.__bcTimer) return;
  g.__bcTimer = setInterval(async () => {
    if (g.__bcBusy) return;
    g.__bcBusy = true;
    try {
      await step();
      await followups();
    } catch (err) {
      console.error(`[diffusions] ${err instanceof Error ? err.message : err}`);
    } finally {
      g.__bcBusy = false;
    }
  }, 10_000);
}
