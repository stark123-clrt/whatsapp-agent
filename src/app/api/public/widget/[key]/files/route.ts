import type { NextRequest } from "next/server";
import { replyWeb, saveWebVisitorFile } from "@/lib/agent";
import { getChat, upsertChat } from "@/lib/db";
import { validVisitorId, webJid } from "@/lib/widget";
import { clientIp, limited, widgetFor } from "@/lib/widget-guard";

const MAX_BYTES = 10 * 1024 * 1024;

/** Type réel du fichier, lu dans ses premiers octets (on ne se fie pas au nom ni au type annoncé). */
function sniff(b: Uint8Array): { mime: string; ext: string } | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((x, j) => b[i + j] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return { mime: "image/jpeg", ext: "jpg" };
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return { mime: "image/png", ext: "png" };
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return { mime: "image/gif", ext: "gif" };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { mime: "image/webp", ext: "webp" };
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return { mime: "application/pdf", ext: "pdf" };
  return null;
}

// Un visiteur du site envoie une photo ou un PDF (formulaire : vid, file).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/public/widget/[key]/files">) {
  const { widget, error } = widgetFor(req, (await ctx.params).key);
  if (error) return error;
  if (!widget.settings.attachments) return Response.json({ error: "L'envoi de fichiers est désactivé." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const vid = form?.get("vid");
  const file = form?.get("file");
  if (!validVisitorId(vid)) return Response.json({ error: "Visiteur invalide" }, { status: 400 });
  if (!(file instanceof File)) return Response.json({ error: "Aucun fichier" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Fichier trop lourd (10 Mo max)." }, { status: 413 });
  // Plus strict que pour les messages : 5 fichiers / minute par visiteur, 15 par adresse IP.
  if (limited(`f:${vid}`, 5) || limited(`fip:${clientIp(req)}`, 15)) {
    return Response.json({ error: "Trop de fichiers, patiente un instant." }, { status: 429 });
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(data);
  if (!kind) return Response.json({ error: "Seules les photos (JPG, PNG, WebP, GIF) et les PDF sont acceptés." }, { status: 415 });

  const jid = webJid(widget.key, vid);
  upsertChat({ jid, channel: "web", phone: null, name: getChat(jid) ? null : "Visiteur du site" });
  const name = (file.name || "document").replace(/[\\/\r\n]/g, "_").slice(0, 120);
  const saved = await saveWebVisitorFile(jid, { data, mime: kind.mime, ext: kind.ext, name });
  replyWeb(jid, widget.settings.aiSpeed);
  return Response.json({ ok: true, id: saved.id, kind: saved.type === "image" ? "image" : "file" });
}
