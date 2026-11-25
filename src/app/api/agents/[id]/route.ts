import { connection, type NextRequest } from "next/server";
import { withDefaults, type AgentSettings } from "@/lib/agent-settings";
import { agentOverview, deleteAgent, getAgent, saveAgentSettings, updateAgent, type Agent } from "@/lib/kb";
import { preparation } from "@/lib/preparation";

const idOf = async (ctx: RouteContext<"/api/agents/[id]">) => Number((await ctx.params).id);

// Un agent, avec ses chiffres (période ?days=7|30|90) et son score de préparation.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/agents/[id]">) {
  await connection();
  const agent = getAgent(await idOf(ctx));
  if (!agent) return Response.json({ error: "Agent introuvable" }, { status: 404 });
  const days = [7, 30, 90].includes(Number(req.nextUrl.searchParams.get("days"))) ? Number(req.nextUrl.searchParams.get("days")) : 30;
  return Response.json({ agent, overview: agentOverview(agent.id, days), preparation: preparation(agent) });
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

// Supprime l'agent avec ses sources et ses FAQ.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/agents/[id]">) {
  const id = await idOf(ctx);
  if (!getAgent(id)) return Response.json({ error: "Agent introuvable" }, { status: 404 });
  deleteAgent(id);
  return Response.json({ ok: true });
}
