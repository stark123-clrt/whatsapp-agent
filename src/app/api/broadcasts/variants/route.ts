import type { NextRequest } from "next/server";
import { addVariants } from "@/lib/broadcasts";

// « Ajouter des variantes avec l'IA » (spintax).
export async function POST(req: NextRequest) {
  const { message } = (await req.json().catch(() => ({}))) as { message?: string };
  try {
    return Response.json({ message: await addVariants(message ?? "") });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Échec" }, { status: 400 });
  }
}
