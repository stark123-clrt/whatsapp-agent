import type { NextRequest } from "next/server";
import { submitInstagramCode } from "@/lib/instagram";

// Code de double authentification ou de vérification envoyé par Instagram.
export async function POST(req: NextRequest) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!code?.trim()) return Response.json({ error: "Code requis." }, { status: 400 });
  try {
    await submitInstagramCode(code.trim());
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Code refusé." }, { status: 400 });
  }
}
