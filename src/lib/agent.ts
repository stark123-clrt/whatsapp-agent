import "server-only";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  downloadMediaMessage,
  generateMessageIDV2,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  isLidUser,
  type WAMessage,
  type WASocket,
} from "baileys";
import pino from "pino";
import { generateReply, transcribeAudio, type ChatMessage, type ContentPart } from "./ai";
import { isOpenNow } from "./agent-settings";
import { addTask, incAiCount, resetAiCounter, setChatAgent, setDraft, setFollowupStage, setPendingReply, updateChat } from "./db";
import { agentMarketingContext } from "./campaign-context";
import { dealsFromTags } from "./deals";
import { channelAgent, noAgentReason, routeAgent } from "./routing";
import { getAgent, getAgentMedia, setMessageAgent, type Agent } from "./kb";
import { buildAgentPrompt, modelOptions, parseAgentReply, type AgentAction } from "./knowledge";
import { instagramConnected, sendInstagram } from "./instagram";
import { getWhatsAppState } from "./whatsapp";

const accountOf = (id: string | null | undefined) => (id ?? "").split(/[:@]/)[0].replace(/\D/g, "") || null;

/**
 * Discussion en lecture seule ? (null = on peut répondre)
 * - le canal est déconnecté ;
 * - la discussion a été reçue sur un autre numéro que celui connecté maintenant.
 */
export function chatReadOnly(jid: string): string | null {
  const chat = getChat(jid);
  if (chat?.channel === "instagram") {
    return instagramConnected() ? null : "Instagram déconnecté : reconnecte le compte dans Paramètres → Canaux pour répondre.";
  }
  if (!chat || chat.channel !== "whatsapp") return null;
  const wa = getWhatsAppState();
  if (wa.status !== "open") return "Canal déconnecté : reconnecte WhatsApp dans Paramètres → Canaux pour répondre.";
  const current = accountOf(wa.me?.id);
  if (chat.account && current && chat.account !== current) {
    return `Discussion reçue sur le numéro +${chat.account}, qui n'est plus connecté : lecture seule.`;
  }
  return null;
}
import {
  getChat,
  getMessage,
  getMessages,
  markDeleted,
  MEDIA_DIR,
  messageExists,
  removeMessage,
  saveMessage,
  setMessageStatus,
  setReaction,
  setAiPaused,
  upsertChat,
  type Message,
  type MessageType,
  type Sender,
} from "./db";

/**
 * L'agent : enregistre chaque message (reçu, envoyé par l'IA ou par toi) et répond avec l'IA.
 *
 * Garde-fous (pour se comporter comme un humain raisonnable) :
 * - il ne répond qu'aux numéros de AGENT_ALLOWED_NUMBERS (sauf AGENT_REPLY_ALL=true) ;
 * - jamais dans les groupes, les statuts ou les chaînes ;
 * - jamais dans une discussion où l'IA est en pause (par exemple dès que tu réponds toi-même) ;
 * - il n'écrit jamais en premier : il répond seulement ;
 * - délai « en train d'écrire » avant chaque réponse, nombre de réponses limité par heure.
 */

const HISTORY_LIMIT = 20; // messages envoyés à l'IA
const IMAGES_KEPT = 2; // photos envoyées à l'IA (les plus récentes)
const LOG_LIMIT = 50;
const MAX_AUDIO_SECONDS = 300;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const OWN_ECHO_DELAY_MS = 2000;

const DEFAULT_PROMPT = `Tu es l'assistant WhatsApp d'une entreprise. Tu réponds en français, \
de façon chaleureuse, courte et naturelle, comme un humain sur WhatsApp (2 à 4 phrases maximum, \
pas de listes ni de mise en forme Markdown). Si tu ne connais pas une information, dis-le \
simplement et propose qu'un membre de l'équipe recontacte la personne. N'invente jamais de prix, \
de dates ou de promesses.
Les messages vocaux te sont transmis sous forme de transcription : réponds-y naturellement, \
comme si tu les avais écoutés. Quand on t'envoie une photo, tu la vois et tu peux la décrire. \
Pour une vidéo, tu ne vois qu'une image d'aperçu : si le contenu de la vidéo compte, demande \
gentiment à la personne de l'expliquer en quelques mots.`;

export type AgentLogEntry = {
  at: number;
  kind: "in" | "out" | "skip" | "error";
  who: string;
  text: string;
};

type AgentStore = {
  queues: Map<string, Promise<void>>; // une file par discussion : tout se fait dans l'ordre
  appSent: Set<string>; // ids des messages envoyés par l'appli (IA ou interface)
  sentAt: number[]; // horodatage des réponses IA (limite par heure)
  log: AgentLogEntry[];
  typing: Set<string>; // discussions où l'IA est en train d'écrire
  pendingStatus: Map<string, number>; // accusés reçus avant l'enregistrement du message
};

const g = globalThis as typeof globalThis & { __agent2?: AgentStore };
const store: AgentStore = (g.__agent2 ??= {
  queues: new Map(),
  appSent: new Set(),
  sentAt: [],
  log: [],
  typing: new Set(),
  pendingStatus: new Map(),
});
store.typing ??= new Set();
store.pendingStatus ??= new Map();

/** Accusé de réception WhatsApp (envoyé, distribué, lu) pour un message envoyé. */
export function onStatusUpdate(id: string, status: number) {
  if (!setMessageStatus(id, status)) {
    store.pendingStatus.set(id, Math.max(status, store.pendingStatus.get(id) ?? 0));
  }
}

function saveSent(m: Parameters<typeof saveMessage>[0]) {
  const status = Math.max(m.status ?? 0, store.pendingStatus.get(m.id) ?? 0);
  store.pendingStatus.delete(m.id);
  return saveMessage({ ...m, status });
}

/** L'IA est-elle en train d'écrire dans cette discussion ? */
export function isAiTyping(jid: string) {
  return store.typing.has(jid);
}

const logger = pino({ level: process.env.WA_LOG_LEVEL ?? "warn" });

function settings() {
  const allowed = (process.env.AGENT_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean);
  return {
    enabled: process.env.AGENT_ENABLED !== "false",
    replyAll: process.env.AGENT_REPLY_ALL === "true",
    allowed,
    maxPerHour: Number(process.env.AGENT_MAX_REPLIES_PER_HOUR) || 30,
    prompt: process.env.AGENT_SYSTEM_PROMPT?.trim() || DEFAULT_PROMPT,
  };
}

function addLog(entry: Omit<AgentLogEntry, "at">) {
  store.log.unshift({ at: Date.now(), ...entry });
  store.log.length = Math.min(store.log.length, LOG_LIMIT);
}

export function getAgentLog() {
  return store.log;
}

export function getAgentSettings() {
  const s = settings();
  return { enabled: s.enabled, replyAll: s.replyAll, allowed: s.allowed };
}

/** L'agent a-t-il le droit de répondre dans cette discussion ? (null = oui, sinon la raison) */
export function whyAiInactive(jid: string, phone: string | null): string | null {
  const s = settings();
  if (!s.enabled) return "Agent coupé (AGENT_ENABLED=false)";
  const readOnly = chatReadOnly(jid);
  if (readOnly) return readOnly;
  const chat = getChat(jid);
  if (chat?.spam) return "Discussion marquée comme spam";
  if (chat?.dnd) return "« Ne pas déranger » est activé";
  if (chat?.aiPaused) return "IA en pause sur cette discussion";
  const isTest = Boolean(chat?.testContact || (phone !== null && s.allowed.includes(phone)));
  // Widget de site web : le mode test ne s'applique pas (le widget est installé pour répondre aux visiteurs).
  const isWeb = chat?.channel === "web";
  const agent = agentOf(jid);
  if (!agent) return noAgentReason(chat?.channel ?? "whatsapp");
  if (agent.status === "paused") return `L'agent « ${agent.name} » est en pause`;
  if (agent.settings.testMode && !isTest && !isWeb) return "Mode test : l'IA ne répond qu'aux contacts de test";
  const max = agent.settings.maxAiPerChat;
  if (chat && max > 0 && chat.aiCount >= max) {
    return `Limite de ${max} réponses IA atteinte dans cette conversation : prends le relais, ou réinitialise le compteur (ⓘ → Compteur de messages IA)`;
  }
  return null;
}

// ---------- Widget de site web ----------

const webMessageId = () => `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/** Enregistre un message écrit par le visiteur du site. */
export function saveWebVisitorMessage(jid: string, text: string) {
  const id = webMessageId();
  saveMessage({ id, jid, sender: "contact", type: "text", text, mediaFile: null, mime: null, ts: Date.now() });
  setFollowupStage(jid, 0);
  return id;
}

/** Photo ou PDF envoyé par un visiteur du site (l'IA voit les photos). */
export async function saveWebVisitorFile(jid: string, file: { data: Uint8Array; mime: string; name: string; ext: string }) {
  const id = webMessageId();
  const mediaFile = await saveMedia(id, file.data, file.ext);
  const type = file.mime.startsWith("image/") ? "image" : "document";
  saveMessage({ id, jid, sender: "contact", type, text: type === "document" ? file.name : null, mediaFile, mime: file.mime, ts: Date.now() });
  setFollowupStage(jid, 0);
  return { id, type };
}

/** Réponse manuelle depuis Discussions vers un visiteur du site : l'IA se met en pause. */
export function sendWebManualMessage(jid: string, text: string) {
  setAiPaused(jid, true);
  saveMessage({ id: webMessageId(), jid, sender: "human", type: "text", text, mediaFile: null, mime: null, ts: Date.now(), status: 4 });
}

/**
 * L'IA répond au visiteur du site (mêmes instructions, FAQ et actions que sur WhatsApp).
 * speed : 0 = plus lent et naturel, 100 = vitesse maximale.
 */
export function replyWeb(jid: string, speed: number) {
  replyVia(jid, speed, null);
}

/**
 * Réponse de l'IA sur un canal sans WhatsApp : site web (rien à envoyer, le widget relit la discussion)
 * ou Instagram (chaque bulle est envoyée par le service Instagram).
 */
function replyVia(jid: string, speed: number, send: ((text: string) => Promise<string>) | null) {
  enqueue(jid, async () => {
    if (whyAiInactive(jid, null)) return;
    if (getMessages(jid, 1).at(-1)?.sender !== "contact") return; // déjà répondu (messages regroupés)
    const agent = agentOf(jid);
    const chat = getChat(jid);
    const who = chat?.customName ?? chat?.name ?? "Visiteur du site";
    store.typing.add(jid);
    try {
      // Instagram : délai humain (3 à 6 s) pour ne pas ressembler à un robot.
      await sleep(send ? randomBetween(3_000, 6_000) : Math.max(300, (100 - Math.min(100, Math.max(0, speed))) * 30));
      const reply = await generateReply(
        [{ role: "system", content: systemPromptFor(jid, agent) }, ...(await buildHistory(jid))],
        agent ? modelOptions(agent) : {},
      );
      if (!reply.trim()) throw new Error("Réponse vide du modèle.");
      const { bubbles, actions } = agent ? parseAgentReply(reply, agent.settings) : { bubbles: [reply], actions: [] as AgentAction[] };
      if (whyAiInactive(jid, null)) return;
      if (agent?.settings.draftsOnly) {
        setDraft(jid, bubbles.join("\n\n"));
        return addLog({ kind: "skip", who, text: `Brouillon prêt : ${bubbles.join(" ")}` });
      }
      for (const [i, bubble] of bubbles.entries()) {
        if (i > 0) await sleep(send ? randomBetween(1_200, 3_000) : Math.min(2500, 400 + bubble.length * 15));
        const id = send ? await send(bubble) : webMessageId();
        saveMessage({ id, jid, sender: "ai", type: "text", text: bubble, mediaFile: null, mime: null, ts: Date.now(), status: 4 });
        if (agent) setMessageAgent(id, agent.id);
        incAiCount(jid);
      }
      addLog({ kind: "out", who, text: `${send ? "📸" : "🌐"} ${bubbles.join(" / ")}` });
      if (agent) await applyActions(null, jid, agent, actions, who);
    } catch (err) {
      addLog({ kind: "error", who, text: err instanceof Error ? err.message : String(err) });
    } finally {
      store.typing.delete(jid);
    }
  });
}

// ---------- Instagram ----------

/** Nouveau message Instagram (relevé par src/lib/instagram.ts) : attribution de l'agent puis réponse. */
export function onInstagramMessage(jid: string, text: string, isNew: boolean) {
  if (isNew) routeChat(jid, text);
  else if (!getChat(jid)?.agentId) routeChat(jid, text);
  setFollowupStage(jid, 0);
  replyVia(jid, 30, (bubble) => sendInstagram(jid, bubble));
}

/** Réponse écrite à la main depuis Discussions vers Instagram : l'IA se met en pause. */
export async function sendInstagramManual(jid: string, text: string) {
  const id = await sendInstagram(jid, text);
  setAiPaused(jid, true);
  saveMessage({ id, jid, sender: "human", type: "text", text, mediaFile: null, mime: null, ts: Date.now(), status: 4 });
}

/** Agent qui gère une discussion : celui qui lui est attribué, sinon l'agent par défaut. */
export function agentOf(jid: string): Agent | null {
  const id = getChat(jid)?.agentId;
  if (id) return getAgent(id); // conversation attribuée : elle garde son agent
  const chat = getChat(jid);
  return chat ? channelAgent(chat.channel) : null; // sinon l'agent de son canal
}

/** Points d'entrée : attribue un agent à une nouvelle discussion (mots-clés, puis canal par défaut). */
function routeChat(jid: string, firstText: string) {
  const chat = getChat(jid);
  if (!chat || chat.agentId) return;
  const agent = routeAgent(chat.channel, firstText);
  if (agent) setChatAgent(jid, agent.id);
}

/** Numéro de téléphone du contact (WhatsApp utilise parfois des identifiants « LID »). */
function phoneOf(msg: WAMessage): string | null {
  const { remoteJid, remoteJidAlt } = msg.key;
  const jid = isLidUser(remoteJid ?? undefined) ? remoteJidAlt : remoteJid;
  return jid?.split(/[:@]/)[0]?.replace(/\D/g, "") || null;
}

/** Infos de contexte (message cité…) quel que soit le type de message. */
function contextOf(m: NonNullable<WAMessage["message"]>) {
  return (
    m.extendedTextMessage?.contextInfo ??
    m.imageMessage?.contextInfo ??
    m.videoMessage?.contextInfo ??
    m.audioMessage?.contextInfo ??
    m.documentMessage?.contextInfo ??
    null
  );
}

function isSupported(msg: WAMessage) {
  const m = msg.message;
  return Boolean(
    m?.conversation ||
      m?.extendedTextMessage?.text ||
      m?.imageMessage ||
      m?.audioMessage ||
      m?.videoMessage ||
      m?.documentMessage,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const safeName = (id: string) => id.replace(/[^\w-]/g, "_");

async function saveMedia(id: string, data: Uint8Array, ext: string) {
  const file = `${safeName(id)}.${ext}`;
  await writeFile(path.join(MEDIA_DIR, file), data);
  return file;
}

/** Transforme un message WhatsApp en message enregistré (télécharge les médias). */
async function ingest(
  sock: WASocket,
  msg: WAMessage,
  sender: Sender,
  transcribe: boolean,
): Promise<Message> {
  const m = msg.message!;
  const id = msg.key.id!;
  const jid = msg.key.remoteJid!;
  const ts = Number(msg.messageTimestamp ?? 0) * 1000 || Date.now();
  const replyTo = contextOf(m)?.stanzaId ?? null;
  const base = { id, jid, sender, ts, mediaFile: null, mime: null, replyTo, status: msg.status ?? 0 };
  const download = () =>
    downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage });

  if (m.imageMessage) {
    const caption = m.imageMessage.caption || null;
    if (Number(m.imageMessage.fileLength ?? 0) > MAX_IMAGE_BYTES) {
      return { ...base, type: "image", text: caption ?? "(photo trop lourde)" };
    }
    const mime = m.imageMessage.mimetype ?? "image/jpeg";
    const file = await saveMedia(id, await download(), mime.includes("png") ? "png" : "jpg");
    return { ...base, type: "image", text: caption, mediaFile: file, mime };
  }

  if (m.audioMessage) {
    const mime = m.audioMessage.mimetype ?? "audio/ogg";
    const audio = await download();
    const file = await saveMedia(id, audio, "ogg");
    const seconds = m.audioMessage.seconds ?? 0;
    // Transcription seulement quand l'IA va s'en servir (ça a un coût).
    const text =
      transcribe && seconds <= MAX_AUDIO_SECONDS
        ? ((await transcribeAudio(audio).catch(() => null)) ?? "(inaudible)")
        : null;
    return { ...base, type: "audio", text, mediaFile: file, mime };
  }

  if (m.videoMessage) {
    // On ne garde que l'image d'aperçu (la vidéo complète serait lourde).
    const thumb = m.videoMessage.jpegThumbnail;
    const file = thumb?.length ? await saveMedia(id, thumb, "jpg") : null;
    return {
      ...base,
      type: "video",
      text: m.videoMessage.caption || null,
      mediaFile: file,
      mime: file ? "image/jpeg" : null,
    };
  }

  if (m.documentMessage) {
    const name = m.documentMessage.fileName || "document";
    const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase().replace(/\W/g, "") : "bin";
    const big = Number(m.documentMessage.fileLength ?? 0) > 32 * 1024 * 1024;
    const file = big ? null : await saveMedia(id, await download(), ext || "bin");
    return { ...base, type: "document", text: name, mediaFile: file, mime: m.documentMessage.mimetype ?? null };
  }

  return { ...base, type: "text", text: m.conversation || m.extendedTextMessage?.text || "" };
}

function describe(type: MessageType, text: string | null) {
  if (type === "image") return `📷 Photo${text ? ` : ${text}` : ""}`;
  if (type === "audio") return `🎤 ${text ?? "Message vocal"}`;
  if (type === "video") return `🎬 Vidéo${text ? ` : ${text}` : ""}`;
  if (type === "document") return `📄 ${text ?? "Document"}`;
  return text ?? "";
}

/** À appeler pour chaque message reçu ou envoyé sur le compte. */
export function handleIncoming(sock: WASocket, msg: WAMessage, live: boolean) {
  // live = message reçu en direct ; sinon rattrapé à la reconnexion (pas de réponse).
  const jid = msg.key.remoteJid;
  if (!jid || !msg.key.id) return;
  if (isJidGroup(jid) || isJidBroadcast(jid) || isJidNewsletter(jid) || isJidStatusBroadcast(jid)) return;

  // Réaction (👍 ❤️…) à un message : on l'affiche sous la bulle concernée.
  const reaction = msg.message?.reactionMessage;
  if (reaction?.key?.id) {
    const target = reaction.key.id;
    void sleep(msg.key.fromMe ? OWN_ECHO_DELAY_MS : 0).then(() =>
      setReaction(target, msg.key.fromMe ? "me" : "them", reaction.text || null),
    );
    return;
  }
  // Message supprimé « pour tout le monde » par le contact (ou depuis ton téléphone).
  const protocol = msg.message?.protocolMessage;
  if (protocol?.type === 0 && protocol.key?.id) {
    markDeleted(protocol.key.id);
    return;
  }

  if (!isSupported(msg)) return;

  const phone = phoneOf(msg);

  if (msg.key.fromMe) {
    // Message envoyé depuis ton téléphone (et pas par l'appli) : c'est toi qui reprends la main,
    // l'IA se met en pause dans cette discussion.
    const id = msg.key.id;
    void sleep(OWN_ECHO_DELAY_MS).then(() =>
      enqueue(jid, async () => {
        if (store.appSent.has(id) || messageExists(id)) return;
        upsertChat({ jid, channel: "whatsapp", phone, account: accountOf(sock.user?.id) });
        const saved = await ingest(sock, msg, "human", false);
        // Seulement pour un message récent (pas pour l'historique rattrapé).
        if (saveMessage(saved) && Date.now() - saved.ts < 120_000) setAiPaused(jid, true);
      }),
    );
    return;
  }

  const who = msg.pushName ? `${msg.pushName} (+${phone ?? "?"})` : `+${phone ?? "?"}`;
  upsertChat({ jid, channel: "whatsapp", phone, name: msg.pushName || null, account: accountOf(sock.user?.id) });

  enqueue(jid, async () => {
    const inactive = whyAiInactive(jid, phone);
    try {
      const saved = await ingest(sock, msg, "contact", live && !inactive);
      if (!saveMessage(saved)) return; // déjà enregistré
      routeChat(jid, saved.text ?? "");
      setFollowupStage(jid, 0); // le contact a répondu : les relances repartent de zéro
      // Le contact revient après un long silence : nouvelle conversation, le compteur de l'IA repart à zéro.
      const resetHours = agentOf(jid)?.settings.limitResetHours ?? 24;
      const previous = getMessages(jid, 2).at(-2);
      if (resetHours > 0 && previous && saved.ts - previous.ts >= resetHours * 3_600_000) resetAiCounter(jid);
      addLog({ kind: "in", who, text: describe(saved.type, saved.text) });
    } catch (err) {
      return addLog({ kind: "error", who, text: `Média illisible : ${err instanceof Error ? err.message : err}` });
    }
    if (!live) return; // messages rattrapés à la reconnexion : enregistrés, pas de réponse
    if (inactive) return addLog({ kind: "skip", who, text: inactive });
  });

  // La réponse passe dans la même file : si d'autres messages arrivent entre-temps,
  // ils sont lus ensemble et l'IA fait une seule réponse.
  if (live) enqueue(jid, () => replyTo(sock, msg.key, jid, phone, who));
}

function enqueue(jid: string, task: () => Promise<unknown>) {
  const next = (store.queues.get(jid) ?? Promise.resolve()).then(task).catch((err) => {
    addLog({ kind: "error", who: jid, text: err instanceof Error ? err.message : String(err) });
  });
  store.queues.set(jid, next as Promise<void>);
  return next;
}

/** Construit la conversation à envoyer à l'IA à partir des messages enregistrés. */
async function buildHistory(jid: string): Promise<ChatMessage[]> {
  const messages = getMessages(jid, HISTORY_LIMIT);
  let images = 0;
  const out: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const role = m.sender === "contact" ? "user" : "assistant";
    let label = m.text ?? "";
    if (m.type === "image") label = `[Photo]${m.text ? ` ${m.text}` : " envoyée sans texte"}`;
    if (m.type === "audio") label = `[Message vocal] ${m.text ?? "(non transcrit)"}`;
    if (m.type === "video") label = `[Vidéo — tu ne vois qu'une image d'aperçu]${m.text ? ` ${m.text}` : ""}`;
    if (m.type === "document") label = `[Document « ${m.text ?? "sans nom"} » — tu ne peux pas l'ouvrir]`;

    const withImage = role === "user" && m.mediaFile && m.mime?.startsWith("image/") && images < IMAGES_KEPT;
    if (withImage) {
      images++;
      const data = await readFile(path.join(MEDIA_DIR, m.mediaFile!)).catch(() => null);
      if (data) {
        const parts: ContentPart[] = [
          { type: "text", text: label },
          { type: "image_url", image_url: { url: `data:${m.mime};base64,${data.toString("base64")}` } },
        ];
        out.unshift({ role, content: parts });
        continue;
      }
    }
    out.unshift({ role, content: label });
  }
  return out;
}

const randomBetween = (min: number, max: number) => min + Math.random() * Math.max(0, max - min);

async function replyTo(sock: WASocket, key: WAMessage["key"], jid: string, phone: string | null, who: string) {
  if (whyAiInactive(jid, phone)) return;
  const s = settings();
  const last = getMessages(jid, 1).at(-1);
  if (last?.sender !== "contact") return; // déjà répondu (messages regroupés)

  const agent = agentOf(jid);
  // Hors des heures d'activité : la réponse partira à la réouverture (planificateur).
  if (agent && !isOpenNow(agent.settings)) {
    setPendingReply(jid, true);
    return addLog({ kind: "skip", who, text: "Hors des heures d'activité : réponse à la réouverture." });
  }
  setPendingReply(jid, false);

  const hourAgo = Date.now() - 3_600_000;
  store.sentAt = store.sentAt.filter((t) => t > hourAgo);
  if (store.sentAt.length >= s.maxPerHour) {
    return addLog({ kind: "skip", who, text: `Limite de ${s.maxPerHour} réponses/heure atteinte.` });
  }

  try {
    // Délai avant de répondre (réglable par agent), pour paraître naturel.
    const wait = agent ? randomBetween(agent.settings.delayMin, agent.settings.delayMax) * 1000 : 1500 + Math.random() * 2000;
    await sleep(Math.max(0, wait - 2000));
    await sock.readMessages([key]);
    await sock.sendPresenceUpdate("composing", jid);
    store.typing.add(jid);

    const chat = getChat(jid);
    const prompt = systemPromptFor(jid, agent);
    const reply = await generateReply(
      [{ role: "system", content: prompt }, ...(await buildHistory(jid))],
      agent ? modelOptions(agent) : {},
    );
    if (!reply.trim()) throw new Error("Réponse vide du modèle.");
    const { bubbles, actions } = agent
      ? parseAgentReply(reply, agent.settings)
      : { bubbles: [reply], actions: [] as AgentAction[] };

    // Tu as peut-être repris la main pendant que l'IA écrivait.
    if (whyAiInactive(jid, phone)) return;

    // Mode « brouillons uniquement » : rien n'est envoyé, tu valides dans la discussion.
    if (agent?.settings.draftsOnly) {
      setDraft(jid, bubbles.join("\n\n"));
      await sock.sendPresenceUpdate("paused", jid);
      return addLog({ kind: "skip", who, text: `Brouillon prêt : ${bubbles.join(" ")}` });
    }

    for (const [i, bubble] of bubbles.entries()) {
      if (i > 0) await sock.sendPresenceUpdate("composing", jid);
      // Temps de frappe à peu près humain : ~30 caractères/seconde, entre 1,5 et 6 s.
      await sleep(Math.min(6000, Math.max(1500, (bubble.length / 30) * 1000)));
      await sock.sendPresenceUpdate("paused", jid);
      const sentId = await sendText(sock, jid, bubble, "ai");
      if (agent) setMessageAgent(sentId, agent.id);
      incAiCount(jid);
    }
    store.sentAt.push(Date.now());
    addLog({ kind: "out", who, text: bubbles.join(" / ") });
    if (agent && chat) await applyActions(sock, jid, agent, actions, who);
  } catch (err) {
    await sock.sendPresenceUpdate("paused", jid).catch(() => {});
    addLog({ kind: "error", who, text: err instanceof Error ? err.message : String(err) });
  } finally {
    store.typing.delete(jid);
  }
}

/** Exécute les actions demandées par l'IA (tag, tâche, nom, info, média, passage à un humain). */
async function applyActions(sock: WASocket | null, jid: string, agent: Agent, actions: AgentAction[], who: string) {
  const caps = agent.settings.capabilities;
  for (const a of actions) {
    const chat = getChat(jid);
    if (!chat) return;
    if (a.kind === "TAG") {
      const rule = agent.settings.tagRules.find((r) => r.name.toLowerCase() === a.value.toLowerCase());
      if (!rule || chat.tags.includes(rule.name)) continue;
      updateChat(jid, { tags: [...chat.tags, rule.name] });
      dealsFromTags(jid, chat.tags); // étiquette déclencheuse → opportunité
      addLog({ kind: "out", who, text: `🏷️ Tag ajouté : ${rule.name}` });
      if (/^https:\/\//.test(rule.webhook)) {
        void fetch(rule.webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "tag.applied", tag: rule.name, contact: { jid, phone: chat.phone, name: chat.customName ?? chat.name } }),
          signal: AbortSignal.timeout(10_000),
        }).catch(() => {});
      }
    } else if (a.kind === "TACHE" && caps.createTasks) {
      addTask(jid, a.value.slice(0, 500));
      addLog({ kind: "out", who, text: `✅ Tâche créée : ${a.value}` });
    } else if (a.kind === "NOM" && caps.updateNames) {
      updateChat(jid, { customName: a.value.slice(0, 80) });
    } else if (a.kind === "INFO" && caps.collectInfo) {
      updateChat(jid, { notes: [chat.notes, `• ${a.value}`].filter(Boolean).join("\n").slice(0, 4000) });
    } else if (a.kind === "HUMAIN" && caps.handoff) {
      setAiPaused(jid, true);
      addTask(jid, `Reprendre la discussion : ${a.value}`.slice(0, 500));
      addLog({ kind: "skip", who, text: `🙋 Passage à un humain : ${a.value}` });
    } else if (a.kind === "MEDIA") {
      const media = getAgentMedia(Number(a.value.replace(/\D/g, "")));
      if (sock && media && media.agentId === agent.id) await sendAgentMedia(sock, jid, agent.id, media.file, media.mime, media.name);
    }
  }
}

/** Envoie un fichier de la médiathèque de l'agent (message écrit par l'IA). */
async function sendAgentMedia(sock: WASocket, jid: string, agentId: number, file: string, mime: string, name: string) {
  const data = await readFile(path.join(MEDIA_DIR, path.basename(file))).catch(() => null);
  if (!data) return;
  const id = generateMessageIDV2(sock.user?.id);
  store.appSent.add(id);
  const type: MessageType = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
  const content =
    type === "image"
      ? { image: data, mimetype: mime }
      : type === "video"
        ? { video: data, mimetype: mime }
        : type === "audio"
          ? { audio: data, mimetype: mime }
          : { document: data, mimetype: mime, fileName: name };
  await sock.sendMessage(jid, content, { messageId: id });
  const ext = path.extname(file).slice(1) || "bin";
  const saved = await saveMedia(id, data, ext);
  saveSent({ id, jid, sender: "ai", type, text: type === "document" ? name : null, mediaFile: saved, mime, ts: Date.now(), status: 2 });
  setMessageAgent(id, agentId);
}

/** Planificateur : répond à une discussion restée en attente (hors heures). */
export function replyPending(sock: WASocket, jid: string) {
  const last = getMessages(jid, 1).at(-1);
  const chat = getChat(jid);
  if (!last || last.sender !== "contact" || !chat) return setPendingReply(jid, false);
  const who = chat.customName ?? chat.name ?? `+${chat.phone ?? "?"}`;
  enqueue(jid, () => replyTo(sock, { remoteJid: jid, id: last.id, fromMe: false }, jid, chat.phone, who));
}

/** Planificateur : envoie une relance à un contact qui n'a pas répondu. */
export async function sendFollowup(sock: WASocket, jid: string, agent: Agent, tone: string, stage: number) {
  const chat = getChat(jid);
  if (!chat || whyAiInactive(jid, chat.phone)) return;
  const who = chat.customName ?? chat.name ?? `+${chat.phone ?? "?"}`;
  await enqueue(jid, async () => {
    const prompt = `${systemPromptFor(jid, agent)}

Le contact n'a pas répondu à ton dernier message. Écris UNE relance courte (1 à 2 phrases), dans la langue \
de la conversation, qui reprend naturellement le sujet. Ton : ${tone}. Ne t'excuse pas de relancer, ne mets pas d'action [[…]].`;
    const reply = await generateReply([{ role: "system", content: prompt }, ...(await buildHistory(jid))], modelOptions(agent));
    const { bubbles } = parseAgentReply(reply, { ...agent.settings, maxBubbles: 1 });
    const text = bubbles[0];
    if (!text) return;
    if (agent.settings.draftsOnly) {
      setDraft(jid, text);
    } else {
      const sentId = await sendText(sock, jid, text, "ai");
      setMessageAgent(sentId, agent.id);
      incAiCount(jid);
    }
    setFollowupStage(jid, stage + 1);
    addLog({ kind: "out", who, text: `🔁 Relance ${stage + 1} : ${text}` });
  });
}

/** Message enregistré → objet WhatsApp minimal pour le citer dans une réponse. */
function quotedFor(replyTo: string | null | undefined): WAMessage | undefined {
  const q = replyTo ? getMessage(replyTo) : null;
  if (!q) return undefined;
  return {
    key: { remoteJid: q.jid, id: q.id, fromMe: q.sender !== "contact" },
    message: { conversation: q.text ?? "" },
  };
}

/** Instructions de l'agent par défaut + FAQ utiles pour les derniers messages du contact. */
function systemPromptFor(jid: string, agent: Agent | null): string {
  if (!agent) return settings().prompt;
  const recent = getMessages(jid, 6)
    .filter((m) => m.sender === "contact")
    .map((m) => m.text ?? "")
    .join(" ");
  const chat = getChat(jid);
  const prompt = buildAgentPrompt(agent, recent, chat);
  // Sur tous les canaux : les campagnes de CET agent (offre, contenus publiés) et son catalogue produits.
  const marketing = agentMarketingContext(agent.id, recent);
  return marketing ? [prompt, marketing].join("\n\n") : prompt;
}

async function sendText(sock: WASocket, jid: string, text: string, sender: Sender, replyTo?: string | null) {
  const id = generateMessageIDV2(sock.user?.id);
  store.appSent.add(id);
  const quoted = quotedFor(replyTo);
  await sock.sendMessage(jid, { text }, { messageId: id, quoted });
  saveSent({
    id,
    jid,
    sender,
    type: "text",
    text,
    mediaFile: null,
    mime: null,
    ts: Date.now(),
    status: 2,
    replyTo: quoted ? replyTo : null,
  });
  return id;
}

/** Envoi manuel depuis l'interface : l'IA se met en pause dans cette discussion. */
export async function sendManualMessage(sock: WASocket, jid: string, text: string, replyTo?: string | null) {
  setAiPaused(jid, true);
  await enqueue(jid, () => sendText(sock, jid, text, "human", replyTo));
}

/** Clé WhatsApp d'un message enregistré (pour réagir ou supprimer). */
function keyOf(id: string) {
  const m = getMessage(id);
  if (!m) throw new Error("Message introuvable");
  return { m, key: { remoteJid: m.jid, id: m.id, fromMe: m.sender !== "contact" } };
}

/** Réagit à un message avec un emoji (chaîne vide = retirer la réaction). */
export async function reactToMessage(sock: WASocket, id: string, emoji: string) {
  const { m, key } = keyOf(id);
  await sock.sendMessage(m.jid, { react: { text: emoji, key } });
  setReaction(id, "me", emoji || null);
}

/**
 * Supprime un message. Les tiens (IA ou toi) sont supprimés pour tout le monde sur WhatsApp ;
 * ceux du contact sont seulement retirés de l'appli (WhatsApp ne permet pas plus).
 */
export async function deleteMessage(sock: WASocket | null, id: string): Promise<"everyone" | "local"> {
  const { m, key } = keyOf(id);
  if (m.sender !== "contact") {
    if (!sock) throw new Error("WhatsApp n'est pas connecté");
    await sock.sendMessage(m.jid, { delete: key });
    markDeleted(id);
    return "everyone";
  }
  removeMessage(id);
  return "local";
}

export type OutgoingFile = {
  data: Buffer;
  mime: string;
  fileName: string;
  caption?: string;
  voice?: boolean; // enregistrement au micro : envoyé comme message vocal
};

/** Envoi d'un fichier depuis l'interface (photo, vidéo, document, vocal). L'IA se met en pause. */
export async function sendManualFile(sock: WASocket, jid: string, file: OutgoingFile) {
  setAiPaused(jid, true);
  await enqueue(jid, async () => {
    const id = generateMessageIDV2(sock.user?.id);
    store.appSent.add(id);
    const caption = file.caption?.trim() || undefined;
    const ext = path.extname(file.fileName).slice(1).toLowerCase() || "bin";
    let type: MessageType = "document";
    let mime = file.mime;

    if (file.voice) {
      type = "audio";
      mime = "audio/ogg; codecs=opus";
      await sock.sendMessage(jid, { audio: file.data, mimetype: mime, ptt: true }, { messageId: id });
    } else if (mime.startsWith("image/")) {
      type = "image";
      await sock.sendMessage(jid, { image: file.data, caption, mimetype: mime }, { messageId: id });
    } else if (mime.startsWith("video/")) {
      type = "video";
      await sock.sendMessage(jid, { video: file.data, caption, mimetype: mime }, { messageId: id });
    } else if (mime.startsWith("audio/")) {
      type = "audio";
      await sock.sendMessage(jid, { audio: file.data, mimetype: mime }, { messageId: id });
    } else {
      await sock.sendMessage(
        jid,
        { document: file.data, mimetype: mime || "application/octet-stream", fileName: file.fileName, caption },
        { messageId: id },
      );
    }

    const saved = await saveMedia(id, file.data, file.voice ? "ogg" : ext);
    saveSent({
      status: 2,
      id,
      jid,
      sender: "human",
      type,
      text: type === "document" ? file.fileName : (caption ?? null),
      mediaFile: saved,
      mime,
      ts: Date.now(),
    });
  });
}

/** Propose une réponse de l'IA sans l'envoyer (bouton « Générer une réponse »). */
export async function draftReply(jid: string): Promise<string> {
  const agent = agentOf(jid);
  const reply = await generateReply(
    [{ role: "system", content: systemPromptFor(jid, agent) }, ...(await buildHistory(jid))],
    agent ? modelOptions(agent) : {},
  );
  return agent ? parseAgentReply(reply, { ...agent.settings, maxBubbles: 1 }).bubbles.join("\n\n") : reply;
}
