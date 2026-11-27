/** Diffusions et listes de contacts : types partagés par le serveur et l'interface. */

export type RuleField = "tags" | "status" | "channel" | "lastActivity" | "score" | "received";
export type RuleOp = "any" | "all" | "none" | "is" | "isNot" | "within" | "olderThan" | "gte" | "lte";
export type ListRule = { field: RuleField; op: RuleOp; values: string[]; number: number | null };

export type ContactList = {
  id: number;
  name: string;
  kind: "static" | "smart";
  jids: string[]; // liste statique
  rules: ListRule[]; // liste intelligente
  match: "all" | "any";
  createdAt: number;
  count: number; // contacts actuels (calculé)
};

export const RULE_FIELDS: Record<RuleField, { label: string; ops: RuleOp[] }> = {
  tags: { label: "Tags", ops: ["any", "all", "none"] },
  status: { label: "Statut", ops: ["is", "isNot"] },
  channel: { label: "Canal", ops: ["is", "isNot"] },
  lastActivity: { label: "Dernière activité", ops: ["within", "olderThan"] },
  score: { label: "Score", ops: ["gte", "lte"] },
  received: { label: "Messages reçus", ops: ["gte", "lte"] },
};

export const RULE_OPS: Record<RuleOp, string> = {
  any: "contient au moins un élément de",
  all: "contient tous les éléments de",
  none: "ne contient aucun élément de",
  is: "est",
  isNot: "n'est pas",
  within: "dans les derniers (jours)",
  olderThan: "il y a plus de (jours)",
  gte: "au moins",
  lte: "au plus",
};

export const STATUS_LABELS: Record<string, string> = {
  nouveau: "Nouveau",
  engage: "Engagé",
  "a-relancer": "À relancer",
  inactif: "Inactif",
  client: "Client",
  dnd: "Ne pas déranger",
};
export const CHANNEL_LABELS: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", web: "Site web" };

export type BroadcastStatus = "draft" | "scheduled" | "sending" | "paused" | "done" | "cancelled";

export type BroadcastSettings = {
  listId: number | null;
  message: string;
  media: { file: string; mime: string; name: string } | null;
  identical: boolean; // envoyer exactement le même texte à tous (déconseillé)
  agentId: number | null; // null = l'équipe gère les réponses (pas d'IA)
  followup: { enabled: boolean; afterHours: number; message: string };
  schedule: { mode: "now" | "later"; at: number | null };
  window: { enabled: boolean; start: string; end: string; days: number[] }; // jours : 1 = lundi … 7 = dimanche
  urgent: boolean; // tout envoyer d'un coup (lots rapides)
  progressive: { enabled: boolean; perDay: number };
};

export const DEFAULT_BROADCAST: BroadcastSettings = {
  listId: null,
  message: "",
  media: null,
  identical: false,
  agentId: null,
  followup: { enabled: false, afterHours: 48, message: "" },
  schedule: { mode: "now", at: null },
  window: { enabled: true, start: "09:00", end: "20:00", days: [1, 2, 3, 4, 5, 6] },
  urgent: false,
  progressive: { enabled: false, perDay: 50 },
};

export type BroadcastStats = { total: number; pending: number; sent: number; delivered: number; read: number; replied: number; failed: number; skipped: number; optout: number };

export type Broadcast = {
  id: number;
  name: string;
  status: BroadcastStatus;
  settings: BroadcastSettings;
  note: string | null; // raison d'une pause, info d'avancement
  createdAt: number;
  updatedAt: number;
  launchedAt: number | null;
  finishedAt: number | null;
  stats: BroadcastStats;
  listName: string | null;
};

export const BROADCAST_STATUS: Record<BroadcastStatus, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "bg-zinc-100 text-zinc-600" },
  scheduled: { label: "Programmée", cls: "bg-sky-50 text-sky-700" },
  sending: { label: "● Envoi en cours", cls: "bg-blue-50 text-blue-700" },
  paused: { label: "En pause", cls: "bg-amber-50 text-amber-700" },
  done: { label: "Terminée", cls: "bg-zinc-100 text-zinc-600" },
  cancelled: { label: "Annulée", cls: "bg-zinc-100 text-zinc-400" },
};

export function broadcastWithDefaults(raw: unknown): BroadcastSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<BroadcastSettings>;
  const d = DEFAULT_BROADCAST;
  return {
    ...d,
    ...s,
    followup: { ...d.followup, ...s.followup },
    schedule: { ...d.schedule, ...s.schedule },
    window: { ...d.window, ...s.window },
    progressive: { ...d.progressive, ...s.progressive },
  };
}

// ---------- Spintax et variables (partagé : aperçu dans l'interface, envoi côté serveur) ----------

/** Nombre de versions différentes possibles d'un texte {a|b|c}. */
export function spintaxCount(text: string): number {
  let n = 1;
  for (const m of text.matchAll(/\{([^{}]*\|[^{}]*)\}/g)) n *= m[1].split("|").length;
  return n;
}

/** Choisit une option au hasard dans chaque {a|b|c}. */
export function spin(text: string, rand: () => number = Math.random): string {
  return text.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, body: string) => {
    const opts = body.split("|");
    return opts[Math.floor(rand() * opts.length)];
  });
}

export const VARIABLES = [
  { key: "first_name", label: "Prénom" },
  { key: "name", label: "Nom complet" },
  { key: "phone", label: "Téléphone" },
];

export function firstNameOf(name: string | null): string {
  const f = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return /\p{L}/u.test(f) && !/^\+?\d/.test(f) ? f.charAt(0).toUpperCase() + f.slice(1) : "";
}

/** Remplace {{first_name}}, {{name}}, {{phone}} ; sans prénom connu, « {{first_name}} » disparaît proprement. */
export function fillVariables(text: string, c: { name: string | null; phone: string | null }): string {
  const first = firstNameOf(c.name);
  return text
    .replace(/\s*\{\{\s*first_name\s*\}\}/g, (m) => (first ? `${m.startsWith(" ") ? " " : ""}${first}` : ""))
    .replace(/\{\{\s*name\s*\}\}/g, c.name && !/^\+?\d/.test(c.name) ? c.name : "")
    .replace(/\{\{\s*phone\s*\}\}/g, c.phone ? `+${c.phone}` : "")
    .replace(/ +([,!?.])/g, "$1");
}
