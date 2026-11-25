import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { MEDIA_DIR } from "@/lib/db";
import { deleteAgentMedia, getAgentMedia, updateAgentMedia } from "@/lib/kb";

type Ctx = RouteContext<"/api/agents/[id]/media/[mediaId]">;
const mediaOf = async (ctx: Ctx) => {
  const { id, mediaId } = await ctx.params;
  const m = getAgentMedia(Number(mediaId));
  return m && m.agentId === Number(id) ? m : null;
};

// Aperçu du fichier.
export async function GET(_req: NextRequest, ctx: Ctx) {
  const m = await mediaOf(ctx);
  const data = m ? await readFile(path.join(MEDIA_DIR, path.basename(m.file))).catch(() => null) : null;
  if (!m || !data) return new Response("Introuvable", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "Content-Type": m.mime } });
}

// Modifie la consigne « quand l'envoyer ».
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const m = await mediaOf(ctx);
  if (!m) return Response.json({ error: "Média introuvable" }, { status: 404 });
  const { when } = (await req.json().catch(() => ({}))) as { when?: string };
  updateAgentMedia(m.id, String(when ?? "").slice(0, 300));
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const m = await mediaOf(ctx);
  if (!m) return Response.json({ error: "Média introuvable" }, { status: 404 });
  const file = deleteAgentMedia(m.id);
  if (file) await rm(path.join(MEDIA_DIR, path.basename(file)), { force: true });
  return Response.json({ ok: true });
}
