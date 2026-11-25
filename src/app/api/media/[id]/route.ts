import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { getMessage, MEDIA_DIR } from "@/lib/db";

// Sert le fichier d'un message (photo, vocal, aperçu de vidéo).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/media/[id]">) {
  const msg = getMessage(decodeURIComponent((await ctx.params).id));
  if (!msg?.mediaFile) return new Response("Introuvable", { status: 404 });
  const data = await readFile(path.join(MEDIA_DIR, path.basename(msg.mediaFile))).catch(() => null);
  if (!data) return new Response("Introuvable", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": (msg.mime ?? "application/octet-stream").split(";")[0],
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
