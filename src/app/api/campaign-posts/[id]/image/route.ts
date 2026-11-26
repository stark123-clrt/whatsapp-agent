import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { getPost } from "@/lib/campaigns";
import { MEDIA_DIR } from "@/lib/db";

// Visuel d'un contenu de campagne (aperçu dans l'appli).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/campaign-posts/[id]/image">) {
  const p = getPost(Number((await ctx.params).id));
  const data = p?.imageFile ? await readFile(path.join(MEDIA_DIR, path.basename(p.imageFile))).catch(() => null) : null;
  if (!data) return new Response("Introuvable", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=31536000, immutable" } });
}
