import { connection, type NextRequest } from "next/server";
import { isAiTyping, replyWeb, saveWebVisitorMessage } from "@/lib/agent";
import { getChat, getMessages, setChatAgent, updateChat, upsertChat } from "@/lib/db";
import { getAgent } from "@/lib/kb";
import { validVisitorId, webJid } from "@/lib/widget";
import { clientIp, limited, widgetFor } from "@/lib/widget-guard";

/**
 * API publique du widget (visiteurs du site) :
 *  GET  ?vid=…&after=… → messages de la conversation du visiteur + « l'IA écrit »
 *  POST { vid, text, lead?, agent? } → message du visiteur, puis réponse de l'IA
 */

type Ctx = RouteContext<"/api/public/widget/[key]/messages">;

export async function GET(req: NextRequest, ctx: Ctx) {
  await connection();
  const { widget, error } = widgetFor(req, (await ctx.params).key);
  if (error) return error;
  const vid = req.nextUrl.searchParams.get("vid");
  if (!validVisitorId(vid)) return Response.json({ messages: [], typing: false });
  const jid = webJid(widget.key, vid);
  const after = Number(req.nextUrl.searchParams.get("after")) || 0;
  const messages = getMessages(jid, 100)
    .filter((m) => m.ts > after && !m.deleted && (m.type === "text" || ((m.type === "image" || m.type === "document") && m.mediaFile)))
    .map((m) => {
      const from = m.sender === "contact" ? "visitor" : "agent";
      if (m.type === "text") return { id: m.id, from, text: m.text ?? "", ts: m.ts };
      // Photo ou document : on renvoie le lien sécurisé (réservé à ce visiteur).
      const url = `/api/public/widget/${widget.key}/files/${encodeURIComponent(m.id)}?vid=${vid}`;
      return { id: m.id, from, text: "", ts: m.ts, kind: m.type === "image" ? "image" : "file", name: m.text ?? "document", url };
    });
  return Response.json({ messages, typing: isAiTyping(jid), known: Boolean(getChat(jid)) });
}

type Lead = { name?: string; lastName?: string; email?: string; phone?: string };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { widget, error } = widgetFor(req, (await ctx.params).key);
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as { vid?: string; text?: string; lead?: Lead; agent?: number };
  if (!validVisitorId(body.vid)) return Response.json({ error: "Visiteur invalide" }, { status: 400 });
  const ip = clientIp(req);
  if (limited(`v:${body.vid}`, 15) || limited(`ip:${ip}`, 40)) {
    return Response.json({ error: "Trop de messages, patiente un instant." }, { status: 429 });
  }

  const jid = webJid(widget.key, body.vid);
  const lead = body.lead ?? {};
  const name = [lead.name, lead.lastName].map((x) => x?.trim()).filter(Boolean).join(" ").slice(0, 80) || null;
  const phone = lead.phone?.replace(/\D/g, "").slice(0, 15) || null;
  upsertChat({ jid, channel: "web", phone, name: name ?? (getChat(jid) ? null : "Visiteur du site") });
  if (lead.email?.trim()) updateChat(jid, { email: lead.email.trim().slice(0, 120) });

  // Agent : celui du code intégré (data-agent), sinon celui choisi dans le widget, sinon le défaut du compte.
  const chat = getChat(jid);
  if (chat && !chat.agentId) {
    const wanted = Number(body.agent) || widget.settings.agentId;
    if (wanted && getAgent(wanted)) setChatAgent(jid, wanted);
  }

  const text = body.text?.trim().slice(0, 2000);
  if (!text) return Response.json({ ok: true }); // formulaire de contact seul
  const id = saveWebVisitorMessage(jid, text);
  replyWeb(jid, widget.settings.aiSpeed);
  return Response.json({ ok: true, id });
}
