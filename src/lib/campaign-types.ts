/** Campagnes Instagram : types et valeurs par défaut (partagés par le serveur et l'interface). */

export type CampaignStatus = "draft" | "active" | "paused" | "ended";
export type Objective = "sales" | "traffic" | "awareness" | "promo";
export type VisualSource = "card" | "product";
export type PostKind = "post" | "story";
export type PostStatus = "generating" | "pending" | "scheduled" | "publishing" | "published" | "failed" | "rejected";

export type CampaignSettings = {
  objective: Objective;
  link: string; // page de destination (site web)
  offer: { enabled: boolean; text: string; code: string; until: string };
  audience: string;
  tone: "pro" | "warm" | "fun" | "luxury";
  formats: { post: boolean; story: boolean };
  rhythm: "auto" | "manual"; // auto : l'agent décide combien publier chaque jour (sous les plafonds du compte)
  perDay: number; // rythme manuel : 1 à 3
  slots: string[]; // heures de publication (HH:MM, heure de Paris)
  visuals: VisualSource[]; // (ancien réglage : le visuel dépend maintenant de l'objectif)
  productIds: number[]; // campagne de vente : produits à mettre en avant (vide = tout le catalogue)
  brand: { color: string; textColor: string; logo: string | null };
  hashtags: string[]; // toujours ajoutés
  autoHashtags: boolean;
  mentions: string; // mentions obligatoires (ex. « Livraison offerte dès 50 € »)
  forbidden: string; // sujets à éviter
  approval: "manual" | "auto";
  interactions: { replyComments: boolean; dmCommenters: boolean; keyword: string; maxReplies: number; maxDms: number };
};

export type Campaign = {
  id: number;
  name: string;
  agentId: number | null;
  status: CampaignStatus;
  startsOn: string; // AAAA-MM-JJ
  endsOn: string;
  settings: CampaignSettings;
  createdAt: number;
  updatedAt: number;
};

export type CampaignPost = {
  id: number;
  campaignId: number;
  kind: PostKind;
  status: PostStatus;
  scheduledAt: number;
  headline: string | null; // texte sur le visuel
  caption: string | null; // légende (publication) ou texte de la story
  visual: VisualSource;
  imageFile: string | null;
  mediaId: string | null; // identifiant Instagram une fois publié
  mediaCode: string | null; // lien instagram.com/p/CODE
  error: string | null;
  createdAt: number;
  publishedAt: number | null;
  productId: number | null;
  productTitle: string | null;
};

export const OBJECTIVES: Record<Objective, string> = {
  sales: "Vendre",
  traffic: "Visites du site",
  awareness: "Faire connaître la marque",
  promo: "Promotion / événement",
};

export const TONES: Record<CampaignSettings["tone"], string> = {
  pro: "Professionnel",
  warm: "Chaleureux",
  fun: "Fun et dynamique",
  luxury: "Haut de gamme",
};

export const VISUALS: Record<VisualSource, { label: string; hint: string }> = {
  product: { label: "Fiche produit", hint: "La vraie photo du produit, son nom et son prix." },
  card: { label: "Carte de marque", hint: "Ton message sur un visuel à tes couleurs, avec ton logo." },
};

export const POST_STATUS: Record<PostStatus, { label: string; cls: string }> = {
  generating: { label: "Préparation…", cls: "bg-zinc-100 text-zinc-500" },
  pending: { label: "À valider", cls: "bg-amber-50 text-amber-700" },
  scheduled: { label: "Programmé", cls: "bg-sky-50 text-sky-700" },
  publishing: { label: "Publication…", cls: "bg-violet-50 text-violet-700" },
  published: { label: "Publié", cls: "bg-green-50 text-green-700" },
  failed: { label: "Échec", cls: "bg-red-50 text-red-600" },
  rejected: { label: "Écarté", cls: "bg-zinc-100 text-zinc-400" },
};

export const DEFAULT_CAMPAIGN: CampaignSettings = {
  objective: "sales",
  link: "",
  offer: { enabled: false, text: "", code: "", until: "" },
  audience: "",
  tone: "warm",
  formats: { post: true, story: true },
  rhythm: "auto",
  perDay: 2,
  slots: ["09:30", "13:00", "19:00"],
  visuals: ["card"],
  productIds: [],
  brand: { color: "#111827", textColor: "#ffffff", logo: null },
  hashtags: [],
  autoHashtags: true,
  mentions: "",
  forbidden: "",
  approval: "manual",
  interactions: { replyComments: true, dmCommenters: true, keyword: "", maxReplies: 30, maxDms: 20 },
};

export function campaignWithDefaults(raw: unknown): CampaignSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<CampaignSettings>;
  const d = DEFAULT_CAMPAIGN;
  const visuals = Array.isArray(s.visuals) ? s.visuals.filter((v): v is VisualSource => v in VISUALS) : d.visuals;
  return {
    ...d,
    ...s,
    offer: { ...d.offer, ...s.offer },
    formats: { ...d.formats, ...s.formats },
    brand: { ...d.brand, ...s.brand },
    interactions: { ...d.interactions, ...s.interactions },
    rhythm: s.rhythm === "manual" ? "manual" : "auto",
    perDay: Math.min(3, Math.max(1, Math.round(Number(s.perDay ?? d.perDay)))),
    slots: (Array.isArray(s.slots) ? s.slots : d.slots).filter((x) => /^\d{2}:\d{2}$/.test(x)).slice(0, 3),
    visuals: visuals.length ? visuals : d.visuals,
    productIds: Array.isArray(s.productIds) ? s.productIds.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [],
    hashtags: Array.isArray(s.hashtags) ? s.hashtags.map((h) => h.replace(/^#/, "").trim()).filter(Boolean).slice(0, 15) : [],
  };
}
