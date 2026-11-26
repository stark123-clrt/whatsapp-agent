import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState as loadAuthState,
  type WASocket,
} from "baileys";
import pino from "pino";
import QRCode from "qrcode";
import { handleIncoming, onStatusUpdate } from "./agent";

/**
 * Connexion WhatsApp (non officielle, via WhatsApp Web) avec Baileys.
 *
 * La connexion vit dans le processus du serveur Next.js : elle fonctionne avec
 * `npm run dev` / `npm start`, pas sur un hébergement serverless.
 * La session est sauvegardée dans `.wa-auth/` pour ne pas rescanner le QR code
 * à chaque redémarrage. Ce dossier donne accès au compte : ne le partage jamais.
 */

export type WhatsAppStatus =
  | "idle" // pas encore démarré
  | "connecting" // connexion en cours
  | "qr" // en attente du scan du QR code
  | "open" // connecté
  | "closed"; // déconnecté (voir lastError)

export type WhatsAppState = {
  status: WhatsAppStatus;
  qrDataUrl: string | null;
  me: { id: string; name?: string } | null;
  lastError: string | null;
  expectedPhone?: string | null; // numéro autorisé (contrôlé à chaque connexion)
  pairingCode?: string | null; // code à saisir sur le téléphone (« Lier avec le numéro »)
};

/**
 * Efface la session WhatsApp. On vide le CONTENU du dossier sans supprimer le dossier :
 * en production c'est un volume Docker (point de montage), impossible à supprimer.
 */
async function clearSession() {
  const files = await readdir(AUTH_DIR).catch(() => [] as string[]);
  await Promise.all(files.map((f) => rm(path.join(AUTH_DIR, f), { recursive: true, force: true }).catch(() => {})));
}

// ---------- Numéro autorisé (sécurité) ----------
// Mémorisé dans data/ (volume persistant) : seul ce compte WhatsApp peut se connecter.
const SETTINGS_FILE = path.join(process.cwd(), "data", "whatsapp.json");
const digits = (v: string | null | undefined) => (v ?? "").split(/[:@]/)[0].replace(/\D/g, "");

function readExpectedPhone(): string | null {
  try {
    return (JSON.parse(readFileSync(SETTINGS_FILE, "utf8")) as { expectedPhone?: string }).expectedPhone || null;
  } catch {
    return null;
  }
}

function writeExpectedPhone(phone: string) {
  mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify({ expectedPhone: phone }, null, 2));
}

const AUTH_DIR = path.join(process.cwd(), ".wa-auth");
const RECONNECT_DELAY_MS = 3000;

type Store = {
  sock: WASocket | null;
  state: WhatsAppState;
  starting: Promise<void> | null;
  reconnectTimer: NodeJS.Timeout | null;
};

// On garde une seule connexion par processus, même quand Next.js recharge les
// modules en développement.
const globalForWa = globalThis as typeof globalThis & { __whatsapp?: Store };
const store: Store = (globalForWa.__whatsapp ??= {
  sock: null,
  state: { status: "idle", qrDataUrl: null, me: null, lastError: null },
  starting: null,
  reconnectTimer: null,
});

const logger = pino({ level: process.env.WA_LOG_LEVEL ?? "warn" });

function setState(patch: Partial<WhatsAppState>) {
  store.state = { ...store.state, ...patch };
}

export function getWhatsAppState(): WhatsAppState {
  return { ...store.state, expectedPhone: existsSync(SETTINGS_FILE) ? readExpectedPhone() : null };
}

export function getSocket(): WASocket | null {
  return store.state.status === "open" ? store.sock : null;
}

/** Démarre la connexion si elle n'est pas déjà active. */
export function ensureWhatsApp(): Promise<void> {
  // WHATSAPP_DISABLED=true : cette copie de l'appli ne se connecte jamais (ex. ton PC quand le serveur gère).
  if (process.env.WHATSAPP_DISABLED === "true") {
    setState({ status: "closed", lastError: "WhatsApp est désactivé sur cette installation (WHATSAPP_DISABLED=true)." });
    return Promise.resolve();
  }
  if (store.sock || store.reconnectTimer) return Promise.resolve();
  store.starting ??= connect().finally(() => {
    store.starting = null;
  });
  return store.starting;
}

async function connect() {
  setState({ status: "connecting", qrDataUrl: null, lastError: null });

  const { state: auth, saveCreds } = await loadAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: undefined,
  }));

  const sock = makeWASocket({
    auth,
    version,
    logger,
    browser: Browsers.appropriate("Chrome"),
    // Ne pas se marquer "en ligne" en permanence : le téléphone continue de
    // recevoir les notifications normalement.
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  store.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  // Tous les messages passent par l'agent qui les enregistre. Il ne répond qu'aux
  // messages reçus en direct ("notify"), pas à ceux rattrapés à la reconnexion ("append").
  sock.ev.on("messages.upsert", ({ messages, type }) => {
    for (const msg of messages) handleIncoming(sock, msg, type === "notify");
  });

  // Accusés de réception des messages envoyés : ✓ envoyé, ✓✓ distribué, ✓✓ lu.
  sock.ev.on("messages.update", (updates) => {
    for (const { key, update } of updates) {
      if (key.id && key.fromMe && typeof update.status === "number") onStatusUpdate(key.id, update.status);
    }
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      setState({
        status: "qr",
        qrDataUrl: await QRCode.toDataURL(qr, { margin: 1, width: 300 }),
      });
    }

    if (connection === "open") {
      // Sécurité : seul le numéro autorisé peut se connecter. Un autre compte est déconnecté aussitôt.
      const connected = digits(sock.user?.id);
      const expected = readExpectedPhone();
      if (expected && connected && connected !== expected) {
        store.sock = null;
        await sock.logout().catch(() => sock.end(undefined));
        await clearSession();
        setState({
          status: "closed",
          qrDataUrl: null,
          pairingCode: null,
          me: null,
          lastError: `Le compte +${connected} n'est pas le numéro autorisé (+${expected}) : il a été déconnecté.`,
        });
        console.warn(`[whatsapp] compte non autorisé déconnecté (…${connected.slice(-4)})`);
        scheduleReconnect();
        return;
      }
      if (!expected && connected) writeExpectedPhone(connected); // première connexion : on mémorise le numéro
      console.log(`[whatsapp] connecté (numéro se terminant par ${connected.slice(-4)})`);
      // Tâches de fond (réponses en attente, relances) : chargées ici pour éviter une boucle d'imports.
      void import("./scheduler").then((m) => m.startScheduler());
      setState({
        pairingCode: null,
        status: "open",
        qrDataUrl: null,
        lastError: null,
        me: sock.user
          ? { id: sock.user.id, name: sock.user.name ?? sock.user.verifiedName }
          : null,
      });
    }

    if (connection === "close") {
      if (store.sock !== sock) return; // ancienne connexion, déjà remplacée
      store.sock = null;

      const code = (lastDisconnect?.error as { output?: { statusCode?: number } })
        ?.output?.statusCode;

      if (code === DisconnectReason.loggedOut) {
        // Déconnecté depuis le téléphone : on efface la session et on repart
        // sur un nouveau QR code.
        await clearSession();
        setState({ me: null, lastError: "Session déconnectée depuis le téléphone." });
        scheduleReconnect();
      } else if (code === DisconnectReason.connectionReplaced) {
        // Le compte a été ouvert ailleurs avec la même session : on n'insiste pas.
        setState({
          status: "closed",
          qrDataUrl: null,
          lastError: "Connexion ouverte ailleurs. Clique sur « Reconnecter ».",
        });
      } else {
        setState({ status: "connecting", lastError: lastDisconnect?.error?.message ?? null });
        scheduleReconnect();
      }
    }
  });
}

function scheduleReconnect() {
  if (store.reconnectTimer) return;
  store.reconnectTimer = setTimeout(() => {
    store.reconnectTimer = null;
    void ensureWhatsApp();
  }, RECONNECT_DELAY_MS);
}

/**
 * Prépare la connexion d'un numéro précis : il devient le seul autorisé.
 * method "code" : renvoie un code à saisir sur le téléphone (« Lier avec le numéro de téléphone »).
 */
export async function startPairing(phone: string, method: "qr" | "code"): Promise<{ code?: string }> {
  const number = digits(phone);
  if (number.length < 8 || number.length > 15) throw new Error("Numéro invalide : indique-le au format international, par exemple +33 6 12 34 56 78.");
  if (store.state.status === "open") {
    if (digits(store.state.me?.id) === number) return {};
    throw new Error("Un autre compte est déjà connecté : déconnecte-le d'abord.");
  }
  writeExpectedPhone(number);
  setState({ pairingCode: null, lastError: null });
  await ensureWhatsApp();
  if (method === "qr") return {};

  // Le code de connexion ne peut être demandé qu'une fois la connexion prête (QR disponible).
  for (let i = 0; i < 40 && store.state.status !== "qr"; i++) await new Promise((r) => setTimeout(r, 500));
  if (!store.sock || store.state.status !== "qr") throw new Error("WhatsApp n'est pas prêt, réessaie dans quelques secondes.");
  const raw = await store.sock.requestPairingCode(number);
  const code = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
  setState({ pairingCode: code });
  return { code };
}

/** Déconnecte le compte, supprime la session et affiche un nouveau QR code. */
export async function logoutWhatsApp() {
  const sock = store.sock;
  store.sock = null;
  if (store.reconnectTimer) {
    clearTimeout(store.reconnectTimer);
    store.reconnectTimer = null;
  }
  if (sock) {
    await sock.logout().catch(() => sock.end(undefined));
  }
  await clearSession();
  setState({ status: "idle", qrDataUrl: null, me: null, lastError: null });
  await ensureWhatsApp();
}
