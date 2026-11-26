import type { NextRequest } from "next/server";
import { editPost, generatePost, getPost, publishNow, setPostStatus } from "@/lib/campaigns";

type Body = { action?: "approve" | "reject" | "publish" | "regenerate" | "edit" | "restore"; headline?: string; caption?: string };

// Actions sur un contenu de campagne : valider, écarter, publier maintenant, régénérer, modifier.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/campaign-posts/[id]">) {
  const id = Number((await ctx.params).id);
  const p = getPost(id);
  if (!p) return Response.json({ error: "Contenu introuvable" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Body;
  try {
    switch (body.action) {
      case "approve":
        if (p.status !== "pending" && p.status !== "failed") throw new Error("Ce contenu n'est pas à valider.");
        setPostStatus(id, "scheduled");
        break;
      case "reject":
        if (p.status === "published" || p.status === "publishing") throw new Error("Déjà publié.");
        setPostStatus(id, "rejected");
        break;
      case "restore":
        if (p.status !== "rejected") throw new Error("Ce contenu n'est pas écarté.");
        setPostStatus(id, "pending");
        break;
      case "publish":
        await publishNow(id);
        break;
      case "regenerate":
        if (p.status === "published" || p.status === "publishing") throw new Error("Déjà publié.");
        setPostStatus(id, "generating");
        await generatePost(id);
        break;
      case "edit":
        await editPost(id, { headline: body.headline, caption: body.caption });
        break;
      default:
        throw new Error("Action inconnue.");
    }
    return Response.json({ post: getPost(id) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Action impossible." }, { status: 400 });
  }
}
