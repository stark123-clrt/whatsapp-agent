import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { deletePipeline, listPipelines, saveStages, StageError, updatePipeline, type StageKind } from "@/lib/deals";

type Ctx = RouteContext<"/api/pipelines/[id]">;
type StageBody = { id?: number; name: string; color: string; kind: StageKind; triggerTags?: string[]; defaultValue?: number; idleDays?: number; idleTarget?: number | null };

// « Appliquer les modifications » : nom, synchronisation des étiquettes et étapes, en une fois.
export async function PUT(req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!listPipelines().some((p) => p.id === id)) return Response.json({ error: "Pipeline introuvable" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { name?: string; syncTags?: boolean; stages?: StageBody[] };
  try {
    db.exec("BEGIN");
    if (body.stages) saveStages(id, body.stages);
    updatePipeline(id, { name: body.name, syncTags: body.syncTags });
    db.exec("COMMIT");
    return Response.json({ ok: true });
  } catch (e) {
    db.exec("ROLLBACK");
    if (e instanceof StageError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!deletePipeline(id)) return Response.json({ error: "Le pipeline principal ne peut pas être supprimé." }, { status: 400 });
  return Response.json({ ok: true });
}
