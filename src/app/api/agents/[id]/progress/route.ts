import { connection, type NextRequest } from "next/server";
import { agentProgress } from "@/lib/kb";

// Progression de la construction d'un agent (pages lues, FAQ créées, instructions).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/agents/[id]/progress">) {
  await connection();
  const progress = agentProgress(Number((await ctx.params).id));
  if (!progress) return Response.json({ error: "Agent introuvable" }, { status: 404 });
  return Response.json(progress);
}
