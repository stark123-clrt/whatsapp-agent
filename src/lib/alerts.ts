import "server-only";

import { appUrl } from "./auth";
import { getChat, getMessages } from "./db";
import { emailEnabled, esc, sendEmail } from "./mailer";
import { alertRecipients } from "./users";
import { getSocket, getWhatsAppState } from "./whatsapp";

/**
 * Alerte « un client veut parler à un humain » : envoyée à chaque membre de l'équipe qui l'a activée
 * (Paramètres → Profil), par WhatsApp sur son numéro et/ou par e-mail, avec le lien direct vers la discussion.
 */

const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", web: "le site web" };

export async function notifyHandoff(jid: string, reason: string) {
  const chat = getChat(jid);
  if (!chat) return;
  const who = chat.customName ?? chat.name ?? (chat.phone ? `+${chat.phone}` : "Un visiteur");
  const last = getMessages(jid, 6)
    .filter((m) => m.sender === "contact" && m.text)
    .at(-1)?.text;
  const link = `${appUrl()}/?c=${encodeURIComponent(jid)}`;
  const recipients = alertRecipients();
  if (!recipients.length) return;

  const wa = getWhatsAppState().status === "open" ? getSocket() : null;
  const own = (wa?.user?.id ?? "").split(/[:@]/)[0];
  for (const u of recipients) {
    // WhatsApp : depuis le numéro connecté vers le numéro du membre (jamais vers lui-même).
    if (wa && u.alertPhone && u.alertPhone !== own) {
      const text = [`*${who}* veut parler à un humain (${CHANNEL[chat.channel] ?? chat.channel}).`, reason && `Motif : ${reason}`, last && `Dernier message : « ${last.slice(0, 300)} »`, `Répondre : ${link}`]
        .filter(Boolean)
        .join("\n");
      await wa.sendMessage(`${u.alertPhone}@s.whatsapp.net`, { text }).catch((e) => console.error(`[alertes] WhatsApp : ${e instanceof Error ? e.message : e}`));
    }
    if (u.alertEmail && emailEnabled()) {
      await sendEmail({
        to: u.email,
        subject: `${who} veut parler à un humain`,
        html: `<p><strong>${esc(who)}</strong> veut parler à un humain (${CHANNEL[chat.channel] ?? esc(chat.channel)}).</p>${reason ? `<p>Motif : ${esc(reason)}</p>` : ""}${last ? `<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #2a6cdc;color:#3f3f46">${esc(last.slice(0, 500))}</blockquote>` : ""}<p><a href="${link}" style="display:inline-block;background:#2a6cdc;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Ouvrir la discussion</a></p><p style="color:#71717a;font-size:13px">L'IA est en pause dans cette discussion : c'est à toi de répondre.</p>`,
      }).catch(() => false);
    }
  }
}
