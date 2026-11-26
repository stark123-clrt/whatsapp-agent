import { connection, type NextRequest } from "next/server";
import { createCampaign, listCampaigns, postCounts, type CampaignInput } from "@/lib/campaigns";
import { getInstagramState } from "@/lib/instagram";
import { listAgents } from "@/lib/kb";

// Campagnes Instagram : liste et création.
export async function GET() {
  await connection();
  const ig = getInstagramState();
  return Response.json({
    campaigns: listCampaigns(),
    counts: postCounts(),
    agents: listAgents().map((a) => ({ id: a.id, name: a.name, status: a.status, website: a.website })),
    instagram: { connected: ig.status === "connected", username: ig.username },
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as CampaignInput;
  return Response.json({ campaign: createCampaign(body) });
}
