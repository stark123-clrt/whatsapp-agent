import "server-only";

import { db, type Channel } from "./db";
import { getAgent, listAgents, type Agent } from "./kb";

/**
 * « Qui répond aux nouvelles conversations » : un agent par défaut pour chaque canal.
 *  - agent choisi (actif ou en pause : en pause = personne ne répond sur ce canal) ;
 *  - « Personne » : aucune réponse automatique sur ce canal ;
 *  - « Automatique » : l'agent principal du compte.
 * Une conversation déjà attribuée garde son agent.
 */

db.exec(`CREATE TABLE IF NOT EXISTS channel_routing (channel TEXT PRIMARY KEY, agent_id INTEGER)`);

export const ROUTED_CHANNELS: Channel[] = ["whatsapp", "web"];
export const NOBODY = 0;

/** null = automatique, 0 = personne, sinon l'id de l'agent. */
export function getRouting(): Record<string, number | null> {
  const rows = db.prepare(`SELECT channel, agent_id FROM channel_routing`).all() as { channel: string; agent_id: number | null }[];
  return Object.fromEntries(ROUTED_CHANNELS.map((c) => [c, rows.find((r) => r.channel === c)?.agent_id ?? null]));
}

export function setChannelAgent(channel: Channel, agentId: number | null) {
  db.prepare(`INSERT INTO channel_routing (channel, agent_id) VALUES (?, ?) ON CONFLICT(channel) DO UPDATE SET agent_id = excluded.agent_id`).run(channel, agentId);
}

/**
 * Réglage « Automatique » : l'agent principal (même en pause : on ne confie jamais en silence
 * les clients d'une marque à l'agent d'une autre). Sans agent principal : l'unique agent actif.
 */
function automatic(agents: Agent[]): Agent | null {
  const main = agents.find((a) => a.isDefault);
  if (main) return main;
  const active = agents.filter((a) => a.status === "active");
  return active.length === 1 ? active[0] : null;
}

/** L'agent du canal (sans mot-clé) : celui qui répond à une nouvelle conversation sur ce canal. */
export function channelAgent(channel: Channel): Agent | null {
  const choice = getRouting()[channel] ?? null;
  if (choice === NOBODY) return null;
  if (choice) {
    const a = getAgent(choice);
    if (a) return a; // même en pause : mettre l'agent en pause coupe ce canal, sans le confier à un autre agent
  }
  return automatic(listAgents());
}

/** Agent d'une nouvelle conversation : mot-clé d'un agent actif d'abord, puis l'agent du canal. */
export function routeAgent(channel: Channel, firstText = ""): Agent | null {
  const text = firstText.toLowerCase();
  const byKeyword = listAgents().find(
    (a) =>
      a.status === "active" &&
      a.settings.entryRules.some(
        (r) =>
          r.enabled &&
          r.kind === "keyword" &&
          r.keywords
            .split(",")
            .map((k) => k.trim().toLowerCase())
            .some((k) => k && text.includes(k)),
      ),
  );
  return byKeyword ?? channelAgent(channel);
}
