import { connection, type NextRequest } from "next/server";
import { appUrl, authErrorResponse, requireAdmin, requireUser } from "@/lib/auth";
import { emailEnabled, esc, sendEmail } from "@/lib/mailer";
import { createInvite, listUsers, pendingInvites, removeUser, revokeInvite, setRole, type Role } from "@/lib/users";

// Équipe : membres et invitations. Lecture pour tous, modifications réservées aux administrateurs.
export async function GET(req: NextRequest) {
  await connection();
  try {
    const me = await requireUser();
    return Response.json({ me, users: listUsers(), invites: me.role === "admin" ? pendingInvites() : [], emailEnabled: emailEnabled(), appUrl: appUrl(req) });
  } catch (err) {
    return authErrorResponse(err);
  }
}

// Inviter : { email, role } → lien d'invitation (et e-mail si un service d'envoi est configuré).
export async function POST(req: NextRequest) {
  try {
    const me = await requireAdmin();
    const b = (await req.json().catch(() => ({}))) as { email?: string; role?: Role };
    const inv = createInvite(b.email ?? "", b.role === "admin" ? "admin" : "member", me.id);
    const link = `${appUrl(req)}/invitation/${inv.token}`;
    let emailed = false;
    if (emailEnabled()) {
      emailed = await sendEmail({
        to: inv.email,
        subject: `${me.name} t'invite sur Stark Marketing`,
        html: `<p>Bonjour,</p><p><strong>${esc(me.name)}</strong> t'invite à rejoindre son espace Stark Marketing (rôle : ${inv.role === "admin" ? "administrateur" : "membre"}).</p><p><a href="${link}" style="display:inline-block;background:#2a6cdc;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Créer mon compte</a></p><p style="color:#71717a;font-size:13px">Le lien est valable 7 jours.</p>`,
      }).catch(() => false);
    }
    return Response.json({ invite: inv, link, emailed });
  } catch (err) {
    return authErrorResponse(err);
  }
}

// { userId, role } : changer le rôle.
export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();
    const b = (await req.json().catch(() => ({}))) as { userId?: number; role?: Role };
    setRole(Number(b.userId), b.role === "admin" ? "admin" : "member");
    return Response.json({ users: listUsers() });
  } catch (err) {
    return authErrorResponse(err);
  }
}

// ?user=ID (retirer quelqu'un) ou ?invite=TOKEN (annuler une invitation).
export async function DELETE(req: NextRequest) {
  try {
    const me = await requireAdmin();
    const user = Number(req.nextUrl.searchParams.get("user"));
    const invite = req.nextUrl.searchParams.get("invite");
    if (user) {
      if (user === me.id) throw new Error("Tu ne peux pas te retirer toi-même.");
      removeUser(user);
    }
    if (invite) revokeInvite(invite);
    return Response.json({ users: listUsers(), invites: pendingInvites() });
  } catch (err) {
    return authErrorResponse(err);
  }
}
