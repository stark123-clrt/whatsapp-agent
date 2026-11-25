import "server-only";

import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Base de données locale (SQLite intégré à Node.js) : discussions et messages.
 * Fichier : data/agent.db — les médias (photos, vocaux…) sont dans data/media/.
 */

export const DATA_DIR = path.join(process.cwd(), "data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");

export type Sender = "contact" | "ai" | "human";
/** Canaux de messagerie. Seul WhatsApp est branché pour l'instant. */
export type Channel = "whatsapp" | "instagram" | "messenger" | "telegram" | "sms" | "email";
export type MessageType = "text" | "image" | "audio" | "video" | "document";

export type Chat = {
  jid: string; // identifiant de la discussion sur son canal
  channel: Channel;
  phone: string | null;
  name: string | null; // nom affiché sur WhatsApp
  customName: string | null; // nom choisi dans l'appli (prioritaire)
  email: string | null;
  notes: string | null;
  tags: string[];
  aiPaused: boolean;
  dnd: boolean; // « Ne pas déranger » : aucune réponse automatique
  archived: boolean;
  spam: boolean;
  testContact: boolean; // l'IA répond toujours à ce contact (en plus de la liste .env)
  followups: boolean; // relances automatiques autorisées (préférence, utilisée plus tard)
  aiCounterResetAt: number;
  summary: string | null;
  summaryAt: number | null;
  agentId: number | null; // agent IA qui gère la discussion
  aiCount: number; // réponses IA envoyées dans cette discussion
  draft: string | null; // brouillon préparé par l'IA (mode « brouillons uniquement »)
  pendingReply: boolean; // réponse en attente (hors heures d'activité)
  followupStage: number; // relances déjà envoyées
  unread: number;
  lastAt: number;
  createdAt: number;
  lastText: string | null;
  lastSender: Sender | null;
  lastType: MessageType | null;
};

export type Message = {
  id: string;
  jid: string;
  sender: Sender;
  type: MessageType;
  text: string | null; // texte, légende, transcription du vocal ou nom du document
  mediaFile: string | null; // nom du fichier dans data/media
  mime: string | null;
  ts: number;
  /** Statut WhatsApp d'un message envoyé : 1 en attente, 2 envoyé ✓, 3 distribué ✓✓, 4 lu ✓✓ vert. */
  status?: number;
  replyTo?: string | null; // id du message cité
  myReaction?: string | null;
  theirReaction?: string | null;
  starred?: boolean;
  deleted?: boolean;
};

export type ChatStats = {
  total: number;
  received: number;
  sent: number;
  ai: number;
  human: number;
  aiSinceReset: number; // réponses IA depuis la dernière remise à zéro du compteur
};

export type Task = { id: number; jid: string; text: string; done: boolean; createdAt: number };
export type ChatFile = Pick<Message, "id" | "type" | "text" | "mime" | "ts" | "sender">;

function open() {
  mkdirSync(MEDIA_DIR, { recursive: true });
  // timeout : si un autre processus utilise la base (construction en parallèle), on attend au lieu d'échouer.
  const db = new DatabaseSync(path.join(DATA_DIR, "agent.db"), { timeout: 15_000 });
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      phone TEXT,
      name TEXT,
      ai_paused INTEGER NOT NULL DEFAULT 0,
      unread INTEGER NOT NULL DEFAULT 0,
      last_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      jid TEXT NOT NULL REFERENCES chats(jid),
      sender TEXT NOT NULL,
      type TEXT NOT NULL,
      text TEXT,
      media_file TEXT,
      mime TEXT,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_by_chat ON messages(jid, ts);
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jid TEXT NOT NULL,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);
  // Colonnes ajoutées au fil des versions (pour les bases déjà créées).
  const cols = new Set((db.prepare(`PRAGMA table_info(chats)`).all() as { name: string }[]).map((c) => c.name));
  const added: [string, string][] = [
    ["channel", "TEXT NOT NULL DEFAULT 'whatsapp'"],
    ["custom_name", "TEXT"],
    ["email", "TEXT"],
    ["notes", "TEXT"],
    ["tags", "TEXT NOT NULL DEFAULT '[]'"],
    ["dnd", "INTEGER NOT NULL DEFAULT 0"],
    ["archived", "INTEGER NOT NULL DEFAULT 0"],
    ["spam", "INTEGER NOT NULL DEFAULT 0"],
    ["test_contact", "INTEGER NOT NULL DEFAULT 0"],
    ["followups", "INTEGER NOT NULL DEFAULT 1"],
    ["ai_counter_reset_at", "INTEGER NOT NULL DEFAULT 0"],
    ["summary", "TEXT"],
    ["summary_at", "INTEGER"],
    ["agent_id", "INTEGER"],
    ["ai_count", "INTEGER NOT NULL DEFAULT 0"],
    ["draft", "TEXT"],
    ["pending_reply", "INTEGER NOT NULL DEFAULT 0"],
    ["followup_stage", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [name, def] of added) {
    if (!cols.has(name)) db.exec(`ALTER TABLE chats ADD COLUMN ${name} ${def}`);
  }
  const msgCols = new Set((db.prepare(`PRAGMA table_info(messages)`).all() as { name: string }[]).map((c) => c.name));
  const msgAdded: [string, string][] = [
    ["status", "INTEGER NOT NULL DEFAULT 0"],
    ["reply_to", "TEXT"],
    ["my_reaction", "TEXT"],
    ["their_reaction", "TEXT"],
    ["starred", "INTEGER NOT NULL DEFAULT 0"],
    ["deleted", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [name, def] of msgAdded) {
    if (!msgCols.has(name)) db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${def}`);
  }
  // Messages envoyés sans statut connu (anciens, ou envoyés depuis le téléphone) : au moins « envoyé ✓ ».
  db.exec(`UPDATE messages SET status = 2 WHERE sender != 'contact' AND status < 2`);
  return db;
}

const g = globalThis as typeof globalThis & { __db?: DatabaseSync };
export const db = (g.__db ??= open());

type ChatRow = {
  jid: string;
  channel: Channel;
  phone: string | null;
  name: string | null;
  custom_name: string | null;
  email: string | null;
  notes: string | null;
  tags: string;
  ai_paused: number;
  dnd: number;
  archived: number;
  spam: number;
  test_contact: number;
  followups: number;
  ai_counter_reset_at: number;
  summary: string | null;
  summary_at: number | null;
  agent_id: number | null;
  ai_count: number;
  draft: string | null;
  pending_reply: number;
  followup_stage: number;
  unread: number;
  last_at: number;
  created_at: number;
  last_text: string | null;
  last_sender: Sender | null;
  last_type: MessageType | null;
};

const toChat = (r: ChatRow): Chat => ({
  jid: r.jid,
  channel: r.channel,
  phone: r.phone,
  name: r.name,
  customName: r.custom_name,
  email: r.email,
  notes: r.notes,
  tags: parseTags(r.tags),
  aiPaused: r.ai_paused === 1,
  dnd: r.dnd === 1,
  archived: r.archived === 1,
  spam: r.spam === 1,
  testContact: r.test_contact === 1,
  followups: r.followups === 1,
  aiCounterResetAt: r.ai_counter_reset_at,
  summary: r.summary,
  summaryAt: r.summary_at,
  agentId: r.agent_id,
  aiCount: r.ai_count,
  draft: r.draft,
  pendingReply: r.pending_reply === 1,
  followupStage: r.followup_stage,
  unread: r.unread,
  lastAt: r.last_at,
  createdAt: r.created_at,
  lastText: r.last_text,
  lastSender: r.last_sender,
  lastType: r.last_type,
});

function parseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

type MessageRow = {
  id: string;
  jid: string;
  sender: Sender;
  type: MessageType;
  text: string | null;
  media_file: string | null;
  mime: string | null;
  ts: number;
  status: number;
  reply_to: string | null;
  my_reaction: string | null;
  their_reaction: string | null;
  starred: number;
  deleted: number;
};

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  jid: r.jid,
  sender: r.sender,
  type: r.type,
  text: r.text,
  mediaFile: r.media_file,
  mime: r.mime,
  ts: r.ts,
  status: r.status,
  replyTo: r.reply_to,
  myReaction: r.my_reaction,
  theirReaction: r.their_reaction,
  starred: r.starred === 1,
  deleted: r.deleted === 1,
});

const CHAT_SELECT = `
  SELECT c.*, m.text AS last_text, m.sender AS last_sender, m.type AS last_type
  FROM chats c
  LEFT JOIN messages m ON m.id = (
    SELECT id FROM messages WHERE jid = c.jid ORDER BY ts DESC LIMIT 1
  )`;

export function upsertChat(chat: {
  jid: string;
  channel: Channel;
  phone: string | null;
  name?: string | null;
}) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO chats (jid, channel, phone, name, last_at, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(jid) DO UPDATE SET
       phone = COALESCE(excluded.phone, chats.phone),
       name = COALESCE(excluded.name, chats.name)`,
  ).run(chat.jid, chat.channel, chat.phone, chat.name ?? null, now, now);
}

/** Enregistre un message. Renvoie false s'il était déjà enregistré. */
export function saveMessage(m: Message): boolean {
  const res = db
    .prepare(
      `INSERT OR IGNORE INTO messages (id, jid, sender, type, text, media_file, mime, ts, status, reply_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(m.id, m.jid, m.sender, m.type, m.text, m.mediaFile, m.mime, m.ts, m.status ?? 0, m.replyTo ?? null);
  if (res.changes === 0) return false;
  const incoming = m.sender === "contact" ? 1 : 0;
  // Un nouveau message du contact sort la discussion des archives (sauf si c'est du spam).
  db.prepare(
    `UPDATE chats SET last_at = MAX(last_at, ?), unread = unread + ?,
       archived = CASE WHEN ? = 1 AND spam = 0 THEN 0 ELSE archived END
     WHERE jid = ?`,
  ).run(m.ts, incoming, incoming, m.jid);
  return true;
}

/** Met à jour le statut d'envoi (il ne fait qu'avancer : envoyé → distribué → lu). Renvoie false si le message est inconnu. */
export function setMessageStatus(id: string, status: number): boolean {
  if (!messageExists(id)) return false;
  db.prepare(`UPDATE messages SET status = MAX(status, ?) WHERE id = ?`).run(status, id);
  return true;
}

export function setReaction(id: string, who: "me" | "them", emoji: string | null) {
  db.prepare(`UPDATE messages SET ${who === "me" ? "my_reaction" : "their_reaction"} = ? WHERE id = ?`).run(emoji, id);
}

export function setStarred(id: string, starred: boolean) {
  db.prepare(`UPDATE messages SET starred = ? WHERE id = ?`).run(starred ? 1 : 0, id);
}

/** Message supprimé pour tout le monde : on garde la bulle « Ce message a été supprimé ». */
export function markDeleted(id: string) {
  const m = getMessage(id);
  if (m?.mediaFile) rmSync(path.join(MEDIA_DIR, path.basename(m.mediaFile)), { force: true });
  db.prepare(`UPDATE messages SET deleted = 1, text = NULL, media_file = NULL, my_reaction = NULL, their_reaction = NULL WHERE id = ?`).run(id);
}

/** Supprime un message de l'appli seulement. */
export function removeMessage(id: string) {
  const m = getMessage(id);
  if (m?.mediaFile) rmSync(path.join(MEDIA_DIR, path.basename(m.mediaFile)), { force: true });
  db.prepare(`DELETE FROM messages WHERE id = ?`).run(id);
}

export function messageExists(id: string) {
  return Boolean(db.prepare(`SELECT 1 FROM messages WHERE id = ?`).get(id));
}

export function listChats(): Chat[] {
  return (db.prepare(`${CHAT_SELECT} ORDER BY c.last_at DESC`).all() as ChatRow[]).map(toChat);
}

export function getChat(jid: string): Chat | null {
  const row = db.prepare(`${CHAT_SELECT} WHERE c.jid = ?`).get(jid) as ChatRow | undefined;
  return row ? toChat(row) : null;
}

export function getMessages(jid: string, limit = 200): Message[] {
  const rows = db
    .prepare(`SELECT * FROM (SELECT * FROM messages WHERE jid = ? ORDER BY ts DESC LIMIT ?) ORDER BY ts`)
    .all(jid, limit) as MessageRow[];
  return rows.map(toMessage);
}

export function getMessage(id: string): Message | null {
  const row = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as MessageRow | undefined;
  return row ? toMessage(row) : null;
}

export function setAiPaused(jid: string, paused: boolean) {
  db.prepare(`UPDATE chats SET ai_paused = ? WHERE jid = ?`).run(paused ? 1 : 0, jid);
}

export function markRead(jid: string) {
  db.prepare(`UPDATE chats SET unread = 0 WHERE jid = ?`).run(jid);
}

export function setChatAgent(jid: string, agentId: number | null) {
  db.prepare(`UPDATE chats SET agent_id = ? WHERE jid = ?`).run(agentId, jid);
}

export function incAiCount(jid: string) {
  db.prepare(`UPDATE chats SET ai_count = ai_count + 1 WHERE jid = ?`).run(jid);
}

export function setDraft(jid: string, draft: string | null) {
  db.prepare(`UPDATE chats SET draft = ? WHERE jid = ?`).run(draft, jid);
}

export function setPendingReply(jid: string, pending: boolean) {
  db.prepare(`UPDATE chats SET pending_reply = ? WHERE jid = ?`).run(pending ? 1 : 0, jid);
}

export function setFollowupStage(jid: string, stage: number) {
  db.prepare(`UPDATE chats SET followup_stage = ? WHERE jid = ?`).run(stage, jid);
}

/** Discussions à surveiller par le planificateur (réponses en attente, relances). */
export function chatsForScheduler(): (Chat & { lastSenderTs: number })[] {
  const rows = db
    .prepare(
      `${CHAT_SELECT} WHERE c.spam = 0 AND c.archived = 0 AND c.dnd = 0 AND (c.pending_reply = 1 OR c.followups = 1)`,
    )
    .all() as ChatRow[];
  return rows.map((r) => ({ ...toChat(r), lastSenderTs: r.last_at }));
}

export function markUnread(jid: string) {
  db.prepare(`UPDATE chats SET unread = MAX(unread, 1) WHERE jid = ?`).run(jid);
}

export type ChatUpdate = Partial<
  Pick<Chat, "customName" | "email" | "notes" | "tags" | "dnd" | "archived" | "spam" | "testContact" | "followups">
>;

/** Met à jour les infos d'une discussion (seulement les champs fournis). */
export function updateChat(jid: string, u: ChatUpdate) {
  const set: string[] = [];
  const values: (string | number | null)[] = [];
  const add = (column: string, value: string | number | null) => {
    set.push(`${column} = ?`);
    values.push(value);
  };
  const text = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
  if ("customName" in u) add("custom_name", text(u.customName));
  if ("email" in u) add("email", text(u.email));
  if ("notes" in u) add("notes", text(u.notes));
  if (u.tags) add("tags", JSON.stringify([...new Set(u.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20)));
  if (typeof u.dnd === "boolean") add("dnd", u.dnd ? 1 : 0);
  if (typeof u.archived === "boolean") add("archived", u.archived ? 1 : 0);
  if (typeof u.spam === "boolean") add("spam", u.spam ? 1 : 0);
  if (typeof u.testContact === "boolean") add("test_contact", u.testContact ? 1 : 0);
  if (typeof u.followups === "boolean") add("followups", u.followups ? 1 : 0);
  if (set.length) db.prepare(`UPDATE chats SET ${set.join(", ")} WHERE jid = ?`).run(...values, jid);
}

/** Supprime une discussion, ses messages et ses fichiers. */
export function deleteChat(jid: string) {
  const files = db.prepare(`SELECT media_file FROM messages WHERE jid = ? AND media_file IS NOT NULL`).all(jid) as {
    media_file: string;
  }[];
  for (const f of files) rmSync(path.join(MEDIA_DIR, path.basename(f.media_file)), { force: true });
  rmSync(path.join(MEDIA_DIR, "avatars", `${jid.replace(/[^\w-]/g, "_")}.jpg`), { force: true });
  db.prepare(`DELETE FROM messages WHERE jid = ?`).run(jid);
  db.prepare(`DELETE FROM tasks WHERE jid = ?`).run(jid);
  db.prepare(`DELETE FROM chats WHERE jid = ?`).run(jid);
}

/** Tous les tags déjà utilisés (pour les suggestions). */
export function allTags(): string[] {
  const rows = db.prepare(`SELECT tags FROM chats WHERE tags != '[]'`).all() as { tags: string }[];
  return [...new Set(rows.flatMap((r) => parseTags(r.tags)))].sort((a, b) => a.localeCompare(b, "fr"));
}

export function getStats(jid: string): ChatStats {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(m.sender = 'contact') AS received,
              SUM(m.sender != 'contact') AS sent,
              SUM(m.sender = 'ai') AS ai,
              SUM(m.sender = 'human') AS human,
              SUM(m.sender = 'ai' AND m.ts > c.ai_counter_reset_at) AS aiSinceReset
       FROM messages m JOIN chats c ON c.jid = m.jid WHERE m.jid = ?`,
    )
    .get(jid) as Record<keyof ChatStats, number | null>;
  return {
    total: r.total ?? 0,
    received: r.received ?? 0,
    sent: r.sent ?? 0,
    ai: r.ai ?? 0,
    human: r.human ?? 0,
    aiSinceReset: r.aiSinceReset ?? 0,
  };
}

/** Fichiers partagés dans la discussion (photos, vocaux, vidéos, documents). */
export function getFiles(jid: string): ChatFile[] {
  return db
    .prepare(
      `SELECT id, type, text, mime, ts, sender FROM messages
       WHERE jid = ? AND media_file IS NOT NULL ORDER BY ts DESC LIMIT 50`,
    )
    .all(jid) as ChatFile[];
}

/** Dates clés de la discussion (pour la section « Activité »). */
export function getActivity(jid: string) {
  const first = (sender: Sender) =>
    (db.prepare(`SELECT MIN(ts) AS ts FROM messages WHERE jid = ? AND sender = ?`).get(jid, sender) as {
      ts: number | null;
    }).ts;
  return { firstContact: first("contact"), firstAi: first("ai"), firstHuman: first("human") };
}

export function setSummary(jid: string, summary: string) {
  db.prepare(`UPDATE chats SET summary = ?, summary_at = ? WHERE jid = ?`).run(summary, Date.now(), jid);
}

export function resetAiCounter(jid: string) {
  db.prepare(`UPDATE chats SET ai_counter_reset_at = ? WHERE jid = ?`).run(Date.now(), jid);
}

type TaskRow = { id: number; jid: string; text: string; done: number; created_at: number };
const toTask = (t: TaskRow): Task => ({ id: t.id, jid: t.jid, text: t.text, done: t.done === 1, createdAt: t.created_at });

export function getTasks(jid: string): Task[] {
  return (db.prepare(`SELECT * FROM tasks WHERE jid = ? ORDER BY done, created_at DESC`).all(jid) as TaskRow[]).map(toTask);
}

export function addTask(jid: string, text: string) {
  db.prepare(`INSERT INTO tasks (jid, text, created_at) VALUES (?, ?, ?)`).run(jid, text.trim(), Date.now());
}

export function updateTask(id: number, done: boolean) {
  db.prepare(`UPDATE tasks SET done = ? WHERE id = ?`).run(done ? 1 : 0, id);
}

export function deleteTask(id: number) {
  db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
}
