import type { NextRequest } from "next/server";
import { addManualFaq } from "@/lib/kb";

/** Découpe une ligne CSV (séparateur ; ou ,) en tenant compte des guillemets. */
function parseCsv(text: string): string[][] {
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) >= (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (cur || row.length) rows.push([...row, cur]);
  return rows.filter((r) => r.some((x) => x.trim()));
}

// « Importer » : fichier CSV (question;reponse) ou JSON ([{question, answer}]).
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Aucun fichier." }, { status: 400 });
  const text = (await file.text()).replace(/^\uFEFF/, "");
  let pairs: { question: string; answer: string }[] = [];
  if (file.name.toLowerCase().endsWith(".json")) {
    try {
      const data = JSON.parse(text);
      pairs = (Array.isArray(data) ? data : []).map((d) => ({ question: String(d.question ?? ""), answer: String(d.answer ?? d.reponse ?? "") }));
    } catch {
      return Response.json({ error: "Fichier JSON invalide." }, { status: 400 });
    }
  } else {
    const rows = parseCsv(text);
    const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
    const qi = header.findIndex((h) => h.startsWith("question"));
    const ai = header.findIndex((h) => h.startsWith("reponse") || h.startsWith("réponse") || h.startsWith("answer"));
    const body = qi >= 0 && ai >= 0 ? rows.slice(1) : rows;
    pairs = body.map((r) => ({ question: r[qi >= 0 ? qi : 0] ?? "", answer: r[ai >= 0 ? ai : 1] ?? "" }));
  }
  const valid = pairs.filter((p) => p.question.trim() && p.answer.trim()).slice(0, 2000);
  for (const p of valid) addManualFaq(null, p.question.slice(0, 300), p.answer.slice(0, 2000));
  return Response.json({ imported: valid.length });
}
