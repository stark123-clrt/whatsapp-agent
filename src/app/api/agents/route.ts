import { connection, type NextRequest } from "next/server";
import { addPage, createAgent, createSource, getAgent, listAgents, type AgentRole } from "@/lib/kb";
import { prepareAgent } from "@/lib/knowledge";
import { normalizeSite } from "@/lib/scraper";

// Liste des agents avec leurs statistiques.
export async function GET() {
  await connection();
  return Response.json({ agents: listAgents() });
}

type Body = {
  role?: AgentRole;
  mode?: "site" | "scratch";
  name?: string;
  language?: string;
  website?: string;
  pages?: string[];
  documents?: { name: string; text: string }[];
  instructions?: string;
};

// Crée un agent. Avec un site : les pages sont lues et les FAQ générées en arrière-plan.
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Body;
  const name = b.name?.trim();
  if (!name) return Response.json({ error: "Donne un nom à l'agent." }, { status: 400 });
  const role: AgentRole = b.role === "support" ? "support" : "sales";
  const pages = (b.pages ?? []).filter((p) => typeof p === "string").slice(0, 25);
  const documents = (b.documents ?? []).filter((d) => d?.text?.trim()).slice(0, 10);

  let website: string | null = null;
  if (b.mode === "site") {
    try {
      website = normalizeSite(b.website ?? "").hostname.replace(/^www\./, "");
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Adresse invalide" }, { status: 400 });
    }
    if (pages.length === 0) return Response.json({ error: "Clique sur « Trouver des pages » et choisis au moins une page." }, { status: 400 });
  }

  const id = createAgent({ name, role, language: b.language || "fr", instructions: b.instructions?.trim() ?? "", website });
  const pageIds: number[] = [];
  if (website) {
    const source = createSource(id, "site", website);
    for (const url of pages) {
      try {
        normalizeSite(url);
        pageIds.push(addPage(source, url, null));
      } catch {
        // adresse refusée : ignorée
      }
    }
  }
  if (documents.length) {
    const source = createSource(id, "document", "Documents");
    for (const d of documents) pageIds.push(addPage(source, d.name.slice(0, 120), d.name.slice(0, 120), d.text.slice(0, 40_000)));
  }
  // Les instructions sont rédigées par l'IA si on part d'un site (et qu'aucune n'a été écrite).
  if (pageIds.length) prepareAgent(id, pageIds, !b.instructions?.trim());
  return Response.json({ agent: getAgent(id) });
}
