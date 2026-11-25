import type { NextRequest } from "next/server";
import { sendManualMessage } from "@/lib/agent";
import { getChat } from "@/lib/db";
import { getSocket } from "@/lib/whatsapp";

// Envoi d'un message à la main depuis l'interface (l'IA se met en pause).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/chats/[jid]/messages">) {
  const jid = decodeURIComponent((await ctx.params).jid);
  const { text, replyTo } = (await req.json().catch(() => ({}))) as { text?: string; replyTo?: string | null };
  if (!text?.trim()) return Response.json({ error: "Message vide" }, { status: 400 });
  if (!getChat(jid)) return Response.json({ error: "Discussion introuvable" }, { status: 404 });
  const sock = getSocket();
  if (!sock) return Response.json({ error: "WhatsApp n'est pas connecté" }, { status: 503 });
  try {
    await sendManualMessage(sock, jid, text.trim(), replyTo);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec de l'envoi" }, { status: 500 });
  }
}
