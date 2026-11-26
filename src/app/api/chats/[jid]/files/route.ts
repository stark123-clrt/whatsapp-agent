import type { NextRequest } from "next/server";
import { chatReadOnly, sendManualFile } from "@/lib/agent";
import { getChat } from "@/lib/db";
import { webmToOgg } from "@/lib/webm-to-ogg";
import { getSocket } from "@/lib/whatsapp";

const MAX_BYTES = 64 * 1024 * 1024; // WhatsApp limite les médias à 64 Mo environ

// Envoi d'un fichier ou d'un vocal enregistré depuis l'interface.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/chats/[jid]/files">) {
  const jid = decodeURIComponent((await ctx.params).jid);
  if (!getChat(jid)) return Response.json({ error: "Discussion introuvable" }, { status: 404 });
  const readOnly = chatReadOnly(jid);
  if (readOnly) return Response.json({ error: readOnly }, { status: 409 });
  const sock = getSocket();
  if (!sock) return Response.json({ error: "WhatsApp n'est pas connecté" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Aucun fichier" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Fichier trop lourd (64 Mo max)" }, { status: 413 });

  const voice = form?.get("voice") === "1";
  let data: Buffer = Buffer.from(await file.arrayBuffer());
  try {
    // Chrome enregistre en WebM : on le met au format des vocaux WhatsApp (Ogg).
    if (voice && !file.type.includes("ogg")) data = webmToOgg(data);
    await sendManualFile(sock, jid, {
      data,
      mime: file.type || "application/octet-stream",
      fileName: file.name || "fichier",
      caption: (form?.get("caption") as string | null) ?? undefined,
      voice,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec de l'envoi" }, { status: 500 });
  }
}
