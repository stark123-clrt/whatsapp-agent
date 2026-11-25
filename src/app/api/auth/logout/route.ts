import { SESSION_COOKIE } from "@/lib/session";

// Déconnexion : le cookie de session est effacé.
export async function POST() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } });
}
