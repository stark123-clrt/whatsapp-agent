import type { NextRequest } from "next/server";
import { deletePage, getPage, listFaqs } from "@/lib/kb";
import { refreshPages } from "@/lib/knowledge";

const idOf = async (ctx: RouteContext<"/api/kb/pages/[id]">) => Number((await ctx.params).id);

// FAQ d'une page.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/kb/pages/[id]">) {
  const id = await idOf(ctx);
  if (!getPage(id)) return Response.json({ error: "Page introuvable" }, { status: 404 });
  return Response.json({ faqs: listFaqs({ pageId: id }) });
}

// Relit la page et régénère ses FAQ.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/kb/pages/[id]">) {
  const id = await idOf(ctx);
  if (!getPage(id)) return Response.json({ error: "Page introuvable" }, { status: 404 });
  refreshPages([id]);
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/kb/pages/[id]">) {
  deletePage(await idOf(ctx));
  return Response.json({ ok: true });
}
