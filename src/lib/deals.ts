import "server-only";

import { db, getChat, updateChat } from "./db";
import type { Deal, DealPriority, Pipeline, Stage, StageKind } from "./deals-types";

export type { Deal, DealPriority, Pipeline, Stage, StageKind } from "./deals-types";

/**
 * CRM → Opportunités : pipelines de vente en colonnes (étapes), opportunités liées aux contacts.
 * Les étiquettes des contacts peuvent créer et déplacer les opportunités (et l'inverse).
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS pipelines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    is_main INTEGER NOT NULL DEFAULT 0,
    sync_tags INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#8b5cf6',
    kind TEXT NOT NULL DEFAULT 'open',
    position INTEGER NOT NULL DEFAULT 0,
    trigger_tags TEXT NOT NULL DEFAULT '[]',
    default_value INTEGER NOT NULL DEFAULT 0,
    idle_days INTEGER NOT NULL DEFAULT 0,
    idle_target INTEGER
  );
  CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stage_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    company TEXT,
    value INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'none',
    jid TEXT,
    owner TEXT,
    probability INTEGER NOT NULL DEFAULT 50,
    close_date TEXT,
    source TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    description TEXT,
    notes TEXT,
    position REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    stage_changed_at INTEGER NOT NULL,
    won_at INTEGER,
    lost_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS deals_stage ON deals(stage_id);
  CREATE INDEX IF NOT EXISTS deals_jid ON deals(jid);
`);

const json = (v: string | null): string[] => {
  try {
    const a = JSON.parse(v ?? "[]");
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

type PipelineRow = { id: number; name: string; is_main: number; sync_tags: number; position: number };
type StageRow = {
  id: number;
  pipeline_id: number;
  name: string;
  color: string;
  kind: StageKind;
  position: number;
  trigger_tags: string;
  default_value: number;
  idle_days: number;
  idle_target: number | null;
};
type DealRow = {
  id: number;
  stage_id: number;
  title: string;
  company: string | null;
  value: number;
  priority: DealPriority;
  jid: string | null;
  owner: string | null;
  probability: number;
  close_date: string | null;
  source: string | null;
  tags: string;
  description: string | null;
  notes: string | null;
  position: number;
  created_at: number;
  updated_at: number;
  stage_changed_at: number;
  won_at: number | null;
  lost_at: number | null;
};

const toPipeline = (r: PipelineRow): Pipeline => ({ id: r.id, name: r.name, isMain: r.is_main === 1, syncTags: r.sync_tags === 1 });
const toStage = (r: StageRow): Stage => ({
  id: r.id,
  pipelineId: r.pipeline_id,
  name: r.name,
  color: r.color,
  kind: r.kind,
  position: r.position,
  triggerTags: json(r.trigger_tags),
  defaultValue: r.default_value,
  idleDays: r.idle_days,
  idleTarget: r.idle_target,
});
const toDeal = (r: DealRow): Deal => ({
  id: r.id,
  stageId: r.stage_id,
  title: r.title,
  company: r.company,
  value: r.value,
  priority: r.priority,
  jid: r.jid,
  owner: r.owner,
  probability: r.probability,
  closeDate: r.close_date,
  source: r.source,
  tags: json(r.tags),
  description: r.description,
  notes: r.notes,
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  stageChangedAt: r.stage_changed_at,
  wonAt: r.won_at,
  lostAt: r.lost_at,
});

export function listPipelines(): Pipeline[] {
  return (db.prepare(`SELECT * FROM pipelines ORDER BY is_main DESC, position, id`).all() as PipelineRow[]).map(toPipeline);
}

export function listStages(): Stage[] {
  const order = `CASE kind WHEN 'open' THEN 0 WHEN 'won' THEN 1 ELSE 2 END`;
  return (db.prepare(`SELECT * FROM stages ORDER BY pipeline_id, ${order}, position, id`).all() as StageRow[]).map(toStage);
}

export function getStage(id: number): Stage | null {
  const r = db.prepare(`SELECT * FROM stages WHERE id = ?`).get(id) as StageRow | undefined;
  return r ? toStage(r) : null;
}

export function listDeals(): Deal[] {
  return (db.prepare(`SELECT * FROM deals ORDER BY position, id DESC`).all() as DealRow[]).map(toDeal);
}

export function getDeal(id: number): Deal | null {
  const r = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(id) as DealRow | undefined;
  return r ? toDeal(r) : null;
}

export function dealsOfContact(jid: string): Deal[] {
  return (db.prepare(`SELECT * FROM deals WHERE jid = ? ORDER BY updated_at DESC`).all(jid) as DealRow[]).map(toDeal);
}

type StageInput = { id?: number; name: string; color: string; kind: StageKind; triggerTags?: string[]; defaultValue?: number; idleDays?: number; idleTarget?: number | null };

export function createPipeline(name: string, stages: StageInput[], isMain = false): Pipeline {
  const now = Date.now();
  const pos = (db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS p FROM pipelines`).get() as { p: number }).p;
  db.exec("BEGIN");
  let id: number;
  try {
    id = Number(db.prepare(`INSERT INTO pipelines (name, is_main, position, created_at) VALUES (?, ?, ?, ?)`).run(name.trim().slice(0, 60) || "Pipeline", isMain ? 1 : 0, pos, now).lastInsertRowid);
    saveStages(id, stages);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return toPipeline(db.prepare(`SELECT * FROM pipelines WHERE id = ?`).get(id) as PipelineRow);
}

export class StageError extends Error {}

/**
 * Enregistre les étapes d'un pipeline (création, modification, ordre, suppression).
 * Les opportunités d'une étape supprimée ne disparaissent pas : elles vont dans la première étape ouverte.
 */
export function saveStages(pipelineId: number, stages: StageInput[]) {
  const clean = stages.slice(0, 20).map((s, i) => ({
    ...s,
    name: s.name.trim().slice(0, 80) || "Étape",
    color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : "#8b5cf6",
    kind: (["open", "won", "lost"] as const).includes(s.kind) ? s.kind : "open",
    position: i,
    triggerTags: [...new Set((s.triggerTags ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 10),
    defaultValue: Math.max(0, Math.round(Number(s.defaultValue) || 0)),
    idleDays: Math.min(365, Math.max(0, Math.round(Number(s.idleDays) || 0))),
  }));
  if (!clean.some((s) => s.kind === "open")) throw new StageError("Il faut au moins une étape ouverte.");
  if (clean.filter((s) => s.kind === "won").length !== 1 || clean.filter((s) => s.kind === "lost").length !== 1) {
    throw new StageError("Un pipeline a exactement une étape « Gagné » et une étape « Perdu ».");
  }
  // Une étiquette ne peut piloter qu'une seule étape, tous pipelines confondus.
  const others = listStages().filter((s) => s.pipelineId !== pipelineId);
  const seen = new Set<string>();
  for (const s of clean) {
    for (const t of s.triggerTags) {
      const key = t.toLowerCase();
      if (seen.has(key)) throw new StageError(`L'étiquette « ${t} » est utilisée par deux étapes.`);
      seen.add(key);
      const taken = others.find((o) => o.triggerTags.some((x) => x.toLowerCase() === key));
      if (taken) {
        const p = listPipelines().find((x) => x.id === taken.pipelineId);
        throw new StageError(`L'étiquette « ${t} » pilote déjà une étape du pipeline « ${p?.name ?? "?"} ».`);
      }
    }
  }

  const existing = listStages().filter((s) => s.pipelineId === pipelineId);
  const keep = new Set(clean.map((s) => s.id).filter((x): x is number => typeof x === "number"));
  const ids: number[] = [];
  for (const s of clean) {
    const known = s.id && existing.some((e) => e.id === s.id);
    if (known) {
      db.prepare(`UPDATE stages SET name = ?, color = ?, kind = ?, position = ?, trigger_tags = ?, default_value = ?, idle_days = ? WHERE id = ?`).run(
        s.name, s.color, s.kind, s.position, JSON.stringify(s.triggerTags), s.defaultValue, s.idleDays, s.id!,
      );
      ids.push(s.id!);
    } else {
      ids.push(
        Number(
          db.prepare(`INSERT INTO stages (pipeline_id, name, color, kind, position, trigger_tags, default_value, idle_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
            pipelineId, s.name, s.color, s.kind, s.position, JSON.stringify(s.triggerTags), s.defaultValue, s.idleDays,
          ).lastInsertRowid,
        ),
      );
    }
  }
  // Cible de la règle d'inactivité : un id existant, ou l'index (négatif) d'une étape qui vient d'être créée.
  clean.forEach((s, i) => {
    const target = s.idleTarget == null ? null : s.idleTarget < 0 ? (ids[-s.idleTarget - 1] ?? null) : s.idleTarget;
    db.prepare(`UPDATE stages SET idle_target = ? WHERE id = ?`).run(s.idleDays && target ? target : null, ids[i]);
  });
  const firstOpen = ids[clean.findIndex((s) => s.kind === "open")];
  for (const e of existing) {
    if (keep.has(e.id)) continue;
    db.prepare(`UPDATE deals SET stage_id = ?, stage_changed_at = ? WHERE stage_id = ?`).run(firstOpen, Date.now(), e.id);
    db.prepare(`UPDATE stages SET idle_target = NULL WHERE idle_target = ?`).run(e.id);
    db.prepare(`DELETE FROM stages WHERE id = ?`).run(e.id);
  }
}

export function updatePipeline(id: number, patch: { name?: string; syncTags?: boolean }) {
  if (patch.name !== undefined) db.prepare(`UPDATE pipelines SET name = ? WHERE id = ?`).run(patch.name.trim().slice(0, 60) || "Pipeline", id);
  if (patch.syncTags !== undefined) db.prepare(`UPDATE pipelines SET sync_tags = ? WHERE id = ?`).run(patch.syncTags ? 1 : 0, id);
}

/** Supprime un pipeline secondaire et ses opportunités (le pipeline principal ne peut pas l'être). */
export function deletePipeline(id: number) {
  const p = listPipelines().find((x) => x.id === id);
  if (!p || p.isMain) return false;
  const stageIds = listStages().filter((s) => s.pipelineId === id).map((s) => s.id);
  for (const sid of stageIds) db.prepare(`DELETE FROM deals WHERE stage_id = ?`).run(sid);
  db.prepare(`DELETE FROM stages WHERE pipeline_id = ?`).run(id);
  db.prepare(`DELETE FROM pipelines WHERE id = ?`).run(id);
  return true;
}

export type DealInput = Partial<Omit<Deal, "id" | "createdAt" | "updatedAt" | "stageChangedAt" | "wonAt" | "lostAt">>;

function cleanDeal(d: DealInput) {
  const text = (v: string | null | undefined, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);
  return {
    title: d.title?.trim().slice(0, 120),
    company: d.company === undefined ? undefined : text(d.company, 120),
    value: d.value === undefined ? undefined : Math.max(0, Math.round(Number(d.value) || 0)),
    priority: d.priority === undefined ? undefined : (["none", "low", "medium", "high"] as const).includes(d.priority) ? d.priority : "none",
    jid: d.jid === undefined ? undefined : d.jid && getChat(d.jid) ? d.jid : null,
    owner: d.owner === undefined ? undefined : text(d.owner, 80),
    probability: d.probability === undefined ? undefined : Math.min(100, Math.max(0, Math.round(Number(d.probability) || 0))),
    closeDate: d.closeDate === undefined ? undefined : d.closeDate && /^\d{4}-\d{2}-\d{2}$/.test(d.closeDate) ? d.closeDate : null,
    source: d.source === undefined ? undefined : text(d.source, 80),
    tags: d.tags === undefined ? undefined : [...new Set(d.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20),
    description: d.description === undefined ? undefined : text(d.description, 1000),
    notes: d.notes === undefined ? undefined : text(d.notes, 5000),
  };
}

export function createDeal(input: DealInput & { stageId: number }): Deal {
  const stage = getStage(input.stageId);
  if (!stage) throw new StageError("Étape introuvable.");
  const d = cleanDeal(input);
  if (!d.title) throw new StageError("Le titre est obligatoire.");
  const now = Date.now();
  const id = Number(
    db
      .prepare(
        `INSERT INTO deals (stage_id, title, company, value, priority, jid, owner, probability, close_date, source, tags, description, notes, position, created_at, updated_at, stage_changed_at, won_at, lost_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        stage.id, d.title, d.company ?? null, d.value ?? stage.defaultValue, d.priority ?? "none", d.jid ?? null, d.owner ?? null,
        d.probability ?? (stage.kind === "won" ? 100 : stage.kind === "lost" ? 0 : 50), d.closeDate ?? null, d.source ?? null,
        JSON.stringify(d.tags ?? []), d.description ?? null, d.notes ?? null, -now, now, now, now,
        stage.kind === "won" ? now : null, stage.kind === "lost" ? now : null,
      ).lastInsertRowid,
  );
  const deal = getDeal(id)!;
  syncContactTags(deal, stage);
  return deal;
}

export function updateDeal(id: number, input: DealInput & { stageId?: number; position?: number }): Deal | null {
  const deal = getDeal(id);
  if (!deal) return null;
  const d = cleanDeal(input);
  const set: string[] = [];
  const values: (string | number | null)[] = [];
  const add = (col: string, v: string | number | null) => {
    set.push(`${col} = ?`);
    values.push(v);
  };
  if (d.title) add("title", d.title);
  if (d.company !== undefined) add("company", d.company);
  if (d.value !== undefined) add("value", d.value);
  if (d.priority !== undefined) add("priority", d.priority);
  if (d.jid !== undefined) add("jid", d.jid);
  if (d.owner !== undefined) add("owner", d.owner);
  if (d.probability !== undefined) add("probability", d.probability);
  if (d.closeDate !== undefined) add("close_date", d.closeDate);
  if (d.source !== undefined) add("source", d.source);
  if (d.tags !== undefined) add("tags", JSON.stringify(d.tags));
  if (d.description !== undefined) add("description", d.description);
  if (d.notes !== undefined) add("notes", d.notes);
  if (typeof input.position === "number") add("position", input.position);

  let moved: Stage | null = null;
  if (input.stageId && input.stageId !== deal.stageId) {
    moved = getStage(input.stageId);
    if (!moved) throw new StageError("Étape introuvable.");
    const now = Date.now();
    add("stage_id", moved.id);
    add("stage_changed_at", now);
    add("won_at", moved.kind === "won" ? now : null);
    add("lost_at", moved.kind === "lost" ? now : null);
    if (moved.kind === "won" && d.probability === undefined) add("probability", 100);
    if (moved.kind === "lost" && d.probability === undefined) add("probability", 0);
  }
  add("updated_at", Date.now());
  db.prepare(`UPDATE deals SET ${set.join(", ")} WHERE id = ?`).run(...values, id);
  const fresh = getDeal(id)!;
  if (moved || d.jid) syncContactTags(fresh, moved ?? getStage(fresh.stageId));
  return fresh;
}

export function deleteDeal(id: number) {
  db.prepare(`DELETE FROM deals WHERE id = ?`).run(id);
}

/** Pipeline « synchronisé » : la carte déplacée pose l'étiquette de son étape sur le contact et retire celles des autres étapes. */
function syncContactTags(deal: Deal, stage: Stage | null) {
  if (!deal.jid || !stage) return;
  const pipeline = listPipelines().find((p) => p.id === stage.pipelineId);
  if (!pipeline?.syncTags || !stage.triggerTags.length) return;
  const chat = getChat(deal.jid);
  if (!chat) return;
  const stageTags = new Set(listStages().filter((s) => s.pipelineId === pipeline.id).flatMap((s) => s.triggerTags.map((t) => t.toLowerCase())));
  const tags = chat.tags.filter((t) => !stageTags.has(t.toLowerCase()));
  const next = [...tags, stage.triggerTags[0]];
  if (next.join("|") !== chat.tags.join("|")) updateChat(deal.jid, { tags: next });
}

/**
 * Étiquettes d'un contact → opportunités : une étiquette déclencheuse crée l'opportunité du contact
 * dans son pipeline (une par pipeline), ou la déplace si le pipeline est synchronisé.
 * À appeler après chaque changement d'étiquettes (IA, Discussions, Contacts).
 */
export function dealsFromTags(jid: string, before: string[] = []) {
  const chat = getChat(jid);
  if (!chat) return;
  const had = new Set(before.map((t) => t.toLowerCase()));
  const added = chat.tags.filter((t) => !had.has(t.toLowerCase()));
  if (!added.length) return;
  const stages = listStages();
  const pipelines = listPipelines();
  for (const tag of added) {
    const stage = stages.find((s) => s.triggerTags.some((t) => t.toLowerCase() === tag.toLowerCase()));
    if (!stage) continue;
    const pipeline = pipelines.find((p) => p.id === stage.pipelineId);
    const inPipeline = new Set(stages.filter((s) => s.pipelineId === stage.pipelineId).map((s) => s.id));
    const existing = dealsOfContact(jid).find((d) => inPipeline.has(d.stageId));
    if (!existing) {
      const who = chat.customName ?? chat.name ?? (chat.phone ? `+${chat.phone}` : "Contact");
      createDeal({ stageId: stage.id, title: who, jid, source: `Étiquette « ${tag} »` });
    } else if (pipeline?.syncTags && existing.stageId !== stage.id) {
      updateDeal(existing.id, { stageId: stage.id });
    }
  }
}

/** Règle « après N jours sans activité, déplacer vers… » (vérifiée toutes les heures). */
export function moveIdleDeals() {
  const now = Date.now();
  for (const s of listStages()) {
    if (!s.idleDays || !s.idleTarget) continue;
    const limit = now - s.idleDays * 86_400_000;
    const idle = db.prepare(`SELECT id FROM deals WHERE stage_id = ? AND updated_at < ?`).all(s.id, limit) as { id: number }[];
    for (const { id } of idle) updateDeal(id, { stageId: s.idleTarget });
  }
}

const g = globalThis as typeof globalThis & { __dealsTimer?: NodeJS.Timeout };
export function startDealsScheduler() {
  if (g.__dealsTimer) return;
  g.__dealsTimer = setInterval(() => {
    try {
      moveIdleDeals();
    } catch {
      /* on réessaie à la prochaine heure */
    }
  }, 3_600_000);
}

// Premier lancement : le pipeline principal « Ventes ».
if (!db.prepare(`SELECT 1 FROM pipelines LIMIT 1`).get()) {
  createPipeline("Ventes", [
    { name: "Nouveau lead", color: "#8b5cf6", kind: "open" },
    { name: "Qualifié", color: "#3b82f6", kind: "open" },
    { name: "Devis envoyé", color: "#f59e0b", kind: "open" },
    { name: "Gagné", color: "#10b981", kind: "won" },
    { name: "Perdu", color: "#ef4444", kind: "lost" },
  ], true);
}
