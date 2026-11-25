import type { NextRequest } from "next/server";
import { addPage, createSource, getAgent } from "@/lib/kb";
import { prepareAgent } from "@/lib/knowledge";
import { normalizeSite } from "@/lib/scraper";

// « Ajouter une source » : importe des pages d'un site pour un agent existant.
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { agentId?: number; website?: string; pages?: string[] };
  const agentId = Number(b.agentId);
  if (!getAgent(agentId)) return Response.json({ error: "Choisis un agent." }, { status: 400 });
  let site: string;
  try {
    site = normalizeSite(b.website ?? "").hostname.replace(/^www\./, "");
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Adresse invalide" }, { status: 400 });
  }
  const pages = (b.pages ?? []).slice(0, 25);
  if (!pages.length) return Response.json({ error: "Choisis au moins une page." }, { status: 400 });
  const source = createSource(agentId, "site", site);
  const ids = pages.map((url) => addPage(source, url, null));
  prepareAgent(agentId, ids, false);
  return Response.json({ ok: true });
}
