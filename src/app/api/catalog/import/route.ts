import type { NextRequest } from "next/server";
import { startImport } from "@/lib/catalog";
import { getAgent } from "@/lib/kb";

// « Importer les produits du site » : lancé en arrière-plan (suivi via GET /api/catalog).
export async function POST(req: NextRequest) {
  const { agentId, url } = (await req.json().catch(() => ({}))) as { agentId?: number; url?: string };
  if (!agentId || !getAgent(agentId)) return Response.json({ error: "Choisis d'abord l'agent de la campagne." }, { status: 400 });
  if (!url?.trim()) return Response.json({ error: "Indique l'adresse du site." }, { status: 400 });
  startImport(agentId, url.trim());
  return Response.json({ started: true });
}
