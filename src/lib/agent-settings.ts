/**
 * Réglages d'un agent IA (stockés en JSON). Fichier sans dépendance serveur :
 * utilisé à la fois par le serveur et par les pages de l'interface.
 */

export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const DAYS: { id: Day; label: string }[] = [
  { id: "mon", label: "Lundi" },
  { id: "tue", label: "Mardi" },
  { id: "wed", label: "Mercredi" },
  { id: "thu", label: "Jeudi" },
  { id: "fri", label: "Vendredi" },
  { id: "sat", label: "Samedi" },
  { id: "sun", label: "Dimanche" },
];

export type TagRule = { id: string; name: string; when: string; webhook: string; allowRemove: boolean };
export type EntryRule = { id: string; kind: "default" | "keyword"; keywords: string; enabled: boolean };
export type FollowupCycle = { delayHours: number; messages: number; tone: string };

export type AgentSettings = {
  sections: { persona: string; objective: string; business: string; behavior: string; escalation: string };
  transparency: boolean; // dire au contact qu'il parle à une IA (1re réponse)
  testMode: boolean; // ne répondre qu'aux contacts de test
  draftsOnly: boolean; // l'IA prépare un brouillon au lieu d'envoyer
  delayMin: number; // secondes
  delayMax: number;
  maxAiPerChat: number; // au-delà : passage à un humain (0 = sans limite)
  limitResetHours: number; // compteur remis à zéro si le contact revient après ce silence (0 = jamais)
  maxBubbles: number; // réponse découpée en N messages maximum
  forbiddenChars: string;
  speed: "human" | "balanced" | "fast" | "very_fast";
  quality: "max" | "pro";
  hours: { always: boolean; timezone: string; days: Record<Day, { on: boolean; start: string; end: string }> };
  extraContext: { resources: string; other: string };
  capabilities: { closingCheck: boolean; updateNames: boolean; collectInfo: boolean; createTasks: boolean; handoff: boolean };
  tagRules: TagRule[];
  followups: { enabled: boolean; cycles: FollowupCycle[] };
  entryRules: EntryRule[];
};

const day = (on: boolean) => ({ on, start: "09:00", end: "19:00" });

export const DEFAULT_SETTINGS: AgentSettings = {
  sections: { persona: "", objective: "", business: "", behavior: "", escalation: "" },
  transparency: false,
  testMode: true,
  draftsOnly: false,
  delayMin: 4,
  delayMax: 12,
  maxAiPerChat: 20,
  limitResetHours: 24,
  maxBubbles: 1,
  forbiddenChars: "—",
  speed: "balanced",
  quality: "max",
  hours: {
    always: true,
    timezone: "Europe/Paris",
    days: { mon: day(true), tue: day(true), wed: day(true), thu: day(true), fri: day(true), sat: day(true), sun: day(false) },
  },
  extraContext: { resources: "", other: "" },
  capabilities: { closingCheck: false, updateNames: true, collectInfo: false, createTasks: true, handoff: true },
  tagRules: [],
  followups: {
    enabled: false,
    cycles: [
      { delayHours: 24, messages: 1, tone: "amical et léger, simple petit rappel" },
      { delayHours: 72, messages: 1, tone: "utile : apporte une info ou un conseil en plus" },
      { delayHours: 168, messages: 1, tone: "dernier message, poli, sans insister" },
    ],
  },
  entryRules: [{ id: "default", kind: "default", keywords: "", enabled: true }],
};

/** Complète des réglages partiels (anciennes versions) avec les valeurs par défaut. */
export function withDefaults(raw: unknown): AgentSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<AgentSettings>;
  const d = DEFAULT_SETTINGS;
  return {
    ...d,
    ...s,
    sections: { ...d.sections, ...s.sections },
    hours: { ...d.hours, ...s.hours, days: { ...d.hours.days, ...s.hours?.days } },
    extraContext: { ...d.extraContext, ...s.extraContext },
    capabilities: { ...d.capabilities, ...s.capabilities },
    followups: { ...d.followups, ...s.followups, cycles: s.followups?.cycles?.length ? s.followups.cycles : d.followups.cycles },
    tagRules: Array.isArray(s.tagRules) ? s.tagRules : [],
    entryRules: Array.isArray(s.entryRules) && s.entryRules.length ? s.entryRules : d.entryRules,
  };
}

/** Le texte complet des instructions (toutes les sections). */
export function instructionsText(s: AgentSettings): string {
  const parts: [string, string][] = [
    ["Persona", s.sections.persona],
    ["Objectif", s.sections.objective],
    ["Contexte métier", s.sections.business],
    ["Comportement conversationnel", s.sections.behavior],
    ["Escalade et conclusion", s.sections.escalation],
  ];
  return parts
    .filter(([, t]) => t.trim())
    .map(([title, t]) => `## ${title}\n${t.trim()}`)
    .join("\n\n");
}

/** L'agent est-il ouvert à cet instant ? */
export function isOpenNow(s: AgentSettings, now = new Date()): boolean {
  if (s.hours.always) return true;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: s.hours.timezone || "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value.toLowerCase().slice(0, 3) as Day;
  const hm = `${parts.find((p) => p.type === "hour")?.value}:${parts.find((p) => p.type === "minute")?.value}`;
  const d = s.hours.days[wd];
  return Boolean(d?.on && hm >= d.start && hm < d.end);
}

export const SPEED_EFFORT: Record<AgentSettings["speed"], string> = {
  human: "high",
  balanced: "low",
  fast: "low",
  very_fast: "none",
};
export const QUALITY_MODEL: Record<AgentSettings["quality"], string> = {
  max: "@cf/deepseek-ai/deepseek-v4.1-flash-1017",
  pro: "@cf/deepseek-ai/deepseek-v4-pro-0813",
};
