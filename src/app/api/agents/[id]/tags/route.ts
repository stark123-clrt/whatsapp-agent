import type { NextRequest } from "next/server";
import { getChat, listChats, updateChat } from "@/lib/db";
import { getAgent } from "@/lib/kb";
import { classifyTags, suggestTagRules } from "@/lib/knowledge";
import { transcript } from "@/lib/transcript";

// action=generate : l'IA propose des règles de tags.
// action=apply : applique les règles aux conversations existantes de l'agent (30 max).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/agents/[id]/tags">) {
  const id = Number((await ctx.params).id);
  const agent = getAgent(id);
  if (!agent) return Response.json({ error: "Agent introuvable" }, { status: 404 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (action === "generate") return Response.json({ rules: await suggestTagRules(id) });
    if (action === "apply") {
      const rules = agent.settings.tagRules;
      if (!rules.length) return Response.json({ error: "Ajoute d'abord des tags." }, { status: 400 });
      const chats = listChats()
        .filter((c) => (c.agentId ?? (agent.isDefault ? id : null)) === id && !c.spam)
        .slice(0, 30);
      let tagged = 0;
      for (const c of chats) {
        const text = transcript(c.jid, 80);
        if (!text) continue;
        const names = await classifyTags(rules, text);
        const current = getChat(c.jid);
        const add = names.filter((n) => !current?.tags.includes(n));
        if (current && add.length) {
          updateChat(c.jid, { tags: [...current.tags, ...add] });
          tagged++;
        }
      }
      return Response.json({ scanned: chats.length, tagged });
    }
    return Response.json({ error: "Action inconnue" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 500 });
  }
}
