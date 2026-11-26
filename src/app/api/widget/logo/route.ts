import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { MEDIA_DIR } from "@/lib/db";

// Import du logo du widget (image, 2 Mo max). Renvoie le nom du fichier à mettre dans les réglages.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Aucun fichier." }, { status: 400 });
  if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) {
    return Response.json({ error: "Image PNG, JPG, WebP ou SVG uniquement." }, { status: 400 });
  }
  if (file.size > 2 * 1024 * 1024) return Response.json({ error: "Image trop lourde (2 Mo max)." }, { status: 413 });
  const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1].replace("jpeg", "jpg");
  const name = `widget-logo-${Date.now()}.${ext}`;
  await writeFile(path.join(MEDIA_DIR, name), Buffer.from(await file.arrayBuffer()));
  return Response.json({ file: name });
}
