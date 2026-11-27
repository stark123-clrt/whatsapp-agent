import { connection, type NextRequest } from "next/server";
import { authErrorResponse, loginResponse } from "@/lib/auth";
import { googleEnabled } from "@/lib/google-auth";
import { acceptInvite, getInvite } from "@/lib/users";

// Invitation : ?token=… (infos) ; POST { token, name, password } pour créer son compte.
export async function GET(req: NextRequest) {
  await connection();
  const inv = getInvite(req.nextUrl.searchParams.get("token") ?? "");
  if (!inv) return Response.json({ error: "Invitation expirée ou déjà utilisée." }, { status: 404 });
  return Response.json({ email: inv.email, role: inv.role, google: googleEnabled() });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { token?: string; name?: string; password?: string };
  try {
    const user = await acceptInvite(b.token ?? "", { name: b.name ?? "", password: b.password ?? "" });
    return loginResponse(req, user);
  } catch (err) {
    return authErrorResponse(err);
  }
}
