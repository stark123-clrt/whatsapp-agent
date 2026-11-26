import { dealsFromTags } from "@/lib/deals";
import { connection, type NextRequest } from "next/server";
import { chatReadOnly, isAiTyping, whyAiInactive } from "@/lib/agent";
import { listAgents } from "@/lib/kb";
import {
  allTags,
  deleteChat,
  getActivity,
  getChat,
  getFiles,
  getMessages,
  getStats,
  getTasks,
  markRead,
  markUnread,
  resetAiCounter,
  setAiPaused,
  setChatAgent,
  setDraft,
  updateChat,
  type ChatUpdate,
} from "@/lib/db";

const decode = (jid: string) => decodeURIComponent(jid);

// Une discussion : infos du contact, messages et statistiques.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/chats/[jid]">) {
  await connection();
  const jid = decode((await ctx.params).jid);
  const chat = getChat(jid);
  if (!chat) return Response.json({ error: "Discussion introuvable" }, { status: 404 });
  return Response.json({
    chat,
    readOnly: chatReadOnly(jid),
    // Messages de l'IA : on signale si l'agent auteur a été supprimé depuis.
    messages: (() => {
      const alive = new Set(listAgents().map((a) => a.id));
      return getMessages(jid).map((m) => ({ ...m, agentDeleted: Boolean(m.agentId && !alive.has(m.agentId)) }));
    })(),
    stats: getStats(jid),
    aiInactive: whyAiInactive(jid, chat.phone),
    aiTyping: isAiTyping(jid),
    knownTags: allTags(),
    files: getFiles(jid),
    tasks: getTasks(jid),
    activity: getActivity(jid),
  });
}

type Patch = ChatUpdate & { aiPaused?: boolean; read?: boolean; unread?: boolean; resetAiCounter?: boolean; agentId?: number | null; draft?: null };

// Modifie la discussion : pause IA, lu/non lu, contact, tags, archive, spam, ne pas déranger.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/chats/[jid]">) {
  const jid = decode((await ctx.params).jid);
  if (!getChat(jid)) return Response.json({ error: "Discussion introuvable" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Patch;
  if (typeof body.aiPaused === "boolean") setAiPaused(jid, body.aiPaused);
  if (body.read) markRead(jid);
  if (body.unread) markUnread(jid);
  if (body.resetAiCounter) resetAiCounter(jid);
  if (body.agentId !== undefined) setChatAgent(jid, body.agentId ? Number(body.agentId) : null);
  if (body.draft === null) setDraft(jid, null);
  const { customName, email, notes, tags, dnd, archived, spam, testContact, followups } = body;
  const update: ChatUpdate = Object.fromEntries(
    Object.entries({ customName, email, notes, tags, dnd, archived, spam, testContact, followups }).filter(
      ([, v]) => v !== undefined,
    ),
  );
  if (tags && !Array.isArray(tags)) return Response.json({ error: "Tags invalides" }, { status: 400 });
  const before = getChat(jid)?.tags ?? [];
  updateChat(jid, update);
  if (tags) dealsFromTags(jid, before); // étiquette déclencheuse → opportunité
  return Response.json({ chat: getChat(jid) });
}

// Supprime le contact, ses messages et ses fichiers (définitif).
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/chats/[jid]">) {
  const jid = decode((await ctx.params).jid);
  if (!getChat(jid)) return Response.json({ error: "Discussion introuvable" }, { status: 404 });
  deleteChat(jid);
  return Response.json({ ok: true });
}
