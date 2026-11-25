import type { NextRequest } from "next/server";
import { deleteSource, linkSource, pagesOfSource } from "@/lib/kb";
import { refreshPages } from "@/lib/knowledge";

const idOf = async (ctx: RouteContext<"/api/kb/sources/[id]">) => Number((await ctx.params).id);

// « Actualiser » : relit toutes les pages du site et régénère leurs FAQ.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/kb/sources/[id]">) {
  refreshPages(pagesOfSource(await idOf(ctx)));
  return Response.json({ ok: true });
}

// Supprime le site, ses pages et leurs FAQ.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/kb/sources/[id]">) {
  deleteSource(await idOf(ctx));
  return Response.json({ ok: true });
}

// Lie (ou délie) la source à un agent : ses FAQ servent alors à cet agent.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/kb/sources/[id]">) {
  const { agentId } = (await req.json().catch(() => ({}))) as { agentId?: number | null };
  linkSource(await idOf(ctx), agentId ? Number(agentId) : null);
  return Response.json({ ok: true });
}
