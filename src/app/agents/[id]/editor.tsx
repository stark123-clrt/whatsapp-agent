"use client";

import { Icon as UiIcon } from "@/app/icons";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { AgentSettings } from "@/lib/agent-settings";
import type { Agent } from "@/lib/kb";
import { BuildProgress } from "../build-progress";
import { CapabilitiesTab, FaqTab, TagsTab } from "./tabs-b";
import { EntryTab, FollowupsTab, TryTab } from "./tabs-c";
import { HoursTab, InstructionsTab, MediaTab, OverviewTab } from "./tabs-a";

export type Overview = {
  aiReplies: number;
  received: number;
  human: number;
  newContacts: number;
  conversations: { aiOnly: number; humanOnly: number; mixed: number };
  recent: { sender: string; ts: number; who: string | null }[];
};
export type Prep = {
  score: number;
  items: { group: string; label: string; detail: string; points: number; max: number; tab: string }[];
  groups: { group: string; points: number; max: number }[];
};
export type TabProps = {
  agent: Agent;
  settings: AgentSettings;
  update: (fn: (s: AgentSettings) => AgentSettings) => void;
  saveNow: (s?: AgentSettings) => Promise<void>;
  reload: () => Promise<void>;
  notify: (m: string) => void;
  goTo: (tab: TabId) => void;
};

export const TABS = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "instructions", label: "Instructions de l'IA" },
  { id: "hours", label: "Heures d'activité" },
  { id: "media", label: "Média" },
  { id: "faq", label: "FAQ et connaissances" },
  { id: "capabilities", label: "Capacités de l'IA" },
  { id: "tags", label: "Tags" },
  { id: "followups", label: "Suivis" },
  { id: "entry", label: "Points d'entrée" },
  { id: "try", label: "Essayer" },
] as const;
export type TabId = (typeof TABS)[number]["id"];

export function AgentEditor({ id }: { id: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "overview") as TabId;
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ agent: Agent; overview: Overview; preparation: Prep } | null>(null);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [missing, setMissing] = useState(false);

  const notify = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 3500);
  }, []);

  const reload = useCallback(
    async (resetSettings = false) => {
      const res = await fetch(`/api/agents/${id}?days=${days}`, { cache: "no-store" });
      if (res.status === 404) return setMissing(true);
      if (!res.ok) return;
      const body = await res.json();
      setData(body);
      setSettings((cur) => (resetSettings || !cur ? body.agent.settings : cur));
      if (resetSettings) setDirty(false);
    },
    [id, days],
  );

  useEffect(() => {
    const t = setTimeout(() => void reload(), 0);
    return () => clearTimeout(t);
  }, [reload]);

  const update = (fn: (s: AgentSettings) => AgentSettings) => {
    setSettings((s) => (s ? fn(s) : s));
    setDirty(true);
  };

  async function saveNow(s = settings ?? undefined) {
    if (!s) return;
    setSaving(true);
    const res = await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: s, note: `Onglet ${TABS.find((t) => t.id === tab)?.label}` }),
    });
    setSaving(false);
    if (!res.ok) return notify("Échec de l'enregistrement.");
    setDirty(false);
    notify("Modifications enregistrées.");
    await reload(true);
  }

  async function patchAgent(body: object, message: string) {
    await fetch(`/api/agents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    notify(message);
    await reload();
  }

  async function optimize() {
    if (dirty && !window.confirm("Des modifications ne sont pas enregistrées. L'optimisation repart des instructions enregistrées. Continuer ?")) return;
    setOptimizing(true);
    const res = await fetch(`/api/agents/${id}/optimize`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setOptimizing(false);
    if (!res.ok) return notify(body.error ?? "Échec de l'optimisation.");
    notify("Instructions optimisées (l'ancienne version est dans l'historique).");
    await reload(true);
    goTo("instructions");
  }

  function goTo(next: TabId) {
    if (dirty) void saveNow();
    const url = new URLSearchParams(params.toString());
    url.set("tab", next);
    router.replace(`/agents/${id}?${url.toString()}`, { scroll: false });
  }

  if (missing) {
    return (
      <main className="p-10">
        <p>Cet agent n&apos;existe plus.</p>
        <Link href="/agents" className="text-blue-700 underline">
          Retour aux agents
        </Link>
      </main>
    );
  }
  if (!data || !settings) return <main className="p-10 text-sm text-zinc-500">Chargement…</main>;

  const { agent, overview, preparation } = data;

  // Agent encore en construction : on montre la progression plutôt qu'un score incomplet.
  if (agent.preparing) {
    return (
      <main className="mx-auto w-full max-w-3xl px-8 py-10">
        <Link href="/agents" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← Agents IA
        </Link>
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white px-8 py-10 shadow-sm">
          <BuildProgress agentId={agent.id} onDone={() => void reload(true)} />
        </div>
      </main>
    );
  }
  const index = TABS.findIndex((t) => t.id === tab);
  const done = (t: TabId) => preparation.items.filter((i) => i.tab === t).every((i) => i.points === i.max) && preparation.items.some((i) => i.tab === t);
  const props: TabProps = { agent, settings, update, saveNow, reload: () => reload(true), notify, goTo };

  return (
    <main className="mx-auto w-full max-w-7xl px-8 py-8">
      {/* En-tête */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/agents" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← Agents IA
        </Link>
        <span className="text-zinc-300">/</span>
        <h1 className="text-xl font-bold">{agent.name}</h1>
        <button
          onClick={() => patchAgent({ status: agent.status === "active" ? "paused" : "active" }, agent.status === "active" ? "Agent mis en pause." : "Agent activé.")}
          title="Cliquer pour changer"
          className={`rounded-full px-3 py-1 text-xs font-bold ${agent.status === "active" ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"}`}
        >
          {agent.status === "active" ? "● ACTIF" : "EN PAUSE"}
        </button>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${
            preparation.score >= 80 ? "bg-blue-50 text-blue-700 ring-blue-200" : preparation.score >= 50 ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-red-50 text-red-700 ring-red-200"
          }`}
        >
          ● {preparation.score} /100
        </span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setVersionsOpen(true)} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50">
            <UiIcon name="clock" size={15} className="mr-1 inline-block align-[-3px]" />Historique des versions
          </button>
          <button onClick={optimize} disabled={optimizing} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50 disabled:text-zinc-400">
            {optimizing ? "L'IA optimise…" : "Optimiser avec l'IA"}
          </button>
        </div>
      </div>

      <div className="mt-6 flex gap-8">
        {/* Menu des onglets */}
        <nav className="w-56 shrink-0">
          <ol className="space-y-1">
            {TABS.map((t, i) => (
              <li key={t.id}>
                <button
                  onClick={() => goTo(t.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${
                    t.id === tab ? "bg-zinc-100 font-semibold text-zinc-900" : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  <span>
                    <span className="mr-1.5 text-zinc-400">{i + 1}.</span>
                    {t.label}
                  </span>
                  {done(t.id) && <span className="text-blue-600">✓</span>}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {/* Contenu */}
        <div className="min-w-0 flex-1 space-y-5 pb-28">
          {tab === "overview" && <OverviewTab {...props} overview={overview} preparation={preparation} days={days} setDays={setDays} patchAgent={patchAgent} />}
          {tab === "instructions" && <InstructionsTab {...props} />}
          {tab === "hours" && <HoursTab {...props} />}
          {tab === "media" && <MediaTab {...props} />}
          {tab === "faq" && <FaqTab {...props} />}
          {tab === "capabilities" && <CapabilitiesTab {...props} />}
          {tab === "tags" && <TagsTab {...props} />}
          {tab === "followups" && <FollowupsTab {...props} />}
          {tab === "entry" && <EntryTab {...props} />}
          {tab === "try" && <TryTab {...props} />}
        </div>
      </div>

      {/* Barre du bas */}
      <div className="fixed right-8 bottom-5 left-[19rem] z-20 mx-auto flex max-w-6xl items-center gap-3 rounded-2xl border border-zinc-200 bg-white/95 px-5 py-3 shadow-lg backdrop-blur">
        <button
          onClick={() => index > 0 && goTo(TABS[index - 1].id)}
          disabled={index === 0}
          className="rounded-xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 disabled:text-zinc-300"
        >
          ← Retour
        </button>
        {dirty && <span className="text-sm text-amber-700">Modifications non enregistrées</span>}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => saveNow()}
            disabled={!dirty || saving}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 disabled:text-zinc-400"
          >
            {saving ? "Enregistrement…" : "Enregistrer les modifications"}
          </button>
          {index < TABS.length - 1 && (
            <button onClick={() => goTo(TABS[index + 1].id)} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Continuer →
            </button>
          )}
        </div>
      </div>

      {versionsOpen && <VersionsModal id={id} onClose={() => setVersionsOpen(false)} onRestored={() => reload(true).then(() => notify("Version restaurée."))} />}

      {toast && (
        <div role="status" className="fixed top-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

function VersionsModal({ id, onClose, onRestored }: { id: number; onClose: () => void; onRestored: () => void }) {
  const [versions, setVersions] = useState<{ id: number; note: string | null; createdAt: number }[] | null>(null);
  useEffect(() => {
    void fetch(`/api/agents/${id}/versions`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setVersions(b.versions));
  }, [id]);

  async function restore(versionId: number) {
    if (!window.confirm("Restaurer cette version ? Les réglages actuels seront gardés dans l'historique.")) return;
    await fetch(`/api/agents/${id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versionId }) });
    onRestored();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Historique des versions</h2>
        <p className="text-sm text-zinc-500">Une version est gardée à chaque enregistrement (30 dernières).</p>
        <ul className="mt-4 divide-y divide-zinc-100">
          {versions?.length === 0 && <li className="py-4 text-sm text-zinc-500">Aucune version pour l&apos;instant.</li>}
          {versions?.map((v) => (
            <li key={v.id} className="flex items-center justify-between py-3 text-sm">
              <span>
                <span className="font-medium">{new Date(v.createdAt).toLocaleString("fr-FR")}</span>
                <span className="block text-xs text-zinc-500">Avant : {v.note ?? "modification"}</span>
              </span>
              <button onClick={() => restore(v.id)} className="rounded-lg border border-zinc-200 px-3 py-1.5 hover:bg-zinc-50">
                Restaurer
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
