import { connection, type NextRequest } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { updateProfile } from "@/lib/users";

// Mon compte : lecture et mise à jour (nom, alertes, mot de passe).
export async function GET() {
  await connection();
  try {
    return Response.json({ user: await requireUser() });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const me = await requireUser();
    const b = (await req.json().catch(() => ({}))) as Parameters<typeof updateProfile>[1];
    return Response.json({ user: await updateProfile(me.id, b) });
  } catch (err) {
    return authErrorResponse(err);
  }
}
