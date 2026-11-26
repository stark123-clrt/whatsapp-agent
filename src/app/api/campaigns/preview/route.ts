import type { NextRequest } from "next/server";
import { renderVisual } from "@/lib/campaign-visuals";

// Aperçu d'une carte aux couleurs de la marque (assistant de création), sans IA.
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { kind?: "post" | "story"; headline?: string; brandName?: string; color?: string; textColor?: string; badge?: string; footer?: string };
  const hex = (v?: string, d = "#111827") => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
  const png = await renderVisual({
    kind: b.kind === "story" ? "story" : "post",
    headline: (b.headline || "Votre message ici").slice(0, 110),
    brandName: (b.brandName || "Votre marque").slice(0, 40),
    color: hex(b.color),
    textColor: hex(b.textColor, "#ffffff"),
    badge: b.badge?.slice(0, 30) || null,
    footer: b.footer?.slice(0, 30) || null,
  });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
}
