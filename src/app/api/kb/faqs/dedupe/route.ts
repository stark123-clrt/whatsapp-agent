import { dedupeFaqs } from "@/lib/kb";

// « Dédupliquer » : supprime les questions en double.
export async function POST() {
  return Response.json({ removed: dedupeFaqs() });
}
