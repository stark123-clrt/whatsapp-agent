import { connection, type NextRequest } from "next/server";
import type { Channel } from "@/lib/db";
import { getAgent } from "@/lib/kb";
import { NOBODY, ROUTED_CHANNELS, channelAgent, getRouting, setChannelAgent } from "@/lib/routing";

// Agents IA → « Qui répond aux nouvelles conversations » : un agent par canal.
export async function GET() {
  await connection();
  const effective = Object.fromEntries(
    ROUTED_CHANNELS.map((c) => {
      const a = channelAgent(c);
      return [c, a ? { id: a.id, name: a.name, status: a.status } : null];
    }),
  );
  return Response.json({ routing: getRouting(), effective });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { channel?: Channel; agentId?: number | null };
  if (!body.channel || !ROUTED_CHANNELS.includes(body.channel)) return Response.json({ error: "Canal inconnu" }, { status: 400 });
  const id = body.agentId === null || body.agentId === undefined ? null : Number(body.agentId);
  if (id !== null && id !== NOBODY && !getAgent(id)) return Response.json({ error: "Agent introuvable" }, { status: 404 });
  setChannelAgent(body.channel, id);
  return Response.json({ ok: true });
}
