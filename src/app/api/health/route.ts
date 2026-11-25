import { connection } from "next/server";

// Test de santé (utilisé par Coolify / Docker) : public, ne révèle rien.
export async function GET() {
  await connection();
  return new Response("ok");
}
