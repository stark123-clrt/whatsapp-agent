import { connection, type NextRequest } from "next/server";
import { buildDashboard } from "@/lib/dashboard";
import { allTags } from "@/lib/db";
import { listAgents } from "@/lib/kb";

// Tableau de bord : ?from=…&to=… (ms), ?agent=ID, ?tags=a,b
export async function GET(req: NextRequest) {
  await connection();
  const q = req.nextUrl.searchParams;
  const to = Number(q.get("to")) || Date.now();
  const from = Number(q.get("from")) || to - 30 * 86_400_000;
  const agentId = Number(q.get("agent")) || null;
  const tags = (q.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  return Response.json({
    dashboard: buildDashboard({ from: Math.min(from, to - 3_600_000), to, agentId, tags }),
    agents: listAgents().map((a) => ({ id: a.id, name: a.name })),
    tags: allTags(),
  });
}
