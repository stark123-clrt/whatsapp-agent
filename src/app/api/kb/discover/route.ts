import type { NextRequest } from "next/server";
import { discoverPages } from "@/lib/scraper";

// « Trouver des pages » : liste les pages d'un site.
export async function POST(req: NextRequest) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url?.trim()) return Response.json({ error: "Indique l'adresse du site." }, { status: 400 });
  try {
    return Response.json(await discoverPages(url));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Site inaccessible" }, { status: 400 });
  }
}
