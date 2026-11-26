import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { getMessage, MEDIA_DIR } from "@/lib/db";
import { getWidgetByKey, validVisitorId, webJid } from "@/lib/widget";

// Fichier d'une conversation du site : accessible uniquement au visiteur de cette conversation.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/public/widget/[key]/files/[id]">) {
  const { key, id } = await ctx.params;
  const vid = req.nextUrl.searchParams.get("vid");
  const widget = getWidgetByKey(key);
  const msg = getMessage(decodeURIComponent(id));
  if (!widget || !validVisitorId(vid) || !msg?.mediaFile || msg.jid !== webJid(widget.key, vid)) {
    return new Response("Introuvable", { status: 404 });
  }
  const data = await readFile(path.join(MEDIA_DIR, path.basename(msg.mediaFile))).catch(() => null);
  if (!data) return new Response("Introuvable", { status: 404 });
  const mime = msg.mime ?? "application/octet-stream";
  const name = encodeURIComponent(msg.text || path.basename(msg.mediaFile));
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename*=UTF-8''${name}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
