import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { getProduct } from "@/lib/catalog";
import { MEDIA_DIR } from "@/lib/db";

// Photo d'un produit du catalogue (copie gardée sur le serveur).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/catalog/[id]/image">) {
  const p = getProduct(Number((await ctx.params).id));
  const data = p?.imageFile ? await readFile(path.join(MEDIA_DIR, path.basename(p.imageFile))).catch(() => null) : null;
  if (!data) return new Response("Introuvable", { status: 404 });
  const type = p!.imageFile!.endsWith(".png") ? "image/png" : "image/jpeg";
  return new Response(new Uint8Array(data), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" } });
}
