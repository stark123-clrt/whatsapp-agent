import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { PostKind } from "./campaign-types";

/**
 * Visuels des campagnes Instagram (PNG) : carte aux couleurs de la marque, ou photo
 * (médiathèque, image IA) avec le titre par-dessus. Publication 1080×1350, story 1080×1920.
 */

type Visual = {
  kind: PostKind;
  headline: string;
  brandName: string;
  color: string; // couleur principale
  textColor: string;
  background?: string | null; // image (data URL) en fond
  badge?: string | null; // ex. code promo
  footer?: string | null; // ex. « Lien en bio »
};

// Police Inter (normale + grasse), chargée une seule fois.
type Font = { name: string; data: ArrayBuffer; weight: 400 | 800; style: "normal" };
let fonts: Promise<Font[]> | null = null;
function loadFonts() {
  const dir = path.join(process.cwd(), "node_modules", "@fontsource", "inter", "files");
  const load = async (file: string, weight: 400 | 800): Promise<Font> => {
    const b = await readFile(path.join(dir, file));
    return { name: "Inter", data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, weight, style: "normal" };
  };
  fonts ??= Promise.all([load("inter-latin-400-normal.woff", 400), load("inter-latin-800-normal.woff", 800)]);
  return fonts;
}

/** Les émojis ne s'affichent pas bien sur l'image : ils restent dans la légende. */
const noEmoji = (t: string) =>
  t
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();

/** Assombrit une couleur #rrggbb (pour le dégradé). */
function shade(hex: string, amount: number) {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  if (Number.isNaN(n)) return hex;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

export async function renderVisual(v: Visual): Promise<Buffer> {
  const width = 1080;
  const height = v.kind === "story" ? 1920 : 1350;
  const photo = Boolean(v.background);
  const headline = noEmoji(v.headline);
  const size = headline.length > 70 ? 68 : headline.length > 40 ? 82 : 96;
  const ink = photo ? "#ffffff" : v.textColor;

  const element = (
    <div
      style={{
        width,
        height,
        display: "flex",
        position: "relative",
        background: photo ? "#000" : `linear-gradient(150deg, ${v.color} 0%, ${shade(v.color, 0.45)} 100%)`,
        color: ink,
        fontFamily: "Inter",
      }}
    >
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- rendu d'image côté serveur (Satori)
        <img src={v.background!} width={width} height={height} style={{ position: "absolute", inset: 0, width, height, objectFit: "cover" }} alt="" />
      )}
      {photo && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.86) 100%)",
          }}
        />
      )}
      {!photo && (
        // Motif discret : deux grands cercles en transparence.
        <div style={{ position: "absolute", inset: 0, display: "flex" }}>
          <div style={{ position: "absolute", top: -260, right: -200, width: 720, height: 720, borderRadius: 999, background: "rgba(255,255,255,0.07)", display: "flex" }} />
          <div style={{ position: "absolute", bottom: -320, left: -240, width: 820, height: 820, borderRadius: 999, background: "rgba(255,255,255,0.05)", display: "flex" }} />
        </div>
      )}

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: photo ? "flex-end" : "center",
          width: "100%",
          height: "100%",
          padding: v.kind === "story" ? "220px 90px 360px" : "96px 90px",
        }}
      >
        <div style={{ position: "absolute", top: v.kind === "story" ? 150 : 80, left: 90, display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 16, height: 16, borderRadius: 999, background: ink, opacity: 0.85, display: "flex" }} />
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase", opacity: 0.9, display: "flex" }}>{noEmoji(v.brandName)}</div>
        </div>

        <div style={{ fontSize: size, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1, display: "flex", maxWidth: 900 }}>{headline}</div>

        {(v.badge || v.footer) && (
          <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 56 }}>
            {v.badge && (
              <div
                style={{
                  display: "flex",
                  fontSize: 36,
                  fontWeight: 800,
                  padding: "18px 34px",
                  borderRadius: 999,
                  background: photo ? "#ffffff" : ink,
                  color: photo ? "#111111" : v.color,
                }}
              >
                {v.badge}
              </div>
            )}
            {v.footer && <div style={{ display: "flex", fontSize: 34, opacity: 0.85 }}>{v.footer}</div>}
          </div>
        )}
      </div>
    </div>
  );

  const res = new ImageResponse(element, { width, height, fonts: await loadFonts() });
  return Buffer.from(await res.arrayBuffer());
}
