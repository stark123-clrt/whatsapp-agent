import { connection, type NextRequest } from "next/server";
import { growthOverview, resumeGrowth, setGrowth, type GrowthSettings } from "@/lib/followers";

// Croissance Instagram : réglages (suivi en retour, bienvenue, plafonds) + ce que l'agent prépare.
export async function GET() {
  await connection();
  return Response.json(growthOverview());
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<GrowthSettings> & { resume?: boolean };
  if (body.resume) resumeGrowth();
  setGrowth(body);
  return Response.json(growthOverview());
}
