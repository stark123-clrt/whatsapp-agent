import { connection, type NextRequest } from "next/server";
import { addManualProduct, catalogInfo, importJob, listProducts } from "@/lib/catalog";
import { getAgent } from "@/lib/kb";

// Catalogue produits d'un agent (campagnes de vente).
export async function GET(req: NextRequest) {
  await connection();
  const agentId = Number(req.nextUrl.searchParams.get("agentId"));
  if (!getAgent(agentId)) return Response.json({ products: [], info: null, job: null });
  return Response.json({ products: listProducts(agentId), info: catalogInfo(agentId), job: importJob(agentId) });
}

// Ajout d'un produit à la main.
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { agentId?: number; title?: string; price?: string; url?: string; imageUrl?: string };
  if (!b.agentId || !getAgent(b.agentId)) return Response.json({ error: "Agent introuvable" }, { status: 404 });
  if (!b.title?.trim()) return Response.json({ error: "Le nom du produit est obligatoire." }, { status: 400 });
  return Response.json({ product: await addManualProduct(b.agentId, { title: b.title, price: b.price, url: b.url, imageUrl: b.imageUrl }) });
}
