import type { NextRequest } from "next/server";
import { instagramDisabled, loginInstagram } from "@/lib/instagram";

// Connexion : le mot de passe est transmis au service Instagram local, jamais enregistré.
export async function POST(req: NextRequest) {
  if (instagramDisabled()) return Response.json({ error: "Instagram est désactivé sur ce serveur." }, { status: 503 });
  const { username, password } = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  if (!username?.trim() || !password) return Response.json({ error: "Identifiant et mot de passe requis." }, { status: 400 });
  try {
    await loginInstagram(username.trim(), password);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Connexion impossible." }, { status: 502 });
  }
}
