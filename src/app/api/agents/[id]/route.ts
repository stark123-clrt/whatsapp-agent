import { connection, type NextRequest } from "next/server";
import { withDefaults, type AgentSettings } from "@/lib/agent-settings";
import { countAgentChats } from "@/lib/db";
import { agentOverview, deleteAgent, getAgent, saveAgentSettings, updateAgent, type Agent } from "@/lib/kb";
import { preparation } from "@/lib/preparation";

const idOf = async (ctx: RouteContext<"/api/agents/[id]">) => Number((await ctx.params).id);

// Un agent, avec ses chiffres (période ?days=7|30|90) et son score de préparation.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/agents/[id]">) {
  await connection();
  const agent = getAgent(await idOf(ctx));
  if (!agent) return Response.json({ error: "Agent introuvable" }, { status: 404 });
  const days = [7, 30, 90].includes(Number(req.nextUrl.searchParams.get("days"))) ? Number(req.nextUrl.searchParams.get("days")) : 30;
  return Response.json({
    agent,
    overview: agentOverview(agent.id, days),
    preparation: preparation(agent),
    chatCount: countAgentChats(agent.id, agent.isDefault),
  });
}

type Body = Partial<Omit<Agent, "settings">> & { settings?: AgentSettings; note?: string };

// Modifie l'agent : réglages complets, nom, statut, langue, rôle, agent par défaut.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/agents/[id]">) {
  const id = await idOf(ctx);
  if (!getAgent(id)) return Response.json({ error: "Agent introuvable" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Body;
  updateAgent(id, {
    name: b.name,
    language: b.language,
    role: b.role === "support" || b.role === "sales" ? b.role : undefined,
    status: b.status === "active" || b.status === "paused" ? b.status : undefined,
    isDefault: b.isDefault === true,
  });
  if (b.settings) saveAgentSettings(id, withDefaults(b.settings), b.note?.slice(0, 80) || "Modification");
  return Response.json({ agent: getAgent(id) });
}

// Supprime l'agent (ses sources et FAQ). Ses discussions ne sont JAMAIS supprimées :
// ?reassignTo=ID les confie à un autre agent, sinon l'IA y est mise en pause.
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/agents/[id]">) {
  const id = await idOf(ctx);
  if (!getAgent(id)) return Response.json({ error: "Agent introuvable" }, { status: 404 });
  const target = Number(req.nextUrl.searchParams.get("reassignTo"));
  deleteAgent(id, Number.isInteger(target) && target > 0 && target !== id ? target : null);
  return Response.json({ ok: true });
}
