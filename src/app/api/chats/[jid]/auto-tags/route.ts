import type { NextRequest } from "next/server";
import { getChat, updateChat } from "@/lib/db";
import { suggestTags } from "@/lib/transcript";

// « Étiquetage automatique par IA » : l'IA lit la discussion et ajoute des étiquettes.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/chats/[jid]/auto-tags">) {
  const jid = decodeURIComponent((await ctx.params).jid);
  const chat = getChat(jid);
  if (!chat) return Response.json({ error: "Discussion introuvable" }, { status: 404 });
  try {
    const added = await suggestTags(jid);
    updateChat(jid, { tags: [...chat.tags, ...added] });
    return Response.json({ added, chat: getChat(jid) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 500 });
  }
}
