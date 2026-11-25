import { connection } from "next/server";
import { listAgents, listFaqs, listSources } from "@/lib/kb";

// Base de connaissances : sources, pages, FAQ ajoutées à la main.
export async function GET() {
  await connection();
  return Response.json({
    sources: listSources(),
    manualFaqs: listFaqs({ manual: true }),
    agents: listAgents().map((a) => ({ id: a.id, name: a.name })),
  });
}
