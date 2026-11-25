import { getWhatsAppState, logoutWhatsApp } from "@/lib/whatsapp";

// Déconnecte le compte WhatsApp et supprime la session enregistrée.
export async function POST() {
  await logoutWhatsApp();
  return Response.json(getWhatsAppState());
}
