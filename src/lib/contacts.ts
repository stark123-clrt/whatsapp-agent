import { db, listChats, type Chat } from "./db";

/**
 * CRM → Contacts : une fiche par personne, quel que soit le canal (WhatsApp, site web…).
 * Les contacts sont les discussions, enrichies de statistiques, d'un score et d'un statut.
 */

export type ContactStatus = "nouveau" | "engage" | "a-relancer" | "inactif" | "client" | "dnd";

export type Contact = Pick<
  Chat,
  "jid" | "channel" | "phone" | "email" | "tags" | "aiPaused" | "dnd" | "archived" | "testContact" | "lastAt" | "createdAt" | "lastText" | "lastSender" | "lastType"
> & {
  name: string | null;
  received: number; // messages reçus du contact
  sent: number; // messages envoyés (IA + humain)
  aiReplies: number;
  lastInbound: number | null; // dernier message du contact
  score: number; // 0 → 100 : intérêt / engagement
  status: ContactStatus;
};

const DAY = 86_400_000;

type StatRow = { jid: string; received: number; sent: number; ai: number; last_in: number | null };

export function listContacts(): Contact[] {
  const stats = new Map(
    (
      db
        .prepare(
          `SELECT jid,
             SUM(sender = 'contact') AS received,
             SUM(sender != 'contact') AS sent,
             SUM(sender = 'ai') AS ai,
             MAX(CASE WHEN sender = 'contact' THEN ts END) AS last_in
           FROM messages WHERE deleted = 0 GROUP BY jid`,
        )
        .all() as StatRow[]
    ).map((r) => [r.jid, r]),
  );
  const now = Date.now();
  return listChats()
    .filter((c) => !c.spam)
    .map((c) => {
      const s = stats.get(c.jid);
      const received = Number(s?.received ?? 0);
      const sent = Number(s?.sent ?? 0);
      const lastInbound = s?.last_in ?? null;
      const contact = {
        jid: c.jid,
        channel: c.channel,
        name: c.customName ?? c.name,
        phone: c.phone,
        email: c.email,
        tags: c.tags,
        aiPaused: c.aiPaused,
        dnd: c.dnd,
        archived: c.archived,
        testContact: c.testContact,
        lastAt: c.lastAt,
        createdAt: c.createdAt,
        lastText: c.lastText,
        lastSender: c.lastSender,
        lastType: c.lastType,
        received,
        sent,
        aiReplies: Number(s?.ai ?? 0),
        lastInbound,
      };
      const score = scoreOf(contact, now);
      return { ...contact, score, status: statusOf(contact, score, now) };
    });
}

/** Score d'engagement : volume d'échanges, fraîcheur, aller-retours, coordonnées connues. */
function scoreOf(c: Omit<Contact, "score" | "status">, now: number) {
  if (!c.received) return c.email || c.phone ? 10 : 0;
  let score = Math.min(40, c.received * 5);
  const age = c.lastInbound ? now - c.lastInbound : Infinity;
  score += age < DAY ? 35 : age < 7 * DAY ? 25 : age < 30 * DAY ? 10 : 0;
  if (c.sent > 0 && c.received >= 2) score += 15; // vraie conversation
  if (c.email) score += 5;
  if (c.phone) score += 5;
  return Math.min(100, score);
}

function statusOf(c: Omit<Contact, "score" | "status">, score: number, now: number): ContactStatus {
  if (c.dnd) return "dnd";
  if (c.tags.some((t) => /client/i.test(t))) return "client";
  const age = c.lastInbound ? now - c.lastInbound : Infinity;
  if (now - c.createdAt < 3 * DAY && c.received <= 2) return "nouveau";
  if (age < 7 * DAY && score >= 40) return "engage";
  if (age > 30 * DAY) return "inactif";
  return "a-relancer";
}
