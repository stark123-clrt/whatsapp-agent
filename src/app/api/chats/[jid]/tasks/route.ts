import type { NextRequest } from "next/server";
import { addTask, getChat, getTasks } from "@/lib/db";

// Ajoute une tâche liée à la discussion.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/chats/[jid]/tasks">) {
  const jid = decodeURIComponent((await ctx.params).jid);
  if (!getChat(jid)) return Response.json({ error: "Discussion introuvable" }, { status: 404 });
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (!text?.trim()) return Response.json({ error: "Tâche vide" }, { status: 400 });
  addTask(jid, text.slice(0, 500));
  return Response.json({ tasks: getTasks(jid) });
}
