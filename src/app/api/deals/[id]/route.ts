import type { NextRequest } from "next/server";
import { deleteDeal, getDeal, StageError, updateDeal, type DealInput } from "@/lib/deals";

type Ctx = RouteContext<"/api/deals/[id]">;

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const body = (await req.json().catch(() => ({}))) as DealInput & { stageId?: number; position?: number };
  try {
    const deal = updateDeal(id, body);
    if (!deal) return Response.json({ error: "Opportunité introuvable" }, { status: 404 });
    return Response.json({ deal });
  } catch (e) {
    if (e instanceof StageError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!getDeal(id)) return Response.json({ error: "Opportunité introuvable" }, { status: 404 });
  deleteDeal(id);
  return Response.json({ ok: true });
}
