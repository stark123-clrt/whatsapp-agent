import { connection } from "next/server";
import { isAiTyping, whyAiInactive } from "@/lib/agent";
import { listChats } from "@/lib/db";
import { ensureWhatsApp, getWhatsAppState } from "@/lib/whatsapp";

// Liste des discussions, la plus récente en premier.
export async function GET() {
  await connection();
  void ensureWhatsApp();
  const chats = listChats().map((c) => ({
    ...c,
    aiInactive: whyAiInactive(c.jid, c.phone),
    aiTyping: isAiTyping(c.jid),
  }));
  return Response.json({ chats, whatsapp: getWhatsAppState().status });
}
