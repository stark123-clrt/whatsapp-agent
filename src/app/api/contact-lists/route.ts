import { connection, type NextRequest } from "next/server";
import { createList, getLists } from "@/lib/contact-lists";
import { listContacts } from "@/lib/contacts";
import { allTags } from "@/lib/db";

// Listes de contacts (diffusions) + contacts et tags disponibles pour en créer.
export async function GET() {
  await connection();
  const contacts = listContacts()
    .filter((c) => c.channel === "whatsapp" && c.phone)
    .map((c) => ({ jid: c.jid, name: c.name, phone: c.phone, tags: c.tags }));
  return Response.json({ lists: getLists(), contacts, tags: allTags() });
}

export async function POST(req: NextRequest) {
  try {
    return Response.json({ list: createList(await req.json()) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 400 });
  }
}
