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
  logo?: string | null; // logo de la marque (data URL)
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
          {v.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- rendu d'image côté serveur (Satori)
            <img src={v.logo} height={64} style={{ height: 64, maxWidth: 260, objectFit: "contain" }} alt="" />
          ) : (
            <div style={{ width: 16, height: 16, borderRadius: 999, background: ink, opacity: 0.85, display: "flex" }} />
          )}
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

type ProductVisual = {
  kind: PostKind;
  hook: string; // petite phrase d'accroche (écrite par l'IA)
  title: string; // nom du produit
  price: string; // « 24,90 € »
  compareAt?: string | null; // ancien prix barré
  discount?: string | null; // « -20 % »
  image: string; // photo du produit (data URL)
  brandName: string;
  logo?: string | null;
  color: string;
  textColor: string;
  footer?: string | null;
  badge?: string | null; // code promo
};

/** Visuel « fiche produit » : la photo entière (jamais coupée), le nom et le prix, aux couleurs de la marque. */
export async function renderProductVisual(v: ProductVisual): Promise<Buffer> {
  const width = 1080;
  const story = v.kind === "story";
  const height = story ? 1920 : 1350;
  const ink = v.textColor;
  const title = noEmoji(v.title);
  const photo = story ? 1040 : 800;

  const element = (
    <div style={{ width, height, display: "flex", flexDirection: "column", position: "relative", fontFamily: "Inter", color: ink, background: `linear-gradient(160deg, ${v.color} 0%, ${shade(v.color, 0.4)} 100%)`, padding: story ? "150px 70px 320px" : "64px 70px" }}>
      <div style={{ position: "absolute", top: -240, right: -220, width: 700, height: 700, borderRadius: 999, background: "rgba(255,255,255,0.07)", display: "flex" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 16, height: 64 }}>
        {v.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendu d'image côté serveur (Satori)
          <img src={v.logo} height={60} style={{ height: 60, maxWidth: 280, objectFit: "contain" }} alt="" />
        ) : (
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase", opacity: 0.92 }}>{noEmoji(v.brandName)}</div>
        )}
      </div>

      <div style={{ display: "flex", marginTop: 34, height: photo, borderRadius: 36, background: "#f4f1ec", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
        {/* Fond : la même photo, agrandie et floutée (pas de bandes blanches quand le format diffère). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- rendu d'image côté serveur (Satori) */}
        <img src={v.image} width={940} height={photo} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(28px)", transform: "scale(1.15)", opacity: 0.9 }} alt="" />
        <div style={{ position: "absolute", inset: 0, display: "flex", background: "rgba(0,0,0,0.12)" }} />
        {/* eslint-disable-next-line @next/next/no-img-element -- rendu d'image côté serveur (Satori) */}
        <img src={v.image} width={940} height={photo} style={{ position: "relative", width: "100%", height: "100%", objectFit: "contain" }} alt="" />
        {v.discount && (
          <div style={{ position: "absolute", top: 28, left: 28, display: "flex", fontSize: 40, fontWeight: 800, padding: "12px 26px", borderRadius: 999, background: "#e11d48", color: "#fff" }}>{v.discount}</div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
        <div style={{ display: "flex", fontSize: 32, opacity: 0.85 }}>{noEmoji(v.hook)}</div>
        <div style={{ display: "flex", fontSize: title.length > 34 ? 50 : 58, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1, marginTop: 10, maxWidth: 940 }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 22 }}>
          <div style={{ display: "flex", fontSize: 70, fontWeight: 800 }}>{v.price}</div>
          {v.compareAt && <div style={{ display: "flex", fontSize: 42, opacity: 0.6, textDecoration: "line-through" }}>{v.compareAt}</div>}
          {v.badge && <div style={{ display: "flex", fontSize: 30, fontWeight: 800, padding: "12px 24px", borderRadius: 999, background: ink, color: v.color }}>{v.badge}</div>}
          {v.footer && <div style={{ display: "flex", fontSize: 32, opacity: 0.85, marginLeft: "auto" }}>{v.footer}</div>}
        </div>
      </div>
    </div>
  );

  const res = new ImageResponse(element, { width, height, fonts: await loadFonts() });
  return Buffer.from(await res.arrayBuffer());
}
