import type { NextRequest } from "next/server";
import { getAgent } from "@/lib/kb";
import { writeAgentInstructions } from "@/lib/knowledge";

// Demande à l'IA de réécrire les instructions de l'agent à partir de ses pages.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/agents/[id]/instructions">) {
  const id = Number((await ctx.params).id);
  if (!getAgent(id)) return Response.json({ error: "Agent introuvable" }, { status: 404 });
  try {
    await writeAgentInstructions(id);
    return Response.json({ agent: getAgent(id) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 500 });
  }
}
