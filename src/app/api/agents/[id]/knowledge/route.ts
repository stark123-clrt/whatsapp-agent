import { connection, type NextRequest } from "next/server";
import { faqsForAgent, listSources } from "@/lib/kb";

// FAQ et sources de l'agent (onglet « FAQ et connaissances »).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/agents/[id]/knowledge">) {
  await connection();
  const id = Number((await ctx.params).id);
  const sources = listSources();
  return Response.json({
    faqs: faqsForAgent(id),
    linked: sources.filter((s) => s.agentId === id),
    others: sources.filter((s) => s.agentId !== id).map((s) => ({ id: s.id, name: s.name, pages: s.pages.length })),
  });
}
