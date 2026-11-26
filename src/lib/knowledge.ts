import { agentMarketingContext } from "./campaign-context";
import "server-only";

import { generateReply, type ChatMessage } from "./ai";
import { instructionsText, QUALITY_MODEL, SPEED_EFFORT, withDefaults, type AgentSettings, type TagRule } from "./agent-settings";
import type { Chat } from "./db";
import {
  agentPagesText,
  faqsForAgent,
  getAgent,
  getPage,
  listAgentMedia,
  markFaqsUsed,
  replacePageFaqs,
  saveAgentSettings,
  setPageStatus,
  updateAgent,
  type Agent,
  type Faq,
} from "./kb";
import { fetchPageText } from "./scraper";

/**
 * Le « cerveau » des agents :
 * - lecture des pages et génération des FAQ par l'IA ;
 * - rédaction / optimisation des instructions ;
 * - construction du prompt de réponse et lecture des actions demandées par l'IA.
 */

export const LANGUAGES: Record<string, string> = {
  fr: "français",
  en: "anglais",
  es: "espagnol",
  de: "allemand",
  it: "italien",
  pt: "portugais",
  nl: "néerlandais",
  ar: "arabe",
};

// ---------- File d'attente des préparations (une tâche à la fois, en arrière-plan) ----------

const g = globalThis as typeof globalThis & { __kbQueue?: Promise<unknown> };
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = (g.__kbQueue ?? Promise.resolve()).then(task, task);
  g.__kbQueue = next.catch(() => {});
  return next;
}

/** Lit les pages puis rédige les instructions de l'agent. Ne bloque pas : tourne en arrière-plan. */
export function prepareAgent(agentId: number, pageIds: number[], writeInstructions: boolean) {
  updateAgent(agentId, { preparing: true, prepPhase: "pages" });
  void enqueue(async () => {
    try {
      await processAll(pageIds);
      if (writeInstructions) {
        updateAgent(agentId, { prepPhase: "instructions" });
        await writeAgentInstructions(agentId).catch(() => {});
      }
    } finally {
      updateAgent(agentId, { preparing: false, prepPhase: null });
    }
  });
}

/** Relit des pages déjà importées (bouton « Actualiser »). */
export function refreshPages(pageIds: number[]) {
  for (const id of pageIds) setPageStatus(id, "pending");
  void enqueue(() => processAll(pageIds));
}

/** Traite les pages 3 par 3 (lecture + génération des FAQ). */
async function processAll(pageIds: number[], concurrency = 3) {
  const queue = [...pageIds];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) await processPage(id).catch(() => {});
    }),
  );
}

async function processPage(pageId: number) {
  const page = getPage(pageId);
  if (!page) return;
  setPageStatus(pageId, "processing");
  try {
    const fromWeb = /^https?:\/\//.test(page.url);
    const { title, text } = fromWeb ? await fetchPageText(page.url) : { title: page.title, text: page.content ?? "" };
    const faqs = await generateFaqs(text, page.title ?? title ?? page.url);
    replacePageFaqs(pageId, page.agent_id, faqs);
    setPageStatus(pageId, "ready", { title, content: text });
  } catch (err) {
    setPageStatus(pageId, "error", { error: err instanceof Error ? err.message : String(err) });
  }
}

function parseJson<T>(reply: string, kind: "array" | "object"): T | null {
  const json = reply.match(kind === "array" ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** L'IA lit le texte d'une page et en tire des questions/réponses. */
async function generateFaqs(text: string, title: string) {
  const reply = await generateReply(
    [
      {
        role: "system",
        content: `Tu construis la base de connaissances d'un assistant client. À partir du contenu d'une page \
web, écris entre 3 et 10 questions qu'un client pourrait poser, avec leur réponse.
Règles :
- Réponses factuelles, complètes mais courtes (1 à 3 phrases), tirées UNIQUEMENT du texte. N'invente rien.
- Garde les informations utiles : prix, horaires, adresses, délais, conditions, contacts, produits.
- Ignore les mentions légales sans intérêt pour un client, les menus et le texte technique.
- Écris dans la langue de la page.
- "section" : un thème court (2 à 4 mots) pour regrouper la FAQ, par exemple "Livraison", "Tarifs", "À propos".
Réponds UNIQUEMENT avec un tableau JSON : [{"question":"…","answer":"…","section":"…"}]`,
      },
      { role: "user", content: `Page : ${title}\n\n${text.slice(0, 14_000)}` },
    ],
    { maxTokens: 4000, temperature: 0.2 },
  );
  const faqs = (parseJson<unknown[]>(reply, "array") ?? [])
    .map((f) => f as { question?: unknown; answer?: unknown; section?: unknown })
    .filter((f) => typeof f.question === "string" && typeof f.answer === "string" && f.question.trim() && f.answer.trim())
    .map((f) => ({
      question: String(f.question).trim().slice(0, 300),
      answer: String(f.answer).trim().slice(0, 1500),
      section: typeof f.section === "string" ? f.section.trim().slice(0, 40) : undefined,
    }))
    .slice(0, 12);
  if (faqs.length === 0) throw new Error("L'IA n'a trouvé aucune information utile sur cette page");
  return faqs;
}

const SECTIONS_FORMAT = `Réponds UNIQUEMENT avec un objet JSON de cette forme (textes simples, tirets autorisés, pas de Markdown lourd) :
{"persona":"Qui est l'assistant, sa personnalité, ses traits clés, comment il parle (avec 2-3 exemples de phrases)",
 "objective":"Sa mission et ce qu'est une conversation réussie",
 "business":"Ce que l'entreprise propose, offre principale, prix clés, zones, contacts (sans recopier tout le site)",
 "behavior":"Comment mener la conversation : questions, longueur des messages, gestion des objections",
 "escalation":"Quand passer la main à un humain, comment conclure, ce qu'il ne doit jamais faire"}`;

function roleGoal(agent: Agent) {
  return agent.role === "sales"
    ? "aider les prospects à acheter ou réserver : comprendre leur besoin, conseiller le bon produit/service, lever les objections, et les amener vers l'achat, la commande ou le rendez-vous"
    : "répondre aux questions des clients et résoudre leurs problèmes (commandes, livraison, retours, utilisation), avec patience et précision";
}

function applySections(agentId: number, settings: AgentSettings, reply: string, note: string) {
  const sec = parseJson<Partial<AgentSettings["sections"]>>(reply, "object");
  if (!sec) throw new Error("L'IA n'a pas renvoyé d'instructions exploitables");
  const clean = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);
  const next: AgentSettings = {
    ...settings,
    sections: {
      persona: clean(sec.persona, settings.sections.persona),
      objective: clean(sec.objective, settings.sections.objective),
      business: clean(sec.business, settings.sections.business),
      behavior: clean(sec.behavior, settings.sections.behavior),
      escalation: clean(sec.escalation, settings.sections.escalation),
    },
  };
  saveAgentSettings(agentId, next, note);
}

/** L'IA rédige les instructions de l'agent (5 sections) à partir du contenu du site. */
export async function writeAgentInstructions(agentId: number) {
  const agent = getAgent(agentId);
  if (!agent) return;
  const site = agentPagesText(agentId, 24_000);
  if (!site) throw new Error("Aucune page prête pour rédiger les instructions");
  const reply = await generateReply(
    [
      {
        role: "system",
        content: `Tu rédiges les instructions d'un assistant IA qui répond aux clients d'une entreprise sur \
WhatsApp et Instagram. Son rôle : ${roleGoal(agent)}. Écris en ${LANGUAGES[agent.language] ?? "français"}, \
à la 2e personne (« Tu es… »). Donne-lui un prénom et une vraie personnalité cohérente avec la marque.
${SECTIONS_FORMAT}`,
      },
      { role: "user", content: `Nom de l'agent : ${agent.name}\nSite : ${agent.website ?? ""}\n\nContenu du site :\n${site}` },
    ],
    { maxTokens: 5000, temperature: 0.4 },
  );
  applySections(agentId, agent.settings, reply, "Rédigé par l'IA");
}

/** « Optimiser avec l'IA » : améliore les instructions existantes sans changer l'essentiel. */
export async function optimizeInstructions(agentId: number) {
  const agent = getAgent(agentId);
  if (!agent) return;
  const current = instructionsText(agent.settings) || agent.instructions;
  if (!current.trim()) return writeAgentInstructions(agentId);
  const reply = await generateReply(
    [
      {
        role: "system",
        content: `Tu es expert en assistants conversationnels de vente/support sur WhatsApp. Améliore les \
instructions ci-dessous : plus claires, plus précises, mieux organisées, sans contradiction, en gardant \
toutes les informations métier et le ton. Rôle de l'assistant : ${roleGoal(agent)}.
${SECTIONS_FORMAT}`,
      },
      { role: "user", content: current },
    ],
    { maxTokens: 5000, temperature: 0.3 },
  );
  applySections(agentId, agent.settings, reply, "Optimisé par l'IA");
}

/** « Générer avec l'IA » (onglet Tags) : propose des règles d'étiquetage adaptées à l'activité. */
export async function suggestTagRules(agentId: number): Promise<TagRule[]> {
  const agent = getAgent(agentId);
  if (!agent) return [];
  const reply = await generateReply(
    [
      {
        role: "system",
        content: `Propose 6 à 10 étiquettes utiles pour classer les contacts de cette entreprise dans un CRM \
(intérêt, budget, type de demande, objection…). Pour chacune : un nom court et une consigne précise \
« quand l'appliquer ». Réponds UNIQUEMENT avec un tableau JSON : [{"name":"…","when":"Appliquer quand …"}]`,
      },
      { role: "user", content: instructionsText(agent.settings) || agent.instructions || agent.name },
    ],
    { maxTokens: 2500, temperature: 0.4 },
  );
  return (parseJson<{ name?: string; when?: string }[]>(reply, "array") ?? [])
    .filter((t) => t.name && t.when)
    .slice(0, 12)
    .map((t) => ({ id: crypto.randomUUID(), name: String(t.name).slice(0, 40), when: String(t.when).slice(0, 300), webhook: "", allowRemove: false }));
}

/** Choisit les étiquettes qui s'appliquent à une discussion (onglet Tags → conversations existantes). */
export async function classifyTags(rules: TagRule[], transcript: string): Promise<string[]> {
  if (!rules.length || !transcript.trim()) return [];
  const reply = await generateReply(
    [
      {
        role: "system",
        content: `Voici des étiquettes avec leur règle d'application :\n${rules.map((r) => `- ${r.name} : ${r.when}`).join("\n")}
Lis la conversation et réponds UNIQUEMENT avec le tableau JSON des noms d'étiquettes qui s'appliquent (ou []).`,
      },
      { role: "user", content: transcript.slice(-8000) },
    ],
    { maxTokens: 800, temperature: 0 },
  );
  const names = new Set(rules.map((r) => r.name));
  return (parseJson<unknown[]>(reply, "array") ?? []).filter((n): n is string => typeof n === "string" && names.has(n));
}

// ---------- Réponses : prompt complet de l'agent ----------

const STOP = new Set(
  "les des une est pour que qui dans sur avec pas vous nous sont aux par plus son ses mon mes ton tes leur leurs cette ces elle ils elles comme mais car donc bien tout tous fait faire avoir être aussi très peut quoi quel quelle quels quelles comment combien bonjour merci salut the and for you are with that this what how can your have".split(
    " ",
  ),
);
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => w.replace(/(s|x)$/, ""));

/** FAQ les plus proches de la question du contact (par mots en commun). */
function relevantFaqs(faqs: Faq[], query: string, limit = 12): Faq[] {
  const q = new Set(words(query));
  if (q.size === 0) return [];
  return faqs
    .map((f) => {
      let score = 0;
      for (const w of words(f.question)) if (q.has(w)) score += 2;
      for (const w of words(f.answer)) if (q.has(w)) score += 1;
      return { f, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.f);
}

const STYLE = `Style WhatsApp : réponds de façon chaleureuse, courte et naturelle, comme un humain \
(pas de titres ni de Markdown). Réponds dans la langue utilisée par le contact.
Les messages vocaux te sont transmis sous forme de transcription : réponds-y comme si tu les avais écoutés. \
Quand on t'envoie une photo, tu la vois. Pour une vidéo, tu ne vois qu'une image d'aperçu.
Si l'information n'est ni dans tes instructions ni dans la base de connaissances, dis-le simplement et propose \
qu'un membre de l'équipe recontacte la personne. N'invente jamais de prix, de dates ou de promesses.`;

/** Paramètres d'appel au modèle selon les réglages de l'agent. */
export function modelOptions(agent: Agent) {
  return {
    model: process.env.AI_MODEL_OVERRIDE || QUALITY_MODEL[agent.settings.quality],
    reasoningEffort: SPEED_EFFORT[agent.settings.speed],
  };
}

/** Prompt système complet d'un agent pour répondre à un contact. */
export function buildAgentPrompt(agent: Agent, query: string, chat: Chat | null): string {
  const s = agent.settings;
  const all = faqsForAgent(agent.id);
  const picked = all.length <= 40 ? all : relevantFaqs(all, query);
  const used = relevantFaqs(picked, query, 5);
  if (used.length && chat) markFaqsUsed(used.map((f) => f.id));

  const parts: string[] = [instructionsText(s) || agent.instructions || `Tu es ${agent.name}, l'assistant de l'entreprise.`, STYLE];
  parts.push(`Ta langue principale est le ${LANGUAGES[agent.language] ?? "français"}, mais réponds toujours dans la langue du contact.`);
  if (s.maxBubbles > 1) {
    parts.push(`Tu peux découper ta réponse en ${s.maxBubbles} messages courts maximum, séparés par une ligne vide, comme sur WhatsApp.`);
  } else {
    parts.push("Réponds en un seul message court (2 à 4 phrases).");
  }
  if (s.transparency && chat && chat.aiCount === 0) {
    parts.push("Dans cette première réponse, précise naturellement que tu es un assistant IA.");
  }
  if (s.capabilities.closingCheck) {
    parts.push("Avant de conclure la conversation, demande si tu peux aider pour autre chose.");
  }
  if (chat) {
    const name = chat.customName ?? chat.name;
    if (name) parts.push(`Le contact s'appelle (ou se présente comme) : ${name}.`);
  }

  // Actions que l'IA peut demander, avec une syntaxe que l'appli retire avant l'envoi.
  const actions: string[] = [];
  if (s.tagRules.length) {
    actions.push(
      `[[TAG: nom]] pour étiqueter le contact. Étiquettes possibles et quand les appliquer :\n${s.tagRules
        .map((r) => `  - ${r.name} : ${r.when}`)
        .join("\n")}`,
    );
  }
  if (s.capabilities.createTasks) actions.push("[[TACHE: description]] pour créer une tâche de suivi pour l'équipe (rappel promis, info à vérifier, demande que tu ne peux pas traiter).");
  if (s.capabilities.updateNames) actions.push("[[NOM: prénom nom]] quand le contact te donne son nom.");
  if (s.capabilities.collectInfo) actions.push("[[INFO: champ = valeur]] pour enregistrer une information utile (adresse, taille, date…).");
  if (s.capabilities.handoff) actions.push("[[HUMAIN: raison]] quand un humain doit reprendre (demande explicite, réclamation sérieuse, sujet hors de ton périmètre). Préviens alors poliment le contact qu'un membre de l'équipe va prendre le relais.");
  const media = listAgentMedia(agent.id);
  if (media.length) {
    actions.push(
      `[[MEDIA: numéro]] pour envoyer un fichier. Fichiers disponibles :\n${media
        .map((m) => `  - ${m.id} : ${m.name} — à envoyer ${m.whenToSend || "quand c'est utile"}`)
        .join("\n")}`,
    );
  }
  if (actions.length) {
    parts.push(
      `Actions possibles : écris-les sur une ligne à part, à la fin de ton message, uniquement si c'est pertinent. Le contact ne les voit pas.\n- ${actions.join("\n- ")}`,
    );
  }

  if (s.extraContext.resources.trim()) parts.push(`Ressources utiles :\n${s.extraContext.resources.trim()}`);
  if (s.extraContext.other.trim()) parts.push(`Autres informations :\n${s.extraContext.other.trim()}`);
  if (picked.length) {
    parts.push(
      `Base de connaissances (questions/réponses validées, utilise-les en priorité) :\n${picked
        .map((f) => `Q : ${f.question}\nR : ${f.answer}`)
        .join("\n\n")}`,
    );
  }
  return parts.join("\n\n");
}

export type AgentAction = { kind: "TAG" | "TACHE" | "NOM" | "INFO" | "HUMAIN" | "MEDIA"; value: string };

/** Sépare le texte à envoyer des actions demandées par l'IA ([[TAG: …]], etc.). */
export function parseAgentReply(reply: string, settings: AgentSettings): { bubbles: string[]; actions: AgentAction[] } {
  const actions: AgentAction[] = [];
  let text = reply.replace(/\[\[\s*(TAG|TACHE|TÂCHE|NOM|INFO|HUMAIN|MEDIA|MÉDIA)\s*:\s*([^\]]+?)\s*\]\]/gi, (_, kind: string, value: string) => {
    const k = kind.toUpperCase().replace("Â", "A").replace("É", "E") as AgentAction["kind"];
    actions.push({ kind: k, value: value.trim() });
    return "";
  });
  for (const ch of settings.forbiddenChars.replace(/\s/g, "")) text = text.split(ch).join(ch === "—" ? "," : "");
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const max = Math.max(1, settings.maxBubbles);
  const bubbles =
    paragraphs.length <= max ? paragraphs : [...paragraphs.slice(0, max - 1), paragraphs.slice(max - 1).join("\n\n")];
  return { bubbles: max === 1 ? [paragraphs.join("\n\n")].filter(Boolean) : bubbles, actions };
}

/** Réponse d'essai (onglet « Essayer ») : rien n'est envoyé ni enregistré. */
export async function tryAgent(agentId: number, history: ChatMessage[]) {
  const agent = getAgent(agentId);
  if (!agent) throw new Error("Agent introuvable");
  const query = history.filter((m) => m.role === "user").slice(-3).map((m) => String(m.content)).join(" ");
  // Comme en vrai : l'agent connaît aussi ses campagnes et son catalogue produits.
  const marketing = agentMarketingContext(agent.id, query);
  const system = [buildAgentPrompt(agent, query, null), marketing].filter(Boolean).join("\n\n");
  const reply = await generateReply([{ role: "system", content: system }, ...history], modelOptions(agent));
  return parseAgentReply(reply, agent.settings);
}

export { withDefaults };
