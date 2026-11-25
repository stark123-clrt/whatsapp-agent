import type { NextRequest } from "next/server";
import { draftReply } from "@/lib/agent";
import { getChat } from "@/lib/db";

// « Générer une réponse » : l'IA propose un texte, rien n'est envoyé.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/chats/[jid]/draft">) {
  const jid = decodeURIComponent((await ctx.params).jid);
  if (!getChat(jid)) return Response.json({ error: "Discussion introuvable" }, { status: 404 });
  try {
    return Response.json({ text: await draftReply(jid) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 500 });
  }
}
