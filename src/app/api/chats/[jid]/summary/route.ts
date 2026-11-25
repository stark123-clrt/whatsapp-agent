import type { NextRequest } from "next/server";
import { getChat, setSummary } from "@/lib/db";
import { summarize } from "@/lib/transcript";

// « Résumés » : l'IA résume la discussion et le résumé est enregistré.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/chats/[jid]/summary">) {
  const jid = decodeURIComponent((await ctx.params).jid);
  if (!getChat(jid)) return Response.json({ error: "Discussion introuvable" }, { status: 404 });
  try {
    const summary = await summarize(jid);
    if (!summary) return Response.json({ error: "Rien à résumer pour l'instant." }, { status: 400 });
    setSummary(jid, summary);
    return Response.json({ summary });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 500 });
  }
}
