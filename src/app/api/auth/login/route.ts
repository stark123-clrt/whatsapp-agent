import type { NextRequest } from "next/server";
import { loginResponse } from "@/lib/auth";
import { loginWithPassword } from "@/lib/users";

// Anti-force brute : 5 essais par minute et par adresse IP.
const g = globalThis as typeof globalThis & { __loginTries?: Map<string, number[]> };
const tries: Map<string, number[]> = (g.__loginTries ??= new Map<string, number[]>());

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (tries.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 5) return Response.json({ error: "Trop d'essais. Réessaie dans une minute." }, { status: 429 });

  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const user = email && password ? await loginWithPassword(email, password) : null;
  if (!user) {
    tries.set(ip, [...recent, now]);
    await new Promise((r) => setTimeout(r, 600)); // ralentit les essais en série
    return Response.json({ error: "E-mail ou mot de passe incorrect." }, { status: 401 });
  }
  tries.delete(ip);
  return loginResponse(req, user);
}
