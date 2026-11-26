import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { MEDIA_DIR } from "@/lib/db";
import { getWidgetByKey } from "@/lib/widget";

// Logo du widget (public : affiché sur les sites des visiteurs).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/public/widget/[key]/logo">) {
  const widget = getWidgetByKey((await ctx.params).key);
  const file = widget?.settings.logo;
  const data = file ? await readFile(path.join(MEDIA_DIR, path.basename(file))).catch(() => null) : null;
  if (!data || !file) return new Response("Introuvable", { status: 404 });
  const ext = path.extname(file).slice(1);
  const type = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return new Response(new Uint8Array(data), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600" } });
}
