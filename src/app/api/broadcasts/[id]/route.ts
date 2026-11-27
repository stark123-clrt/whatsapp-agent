import { connection, type NextRequest } from "next/server";
import { deleteBroadcast, duplicateBroadcast, getBroadcast, launchProblems, quota, updateBroadcast } from "@/lib/broadcasts";
import { listAgents } from "@/lib/kb";
import { getWhatsAppState } from "@/lib/whatsapp";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/broadcasts/[id]">) {
  await connection();
  const b = getBroadcast(Number((await ctx.params).id));
  if (!b) return Response.json({ error: "Diffusion introuvable" }, { status: 404 });
  return Response.json({
    broadcast: b,
    problems: launchProblems(b),
    quota: quota(),
    whatsapp: { connected: getWhatsAppState().status === "open" },
    agents: listAgents().map((a) => ({ id: a.id, name: a.name, paused: a.status === "paused" })),
  });
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/broadcasts/[id]">) {
  try {
    const b = updateBroadcast(Number((await ctx.params).id), await req.json());
    return Response.json({ broadcast: b, problems: launchProblems(b) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 400 });
  }
}

// Dupliquer.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/broadcasts/[id]">) {
  try {
    return Response.json({ broadcast: duplicateBroadcast(Number((await ctx.params).id)) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 400 });
  }
}

// Supprime le suivi de la diffusion ; les messages envoyés restent dans les discussions.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/broadcasts/[id]">) {
  try {
    deleteBroadcast(Number((await ctx.params).id));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 400 });
  }
}
