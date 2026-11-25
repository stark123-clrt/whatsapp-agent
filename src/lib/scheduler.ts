import "server-only";

import { isOpenNow } from "./agent-settings";
import { agentOf, replyPending, sendFollowup } from "./agent";
import { chatsForScheduler, getMessages } from "./db";
import { getSocket } from "./whatsapp";

/**
 * Tâches de fond, toutes les minutes :
 * - réponses mises en attente hors des heures d'activité ;
 * - relances automatiques (onglet « Suivis » de l'agent).
 */

const TICK_MS = 60_000;
const MAX_FOLLOWUPS_PER_TICK = 3; // prudence : pas de rafale de relances

const g = globalThis as typeof globalThis & { __scheduler?: NodeJS.Timeout; __schedulerBusy?: boolean };

export function startScheduler() {
  if (g.__scheduler) return;
  g.__scheduler = setInterval(() => void tick(), TICK_MS);
}

async function tick() {
  if (g.__schedulerBusy) return;
  const sock = getSocket();
  if (!sock) return;
  g.__schedulerBusy = true;
  try {
    let followups = 0;
    for (const chat of chatsForScheduler()) {
      const agent = agentOf(chat.jid);
      if (!agent || agent.status !== "active" || !isOpenNow(agent.settings)) continue;

      if (chat.pendingReply) {
        replyPending(sock, chat.jid);
        continue;
      }

      // Relances : seulement si le dernier message vient de nous et que le contact n'a pas répondu.
      const fu = agent.settings.followups;
      if (!fu.enabled || !chat.followups || chat.aiPaused || followups >= MAX_FOLLOWUPS_PER_TICK) continue;
      const last = getMessages(chat.jid, 1).at(-1);
      if (!last || last.sender === "contact") continue;
      // Il faut qu'il y ait eu au moins un échange avec le contact.
      if (!getMessages(chat.jid, 50).some((m) => m.sender === "contact")) continue;

      const plan = fu.cycles.flatMap((c) => Array.from({ length: Math.max(1, Math.min(3, c.messages)) }, () => c));
      const step = plan[chat.followupStage];
      if (!step) continue; // toutes les relances ont été envoyées
      if (Date.now() - last.ts < step.delayHours * 3_600_000) continue;

      followups++;
      await sendFollowup(sock, chat.jid, agent, step.tone, chat.followupStage).catch(() => {});
    }
  } finally {
    g.__schedulerBusy = false;
  }
}
