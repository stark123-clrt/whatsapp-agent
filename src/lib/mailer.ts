import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

/**
 * Envoi d'e-mails (invitations, alertes « parler à un humain »).
 * - Gmail (prioritaire) : SMTP_USER (ton adresse Gmail) + SMTP_PASS (mot de passe d'application Google, 16 lettres).
 *   Facultatif : SMTP_HOST / SMTP_PORT pour un autre serveur que Gmail, EMAIL_FROM_NAME pour le nom affiché.
 * - Sinon Resend : RESEND_API_KEY + EMAIL_FROM (nécessite un nom de domaine vérifié).
 * Sans configuration, l'appli fonctionne quand même (lien d'invitation à copier, alertes par WhatsApp).
 */

const smtpEnabled = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
const resendEnabled = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
export const emailEnabled = () => smtpEnabled() || resendEnabled();

/** Échappe un texte inséré dans un e-mail HTML. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const g = globalThis as typeof globalThis & { __smtp?: Transporter };
function transport() {
  if (!g.__smtp) {
    const port = Number(process.env.SMTP_PORT) || 465;
    g.__smtp = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      // Le mot de passe d'application Google s'affiche avec des espaces : on les retire.
      auth: { user: process.env.SMTP_USER!.trim(), pass: process.env.SMTP_PASS!.replace(/\s+/g, "") },
      connectionTimeout: 15_000,
    });
  }
  return g.__smtp;
}

export async function sendEmail(m: { to: string; subject: string; html: string }): Promise<boolean> {
  try {
    if (smtpEnabled()) {
      const name = (process.env.EMAIL_FROM_NAME || "Stark Marketing").replace(/["\r\n]/g, "");
      await transport().sendMail({ from: `"${name}" <${process.env.SMTP_USER!.trim()}>`, to: m.to, subject: m.subject, html: m.html });
      return true;
    }
    if (resendEnabled()) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [m.to], subject: m.subject, html: m.html }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) console.error(`[e-mail] envoi refusé (${res.status})`);
      return res.ok;
    }
    return false;
  } catch (err) {
    console.error(`[e-mail] ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
