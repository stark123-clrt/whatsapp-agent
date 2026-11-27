import type { NextRequest } from "next/server";
import type { ListRule } from "@/lib/broadcast-types";
import { evaluateRules } from "@/lib/contact-lists";

// Liste intelligente : combien de contacts correspondent aux règles (avant de créer la liste).
export async function POST(req: NextRequest) {
  const { rules, match } = (await req.json().catch(() => ({}))) as { rules?: ListRule[]; match?: "all" | "any" };
  const found = evaluateRules(rules ?? [], match === "any" ? "any" : "all");
  const whatsapp = found.filter((c) => c.channel === "whatsapp" && c.phone);
  return Response.json({ count: found.length, whatsapp: whatsapp.length, sample: found.slice(0, 5).map((c) => c.name ?? (c.phone ? `+${c.phone}` : "Contact")) });
}
