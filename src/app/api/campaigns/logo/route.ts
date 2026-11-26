import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { MEDIA_DIR } from "@/lib/db";

// Logo de la marque pour les visuels des campagnes (PNG ou JPG, 2 Mo max).
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Aucun fichier." }, { status: 400 });
  if (!/^image\/(png|jpe?g)$/.test(file.type)) return Response.json({ error: "Logo en PNG (idéalement transparent) ou JPG." }, { status: 400 });
  if (file.size > 2 * 1024 * 1024) return Response.json({ error: "Logo trop lourd (2 Mo max)." }, { status: 413 });
  const name = `campaign-logo-${Date.now()}.${file.type === "image/png" ? "png" : "jpg"}`;
  await writeFile(path.join(MEDIA_DIR, name), Buffer.from(await file.arrayBuffer()));
  return Response.json({ file: name });
}
