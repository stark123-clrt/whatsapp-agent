import type { NextRequest } from "next/server";
import { getWhatsAppState, startPairing } from "@/lib/whatsapp";

// Connexion d'un numéro précis : par QR code ou par code de connexion (8 caractères).
export async function POST(req: NextRequest) {
  const { phone, method } = (await req.json().catch(() => ({}))) as { phone?: string; method?: string };
  try {
    const result = await startPairing(phone ?? "", method === "code" ? "code" : "qr");
    return Response.json({ ...result, state: getWhatsAppState() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 400 });
  }
}
