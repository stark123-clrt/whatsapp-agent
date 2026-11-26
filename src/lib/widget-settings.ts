/**
 * Réglages du widget de chat pour site web (stockés en JSON).
 * Fichier sans dépendance serveur : partagé par l'admin, la page du chat et le script.
 */

export type LauncherIcon = "chat" | "dots" | "send" | "help" | "bolt" | "smile";
export type ThemeId = "classic" | "glass" | "midnight" | "bloom" | "ember" | "mono";
export type ActionButton = { id: string; kind: "call" | "email" | "map" | "link"; label: string; value: string };

export type WidgetSettings = {
  theme: ThemeId;
  corners: "rounded" | "soft" | "square";
  font: "default" | "system" | "serif" | "mono";
  name: string;
  subtitle: string;
  logo: string | null; // nom du fichier importé
  launcherIcon: LauncherIcon;
  colors: { brand: string; brandText: string; botBubble: string; botText: string; panel: string };
  position: "bottom-right" | "bottom-left";
  offsetX: number;
  offsetY: number;
  starters: string[];
  footer: { enabled: boolean; text: string };
  welcome: string;
  placeholder: string;
  language: "auto" | "fr" | "en" | "es" | "de" | "it" | "pt" | "nl" | "ar";
  sound: boolean;
  proactive: { enabled: boolean; message: string; accept: string; refuse: string; delay: number };
  newVisitorsOnly: boolean;
  includePaths: string[];
  excludePaths: string[];
  aiSpeed: number; // 0 (plus lent, plus naturel) → 100 (vitesse max)
  activityNote: boolean;
  lead: {
    enabled: boolean;
    title: string;
    subtitle: string;
    phone: boolean;
    lastName: boolean;
    requirePrivacy: boolean;
    privacyUrl: string;
  };
  emoji: boolean;
  attachments: boolean; // photos et PDF envoyés par les visiteurs
  actions: ActionButton[];
  allowedDomains: string[];
  agentId: number | null; // null = agent par défaut du compte
  poweredBy: boolean;
};

export const THEMES: Record<ThemeId, { label: string; colors: WidgetSettings["colors"]; corners: WidgetSettings["corners"]; font: WidgetSettings["font"] }> = {
  classic: { label: "Classique", colors: { brand: "#25D366", brandText: "#ffffff", botBubble: "#f3f4f6", botText: "#374151", panel: "#ffffff" }, corners: "rounded", font: "default" },
  glass: { label: "Verre", colors: { brand: "#22c55e", brandText: "#ffffff", botBubble: "#f0fdf4", botText: "#14532d", panel: "#ffffff" }, corners: "rounded", font: "default" },
  midnight: { label: "Minuit", colors: { brand: "#6366f1", brandText: "#ffffff", botBubble: "#1e1b4b", botText: "#e0e7ff", panel: "#0f0f23" }, corners: "rounded", font: "default" },
  bloom: { label: "Éclosion", colors: { brand: "#ec4899", brandText: "#ffffff", botBubble: "#fdf2f8", botText: "#831843", panel: "#ffffff" }, corners: "soft", font: "default" },
  ember: { label: "Braise", colors: { brand: "#f97316", brandText: "#ffffff", botBubble: "#fff7ed", botText: "#7c2d12", panel: "#ffffff" }, corners: "soft", font: "default" },
  mono: { label: "Mono", colors: { brand: "#18181b", brandText: "#ffffff", botBubble: "#f4f4f5", botText: "#18181b", panel: "#ffffff" }, corners: "square", font: "mono" },
};

export const DEFAULT_WIDGET: WidgetSettings = {
  theme: "classic",
  corners: "rounded",
  font: "default",
  name: "Notre équipe",
  subtitle: "Répond généralement en quelques minutes",
  logo: null,
  launcherIcon: "chat",
  colors: THEMES.classic.colors,
  position: "bottom-right",
  offsetX: 20,
  offsetY: 20,
  starters: [],
  footer: { enabled: false, text: "" },
  welcome: "Bonjour 👋 Une question ? On vous répond en quelques minutes.",
  placeholder: "Écrivez un message…",
  language: "auto",
  sound: true,
  proactive: { enabled: false, message: "Bonjour ! 👋 Comment pouvons-nous vous aider aujourd'hui ?", accept: "Discuter", refuse: "Plus tard", delay: 5 },
  newVisitorsOnly: false,
  includePaths: [],
  excludePaths: [],
  aiSpeed: 50,
  activityNote: false,
  lead: {
    enabled: false,
    title: "Avant de commencer…",
    subtitle: "Il nous faut juste quelques informations pour pouvoir vous recontacter si la discussion s'interrompt.",
    phone: false,
    lastName: false,
    requirePrivacy: false,
    privacyUrl: "",
  },
  emoji: true,
  attachments: true,
  actions: [],
  allowedDomains: [],
  agentId: null,
  poweredBy: true,
};

/** Complète des réglages partiels avec les valeurs par défaut. */
export function widgetWithDefaults(raw: unknown): WidgetSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<WidgetSettings>;
  const d = DEFAULT_WIDGET;
  return {
    ...d,
    ...s,
    colors: { ...d.colors, ...s.colors },
    footer: { ...d.footer, ...s.footer },
    proactive: { ...d.proactive, ...s.proactive },
    lead: { ...d.lead, ...s.lead },
    starters: Array.isArray(s.starters) ? s.starters.slice(0, 10) : [],
    includePaths: Array.isArray(s.includePaths) ? s.includePaths : [],
    excludePaths: Array.isArray(s.excludePaths) ? s.excludePaths : [],
    actions: Array.isArray(s.actions) ? s.actions : [],
    allowedDomains: Array.isArray(s.allowedDomains) ? s.allowedDomains : [],
  };
}

export const RADIUS: Record<WidgetSettings["corners"], { panel: number; bubble: number; button: number }> = {
  rounded: { panel: 18, bubble: 16, button: 999 },
  soft: { panel: 12, bubble: 10, button: 12 },
  square: { panel: 4, bubble: 4, button: 4 },
};

export const FONTS: Record<WidgetSettings["font"], string> = {
  default: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
};

/** Dessins des icônes de lancement (SVG, 24×24). */
export const LAUNCHER_ICONS: Record<LauncherIcon, string> = {
  chat: "M4 5h16v11H8l-4 3V5z",
  dots: "M4 5h16v11H8l-4 3V5zM8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01",
  send: "M3.4 20.4l17.4-7.5a1 1 0 0 0 0-1.8L3.4 3.6a1 1 0 0 0-1.4 1.1L4 11l9 1-9 1-2 6.3a1 1 0 0 0 1.4 1.1z",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01",
};

/** Textes de l'interface du widget, selon la langue du visiteur. */
export const WIDGET_I18N = {
  fr: { send: "Envoyer", typing: "écrit…", thinking: "L'IA réfléchit…", start: "Commencer la discussion", name: "Prénom", lastName: "Nom", email: "E-mail", phone: "Téléphone", privacy: "J'accepte la politique de confidentialité", poweredBy: "Propulsé par l'IA", close: "Fermer", offline: "Message envoyé. Nous revenons vers vous très vite.", required: "Champ obligatoire", attach: "Joindre une photo ou un PDF", fileTooBig: "Fichier trop lourd (10 Mo max).", fileType: "Seules les photos et les PDF sont acceptés.", drop: "Déposez votre photo ou votre PDF ici", open: "Ouvrir" },
  en: { send: "Send", typing: "is typing…", thinking: "AI is thinking…", start: "Start chatting", name: "First name", lastName: "Last name", email: "Email", phone: "Phone", privacy: "I accept the privacy policy", poweredBy: "Powered by AI", close: "Close", offline: "Message sent. We'll get back to you soon.", required: "Required", attach: "Attach a photo or a PDF", fileTooBig: "File too large (10 MB max).", fileType: "Only photos and PDFs are accepted.", drop: "Drop your photo or PDF here", open: "Open" },
} as const;
export type WidgetLabels = { [K in keyof (typeof WIDGET_I18N)["fr"]]: string };

export function labelsFor(lang: string): WidgetLabels {
  // Les autres langues utiliseront l'anglais en attendant leurs traductions.
  return lang.startsWith("fr") ? WIDGET_I18N.fr : WIDGET_I18N.en;
}

/** Le domaine du site est-il autorisé ? (liste vide = tous ; « *.exemple.com » = sous-domaines) */
export function domainAllowed(host: string, allowed: string[]): boolean {
  if (!allowed.length) return true;
  const h = host.toLowerCase().replace(/^www\./, "");
  return allowed.some((rule) => {
    const r = rule.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    if (r.startsWith("*.")) return h === r.slice(2) || h.endsWith(`.${r.slice(2)}`);
    return h === r;
  });
}
