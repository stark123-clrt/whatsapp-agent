import { logoutInstagram } from "@/lib/instagram";

// Déconnexion : la session Instagram est effacée du serveur. Les discussions restent.
export async function POST() {
  try {
    await logoutInstagram();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Déconnexion impossible." }, { status: 502 });
  }
}
