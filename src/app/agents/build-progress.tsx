"use client";

import { Icon as UiIcon } from "@/app/icons";

import { useEffect, useRef, useState } from "react";

type Progress = {
  name: string;
  preparing: boolean;
  phase: "pages" | "instructions" | null;
  pages: { total: number; ready: number; errors: number };
  faqs: number;
  hasInstructions: boolean;
};

const PHRASES = [
  "Ton agent découvre ton site, page par page…",
  "Il note les prix, les délais et les conditions…",
  "Il prépare les réponses aux questions de tes clients…",
  "Il apprend le ton de ta marque…",
  "Encore un instant, il relit tout avant de se lancer…",
];

/**
 * Écran « On construit votre agent » : progression réelle (pages lues, FAQ créées,
 * instructions), puis « Votre agent est prêt ! » et passage à la page de l'agent.
 */
export function BuildProgress({
  agentId,
  pagesFound,
  onDone,
  onBackground,
}: {
  agentId: number;
  pagesFound?: number;
  onDone: () => void;
  onBackground?: () => void;
}) {
  const [p, setP] = useState<Progress | null>(null);
  const [phrase, setPhrase] = useState(0);
  const [finished, setFinished] = useState(false);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  // Suivi de la construction (toutes les 1,5 s).
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const res = await fetch(`/api/agents/${agentId}/progress`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok || stop) return;
      const data = (await res.json()) as Progress;
      setP(data);
      if (!data.preparing) {
        setFinished(true);
        stop = true;
        setTimeout(() => doneRef.current(), 1600);
      }
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(() => !stop && void tick(), 1500);
    return () => {
      stop = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [agentId]);

  useEffect(() => {
    const id = setInterval(() => setPhrase((i) => (i + 1) % PHRASES.length), 3500);
    return () => clearInterval(id);
  }, []);

  const total = p?.pages.total ?? 0;
  const read = (p?.pages.ready ?? 0) + (p?.pages.errors ?? 0);
  const pagesDone = finished || (p !== null && p.phase !== "pages");
  const writing = p?.phase === "instructions";
  const pct = total ? Math.round((read / total) * 100) : 0;

  type Step = { label: string; detail?: string; state: "done" | "active" | "todo" };
  const steps: Step[] = [
    ...(pagesFound !== undefined || total
      ? [{ label: "Recherche des pages du site", detail: `${pagesFound ?? total} page${(pagesFound ?? total) > 1 ? "s" : ""} trouvée${(pagesFound ?? total) > 1 ? "s" : ""}`, state: "done" as const }]
      : []),
    ...(total
      ? [
          {
            label: "Lecture des pages",
            detail: `${read} / ${total}${p?.pages.errors ? ` · ${p.pages.errors} ignorée${p.pages.errors > 1 ? "s" : ""}` : ""}`,
            state: pagesDone ? ("done" as const) : ("active" as const),
          },
          {
            label: "Création des questions-réponses",
            detail: `${p?.faqs ?? 0} FAQ${pagesDone ? "" : " pour l'instant"}`,
            state: pagesDone ? ("done" as const) : read > 0 ? ("active" as const) : ("todo" as const),
          },
        ]
      : []),
    {
      label: "Rédaction des instructions de l'IA",
      state: finished ? "done" : writing ? "active" : "todo",
    },
    { label: "Votre agent est prêt !", state: finished ? "done" : "todo" },
  ];

  return (
    <div className="flex flex-col items-center px-2 py-4 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        {!finished && <span className="absolute inset-0 animate-ping rounded-full bg-blue-200 opacity-60" />}
        <span className={`relative flex h-20 w-20 items-center justify-center rounded-full text-4xl ${finished ? "bg-blue-100" : "bg-blue-50"}`}>
          <UiIcon name={finished ? "checkCircle" : "sparkles"} size={36} className="text-blue-700" />
        </span>
      </div>
      <h2 className="mt-5 text-xl font-semibold">
        {finished ? "Votre agent est prêt !" : `On construit votre agent${p?.name ? ` « ${p.name} »` : ""}…`}
      </h2>
      <p className="mt-1 h-5 text-sm text-zinc-500 transition-opacity">{finished ? "Ouverture de sa page…" : PHRASES[phrase]}</p>

      <ol className="mt-7 w-full max-w-md space-y-3 text-left">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                s.state === "done" ? "bg-blue-600 text-white" : s.state === "active" ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-300"
              }`}
            >
              {s.state === "done" ? "✓" : s.state === "active" ? <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" /> : "•"}
            </span>
            <span className={`flex-1 text-sm ${s.state === "todo" ? "text-zinc-400" : "font-medium text-zinc-800"}`}>{s.label}</span>
            {s.detail && <span className="text-xs text-zinc-500 tabular-nums">{s.detail}</span>}
          </li>
        ))}
      </ol>

      {!pagesDone && total > 0 && (
        <div className="mt-5 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-zinc-100">
          <div className="h-1.5 rounded-full bg-blue-600 transition-all duration-700" style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
      )}

      {onBackground && !finished && (
        <button onClick={onBackground} className="mt-7 rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
          Continuer en arrière-plan
        </button>
      )}
    </div>
  );
}
