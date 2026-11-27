import "server-only";

/**
 * Connexion avec Google (OAuth 2.0 / OpenID Connect).
 * Active seulement si GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET sont définis.
 * Adresse de retour à déclarer dans Google Cloud : {adresse de l'appli}/api/auth/google/callback
 */

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function googleAuthUrl(redirectUri: string, state: string) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

export type GoogleProfile = { sub: string; email: string; name: string; picture: string | null };

/** Échange le code contre l'identité Google (adresse vérifiée uniquement). */
export async function googleProfile(code: string, redirectUri: string): Promise<GoogleProfile> {
  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const t = (await tok.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!t.access_token) throw new Error(`Google a refusé la connexion${t.error_description ? ` : ${t.error_description}` : "."}`);
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(15_000) });
  const p = (await info.json().catch(() => ({}))) as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  if (!p.sub || !p.email || !p.email_verified) throw new Error("Adresse Google non vérifiée.");
  return { sub: p.sub, email: p.email, name: p.name ?? p.email.split("@")[0], picture: p.picture ?? null };
}
