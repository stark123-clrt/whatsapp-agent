import { connection, type NextRequest } from "next/server";
import { addManualFaq, listAllFaqs } from "@/lib/kb";

// Toutes les FAQ (onglet « Foire aux questions »).
export async function GET() {
  await connection();
  return Response.json({ faqs: listAllFaqs() });
}

// « Nouvelle FAQ » : ajout à la main.
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { question?: string; answer?: string; agentId?: number | null };
  if (!b.question?.trim() || !b.answer?.trim()) return Response.json({ error: "Question et réponse obligatoires." }, { status: 400 });
  addManualFaq(b.agentId ? Number(b.agentId) : null, b.question.slice(0, 300), b.answer.slice(0, 2000));
  return Response.json({ ok: true });
}
