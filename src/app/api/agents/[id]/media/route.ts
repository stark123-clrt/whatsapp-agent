import { writeFile } from "node:fs/promises";
import path from "node:path";
import { connection, type NextRequest } from "next/server";
import { MEDIA_DIR } from "@/lib/db";
import { addAgentMedia, getAgent, listAgentMedia } from "@/lib/kb";

const MAX_BYTES = 32 * 1024 * 1024;

// Médiathèque de l'agent.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/agents/[id]/media">) {
  await connection();
  return Response.json({ media: listAgentMedia(Number((await ctx.params).id)) });
}

// « Ajouter un média » : fichier + consigne « quand l'envoyer ».
export async function POST(req: NextRequest, ctx: RouteContext<"/api/agents/[id]/media">) {
  const id = Number((await ctx.params).id);
  if (!getAgent(id)) return Response.json({ error: "Agent introuvable" }, { status: 404 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Aucun fichier." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Fichier trop lourd (32 Mo max)." }, { status: 413 });
  const ext = (path.extname(file.name).slice(1).toLowerCase().replace(/\W/g, "") || "bin").slice(0, 8);
  const name = `agent-${id}-${Date.now()}.${ext}`;
  await writeFile(path.join(MEDIA_DIR, name), Buffer.from(await file.arrayBuffer()));
  addAgentMedia(id, name, file.type || "application/octet-stream", file.name.slice(0, 120), String(form?.get("when") ?? "").slice(0, 300));
  return Response.json({ media: listAgentMedia(id) });
}
