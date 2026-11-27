import "server-only";

/**
 * Envoi d'e-mails (invitations, alertes « parler à un humain ») via Resend.
 * Inactif tant que RESEND_API_KEY et EMAIL_FROM ne sont pas définis : l'appli fonctionne sans
 * (lien d'invitation à copier, alertes par WhatsApp).
 */

export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

/** Échappe un texte inséré dans un e-mail HTML. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendEmail(m: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!emailEnabled()) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [m.to], subject: m.subject, html: m.html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) console.error(`[e-mail] envoi refusé (${res.status})`);
  return res.ok;
}
