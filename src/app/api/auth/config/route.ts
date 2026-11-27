import { connection } from "next/server";
import { googleEnabled } from "@/lib/google-auth";
import { userCount } from "@/lib/users";

// Page de connexion : faut-il créer le premier compte ? La connexion Google est-elle disponible ?
export async function GET() {
  await connection();
  return Response.json({ needsSetup: userCount() === 0, setupCodeRequired: Boolean(process.env.ADMIN_PASSWORD), google: googleEnabled() });
}
