import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { onInstagramMessage } from "./agent";
import { publishedByMediaId } from "./campaign-context";
import { DATA_DIR, db, getChat, markRead, messageExists, saveMessage, setAiPaused, upsertChat } from "./db";
import { noteInteraction } from "./followers";

/**
 * Instagram (compte personnel, non officiel) : l'appli lance le petit service Python
 * (instagram-service/ig_service.py), le surveille, relève les messages privés toutes les
 * 45 secondes environ et envoie les réponses. Le service n'écoute qu'en local, avec une clé secrète.
 */

export type InstagramStatus = "off" | "starting" | "logged_out" | "logging_in" | "two_factor" | "challenge" | "connected" | "error";
export type InstagramState = {
  status: InstagramStatus;
  username: string | null;
  fullName: string | null;
  followers: number | null;
  picture: string | null;
  error: string | null;
};

type Thread = {
  threadId: string;
  pending: boolean;
  users: { pk: string; username: string; fullName: string | null; picture: string | null }[];
  messages: { id: string; fromMe: boolean; ts: number; text: string; type?: string | null; mediaRef?: string | null; debug?: string | null }[];
};

const PORT = Number(process.env.IG_PORT ?? 8765);
const IG_DIR = path.join(DATA_DIR, "instagram");
const SINCE_FILE = path.join(IG_DIR, "since.txt");
const POLL_MS = 45_000; // rythme calme
const FAST_MS = 15_000; // conversation en cours : relève rapprochée pendant 10 minutes
const ACTIVE_FOR = 10 * 60_000;

type Store = {
  proc: ChildProcess | null;
  token: string;
  state: InstagramState;
  threads: Map<string, { threadId: string; pending: boolean }>; // jid → conversation Instagram
  poll: NodeJS.Timeout | null;
  watch: NodeJS.Timeout | null;
  restarts: number;
};
const g = globalThis as typeof globalThis & { __instagram?: Store; __igActiveUntil?: number };
const store: Store = (g.__instagram ??= {
  proc: null,
  token: randomBytes(24).toString("hex"),
  state: { status: "off", username: null, fullName: null, followers: null, picture: null, error: null },
  threads: new Map(),
  poll: null,
  watch: null,
  restarts: 0,
});

export const instagramDisabled = () => process.env.INSTAGRAM_DISABLED === "true";
export const getInstagramState = (): InstagramState => store.state;
export const instagramConnected = () => store.state.status === "connected";

function pythonPath() {
  if (process.env.INSTAGRAM_PYTHON) return process.env.INSTAGRAM_PYTHON;
  return process.platform === "win32" ? path.join(process.cwd(), ".venv-ig", "Scripts", "python.exe") : "/opt/ig/bin/python";
}

async function ig<T>(route: string, body?: unknown): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${PORT}${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-IG-Token": store.token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Service Instagram : erreur ${res.status}`);
  return data;
}

/** Lance le service Python (une seule fois) et suit son état. */
export function ensureInstagram() {
  if (instagramDisabled() || store.proc) return;
  const script = path.join(process.cwd(), "instagram-service", "ig_service.py");
  const python = pythonPath();
  if (!existsSync(script) || !existsSync(python)) {
    store.state = { ...store.state, status: "error", error: "Service Instagram non installé sur ce serveur." };
    return;
  }
  store.state = { ...store.state, status: "starting", error: null };
  const proc = spawn(python, [script], {
    env: { ...process.env, IG_TOKEN: store.token, IG_PORT: String(PORT), IG_DATA_DIR: IG_DIR, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  store.proc = proc;
  proc.stdout?.on("data", (d: Buffer) => process.stdout.write(d.toString()));
  proc.stderr?.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line) console.error(`[instagram] ${line.slice(0, 500)}`);
  });
  proc.on("exit", (code) => {
    store.proc = null;
    store.state = { ...store.state, status: "error", error: `Le service Instagram s'est arrêté (code ${code}). Redémarrage…` };
    // Redémarrage automatique, de plus en plus espacé.
    const wait = Math.min(300_000, 5_000 * 2 ** Math.min(store.restarts++, 6));
    setTimeout(ensureInstagram, wait);
  });
  if (!store.watch) store.watch = setInterval(() => void refreshStatus(), 5_000);
}

async function refreshStatus() {
  if (!store.proc) return;
  try {
    const s = await ig<InstagramState & { userId: string | null }>("/status");
    const was = store.state.status;
    store.state = { status: s.status, username: s.username, fullName: s.fullName, followers: s.followers, picture: s.picture, error: s.error };
    store.restarts = 0;
    if (s.status === "connected" && was !== "connected") {
      console.log(`[instagram] connecté (@${s.username})`);
      startPolling();
    }
    if (s.status !== "connected") stopPolling();
  } catch {
    /* service en cours de démarrage */
  }
}

// ---------- Messages privés ----------

function since(): number {
  // Les messages plus anciens que la dernière relève sont importés sans réponse automatique
  // (on ne répond jamais à de vieux messages au moment de la connexion).
  try {
    return Math.max(Number(readFileSync(SINCE_FILE, "utf8")) || 0, Date.now() - 30 * 60_000);
  } catch {
    return Date.now();
  }
}

function startPolling() {
  if (store.poll) return;
  // Une seule fois : l'historique importé avant ce correctif est marqué comme lu.
  const flag = path.join(IG_DIR, "history-read-v1");
  if (!existsSync(flag) && existsSync(IG_DIR)) {
    db.prepare(`UPDATE chats SET unread = 0 WHERE channel = 'instagram'`).run();
    writeFileSync(flag, String(Date.now()));
  }
  let cutoff = since();
  const tick = async () => {
    try {
      // Heure prise AVANT la relève (avec 2 min de marge) : un message arrivé pendant la relève
      // ne doit jamais être pris pour de l'historique. Les doublons sont déjà écartés par leur identifiant.
      const started = Date.now() - 2 * 60_000;
      const { threads } = await ig<{ threads: Thread[] }>("/inbox");
      for (const t of threads) ingest(t, cutoff);
      cutoff = started;
      writeFileSync(SINCE_FILE, String(started));
    } catch (err) {
      console.error(`[instagram] relève : ${err instanceof Error ? err.message : err}`);
    }
    // Rythme irrégulier, plus naturel pour Instagram.
    // Rythme adaptatif : rapide quand quelqu'un écrit, calme sinon (moins de requêtes vers Instagram).
    const fast = Date.now() < (g.__igActiveUntil ?? 0);
    store.poll = setTimeout(() => void tick(), fast ? FAST_MS + Math.random() * 5_000 : POLL_MS + Math.random() * 15_000);
  };
  store.poll = setTimeout(() => void tick(), 1_000);
}

function stopPolling() {
  if (store.poll) clearTimeout(store.poll);
  store.poll = null;
}

function ingest(t: Thread, cutoff: number) {
  const other = t.users[0];
  if (!other) return;
  const jid = `ig_${t.threadId}`;
  store.threads.set(jid, { threadId: t.threadId, pending: t.pending });
  const isNew = !getChat(jid);
  upsertChat({ jid, channel: "instagram", phone: null, name: other.fullName || `@${other.username}`, account: store.state.username });
  let fresh: string | null = null;
  let history = false; // anciens messages importés (avant la connexion)
  for (const m of [...t.messages].sort((a, b) => a.ts - b.ts)) {
    const id = `ig_${m.id}`;
    if (messageExists(id)) continue;
    // Réponse à une story ou à une publication de nos campagnes : l'IA sait de quel contenu il s'agit.
    let text = m.text;
    if (!m.fromMe && m.mediaRef) {
      const about = publishedByMediaId(m.mediaRef);
      if (about) text = `[Réponse à : ${about}]
${m.text}`;
      else if (/reel_share|story/i.test(m.type ?? "")) text = `[Réponse à une de tes stories]
${m.text}`;
    }
    saveMessage({ id, jid, sender: m.fromMe ? "human" : "contact", type: "text", text, mediaFile: null, mime: null, ts: m.ts, status: m.fromMe ? 4 : 0 });
    if (!m.fromMe && !m.mediaRef && (m.debug || (m.type && m.type !== "text"))) console.log(`[instagram] message « ${m.type} » sans contenu reconnu (${m.debug ?? "aucun bloc"})`);
    if (!m.fromMe && m.ts > cutoff) fresh = text;
    else if (!m.fromMe) history = true;
    if (m.fromMe) {
      fresh = null; // déjà répondu depuis le téléphone
      // Comme sur WhatsApp : si tu réponds toi-même depuis Instagram, l'IA se met en pause ici.
      if (Date.now() - m.ts < 5 * 60_000) setAiPaused(jid, true);
    }
  }
  if (fresh !== null) {
    // Quelqu'un qui écrit est un contact engagé : l'agent peut le suivre (si activé dans Croissance).
    noteInteraction({ userId: other.pk, username: other.username, fullName: other.fullName, picture: other.picture }, "dm");
    g.__igActiveUntil = Date.now() + ACTIVE_FOR;
    onInstagramMessage(jid, fresh, isNew);
  }
  else if (history) markRead(jid); // l'historique importé ne compte pas comme « non lu »
}

/** Envoie un message dans une conversation Instagram ; renvoie l'identifiant du message enregistré. */
export async function sendInstagram(jid: string, text: string): Promise<string> {
  const thread = store.threads.get(jid) ?? { threadId: jid.replace(/^ig_/, ""), pending: false };
  const { id } = await ig<{ id: string }>("/send", { threadId: thread.threadId, text, pending: thread.pending });
  store.threads.set(jid, { ...thread, pending: false });
  return `ig_${id}`;
}

export type IgComment = { id: string; text: string; userId: string; username: string; fullName: string | null; ts: number; repliedTo: string | null };

/** Commentaires d'une publication (campagnes). */
export async function fetchComments(mediaId: string): Promise<IgComment[]> {
  return (await ig<{ comments: IgComment[] }>("/comments", { mediaId, amount: 40 })).comments;
}

/** Réponse publique sous un commentaire, et/ou « j'aime » sur le commentaire. */
export async function replyToComment(mediaId: string, commentId: string, text: string, like: boolean) {
  return ig<{ id: string | null }>("/comment-reply", { mediaId, commentId, text, like });
}

/** Message privé à quelqu'un qui a commenté : la conversation rejoint Discussions. */
export async function dmUser(userId: string, text: string, name: string): Promise<string | null> {
  const res = await ig<{ id: string; threadId: string | null }>("/dm-user", { userId, text });
  if (!res.threadId) return null;
  const jid = `ig_${res.threadId}`;
  store.threads.set(jid, { threadId: res.threadId, pending: false });
  upsertChat({ jid, channel: "instagram", phone: null, name, account: store.state.username });
  saveMessage({ id: `ig_${res.id}`, jid, sender: "ai", type: "text", text, mediaFile: null, mime: null, ts: Date.now(), status: 4 });
  g.__igActiveUntil = Date.now() + ACTIVE_FOR; // la personne va sûrement répondre : relève rapprochée
  return jid;
}

// ---------- Abonnés (croissance) ----------

export type IgFollower = { pk: string; username: string; fullName: string | null; picture: string | null; private: boolean; noPicture: boolean; following: boolean | null };
export type IgProfile = { pk: string; username: string; fullName: string | null; picture: string | null; private: boolean; posts: number; followers: number; following: number; business: boolean };

/** Derniers abonnés du compte (les plus récents d'abord). */
export async function fetchFollowers(amount = 50): Promise<IgFollower[]> {
  return (await ig<{ users: IgFollower[] }>("/followers", { amount })).users;
}

/** Profil d'une personne (nombre de publications, d'abonnés, d'abonnements). */
export async function fetchProfile(userId: string): Promise<IgProfile> {
  return ig<IgProfile>("/user-info", { userId });
}

/** Chiffres du compte connecté. */
export async function fetchMyProfile(): Promise<IgProfile> {
  return ig<IgProfile>("/me", {});
}

/** S'abonner à une personne. */
export async function followUser(userId: string): Promise<boolean> {
  return (await ig<{ ok: boolean }>("/follow", { userId })).ok;
}

/** Convertit une image (WebP, AVIF…) en JPEG via le service Python (Pillow). */
export async function convertToJpeg(src: string, dest: string) {
  ensureInstagram();
  await ig("/convert", { src, dest });
}

/** Publie une photo ou une story (campagnes). */
export type Poll = { question: string; options: string[] };

export async function publishInstagram(kind: "post" | "story", file: string, caption: string, link: string, poll?: Poll | null) {
  return ig<{ id: string; code: string | null }>("/publish", { kind, path: file, caption, link, poll: poll ?? null });
}

/** Votes d'un sondage de story. */
export async function fetchPollResults(storyId: string) {
  return ig<{ question: string | null; results: { text: string; count: number }[] }>("/poll-results", { storyId });
}

export async function loginInstagram(username: string, password: string) {
  ensureInstagram();
  await ig("/login", { username, password });
  store.state = { ...store.state, status: "logging_in", error: null, username };
}

/** Connexion avec le cookie « sessionid » du navigateur (quand Instagram refuse l'identifiant). */
export async function loginInstagramSession(sessionid: string) {
  ensureInstagram();
  await ig("/login-session", { sessionid });
  store.state = { ...store.state, status: "logging_in", error: null };
}

export async function submitInstagramCode(code: string) {
  await ig("/code", { code });
}

export async function logoutInstagram() {
  stopPolling();
  await ig("/logout", {});
  store.threads.clear();
  await refreshStatus();
}
