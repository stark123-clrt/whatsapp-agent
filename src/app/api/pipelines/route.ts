import type { NextRequest } from "next/server";
import { createPipeline, listPipelines, StageError, updatePipeline, type StageKind } from "@/lib/deals";

type StageBody = { id?: number; name: string; color: string; kind: StageKind; triggerTags?: string[]; defaultValue?: number; idleDays?: number; idleTarget?: number | null };

// « Nouveau pipeline » (10 au maximum).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; syncTags?: boolean; stages?: StageBody[] };
  if (listPipelines().length >= 10) return Response.json({ error: "10 pipelines au maximum." }, { status: 400 });
  try {
    const p = createPipeline(body.name ?? "Nouveau pipeline", body.stages ?? []);
    updatePipeline(p.id, { syncTags: Boolean(body.syncTags) });
    return Response.json({ pipeline: p });
  } catch (e) {
    if (e instanceof StageError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
