import { connection, type NextRequest } from "next/server";
import { listComments } from "@/lib/campaign-comments";

// Commentaires reçus sous les publications d'une campagne (et ce que l'IA propose d'y répondre).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/comments">) {
  await connection();
  return Response.json({ comments: listComments(Number((await ctx.params).id)) });
}
