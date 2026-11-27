import type { NextRequest } from "next/server";
import { setBroadcastState } from "@/lib/broadcasts";

// { action: "pause" | "resume" | "cancel" }
export async function POST(req: NextRequest, ctx: RouteContext<"/api/broadcasts/[id]/action">) {
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action !== "pause" && action !== "resume" && action !== "cancel") return Response.json({ error: "Action inconnue" }, { status: 400 });
  return Response.json({ broadcast: setBroadcastState(Number((await ctx.params).id), action) });
}
