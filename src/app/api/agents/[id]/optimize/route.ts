import type { NextRequest } from "next/server";
import { getAgent } from "@/lib/kb";
import { optimizeInstructions } from "@/lib/knowledge";

// « Optimiser avec l'IA » : améliore les instructions (une version est gardée dans l'historique).
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/agents/[id]/optimize">) {
  const id = Number((await ctx.params).id);
  if (!getAgent(id)) return Response.json({ error: "Agent introuvable" }, { status: 404 });
  try {
    await optimizeInstructions(id);
    return Response.json({ agent: getAgent(id) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 500 });
  }
}
