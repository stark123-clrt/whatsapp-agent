import type { NextRequest } from "next/server";
import { deleteMessage } from "@/lib/agent";
import { getMessage, setStarred } from "@/lib/db";
import { getSocket } from "@/lib/whatsapp";

const idOf = async (ctx: RouteContext<"/api/messages/[id]">) => decodeURIComponent((await ctx.params).id);

// Marque / retire un message comme important.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/messages/[id]">) {
  const id = await idOf(ctx);
  if (!getMessage(id)) return Response.json({ error: "Message introuvable" }, { status: 404 });
  const { starred } = (await req.json().catch(() => ({}))) as { starred?: boolean };
  if (typeof starred !== "boolean") return Response.json({ error: "Requête invalide" }, { status: 400 });
  setStarred(id, starred);
  return Response.json({ ok: true });
}

// Supprime un message (pour tout le monde si c'est le tien, sinon dans l'appli seulement).
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/messages/[id]">) {
  const id = await idOf(ctx);
  if (!getMessage(id)) return Response.json({ error: "Message introuvable" }, { status: 404 });
  try {
    return Response.json({ deleted: await deleteMessage(getSocket(), id) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec de la suppression" }, { status: 500 });
  }
}
