import { connection, type NextRequest } from "next/server";
import { createBroadcast, listBroadcasts, quota } from "@/lib/broadcasts";
import { getWhatsAppState } from "@/lib/whatsapp";

export async function GET() {
  await connection();
  return Response.json({ broadcasts: listBroadcasts(), quota: quota(), whatsapp: { connected: getWhatsAppState().status === "open" } });
}

// Nouvelle diffusion (brouillon).
export async function POST(req: NextRequest) {
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  return Response.json({ broadcast: createBroadcast(name) });
}
