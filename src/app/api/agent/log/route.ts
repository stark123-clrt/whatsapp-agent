import { connection } from "next/server";
import { getAgentLog, getAgentSettings } from "@/lib/agent";

// Dernières activités de l'agent (messages reçus, réponses, erreurs).
export async function GET() {
  await connection();
  return Response.json({
    settings: getAgentSettings(),
    aiConfigured: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
    log: getAgentLog(),
  });
}
