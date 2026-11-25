import { listAllFaqs } from "@/lib/kb";

const cell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// « Exporter » : toutes les FAQ en CSV (ouvrable dans Excel / Google Sheets).
export async function GET() {
  const rows = listAllFaqs().map((f) =>
    [f.question, f.answer, f.section, f.sourceUrl ?? "manuel", f.agentName ?? "tous", f.used].map(cell).join(";"),
  );
  const csv = "\uFEFF" + ["question;reponse;section;source;agent;utilise", ...rows].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="faq-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
