import type { NextRequest } from "next/server";
import { deleteProduct } from "@/lib/catalog";

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/catalog/[id]">) {
  await deleteProduct(Number((await ctx.params).id));
  return Response.json({ ok: true });
}
