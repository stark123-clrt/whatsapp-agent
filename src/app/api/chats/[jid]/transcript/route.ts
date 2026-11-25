import type { NextRequest } from "next/server";
import { transcript } from "@/lib/transcript";

// Télécharge la transcription de la discussion en fichier texte.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/chats/[jid]/transcript">) {
  const jid = decodeURIComponent((await ctx.params).jid);
  const text = transcript(jid);
  if (text === null) return new Response("Discussion introuvable", { status: 404 });
  const inline = req.nextUrl.searchParams.get("format") === "text";
  const file = `discussion-${jid.split("@")[0].replace(/\W/g, "")}.txt`;
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...(inline ? {} : { "Content-Disposition": `attachment; filename="${file}"` }),
    },
  });
}
