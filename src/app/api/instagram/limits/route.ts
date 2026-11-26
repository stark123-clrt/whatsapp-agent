import { connection, type NextRequest } from "next/server";
import { getLimits, setLimits, todayCounts, type PublishLimits } from "@/lib/publish-limits";

// Rythme de publication du compte Instagram (toutes campagnes) + ce qui a été publié aujourd'hui.
export async function GET() {
  await connection();
  return Response.json({ limits: getLimits(), today: todayCounts() });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<PublishLimits>;
  return Response.json({ limits: setLimits(body), today: todayCounts() });
}
