import { connection } from "next/server";
import { ensureWhatsApp, getWhatsAppState } from "@/lib/whatsapp";

// Renvoie l'état de la connexion (et le QR code à scanner si besoin).
export async function GET() {
  await connection(); // toujours calculé à la demande, jamais mis en cache
  void ensureWhatsApp();
  return Response.json(getWhatsAppState());
}
