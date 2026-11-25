import { ensureWhatsApp, getWhatsAppState } from "@/lib/whatsapp";

// Relance la connexion (par exemple après « connexion ouverte ailleurs »).
export async function POST() {
  await ensureWhatsApp();
  return Response.json(getWhatsAppState());
}
