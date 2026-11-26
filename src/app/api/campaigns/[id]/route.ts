import { connection, type NextRequest } from "next/server";
import { autoPlan, deleteCampaign, getCampaign, listPosts, planCampaign, runCampaignTick, updateCampaign, type CampaignInput } from "@/lib/campaigns";
import { getInstagramState } from "@/lib/instagram";
import { listAgents } from "@/lib/kb";

type Ctx = RouteContext<"/api/campaigns/[id]">;

export async function GET(_req: NextRequest, ctx: Ctx) {
  await connection();
  const c = getCampaign(Number((await ctx.params).id));
  if (!c) return Response.json({ error: "Campagne introuvable" }, { status: 404 });
  const ig = getInstagramState();
  return Response.json({
    campaign: c,
    posts: listPosts(c.id),
    agents: listAgents().map((a) => ({ id: a.id, name: a.name, status: a.status, website: a.website })),
    instagram: { connected: ig.status === "connected", username: ig.username },
    // Rythme automatique : ce que l'agent prévoit aujourd'hui, et pourquoi.
    plan: c.settings.rhythm === "manual" ? null : autoPlan(c, new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(Date.now())),
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const body = (await req.json().catch(() => ({}))) as CampaignInput;
  if (body.status === "active") {
    const c = getCampaign(id);
    if (!c?.agentId && !body.agentId) return Response.json({ error: "Choisis l'agent de la campagne avant de l'activer." }, { status: 400 });
  }
  const c = updateCampaign(id, body);
  if (!c) return Response.json({ error: "Campagne introuvable" }, { status: 404 });
  // Activation : le calendrier se remplit tout de suite (la préparation suit en arrière-plan).
  if (c.status === "active") {
    planCampaign(c);
    void runCampaignTick();
  }
  return Response.json({ campaign: c });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  await deleteCampaign(Number((await ctx.params).id));
  return Response.json({ ok: true });
}
