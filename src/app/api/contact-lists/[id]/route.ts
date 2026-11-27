import type { NextRequest } from "next/server";
import { deleteList, updateList } from "@/lib/contact-lists";

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/contact-lists/[id]">) {
  try {
    return Response.json({ list: updateList(Number((await ctx.params).id), await req.json()) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 400 });
  }
}

// Supprime la liste seulement (aucun contact n'est supprimé).
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/contact-lists/[id]">) {
  deleteList(Number((await ctx.params).id));
  return Response.json({ ok: true });
}
