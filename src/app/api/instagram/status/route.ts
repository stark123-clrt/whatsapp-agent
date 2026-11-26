import { connection } from "next/server";
import { ensureInstagram, getInstagramState, instagramDisabled } from "@/lib/instagram";

// État de la connexion Instagram (carte « Instagram (personnel) » des Canaux).
export async function GET() {
  await connection();
  ensureInstagram();
  return Response.json({ ...getInstagramState(), disabled: instagramDisabled() });
}
