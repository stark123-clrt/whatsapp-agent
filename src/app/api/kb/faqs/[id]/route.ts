import type { NextRequest } from "next/server";
import { deleteFaq, updateFaq } from "@/lib/kb";

const idOf = async (ctx: RouteContext<"/api/kb/faqs/[id]">) => Number((await ctx.params).id);

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/kb/faqs/[id]">) {
  const b = (await req.json().catch(() => ({}))) as { question?: string; answer?: string };
  if (!b.question?.trim() || !b.answer?.trim()) return Response.json({ error: "Question et réponse obligatoires." }, { status: 400 });
  updateFaq(await idOf(ctx), b.question.slice(0, 300), b.answer.slice(0, 2000));
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/kb/faqs/[id]">) {
  deleteFaq(await idOf(ctx));
  return Response.json({ ok: true });
}
