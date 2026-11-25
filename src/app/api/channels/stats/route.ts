import { connection } from "next/server";
import { sentPerDay } from "@/lib/db";

// Volume d'envoi des 30 derniers jours par canal (graphique de la page Canaux).
export async function GET() {
  await connection();
  return Response.json({ whatsapp: sentPerDay("whatsapp", 30) });
}
