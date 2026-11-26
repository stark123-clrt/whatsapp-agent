import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "./db";
import { widgetWithDefaults, type WidgetSettings } from "./widget-settings";

/**
 * Widget de chat pour site web : un widget par espace de travail (pour l'instant),
 * identifié publiquement par une clé aléatoire (celle qui figure dans le code à coller).
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS widgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_key TEXT NOT NULL UNIQUE,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

export type Widget = { id: number; key: string; settings: WidgetSettings; createdAt: number; updatedAt: number };

type Row = { id: number; public_key: string; settings: string; created_at: number; updated_at: number };
const toWidget = (r: Row): Widget => {
  let raw: unknown = {};
  try {
    raw = JSON.parse(r.settings);
  } catch {
    raw = {};
  }
  return { id: r.id, key: r.public_key, settings: widgetWithDefaults(raw), createdAt: r.created_at, updatedAt: r.updated_at };
};

export function getWidget(): Widget | null {
  const r = db.prepare(`SELECT * FROM widgets ORDER BY id LIMIT 1`).get() as Row | undefined;
  return r ? toWidget(r) : null;
}

export function getWidgetByKey(key: string): Widget | null {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) return null;
  const r = db.prepare(`SELECT * FROM widgets WHERE public_key = ?`).get(key) as Row | undefined;
  return r ? toWidget(r) : null;
}

export function createWidget(settings: WidgetSettings): Widget {
  const key = randomBytes(15).toString("base64url");
  const now = Date.now();
  db.prepare(`INSERT INTO widgets (public_key, settings, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(key, JSON.stringify(settings), now, now);
  return getWidgetByKey(key)!;
}

export function saveWidget(id: number, settings: WidgetSettings) {
  db.prepare(`UPDATE widgets SET settings = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(settings), Date.now(), id);
}

/** Supprime le widget. Les discussions du site restent (règle : les conversations ne sont jamais perdues). */
export function deleteWidget(id: number) {
  db.prepare(`DELETE FROM widgets WHERE id = ?`).run(id);
}

/** Identifiant de discussion d'un visiteur du site. */
export const webJid = (key: string, visitorId: string) => `web_${key}_${visitorId}`;
export const validVisitorId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{12,64}$/.test(v);
