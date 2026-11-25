import "server-only";

import { mkdirSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "./db";
import { getSocket } from "./whatsapp";

/**
 * Photos de profil WhatsApp. Les liens donnés par WhatsApp expirent vite :
 * on télécharge la photo et on la garde 24 h sur le disque (data/media/avatars).
 */

const DIR = path.join(MEDIA_DIR, "avatars");
const TTL_MS = 24 * 3600 * 1000;
const NO_PHOTO_TTL_MS = 6 * 3600 * 1000; // on réessaie plus tôt pour les comptes sans photo

const g = globalThis as typeof globalThis & { __avatarPending?: Map<string, Promise<Buffer | null>> };
const pending = (g.__avatarPending ??= new Map());

const fileFor = (jid: string) => path.join(DIR, `${jid.replace(/[^\w-]/g, "_")}.jpg`);
const age = async (file: string) => Date.now() - (await stat(file)).mtimeMs;

/** Renvoie la photo de profil (ou null si le contact n'en a pas / n'est pas visible). */
export async function getAvatar(jid: string): Promise<Buffer | null> {
  mkdirSync(DIR, { recursive: true });
  const file = fileFor(jid);
  const none = `${file}.none`;

  const cached = await age(file).catch(() => Infinity);
  if (cached < TTL_MS) return readFile(file);
  if ((await age(none).catch(() => Infinity)) < NO_PHOTO_TTL_MS) return null;

  // Une seule requête à WhatsApp à la fois par contact.
  if (!pending.has(jid)) {
    pending.set(
      jid,
      download(jid, file, none).finally(() => pending.delete(jid)),
    );
  }
  const fresh = await pending.get(jid)!;
  // WhatsApp indisponible : on sert l'ancienne photo si on en a une.
  return fresh ?? (cached < Infinity ? readFile(file) : null);
}

async function download(jid: string, file: string, none: string): Promise<Buffer | null> {
  const sock = getSocket();
  if (!sock) return null;
  const url = await sock.profilePictureUrl(jid, "image", 8000).catch(() => undefined);
  if (!url) {
    await writeFile(none, "");
    return null;
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) return null;
  const data = Buffer.from(await res.arrayBuffer());
  await writeFile(file, data);
  return data;
}
