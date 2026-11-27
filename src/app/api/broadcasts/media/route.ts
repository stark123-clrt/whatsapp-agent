import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { getProduct } from "@/lib/catalog";
import { MEDIA_DIR } from "@/lib/db";

const MAX = 10 * 1024 * 1024;

// Pièce jointe d'une diffusion : photo ou vidéo envoyée (10 Mo max), ou photo d'un produit du catalogue (?product=ID).
export async function POST(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get("product");
  if (productId) {
    const p = getProduct(Number(productId));
    if (!p?.imageFile) return Response.json({ error: "Ce produit n'a pas de photo." }, { status: 400 });
    const file = path.basename(p.imageFile);
    return Response.json({ media: { file, mime: file.endsWith(".png") ? "image/png" : "image/jpeg", name: p.title } });
  }
  const form = await req.formData().catch(() => null);
  const f = form?.get("file");
  if (!(f instanceof File)) return Response.json({ error: "Aucun fichier." }, { status: 400 });
  if (!/^(image\/(jpeg|png|webp)|video\/mp4)$/.test(f.type)) return Response.json({ error: "Formats acceptés : JPG, PNG, WebP ou vidéo MP4." }, { status: 400 });
  if (f.size > MAX) return Response.json({ error: "Fichier trop lourd (10 Mo maximum)." }, { status: 400 });
  const ext = f.type === "video/mp4" ? "mp4" : f.type.split("/")[1].replace("jpeg", "jpg");
  const file = `bc_${randomBytes(8).toString("hex")}.${ext}`;
  await writeFile(path.join(MEDIA_DIR, file), Buffer.from(await f.arrayBuffer()));
  return Response.json({ media: { file, mime: f.type, name: f.name.slice(0, 80) } });
}

// Aperçu d'une pièce jointe : /api/broadcasts/media?file=…
export async function GET(req: NextRequest) {
  const file = path.basename(req.nextUrl.searchParams.get("file") ?? "");
  const data = file ? await readFile(path.join(MEDIA_DIR, file)).catch(() => null) : null;
  if (!data) return new Response("Introuvable", { status: 404 });
  const type = file.endsWith(".mp4") ? "video/mp4" : file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new Response(new Uint8Array(data), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" } });
}
