"use client";

import { useEffect, useState } from "react";
import type { AgentLogEntry } from "@/lib/agent";

type Data = {
  settings: { enabled: boolean; replyAll: boolean; allowed: string[] };
  aiConfigured: boolean;
  log: AgentLogEntry[];
};

const KIND: Record<AgentLogEntry["kind"], { label: string; className: string }> = {
  in: { label: "Reçu", className: "text-zinc-500" },
  out: { label: "Réponse IA", className: "text-green-700" },
  skip: { label: "Ignoré", className: "text-amber-700" },
  error: { label: "Erreur", className: "text-red-600" },
};

export function AgentActivity() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/agent/log", { cache: "no-store" })
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    const first = setTimeout(load, 0);
    const id = setInterval(load, 2000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (!data) return null;
  const { settings, aiConfigured, log } = data;

  return (
    <section className="w-full rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-zinc-900">Activité de l&apos;agent</h2>

      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-zinc-500">IA Cloudflare</dt>
          <dd className={aiConfigured ? "text-zinc-900" : "text-red-600"}>
            {aiConfigured ? "Configurée" : "Clés manquantes dans .env.local"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Répond à</dt>
          <dd className="text-right text-zinc-900">
            {!settings.enabled
              ? "Personne (agent coupé)"
              : settings.replyAll
                ? "Tout le monde"
                : settings.allowed.length
                  ? settings.allowed.map((n) => `+${n}`).join(", ")
                  : "Personne (aucun numéro de test)"}
          </dd>
        </div>
      </dl>

      <ul className="mt-5 space-y-3">
        {log.length === 0 && (
          <li className="text-sm text-zinc-500">
            Rien pour l&apos;instant. Envoie un message WhatsApp depuis un numéro de test.
          </li>
        )}
        {log.map((e, i) => (
          <li key={`${e.at}-${i}`} className="text-sm">
            <div className="flex justify-between gap-2 text-xs">
              <span className={`font-medium ${KIND[e.kind].className}`}>
                {KIND[e.kind].label} · {e.who}
              </span>
              <time className="text-zinc-400">
                {new Date(e.at).toLocaleTimeString("fr-FR")}
              </time>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-zinc-800">{e.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
