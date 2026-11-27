import { connection, type NextRequest } from "next/server";
import { listRecipients } from "@/lib/broadcasts";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/broadcasts/[id]/recipients">) {
  await connection();
  return Response.json({ recipients: listRecipients(Number((await ctx.params).id)) });
}
