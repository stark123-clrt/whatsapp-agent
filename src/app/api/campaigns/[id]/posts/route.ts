import type { NextRequest } from "next/server";
import { addManualPost, generatePost, getCampaign, getPost } from "@/lib/campaigns";

// « Préparer un contenu maintenant » : rédaction + visuel tout de suite, pour voir le résultat.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/posts">) {
  const id = Number((await ctx.params).id);
  if (!getCampaign(id)) return Response.json({ error: "Campagne introuvable" }, { status: 404 });
  const { kind } = (await req.json().catch(() => ({}))) as { kind?: "post" | "story" };
  const postId = addManualPost(id, kind === "story" ? "story" : "post");
  await generatePost(postId);
  return Response.json({ post: getPost(postId) });
}
