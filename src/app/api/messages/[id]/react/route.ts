import type { NextRequest } from "next/server";
import { reactToMessage } from "@/lib/agent";
import { getMessage } from "@/lib/db";
import { getSocket } from "@/lib/whatsapp";

// Réagit à un message avec un emoji ; emoji vide = retirer la réaction.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/messages/[id]/react">) {
  const id = decodeURIComponent((await ctx.params).id);
  if (!getMessage(id)) return Response.json({ error: "Message introuvable" }, { status: 404 });
  const { emoji } = (await req.json().catch(() => ({}))) as { emoji?: string };
  if (typeof emoji !== "string" || emoji.length > 16) return Response.json({ error: "Emoji invalide" }, { status: 400 });
  const sock = getSocket();
  if (!sock) return Response.json({ error: "WhatsApp n'est pas connecté" }, { status: 503 });
  try {
    await reactToMessage(sock, id, emoji);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 500 });
  }
}
