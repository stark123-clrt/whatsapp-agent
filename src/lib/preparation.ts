import "server-only";

import { isOpenNow } from "./agent-settings";
import { faqsForAgent, listAgentMedia, listSources, type Agent } from "./kb";

export type PrepItem = { group: string; label: string; detail: string; points: number; max: number; tab: string };

/** Score de préparation /100 de l'agent, avec ce qui fonctionne et ce qui manque. */
export function preparation(agent: Agent) {
  const s = agent.settings;
  const faqs = faqsForAgent(agent.id).length;
  const sources = listSources().filter((x) => x.agentId === agent.id);
  const pages = sources.flatMap((x) => x.pages);
  const readyPages = pages.filter((p) => p.status === "ready").length;
  const items: PrepItem[] = [
    { group: "Instructions", tab: "instructions", label: "Persona définie", detail: "L'agent sait qui il est et comment il parle.", max: 8, points: s.sections.persona.trim().length > 80 ? 8 : 0 },
    { group: "Instructions", tab: "instructions", label: "Objectif défini", detail: "L'agent sait ce qu'est une conversation réussie.", max: 8, points: s.sections.objective.trim().length > 40 ? 8 : 0 },
    { group: "Instructions", tab: "instructions", label: "Contexte de l'entreprise renseigné", detail: "Offre, prix clés, contacts.", max: 5, points: s.sections.business.trim().length > 40 ? 5 : 0 },
    { group: "Instructions", tab: "instructions", label: "Escalade vers un humain définie", detail: "Quand passer la main et comment conclure.", max: 4, points: s.sections.escalation.trim().length > 20 ? 4 : 0 },
    { group: "Connaissances", tab: "faq", label: "FAQ liées", detail: `${faqs} paires de questions-réponses servent de base aux réponses.`, max: 15, points: faqs >= 20 ? 15 : faqs >= 5 ? 10 : faqs > 0 ? 5 : 0 },
    { group: "Connaissances", tab: "faq", label: "Toutes les sources sont traitées", detail: pages.length ? `${readyPages}/${pages.length} pages lues.` : "Aucune source liée.", max: 10, points: pages.length && readyPages === pages.length ? 10 : readyPages ? 5 : 0 },
    { group: "Capacités", tab: "capabilities", label: "Passage à un humain possible", detail: "L'IA sait alerter l'équipe au lieu d'insister.", max: 5, points: s.capabilities.handoff ? 5 : 0 },
    { group: "Capacités", tab: "capabilities", label: "Création de tâches", detail: "Les promesses de rappel deviennent des tâches.", max: 5, points: s.capabilities.createTasks ? 5 : 0 },
    { group: "Capacités", tab: "media", label: "Médias ou tags configurés", detail: "Fichiers à envoyer ou étiquetage automatique.", max: 5, points: listAgentMedia(agent.id).length || s.tagRules.length ? 5 : 0 },
    { group: "Heures d'activité et suivis", tab: "hours", label: "Heures d'activité", detail: s.hours.always ? "Actif 24h/24." : isOpenNow(s) ? "Ouvert en ce moment." : "Fermé en ce moment.", max: 5, points: 5 },
    { group: "Heures d'activité et suivis", tab: "followups", label: "Relances automatiques", detail: s.followups.enabled ? "Activées." : "Les contacts silencieux ne sont pas relancés.", max: 5, points: s.followups.enabled ? 5 : 0 },
    { group: "Points d'entrée et routage", tab: "entry", label: "Connecté à un point d'entrée", detail: "Les nouvelles conversations arrivent bien à cet agent.", max: 15, points: s.entryRules.some((r) => r.enabled) ? 15 : 0 },
    { group: "Statut en direct et tests", tab: "overview", label: "Agent actif", detail: agent.status === "active" ? "L'agent répond." : "En pause : il ne répond à personne.", max: 5, points: agent.status === "active" ? 5 : 0 },
    { group: "Statut en direct et tests", tab: "instructions", label: "Ouvert à tous les contacts", detail: s.testMode ? "Mode test : seuls les contacts de test reçoivent des réponses." : "Répond à tout le monde.", max: 5, points: s.testMode ? 0 : 5 },
  ];
  const score = items.reduce((n, i) => n + i.points, 0);
  const groups = [...new Set(items.map((i) => i.group))].map((g) => {
    const list = items.filter((i) => i.group === g);
    return { group: g, points: list.reduce((n, i) => n + i.points, 0), max: list.reduce((n, i) => n + i.max, 0) };
  });
  return { score, items, groups };
}
