import type { NextRequest } from "next/server";
import { createSession, safeEqual, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";

// Anti-force brute : 5 essais par minute et par adresse IP.
const g = globalThis as typeof globalThis & { __loginTries?: Map<string, number[]> };
const tries: Map<string, number[]> = (g.__loginTries ??= new Map<string, number[]>());

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (tries.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 5) {
    return Response.json({ error: "Trop d'essais. Réessaie dans une minute." }, { status: 429 });
  }

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected) {
    return Response.json(
      { error: "Aucun mot de passe administrateur configuré : ajoute ADMIN_PASSWORD dans les variables d'environnement." },
      { status: 503 },
    );
  }
  if (!expected || typeof password !== "string" || !safeEqual(password, expected)) {
    tries.set(ip, [...recent, now]);
    await new Promise((r) => setTimeout(r, 600)); // ralentit les essais en série
    return Response.json({ error: "Mot de passe incorrect." }, { status: 401 });
  }

  tries.delete(ip);
  const secure = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const cookie = [
    `${SESSION_COOKIE}=${await createSession()}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_DAYS * 86_400}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
