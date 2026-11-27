import "server-only";

import type { ContactList, ListRule } from "./broadcast-types";
import { listContacts, type Contact } from "./contacts";
import { db } from "./db";

/**
 * Listes de contacts pour les diffusions :
 * - statique : les contacts choisis un par un ;
 * - intelligente : des règles (tags, statut, canal, activité, score) recalculées à chaque utilisation.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS contact_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'static',
    jids TEXT NOT NULL DEFAULT '[]',
    rules TEXT NOT NULL DEFAULT '[]',
    match TEXT NOT NULL DEFAULT 'all',
    created_at INTEGER NOT NULL
  );
`);

type Row = { id: number; name: string; kind: "static" | "smart"; jids: string; rules: string; match: "all" | "any"; created_at: number };

const parse = <T>(raw: string, fallback: T): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const DAY = 86_400_000;

function ruleMatches(r: ListRule, c: Contact, now: number): boolean {
  const vals = r.values.map((v) => v.toLowerCase());
  const n = Number(r.number ?? 0);
  switch (r.field) {
    case "tags": {
      const tags = c.tags.map((t) => t.toLowerCase());
      if (r.op === "all") return vals.every((v) => tags.includes(v));
      if (r.op === "none") return !vals.some((v) => tags.includes(v));
      return vals.some((v) => tags.includes(v));
    }
    case "status":
      return r.op === "isNot" ? !vals.includes(c.status) : vals.includes(c.status);
    case "channel":
      return r.op === "isNot" ? !vals.includes(c.channel) : vals.includes(c.channel);
    case "lastActivity": {
      const last = c.lastInbound ?? c.lastAt;
      return r.op === "olderThan" ? now - last > n * DAY : now - last <= n * DAY;
    }
    case "score":
      return r.op === "lte" ? c.score <= n : c.score >= n;
    case "received":
      return r.op === "lte" ? c.received <= n : c.received >= n;
  }
}

/** Une règle est complète quand elle a une valeur. */
export const ruleReady = (r: ListRule) => (["lastActivity", "score", "received"].includes(r.field) ? r.number !== null && !Number.isNaN(Number(r.number)) : r.values.length > 0);

export function evaluateRules(rules: ListRule[], match: "all" | "any", contacts = listContacts()): Contact[] {
  const ready = rules.filter(ruleReady);
  if (!ready.length) return [];
  const now = Date.now();
  return contacts.filter((c) => (match === "any" ? ready.some((r) => ruleMatches(r, c, now)) : ready.every((r) => ruleMatches(r, c, now))));
}

/** Contacts actuels d'une liste. */
export function listMembers(list: Pick<ContactList, "kind" | "jids" | "rules" | "match">, contacts = listContacts()): Contact[] {
  if (list.kind === "smart") return evaluateRules(list.rules, list.match, contacts);
  const wanted = new Set(list.jids);
  return contacts.filter((c) => wanted.has(c.jid));
}

function toList(r: Row, contacts: Contact[]): ContactList {
  const base = { id: r.id, name: r.name, kind: r.kind, jids: parse<string[]>(r.jids, []), rules: parse<ListRule[]>(r.rules, []), match: r.match, createdAt: r.created_at };
  return { ...base, count: listMembers(base, contacts).length };
}

export function getLists(): ContactList[] {
  const contacts = listContacts();
  return (db.prepare(`SELECT * FROM contact_lists ORDER BY created_at DESC`).all() as Row[]).map((r) => toList(r, contacts));
}

export function getList(id: number): ContactList | null {
  const r = db.prepare(`SELECT * FROM contact_lists WHERE id = ?`).get(id) as Row | undefined;
  return r ? toList(r, listContacts()) : null;
}

type Input = { name: string; kind: "static" | "smart"; jids?: string[]; rules?: ListRule[]; match?: "all" | "any" };

function clean(input: Input) {
  const name = (input.name ?? "").trim().slice(0, 80);
  if (!name) throw new Error("Donne un nom à la liste.");
  const kind = input.kind === "smart" ? "smart" : "static";
  const jids = [...new Set((input.jids ?? []).map(String))].slice(0, 5000);
  const rules = (input.rules ?? []).slice(0, 10);
  if (kind === "static" && !jids.length) throw new Error("Choisis au moins un contact.");
  if (kind === "smart" && !rules.filter(ruleReady).length) throw new Error("Termine au moins une règle.");
  return { name, kind, jids: JSON.stringify(jids), rules: JSON.stringify(rules), match: input.match === "any" ? "any" : "all" };
}

export function createList(input: Input): ContactList {
  const c = clean(input);
  const r = db.prepare(`INSERT INTO contact_lists (name, kind, jids, rules, match, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(c.name, c.kind, c.jids, c.rules, c.match, Date.now());
  return getList(Number(r.lastInsertRowid))!;
}

export function updateList(id: number, input: Input): ContactList | null {
  const c = clean(input);
  db.prepare(`UPDATE contact_lists SET name = ?, kind = ?, jids = ?, rules = ?, match = ? WHERE id = ?`).run(c.name, c.kind, c.jids, c.rules, c.match, id);
  return getList(id);
}

/** Supprimer une liste ne supprime aucun contact. */
export function deleteList(id: number) {
  db.prepare(`DELETE FROM contact_lists WHERE id = ?`).run(id);
}
