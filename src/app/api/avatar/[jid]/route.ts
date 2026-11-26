import type { NextRequest } from "next/server";
import { getAvatar } from "@/lib/avatar";

// Photo de profil d'un contact (404 s'il n'en a pas : l'interface affiche ses initiales).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/avatar/[jid]">) {
  const jid = decodeURIComponent((await ctx.params).jid);
  const photo = jid.startsWith("web_") || jid.startsWith("ig_") ? null : await getAvatar(jid).catch(() => null);
  if (!photo) return new Response(null, { status: 404, headers: { "Cache-Control": "private, max-age=600" } });
  return new Response(new Uint8Array(photo), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
  });
}
