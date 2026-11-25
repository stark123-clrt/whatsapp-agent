import type { NextRequest } from "next/server";
import { deleteFaqs } from "@/lib/kb";

// Supprime plusieurs FAQ sélectionnées.
export async function POST(req: NextRequest) {
  const { ids } = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const list = Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger) : [];
  if (!list.length) return Response.json({ error: "Aucune FAQ sélectionnée." }, { status: 400 });
  deleteFaqs(list.slice(0, 1000));
  return Response.json({ deleted: list.length });
}
