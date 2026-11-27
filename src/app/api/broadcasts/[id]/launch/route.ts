import type { NextRequest } from "next/server";
import { launchBroadcast } from "@/lib/broadcasts";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/broadcasts/[id]/launch">) {
  try {
    return Response.json({ broadcast: launchBroadcast(Number((await ctx.params).id)) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 400 });
  }
}
