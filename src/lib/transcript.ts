import "server-only";

import { generateReply } from "./ai";
import { allTags, getChat, getMessages, type Chat, type Message } from "./db";

const WHO = { contact: "", ai: "IA", human: "Vous" } as const;

export const chatName = (c: Chat) => c.customName ?? c.name ?? (c.phone ? `+${c.phone}` : "Contact");

function line(chat: Chat, m: Message) {
  const when = new Date(m.ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  const who = m.sender === "contact" ? chatName(chat) : WHO[m.sender];
  const body =
    m.type === "image"
      ? `[Photo]${m.text ? ` ${m.text}` : ""}`
      : m.type === "audio"
        ? `[Vocal]${m.text ? ` ${m.text}` : ""}`
        : m.type === "video"
          ? `[Vidéo]${m.text ? ` ${m.text}` : ""}`
          : m.type === "document"
            ? `[Document] ${m.text ?? ""}`
            : (m.text ?? "");
  return `[${when}] ${who} : ${body}`;
}

/** Transcription texte d'une discussion (export, e-mail, étiquetage IA). */
export function transcript(jid: string, limit = 2000): string | null {
  const chat = getChat(jid);
  if (!chat) return null;
  const header = `Discussion avec ${chatName(chat)}${chat.phone ? ` (+${chat.phone})` : ""}\n\n`;
  return header + getMessages(jid, limit).map((m) => line(chat, m)).join("\n");
}

/** Demande à l'IA un résumé court de la discussion. */
export async function summarize(jid: string): Promise<string | null> {
  const text = transcript(jid, 120);
  if (!text || text.split("\n").length < 3) return null;
  const reply = await generateReply([
    {
      role: "system",
      content: `Tu résumes des conversations clients pour l'équipe commerciale. En français, 2 à 4 phrases \
courtes : qui est le contact, ce qu'il veut, où en est la discussion et la prochaine action à faire. \
Pas de titre, pas de liste, pas de mise en forme.`,
    },
    { role: "user", content: text },
  ]);
  return reply.trim() || null;
}

/** Demande à l'IA de proposer des étiquettes pour la discussion. */
export async function suggestTags(jid: string): Promise<string[]> {
  const text = transcript(jid, 60);
  if (!text) return [];
  const existing = allTags();
  const reply = await generateReply([
    {
      role: "system",
      content: `Tu classes des conversations clients. Propose de 1 à 4 étiquettes courtes (1 à 3 mots, \
en français, sans emoji) qui décrivent le contact ou sa demande (ex : « prospect », « demande de prix », \
« rendez-vous », « réclamation »). Réutilise si possible ces étiquettes existantes : ${existing.join(", ") || "aucune"}.
Réponds UNIQUEMENT avec un tableau JSON de chaînes, par exemple ["prospect","demande de prix"].`,
    },
    { role: "user", content: text },
  ]);
  const json = reply.match(/\[[\s\S]*\]/)?.[0];
  try {
    const tags = JSON.parse(json ?? "[]");
    return Array.isArray(tags)
      ? tags.filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 4)
      : [];
  } catch {
    return [];
  }
}
