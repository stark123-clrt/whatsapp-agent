import { connection, type NextRequest } from "next/server";
import { listChats } from "@/lib/db";
import { createDeal, listDeals, listPipelines, listStages, StageError, type DealInput } from "@/lib/deals";

// CRM → Opportunités : pipelines, étapes, opportunités et contacts à lier.
export async function GET() {
  await connection();
  const contacts = listChats()
    .filter((c) => !c.spam)
    .map((c) => ({ jid: c.jid, name: c.customName ?? c.name, phone: c.phone, channel: c.channel }));
  return Response.json({ pipelines: listPipelines(), stages: listStages(), deals: listDeals(), contacts });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as DealInput & { stageId?: number };
  try {
    return Response.json({ deal: createDeal({ ...body, stageId: Number(body.stageId) }) });
  } catch (e) {
    if (e instanceof StageError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
