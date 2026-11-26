import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { formatPrice, getProduct } from "@/lib/catalog";
import { renderProductVisual, renderVisual } from "@/lib/campaign-visuals";
import { MEDIA_DIR } from "@/lib/db";

type Body = {
  kind?: "post" | "story";
  headline?: string;
  brandName?: string;
  color?: string;
  textColor?: string;
  badge?: string;
  footer?: string;
  logo?: string | null; // nom du fichier du logo
  productId?: number; // aperçu « fiche produit »
};

const hex = (v?: string, d = "#111827") => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

async function dataUrl(file: string | null | undefined) {
  if (!file) return null;
  const data = await readFile(path.join(MEDIA_DIR, path.basename(file))).catch(() => null);
  if (!data) return null;
  const type = file.endsWith(".png") ? "image/png" : file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return `data:${type};base64,${data.toString("base64")}`;
}

// Aperçu d'un visuel (assistant de création) : carte de marque ou fiche produit, sans IA.
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Body;
  const kind = b.kind === "story" ? "story" : "post";
  const logo = await dataUrl(b.logo);
  const product = b.productId ? getProduct(Number(b.productId)) : null;
  const image = await dataUrl(product?.imageFile);
  const png =
    product && image
      ? await renderProductVisual({
          kind,
          hook: (b.headline || "Coup de cœur du moment").slice(0, 80),
          title: product.title,
          price: formatPrice(product.priceCents, product.currency),
          compareAt: product.compareCents && product.priceCents && product.compareCents > product.priceCents ? formatPrice(product.compareCents, product.currency) : null,
          discount: product.compareCents && product.priceCents && product.compareCents > product.priceCents ? `-${Math.round((1 - product.priceCents / product.compareCents) * 100)} %` : null,
          image,
          brandName: (b.brandName || "Votre marque").slice(0, 40),
          logo,
          color: hex(b.color),
          textColor: hex(b.textColor, "#ffffff"),
          footer: b.footer?.slice(0, 30) || null,
          badge: b.badge?.slice(0, 30) || null,
        })
      : await renderVisual({
          kind,
          headline: (b.headline || "Votre message ici").slice(0, 110),
          brandName: (b.brandName || "Votre marque").slice(0, 40),
          color: hex(b.color),
          textColor: hex(b.textColor, "#ffffff"),
          badge: b.badge?.slice(0, 30) || null,
          footer: b.footer?.slice(0, 30) || null,
          logo,
        });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
}
