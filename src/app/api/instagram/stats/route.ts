import { connection } from "next/server";
import { instagramStats } from "@/lib/ig-stats";

// Tableau de bord Instagram : 30 derniers jours.
export async function GET() {
  await connection();
  return Response.json(instagramStats(30));
}
