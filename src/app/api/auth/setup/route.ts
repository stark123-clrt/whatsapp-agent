import type { NextRequest } from "next/server";
import { authErrorResponse, loginResponse } from "@/lib/auth";
import { createFirstAdmin } from "@/lib/users";

// Création du premier compte (administrateur), protégée par le code d'installation (ADMIN_PASSWORD).
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; name?: string; password?: string; setupCode?: string };
  try {
    const user = await createFirstAdmin({ email: b.email ?? "", name: b.name ?? "", password: b.password ?? "", setupCode: b.setupCode ?? "" });
    return loginResponse(req, user);
  } catch (err) {
    await new Promise((r) => setTimeout(r, 400));
    return authErrorResponse(err);
  }
}
