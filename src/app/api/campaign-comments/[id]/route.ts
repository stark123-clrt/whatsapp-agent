import type { NextRequest } from "next/server";
import { actOnComment } from "@/lib/campaign-comments";

// Valider (avec modifications), ignorer ou réessayer une réponse à un commentaire.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/campaign-comments/[id]">) {
  const id = decodeURIComponent((await ctx.params).id);
  const b = (await req.json().catch(() => ({}))) as { action?: "approve" | "ignore" | "retry"; reply?: string; dm?: string | null };
  if (!b.action) return Response.json({ error: "Action manquante." }, { status: 400 });
  try {
    actOnComment(id, b.action, { reply: b.reply, dm: b.dm });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Action impossible." }, { status: 400 });
  }
}
