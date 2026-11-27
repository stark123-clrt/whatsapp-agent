import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { originOf } from "@/lib/auth";
import { googleAuthUrl, googleEnabled } from "@/lib/google-auth";
import { isSecure } from "@/lib/session";

// Démarre la connexion Google (?next=/page pour revenir où on était).
export async function GET(req: NextRequest) {
  if (!googleEnabled()) return Response.redirect(new URL("/login?error=google", originOf(req)));
  const state = randomBytes(16).toString("base64url");
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const redirectUri = `${originOf(req)}/api/auth/google/callback`;
  const cookie = [`g_state=${state}|${encodeURIComponent(safeNext)}`, "Path=/api/auth/google", "HttpOnly", "SameSite=Lax", "Max-Age=600", isSecure(req) ? "Secure" : ""].filter(Boolean).join("; ");
  return new Response(null, { status: 302, headers: { Location: googleAuthUrl(redirectUri, state), "Set-Cookie": cookie } });
}
