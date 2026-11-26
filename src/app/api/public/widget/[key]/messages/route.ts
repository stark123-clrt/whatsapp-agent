import { connection, type NextRequest } from "next/server";
import { isAiTyping, replyWeb, saveWebVisitorMessage } from "@/lib/agent";
import { getChat, getMessages, setChatAgent, updateChat, upsertChat } from "@/lib/db";
import { getAgent } from "@/lib/kb";
import { getWidgetByKey, validVisitorId, webJid } from "@/lib/widget";
import { domainAllowed } from "@/lib/widget-settings";

/**
 * API publique du widget (visiteurs du site) :
 *  GET  ?vid=…&after=… → messages de la conversation du visiteur + « l'IA écrit »
 *  POST { vid, text, lead?, agent? } → message du visiteur, puis réponse de l'IA
 */

type Ctx = RouteContext<"/api/public/widget/[key]/messages">;

// Anti-spam : 15 messages / minute par visiteur, 40 par adresse IP.
const g = globalThis as typeof globalThis & { __widgetRate?: Map<string, number[]> };
const rate: Map<string, number[]> = (g.__widgetRate ??= new Map<string, number[]>());
function limited(key: string, max: number) {
  const now = Date.now();
  const list = (rate.get(key) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  rate.set(key, list);
  return list.length > max;
}

async function widgetFor(req: NextRequest, ctx: Ctx) {
  const widget = getWidgetByKey((await ctx.params).key);
  if (!widget) return { error: Response.json({ error: "Widget introuvable" }, { status: 404 }) };
  const host = req.headers.get("x-widget-host") ?? "";
  // Le lien partagé (/w/CLÉ ouvert directement) est servi par l'appli elle-même : toujours autorisé.
  const own = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0];
  if (host !== own && !domainAllowed(host, widget.settings.allowedDomains)) {
    return { error: Response.json({ error: "Ce site n'est pas autorisé à utiliser ce widget." }, { status: 403 }) };
  }
  return { widget };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  await connection();
  const { widget, error } = await widgetFor(req, ctx);
  if (error) return error;
  const vid = req.nextUrl.searchParams.get("vid");
  if (!validVisitorId(vid)) return Response.json({ messages: [], typing: false });
  const jid = webJid(widget.key, vid);
  const after = Number(req.nextUrl.searchParams.get("after")) || 0;
  const messages = getMessages(jid, 100)
    .filter((m) => m.ts > after && !m.deleted && m.type === "text")
    .map((m) => ({ id: m.id, from: m.sender === "contact" ? "visitor" : "agent", text: m.text ?? "", ts: m.ts }));
  return Response.json({ messages, typing: isAiTyping(jid), known: Boolean(getChat(jid)) });
}

type Lead = { name?: string; lastName?: string; email?: string; phone?: string };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { widget, error } = await widgetFor(req, ctx);
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as { vid?: string; text?: string; lead?: Lead; agent?: number };
  if (!validVisitorId(body.vid)) return Response.json({ error: "Visiteur invalide" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
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
