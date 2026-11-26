import { connection, type NextRequest } from "next/server";
import { allTags, getChat, listChats, updateChat, upsertChat } from "@/lib/db";
import { listContacts } from "@/lib/contacts";

// CRM → Contacts : tous les contacts, tous canaux confondus.
export async function GET() {
  await connection();
  return Response.json({ contacts: listContacts(), tags: allTags() });
}

type Body = { name?: string; phone?: string; email?: string; tags?: string[] };

// « Nouveau contact » : un numéro WhatsApp ajouté à la main (la discussion est prête dans Discussions).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const phone = (body.phone ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (phone.length < 8 || phone.length > 15) {
    return Response.json({ error: "Numéro invalide : indique-le avec l'indicatif du pays (ex. +33 6 12 34 56 78)." }, { status: 400 });
  }
  const email = body.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "E-mail invalide." }, { status: 400 });

  const jid = `${phone}@s.whatsapp.net`;
  // WhatsApp identifie parfois un contact par un code interne (…@lid) : on compare aussi les numéros.
  const existing = getChat(jid) ?? listChats().find((c) => c.phone === phone);
  if (existing) return Response.json({ error: "Ce numéro est déjà dans tes contacts.", jid: existing.jid }, { status: 409 });
  upsertChat({ jid, channel: "whatsapp", phone });
  const tags = (body.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 20);
  updateChat(jid, { customName: body.name?.trim().slice(0, 80) || null, email, tags });
  return Response.json({ ok: true, jid });
}
