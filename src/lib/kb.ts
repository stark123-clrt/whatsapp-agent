import "server-only";

import { withDefaults, instructionsText, type AgentSettings } from "./agent-settings";
import { db, reassignAgentChats } from "./db";

/**
 * Agents IA et base de connaissances (sites importés, pages, FAQ).
 * Tables créées ici, dans la même base SQLite que les discussions.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'sales',
    language TEXT NOT NULL DEFAULT 'fr',
    instructions TEXT NOT NULL DEFAULT '',
    website TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    is_default INTEGER NOT NULL DEFAULT 0,
    preparing INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS kb_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER,
    kind TEXT NOT NULL DEFAULT 'site',
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS kb_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    content TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER,
    agent_id INTEGER,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    section TEXT,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS agent_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    snapshot TEXT NOT NULL,
    note TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS agent_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    file TEXT NOT NULL,
    mime TEXT NOT NULL,
    name TEXT NOT NULL,
    when_to_send TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS faqs_by_page ON faqs(page_id);
  CREATE INDEX IF NOT EXISTS pages_by_source ON kb_pages(source_id);
`);
{
  const cols = new Set((db.prepare(`PRAGMA table_info(messages)`).all() as { name: string }[]).map((c) => c.name));
  if (!cols.has("agent_id")) db.exec(`ALTER TABLE messages ADD COLUMN agent_id INTEGER`);
  // Nom de l'agent auteur, gardé sur le message même si l'agent est supprimé (rempli pour l'existant).
  if (cols.has("agent_name") || db.prepare(`PRAGMA table_info(messages)`).all().some((c) => (c as { name: string }).name === "agent_name")) {
    db.exec(`UPDATE messages SET agent_name = (SELECT name FROM agents WHERE agents.id = messages.agent_id)
             WHERE agent_name IS NULL AND agent_id IS NOT NULL`);
  }
  const agentCols = new Set((db.prepare(`PRAGMA table_info(agents)`).all() as { name: string }[]).map((c) => c.name));
  if (!agentCols.has("settings")) db.exec(`ALTER TABLE agents ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'`);
  if (!agentCols.has("prep_phase")) db.exec(`ALTER TABLE agents ADD COLUMN prep_phase TEXT`);
}

export type AgentRole = "sales" | "support";
export type Agent = {
  id: number;
  name: string;
  role: AgentRole;
  language: string;
  instructions: string;
  website: string | null;
  status: "active" | "paused";
  isDefault: boolean;
  preparing: boolean;
  createdAt: number;
  updatedAt: number;
  settings: AgentSettings;
};
export type AgentWithStats = Agent & {
  sent: number;
  replies: number;
  pages: { total: number; ready: number; errors: number; pending: number };
  faqCount: number;
};
export type PageStatus = "pending" | "processing" | "ready" | "error";
export type KbPage = { id: number; sourceId: number; url: string; title: string | null; status: PageStatus; error: string | null; updatedAt: number; faqCount: number };
export type KbSource = { id: number; agentId: number | null; kind: "site" | "document"; name: string; createdAt: number; pages: KbPage[] };
export type Faq = { id: number; pageId: number | null; agentId: number | null; question: string; answer: string; section: string | null; used: number; createdAt: number };

type AgentRow = {
  id: number; name: string; role: AgentRole; language: string; instructions: string; website: string | null;
  status: "active" | "paused"; is_default: number; preparing: number; created_at: number; updated_at: number;
  settings: string;
};

function parseSettings(r: AgentRow): AgentSettings {
  let raw: unknown = {};
  try {
    raw = JSON.parse(r.settings || "{}");
  } catch {
    raw = {};
  }
  const s = withDefaults(raw);
  // Anciennes instructions en un seul bloc : elles deviennent la section « Persona ».
  if (!instructionsText(s) && r.instructions.trim()) s.sections.persona = r.instructions;
  return s;
}
const toAgent = (r: AgentRow): Agent => ({
  id: r.id, name: r.name, role: r.role, language: r.language, instructions: r.instructions, website: r.website,
  status: r.status, isDefault: r.is_default === 1, preparing: r.preparing === 1, createdAt: r.created_at, updatedAt: r.updated_at,
  settings: parseSettings(r),
});

/** Enregistre les réglages (et garde une version pour l'historique). */
export function saveAgentSettings(id: number, settings: AgentSettings, note = "Modification") {
  const agent = getAgent(id);
  if (!agent) return;
  db.prepare(`INSERT INTO agent_versions (agent_id, snapshot, note, created_at) VALUES (?, ?, ?, ?)`).run(
    id, JSON.stringify(agent.settings), note, Date.now(),
  );
  // On ne garde que les 30 dernières versions.
  db.prepare(
    `DELETE FROM agent_versions WHERE agent_id = ? AND id NOT IN (SELECT id FROM agent_versions WHERE agent_id = ? ORDER BY id DESC LIMIT 30)`,
  ).run(id, id);
  db.prepare(`UPDATE agents SET settings = ?, instructions = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(settings), instructionsText(settings), Date.now(), id,
  );
}

export function listVersions(agentId: number) {
  return (db.prepare(`SELECT id, note, created_at FROM agent_versions WHERE agent_id = ? ORDER BY id DESC`).all(agentId) as {
    id: number; note: string | null; created_at: number;
  }[]).map((v) => ({ id: v.id, note: v.note, createdAt: v.created_at }));
}

export function restoreVersion(agentId: number, versionId: number) {
  const v = db.prepare(`SELECT snapshot FROM agent_versions WHERE id = ? AND agent_id = ?`).get(versionId, agentId) as
    | { snapshot: string }
    | undefined;
  if (!v) return false;
  saveAgentSettings(agentId, withDefaults(JSON.parse(v.snapshot)), "Avant restauration");
  return true;
}

// ---------- Médias de l'agent ----------

export type AgentMedia = { id: number; agentId: number; file: string; mime: string; name: string; whenToSend: string; createdAt: number };

export function listAgentMedia(agentId: number): AgentMedia[] {
  return (db.prepare(`SELECT * FROM agent_media WHERE agent_id = ? ORDER BY id`).all(agentId) as {
    id: number; agent_id: number; file: string; mime: string; name: string; when_to_send: string; created_at: number;
  }[]).map((m) => ({ id: m.id, agentId: m.agent_id, file: m.file, mime: m.mime, name: m.name, whenToSend: m.when_to_send, createdAt: m.created_at }));
}

export function addAgentMedia(agentId: number, file: string, mime: string, name: string, whenToSend: string) {
  db.prepare(`INSERT INTO agent_media (agent_id, file, mime, name, when_to_send, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    agentId, file, mime, name, whenToSend, Date.now(),
  );
}

export function updateAgentMedia(id: number, whenToSend: string) {
  db.prepare(`UPDATE agent_media SET when_to_send = ? WHERE id = ?`).run(whenToSend, id);
}

export function deleteAgentMedia(id: number): string | null {
  const m = db.prepare(`SELECT file FROM agent_media WHERE id = ?`).get(id) as { file: string } | undefined;
  db.prepare(`DELETE FROM agent_media WHERE id = ?`).run(id);
  return m?.file ?? null;
}

export function getAgentMedia(id: number): AgentMedia | null {
  return listAgentMediaById(id);
}
function listAgentMediaById(id: number): AgentMedia | null {
  const m = db.prepare(`SELECT * FROM agent_media WHERE id = ?`).get(id) as
    | { id: number; agent_id: number; file: string; mime: string; name: string; when_to_send: string; created_at: number }
    | undefined;
  return m ? { id: m.id, agentId: m.agent_id, file: m.file, mime: m.mime, name: m.name, whenToSend: m.when_to_send, createdAt: m.created_at } : null;
}

// ---------- Statistiques (Vue d'ensemble) ----------

export function agentOverview(agentId: number, days: number) {
  const since = Date.now() - days * 86_400_000;
  const one = <T,>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T;
  const aiReplies = one<{ n: number }>(`SELECT COUNT(*) AS n FROM messages WHERE agent_id = ? AND sender = 'ai' AND ts >= ?`, agentId, since).n;
  const chats = `SELECT jid FROM chats WHERE agent_id = ${Number(agentId)}`;
  const received = one<{ n: number }>(`SELECT COUNT(*) AS n FROM messages WHERE sender = 'contact' AND ts >= ? AND jid IN (${chats})`, since).n;
  const human = one<{ n: number }>(`SELECT COUNT(*) AS n FROM messages WHERE sender = 'human' AND ts >= ? AND jid IN (${chats})`, since).n;
  const newContacts = one<{ n: number }>(`SELECT COUNT(*) AS n FROM chats WHERE agent_id = ? AND created_at >= ?`, agentId, since).n;
  const mix = db
    .prepare(
      `SELECT jid, SUM(sender = 'ai') AS ai, SUM(sender = 'human') AS human FROM messages
       WHERE ts >= ? AND jid IN (${chats}) GROUP BY jid`,
    )
    .all(since) as { jid: string; ai: number; human: number }[];
  const recent = db
    .prepare(
      `SELECT m.sender, m.ts, COALESCE(c.custom_name, c.name, c.phone) AS who FROM messages m JOIN chats c ON c.jid = m.jid
       WHERE c.agent_id = ? ORDER BY m.ts DESC LIMIT 12`,
    )
    .all(agentId) as { sender: string; ts: number; who: string | null }[];
  return {
    aiReplies,
    received,
    human,
    newContacts,
    conversations: {
      aiOnly: mix.filter((m) => m.ai > 0 && m.human === 0).length,
      humanOnly: mix.filter((m) => m.human > 0 && m.ai === 0).length,
      mixed: mix.filter((m) => m.ai > 0 && m.human > 0).length,
    },
    recent,
  };
}

// ---------- Agents ----------

/** Étape de construction d'un agent (affichée dans l'écran « On construit votre agent »). */
export type PrepPhase = "pages" | "instructions";

/** Progression détaillée de la construction d'un agent. */
export function agentProgress(id: number) {
  const row = db.prepare(`SELECT name, preparing, prep_phase, instructions FROM agents WHERE id = ?`).get(id) as
    | { name: string; preparing: number; prep_phase: PrepPhase | null; instructions: string }
    | undefined;
  if (!row) return null;
  const pages = db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(p.status = 'ready') AS ready, SUM(p.status = 'error') AS errors
       FROM kb_pages p JOIN kb_sources s ON s.id = p.source_id WHERE s.agent_id = ?`,
    )
    .get(id) as Record<string, number | null>;
  const faqs = (db.prepare(`SELECT COUNT(*) AS n FROM faqs WHERE agent_id = ?`).get(id) as { n: number }).n;
  return {
    name: row.name,
    preparing: row.preparing === 1,
    phase: row.preparing === 1 ? (row.prep_phase ?? "pages") : null,
    pages: { total: pages.total ?? 0, ready: pages.ready ?? 0, errors: pages.errors ?? 0 },
    faqs,
    hasInstructions: row.instructions.trim().length > 0,
  };
}

export function listAgents(): AgentWithStats[] {
  const agents = (db.prepare(`SELECT * FROM agents ORDER BY is_default DESC, created_at`).all() as AgentRow[]).map(toAgent);
  return agents.map((a) => {
    const msg = db
      .prepare(`SELECT COUNT(*) AS sent, COUNT(DISTINCT jid) AS chats FROM messages WHERE sender = 'ai' AND agent_id = ?`)
      .get(a.id) as { sent: number; chats: number };
    const pages = db
      .prepare(
        `SELECT COUNT(*) AS total, SUM(p.status = 'ready') AS ready, SUM(p.status = 'error') AS errors,
                SUM(p.status IN ('pending','processing')) AS pending
         FROM kb_pages p JOIN kb_sources s ON s.id = p.source_id WHERE s.agent_id = ?`,
      )
      .get(a.id) as Record<string, number | null>;
    const faqCount = (db.prepare(`SELECT COUNT(*) AS n FROM faqs WHERE agent_id = ?`).get(a.id) as { n: number }).n;
    return {
      ...a,
      sent: msg.sent,
      replies: msg.chats,
      pages: { total: pages.total ?? 0, ready: pages.ready ?? 0, errors: pages.errors ?? 0, pending: pages.pending ?? 0 },
      faqCount,
    };
  });
}

export function getAgent(id: number): Agent | null {
  const r = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as AgentRow | undefined;
  return r ? toAgent(r) : null;
}

/** L'agent qui répond aux nouvelles conversations (actif ou non). */
export function getDefaultAgent(): Agent | null {
  const r = db.prepare(`SELECT * FROM agents WHERE is_default = 1 LIMIT 1`).get() as AgentRow | undefined;
  return r ? toAgent(r) : null;
}

export function createAgent(a: { name: string; role: AgentRole; language: string; instructions: string; website: string | null }) {
  const now = Date.now();
  const isFirst = !(db.prepare(`SELECT 1 FROM agents LIMIT 1`).get());
  const res = db
    .prepare(
      `INSERT INTO agents (name, role, language, instructions, website, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(a.name, a.role, a.language, a.instructions, a.website, isFirst ? 1 : 0, now, now);
  return Number(res.lastInsertRowid);
}

export function updateAgent(
  id: number,
  u: Partial<Pick<Agent, "name" | "role" | "language" | "instructions" | "status" | "preparing">> & {
    isDefault?: boolean;
    prepPhase?: PrepPhase | null;
  },
) {
  const set: string[] = [];
  const values: (string | number)[] = [];
  const add = (c: string, v: string | number) => {
    set.push(`${c} = ?`);
    values.push(v);
  };
  if (u.name?.trim()) add("name", u.name.trim());
  if (u.role) add("role", u.role);
  if (u.language) add("language", u.language);
  if (typeof u.instructions === "string") add("instructions", u.instructions);
  if (u.status) add("status", u.status);
  if (typeof u.preparing === "boolean") add("preparing", u.preparing ? 1 : 0);
  if (u.prepPhase !== undefined) {
    set.push("prep_phase = ?");
    values.push(u.prepPhase ?? (null as unknown as string));
  }
  if (u.isDefault) db.prepare(`UPDATE agents SET is_default = 0`).run();
  if (u.isDefault) add("is_default", 1);
  if (!set.length) return;
  add("updated_at", Date.now());
  db.prepare(`UPDATE agents SET ${set.join(", ")} WHERE id = ?`).run(...values, id);
}

export function deleteAgent(id: number, reassignTo: number | null = null) {
  const wasDefault = Boolean(getAgent(id)?.isDefault);
  // Les discussions restent : elles sont confiées à un autre agent, ou l'IA y est mise en pause.
  reassignAgentChats(id, wasDefault, reassignTo && getAgent(reassignTo) ? reassignTo : null);
  const sources = db.prepare(`SELECT id FROM kb_sources WHERE agent_id = ?`).all(id) as { id: number }[];
  for (const s of sources) deleteSource(s.id);
  db.prepare(`DELETE FROM faqs WHERE agent_id = ?`).run(id);
  db.prepare(`DELETE FROM agents WHERE id = ?`).run(id);
  if (wasDefault) {
    // L'agent qui reprend ses discussions devient l'agent par défaut (sinon le plus ancien).
    const next = reassignTo && getAgent(reassignTo) ? reassignTo : null;
    if (next) db.prepare(`UPDATE agents SET is_default = 1 WHERE id = ?`).run(next);
    else db.prepare(`UPDATE agents SET is_default = 1 WHERE id = (SELECT id FROM agents ORDER BY created_at LIMIT 1)`).run();
  }
}

// ---------- Sources et pages ----------

export function createSource(agentId: number | null, kind: "site" | "document", name: string) {
  const res = db.prepare(`INSERT INTO kb_sources (agent_id, kind, name, created_at) VALUES (?, ?, ?, ?)`).run(agentId, kind, name, Date.now());
  return Number(res.lastInsertRowid);
}

export function addPage(sourceId: number, url: string, title: string | null, content: string | null = null) {
  const res = db
    .prepare(`INSERT INTO kb_pages (source_id, url, title, content, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run(sourceId, url, title, content, Date.now());
  return Number(res.lastInsertRowid);
}

type PageRow = { id: number; source_id: number; url: string; title: string | null; content: string | null; status: PageStatus; error: string | null; updated_at: number; faq_count: number };

export function getPage(id: number) {
  const r = db.prepare(`SELECT p.*, s.agent_id FROM kb_pages p JOIN kb_sources s ON s.id = p.source_id WHERE p.id = ?`).get(id) as
    | (PageRow & { agent_id: number | null })
    | undefined;
  return r ?? null;
}

export function setPageStatus(id: number, status: PageStatus, extra: { title?: string | null; content?: string; error?: string | null } = {}) {
  db.prepare(
    `UPDATE kb_pages SET status = ?, error = ?, title = COALESCE(?, title), content = COALESCE(?, content), updated_at = ? WHERE id = ?`,
  ).run(status, extra.error ?? null, extra.title ?? null, extra.content ?? null, Date.now(), id);
}

export function listSources(): KbSource[] {
  const sources = db.prepare(`SELECT * FROM kb_sources ORDER BY created_at DESC`).all() as {
    id: number; agent_id: number | null; kind: "site" | "document"; name: string; created_at: number;
  }[];
  const pages = db
    .prepare(
      `SELECT p.id, p.source_id, p.url, p.title, p.status, p.error, p.updated_at,
              (SELECT COUNT(*) FROM faqs f WHERE f.page_id = p.id) AS faq_count
       FROM kb_pages p ORDER BY p.url`,
    )
    .all() as PageRow[];
  return sources.map((s) => ({
    id: s.id,
    agentId: s.agent_id,
    kind: s.kind,
    name: s.name,
    createdAt: s.created_at,
    pages: pages
      .filter((p) => p.source_id === s.id)
      .map((p) => ({ id: p.id, sourceId: p.source_id, url: p.url, title: p.title, status: p.status, error: p.error, updatedAt: p.updated_at, faqCount: p.faq_count })),
  }));
}

export function pagesOfSource(sourceId: number): number[] {
  return (db.prepare(`SELECT id FROM kb_pages WHERE source_id = ?`).all(sourceId) as { id: number }[]).map((p) => p.id);
}

export function deletePage(id: number) {
  db.prepare(`DELETE FROM faqs WHERE page_id = ?`).run(id);
  db.prepare(`DELETE FROM kb_pages WHERE id = ?`).run(id);
}

/** Lie une source (et ses FAQ) à un agent. */
export function linkSource(id: number, agentId: number | null) {
  db.prepare(`UPDATE kb_sources SET agent_id = ? WHERE id = ?`).run(agentId, id);
  db.prepare(`UPDATE faqs SET agent_id = ? WHERE page_id IN (SELECT id FROM kb_pages WHERE source_id = ?)`).run(agentId, id);
}

export function deleteSource(id: number) {
  for (const p of pagesOfSource(id)) deletePage(p);
  db.prepare(`DELETE FROM kb_sources WHERE id = ?`).run(id);
}

/** Texte des pages prêtes d'un agent (pour rédiger ses instructions). */
export function agentPagesText(agentId: number, maxChars: number) {
  const rows = db
    .prepare(
      `SELECT p.url, p.title, p.content FROM kb_pages p JOIN kb_sources s ON s.id = p.source_id
       WHERE s.agent_id = ? AND p.status = 'ready' AND p.content IS NOT NULL ORDER BY length(p.url)`,
    )
    .all(agentId) as { url: string; title: string | null; content: string }[];
  let out = "";
  for (const r of rows) {
    const block = `\n\n### ${r.title ?? r.url} (${r.url})\n${r.content.slice(0, 4000)}`;
    if (out.length + block.length > maxChars) break;
    out += block;
  }
  return out.trim();
}

// ---------- FAQ ----------

type FaqRow = { id: number; page_id: number | null; agent_id: number | null; question: string; answer: string; section: string | null; used: number; created_at: number };
const toFaq = (r: FaqRow): Faq => ({
  id: r.id, pageId: r.page_id, agentId: r.agent_id, question: r.question, answer: r.answer, section: r.section, used: r.used, createdAt: r.created_at,
});

export function replacePageFaqs(pageId: number, agentId: number | null, faqs: { question: string; answer: string; section?: string }[]) {
  db.prepare(`DELETE FROM faqs WHERE page_id = ?`).run(pageId);
  const ins = db.prepare(`INSERT INTO faqs (page_id, agent_id, question, answer, section, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const f of faqs) ins.run(pageId, agentId, f.question, f.answer, f.section ?? null, Date.now());
}

export function listFaqs(filter: { pageId?: number; manual?: boolean } = {}): Faq[] {
  if (filter.pageId) return (db.prepare(`SELECT * FROM faqs WHERE page_id = ? ORDER BY id`).all(filter.pageId) as FaqRow[]).map(toFaq);
  if (filter.manual) return (db.prepare(`SELECT * FROM faqs WHERE page_id IS NULL ORDER BY id DESC`).all() as FaqRow[]).map(toFaq);
  return (db.prepare(`SELECT * FROM faqs ORDER BY id`).all() as FaqRow[]).map(toFaq);
}

export function addManualFaq(agentId: number | null, question: string, answer: string) {
  db.prepare(`INSERT INTO faqs (page_id, agent_id, question, answer, section, created_at) VALUES (NULL, ?, ?, ?, 'manuel', ?)`).run(
    agentId, question.trim(), answer.trim(), Date.now(),
  );
}

export function updateFaq(id: number, question: string, answer: string) {
  db.prepare(`UPDATE faqs SET question = ?, answer = ? WHERE id = ?`).run(question.trim(), answer.trim(), id);
}

export function deleteFaq(id: number) {
  db.prepare(`DELETE FROM faqs WHERE id = ?`).run(id);
}

export type FaqWithSource = Faq & { sourceUrl: string | null; agentName: string | null };

/** Toutes les FAQ (sources + ajoutées à la main), avec la page d'origine. */
export function listAllFaqs(): FaqWithSource[] {
  const rows = db
    .prepare(
      `SELECT f.*, p.url AS source_url, a.name AS agent_name
       FROM faqs f LEFT JOIN kb_pages p ON p.id = f.page_id LEFT JOIN agents a ON a.id = f.agent_id
       ORDER BY f.created_at DESC, f.id DESC`,
    )
    .all() as (FaqRow & { source_url: string | null; agent_name: string | null })[];
  return rows.map((r) => ({ ...toFaq(r), sourceUrl: r.source_url, agentName: r.agent_name }));
}

export function deleteFaqs(ids: number[]) {
  const stmt = db.prepare(`DELETE FROM faqs WHERE id = ?`);
  for (const id of ids) stmt.run(id);
}

const normalize = (q: string) =>
  q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Supprime les FAQ en double (même question), en gardant la plus utilisée. Renvoie le nombre supprimé. */
export function dedupeFaqs(): number {
  const all = db.prepare(`SELECT id, agent_id, question, used FROM faqs ORDER BY used DESC, id`).all() as {
    id: number; agent_id: number | null; question: string; used: number;
  }[];
  const seen = new Set<string>();
  const dup: number[] = [];
  for (const f of all) {
    const key = `${f.agent_id ?? "*"}|${normalize(f.question)}`;
    if (seen.has(key)) dup.push(f.id);
    else seen.add(key);
  }
  deleteFaqs(dup);
  return dup.length;
}

/** FAQ utilisables par un agent : les siennes + celles sans agent (bibliothèque commune). */
export function faqsForAgent(agentId: number): Faq[] {
  return (db.prepare(`SELECT * FROM faqs WHERE agent_id = ? OR agent_id IS NULL`).all(agentId) as FaqRow[]).map(toFaq);
}

/** Note quel agent a écrit un message (statistiques de la page Agents). */
export function setMessageAgent(messageId: string, agentId: number) {
  db.prepare(`UPDATE messages SET agent_id = ?, agent_name = (SELECT name FROM agents WHERE id = ?) WHERE id = ?`).run(
    agentId,
    agentId,
    messageId,
  );
}

export function markFaqsUsed(ids: number[]) {
  const stmt = db.prepare(`UPDATE faqs SET used = used + 1 WHERE id = ?`);
  for (const id of ids) stmt.run(id);
}
