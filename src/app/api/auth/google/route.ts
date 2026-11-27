import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { originOf } from "@/lib/auth";
import { googleAuthUrl, googleEnabled } from "@/lib/google-auth";
import { isSecure } from "@/lib/session";
import { setupCodeOk, userCount } from "@/lib/users";

function start(req: NextRequest, next: string, setup: boolean) {
  const state = randomBytes(16).toString("base64url");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const redirectUri = `${originOf(req)}/api/auth/google/callback`;
  const cookie = [`g_state=${state}|${encodeURIComponent(safeNext)}|${setup ? 1 : 0}`, "Path=/api/auth/google", "HttpOnly", "SameSite=Lax", "Max-Age=600", isSecure(req) ? "Secure" : ""]
    .filter(Boolean)
    .join("; ");
  return { url: googleAuthUrl(redirectUri, state), cookie };
}

// Connexion avec Google (?next=/page pour revenir où on était).
export async function GET(req: NextRequest) {
  if (!googleEnabled()) return Response.redirect(new URL("/login?error=La%20connexion%20Google%20n'est%20pas%20encore%20activ%C3%A9e.", originOf(req)));
  const { url, cookie } = start(req, req.nextUrl.searchParams.get("next") ?? "/", false);
  return new Response(null, { status: 302, headers: { Location: url, "Set-Cookie": cookie } });
}

// Création du PREMIER compte avec Google : le code d'installation est vérifié ici, avant de partir chez Google.
export async function POST(req: NextRequest) {
  if (!googleEnabled()) return Response.json({ error: "La connexion Google n'est pas encore activée." }, { status: 400 });
  const { setupCode } = (await req.json().catch(() => ({}))) as { setupCode?: string };
  if (userCount() > 0) return Response.json({ error: "L'espace a déjà un administrateur : connecte-toi." }, { status: 409 });
  if (!setupCodeOk(setupCode ?? "")) {
    await new Promise((r) => setTimeout(r, 500));
    return Response.json({ error: "Code d'installation incorrect." }, { status: 401 });
  }
  const { url, cookie } = start(req, "/", true);
  return Response.json({ url }, { headers: { "Set-Cookie": cookie } });
}
