import type { NextRequest } from "next/server";
import type { ChatMessage } from "@/lib/ai";
import { tryAgent } from "@/lib/knowledge";

// « Essayer » : l'agent répond comme à un vrai contact, mais rien n'est envoyé ni enregistré.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/agents/[id]/try">) {
  const id = Number((await ctx.params).id);
  const { messages } = (await req.json().catch(() => ({}))) as { messages?: { role: string; content: string }[] };
  const history: ChatMessage[] = (messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-30)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 4000) }));
  if (!history.length || history.at(-1)?.role !== "user") return Response.json({ error: "Écris un message." }, { status: 400 });
  try {
    return Response.json(await tryAgent(id, history));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 500 });
  }
}
