import { appUrl, authErrorResponse, requireUser } from "@/lib/auth";
import { emailEnabled, esc, sendEmail } from "@/lib/mailer";

// « M'envoyer un e-mail de test » (Profil) : vérifie que l'envoi d'e-mails fonctionne, vers sa propre adresse.
export async function POST() {
  try {
    const me = await requireUser();
    if (!emailEnabled()) return Response.json({ error: "L'envoi d'e-mails n'est pas configuré sur le serveur." }, { status: 400 });
    const ok = await sendEmail({
      to: me.email,
      subject: "Test d'envoi — Stark Marketing",
      html: `<p>Bonjour ${esc(me.name)},</p><p>Ceci est un e-mail de test : l'envoi depuis Stark Marketing fonctionne. Tes invitations et tes alertes « parler à un humain » partiront ainsi.</p><p><a href="${appUrl()}" style="display:inline-block;background:#2a6cdc;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Ouvrir Stark Marketing</a></p>`,
    });
    if (!ok) return Response.json({ error: "L'envoi a échoué : vérifie l'adresse Gmail et le mot de passe d'application dans Coolify." }, { status: 502 });
    return Response.json({ ok: true, to: me.email });
  } catch (err) {
    return authErrorResponse(err);
  }
}
