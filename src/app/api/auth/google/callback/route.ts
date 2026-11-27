import type { NextRequest } from "next/server";
import { originOf, rememberOrigin } from "@/lib/auth";
import { googleProfile } from "@/lib/google-auth";
import { createSession, isSecure, sessionCookie } from "@/lib/session";
import { createFirstAdminGoogle, loginWithGoogle, sessionVersion, userCount } from "@/lib/users";

// Retour de Google : vérifie l'état anti-falsification, retrouve (ou crée sur invitation) le compte, ouvre la session.
export async function GET(req: NextRequest) {
  const origin = originOf(req);
  const fail = (msg: string) => Response.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
  const [state, next, setup] = (req.cookies.get("g_state")?.value ?? "").split("|");
  const code = req.nextUrl.searchParams.get("code");
  if (!code || !state || state !== req.nextUrl.searchParams.get("state")) return fail("La connexion Google a expiré, réessaie.");
  try {
    const profile = await googleProfile(code, `${origin}/api/auth/google/callback`);
    // Premier compte (code d'installation déjà vérifié) ou connexion d'un compte existant / invité.
    const user = setup === "1" && userCount() === 0 ? await createFirstAdminGoogle(profile) : await loginWithGoogle(profile);
    rememberOrigin(req); // adresse publique de l'appli, pour les liens des e-mails et alertes
    const value = await createSession(user.id, sessionVersion(user.id) ?? 1);
    const target = decodeURIComponent(next || "/");
    const headers = new Headers({ Location: `${origin}${target.startsWith("/") && !target.startsWith("//") ? target : "/"}` });
    headers.append("Set-Cookie", sessionCookie(value, isSecure(req)));
    headers.append("Set-Cookie", "g_state=; Path=/api/auth/google; Max-Age=0");
    return new Response(null, { status: 302, headers });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Connexion Google impossible.");
  }
}
