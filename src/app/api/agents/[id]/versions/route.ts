import { connection, type NextRequest } from "next/server";
import { getAgent, listVersions, restoreVersion } from "@/lib/kb";

// Historique des versions des réglages.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/agents/[id]/versions">) {
  await connection();
  return Response.json({ versions: listVersions(Number((await ctx.params).id)) });
}

// Restaure une version (la version actuelle est d'abord sauvegardée).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/agents/[id]/versions">) {
  const id = Number((await ctx.params).id);
  const { versionId } = (await req.json().catch(() => ({}))) as { versionId?: number };
  if (!restoreVersion(id, Number(versionId))) return Response.json({ error: "Version introuvable" }, { status: 404 });
  return Response.json({ agent: getAgent(id) });
}
