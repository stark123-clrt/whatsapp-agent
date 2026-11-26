"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Agent, AgentWithStats } from "@/lib/kb";
import { NewAgentModal } from "./new-agent-modal";

const LANG_LABEL: Record<string, string> = {
  fr: "FR Français", en: "EN Anglais", es: "ES Espagnol", de: "DE Allemand", it: "IT Italien", pt: "PT Portugais", nl: "NL Néerlandais", ar: "AR Arabe",
};

function ago(ts: number) {
  const s = (ts - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (Math.abs(s) < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (Math.abs(s) < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

export function AgentsClient() {
  const [agents, setAgents] = useState<AgentWithStats[] | null>(null);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/agents", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setAgents((await res.json()).agents);
  }, []);

  // Rafraîchit souvent pendant qu'un agent se prépare (lecture des pages).
  const preparing = agents?.some((a) => a.preparing || a.pages.pending > 0);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, preparing ? 2500 : 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load, preparing]);

  async function patch(id: number, body: Partial<Agent>) {
    await fetch(`/api/agents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    void load();
  }

  const [deleting, setDeleting] = useState<AgentWithStats | null>(null);
  const remove = (a: AgentWithStats) => setDeleting(a);

  const list = (agents ?? []).filter(
    (a) => (filter === "all" || a.status === filter) && a.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Agents IA 🧠</h1>
          <p className="mt-1 text-zinc-600">Tes agents IA : leurs instructions, leurs connaissances et leur façon de répondre.</p>
        </div>
        <button onClick={() => setCreating(true)} className="rounded-xl bg-green-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-green-700">
          ＋ Nouvel agent
        </button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card label="Total" value={agents?.length ?? 0} icon="🤖" />
        <Card label="Actif" value={agents?.filter((a) => a.status === "active").length ?? 0} icon="⚡" />
        <Card label="En pause" value={agents?.filter((a) => a.status === "paused").length ?? 0} icon="⏸️" />
      </div>

      {agents && <WhoAnswers agents={agents} />}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher des agents…"
          className="w-64 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-400"
        />
        <div className="flex rounded-xl border border-zinc-200 bg-white p-1 text-sm">
          {(["all", "active", "paused"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-4 py-1.5 ${filter === f ? "bg-zinc-100 font-medium" : "text-zinc-500"}`}
            >
              {{ all: "Tous", active: "Actif", paused: "En pause" }[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs tracking-wide text-zinc-500 uppercase">
              <th className="px-5 py-3 font-semibold">Agent</th>
              <th className="px-3 py-3 font-semibold">Langue</th>
              <th className="px-3 py-3 font-semibold">Modèle</th>
              <th className="px-3 py-3 text-right font-semibold">Envoyés</th>
              <th className="px-3 py-3 text-right font-semibold">Discussions</th>
              <th className="px-3 py-3 font-semibold">Statut</th>
              <th className="px-3 py-3 font-semibold">Préparation</th>
              <th className="px-3 py-3 font-semibold">Créé</th>
              <th className="px-3 py-3 font-semibold">Modifié</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents && list.length === 0 && (
              <tr>
                <td colSpan={10} className="px-5 py-10 text-center text-zinc-500">
                  {agents.length === 0 ? "Aucun agent pour l'instant. Clique sur « Nouvel agent »." : "Aucun résultat."}
                </td>
              </tr>
            )}
            {list.map((a) => (
              <tr key={a.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/60">
                <td className="px-5 py-4">
                  <button onClick={() => router.push(`/agents/${a.id}`)} className="flex items-center gap-3 text-left">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-lg">{a.role === "sales" ? "🛍️" : "🛟"}</span>
                    <span>
                      <span className="block font-semibold hover:underline">{a.name}</span>
                      <span className="text-xs text-zinc-500">
                        {a.role === "sales" ? "Ventes" : "Support"}
                        {a.isDefault && " · répond aux nouvelles conversations"}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-4 text-zinc-600">{LANG_LABEL[a.language] ?? a.language}</td>
                <td className="px-3 py-4">
                  <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">DeepSeek</span>
                </td>
                <td className="px-3 py-4 text-right tabular-nums">{a.sent}</td>
                <td className="px-3 py-4 text-right tabular-nums">{a.replies}</td>
                <td className="px-3 py-4">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                      a.status === "active" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {a.status === "active" ? "● ACTIF" : "⏸ EN PAUSE"}
                  </span>
                </td>
                <td className="px-3 py-4">
                  <Preparation a={a} />
                </td>
                <td className="px-3 py-4 text-zinc-500">{ago(a.createdAt)}</td>
                <td className="px-3 py-4 text-zinc-500">{ago(a.updatedAt)}</td>
                <td className="px-5 py-4">
                  <div className="flex justify-end gap-1">
                    <IconBtn
                      label={a.status === "active" ? "Mettre en pause" : "Activer"}
                      onClick={() => patch(a.id, { status: a.status === "active" ? "paused" : "active" })}
                    >
                      {a.status === "active" ? "⏸" : "▶"}
                    </IconBtn>
                    <IconBtn label="Modifier" onClick={() => router.push(`/agents/${a.id}`)}>
                      ✏️
                    </IconBtn>
                    <IconBtn label="Supprimer" onClick={() => remove(a)} danger>
                      🗑️
                    </IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleting && (
        <DeleteAgentModal
          agent={deleting}
          others={(agents ?? []).filter((x) => x.id !== deleting.id)}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            void load();
          }}
        />
      )}
      {creating && (
        <NewAgentModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.push(`/agents/${id}`);
          }}
          onBackground={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
    </main>
  );
}

/** Supprimer un agent sans jamais perdre ses discussions : désactiver, ou choisir qui les reprend. */
function DeleteAgentModal({
  agent,
  others,
  onClose,
  onDone,
}: {
  agent: AgentWithStats;
  others: AgentWithStats[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [chatCount, setChatCount] = useState<number | null>(null);
  const [target, setTarget] = useState(others[0] ? String(others[0].id) : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`/api/agents/${agent.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setChatCount(d.chatCount ?? 0));
  }, [agent.id]);

  async function deactivate() {
    setBusy(true);
    await fetch(`/api/agents/${agent.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paused" }) });
    onDone();
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/agents/${agent.id}?reassignTo=${target || "none"}`, { method: "DELETE" });
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Supprimer l&apos;agent « {agent.name} » ?</h2>
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          💡 <strong>Tu peux plutôt le désactiver</strong> : il ne répond plus, mais tu gardes ses instructions et ses connaissances pour le réactiver plus tard.
          <button onClick={deactivate} disabled={busy} className="mt-2 block rounded-lg bg-white px-3 py-1.5 font-medium ring-1 ring-green-300 hover:bg-green-100">
            Désactiver plutôt
          </button>
        </div>
        <p className="mt-5 text-sm text-zinc-600">
          Si tu le supprimes : ses instructions, ses sources et ses {agent.faqCount} FAQ sont effacées. <strong>Ses discussions sont conservées</strong>, et les
          messages qu&apos;il a écrits restent signés « {agent.name} (agent supprimé) ».
        </p>
        <label className="mt-4 block text-sm font-medium text-zinc-700">
          Qui reprend ses {chatCount ?? "…"} discussion{chatCount === 1 ? "" : "s"} ?
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm">
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value="">Personne : l&apos;IA reste en pause dans ces discussions</option>
          </select>
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button onClick={remove} disabled={busy} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-red-300">
            Supprimer l&apos;agent
          </button>
        </div>
      </div>
    </div>
  );
}

function Preparation({ a }: { a: AgentWithStats }) {
  const { total, ready, errors, pending } = a.pages;
  if (a.preparing || pending > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-600" />
        En construction… {total ? `${ready + errors}/${total} pages` : ""}
      </span>
    );
  }
  if (!a.instructions.trim()) return <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">● Action requise : instructions</span>;
  return (
    <Link href="/base-de-connaissances" className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:underline">
      ● Prêt · {a.faqCount} FAQ{errors ? ` · ${errors} erreur${errors > 1 ? "s" : ""}` : ""}
    </Link>
  );
}


function Card({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-5 py-4">
      <div>
        <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </div>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-50 text-xl">{icon}</span>
    </div>
  );
}

function IconBtn({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg ${danger ? "hover:bg-red-50" : "hover:bg-zinc-100"}`}
    >
      {children}
    </button>
  );
}

type Effective = { id: number; name: string; status: "active" | "paused" } | null;
const CHANNEL_ROWS = [
  { id: "whatsapp", label: "WhatsApp", color: "#25D366" },
  { id: "web", label: "Site web (widget)", color: "#a855f7" },
] as const;

/** « Qui répond aux nouvelles conversations » : l'agent de chaque canal. */
function WhoAnswers({ agents }: { agents: AgentWithStats[] }) {
  const [routing, setRouting] = useState<Record<string, number | null> | null>(null);
  const [effective, setEffective] = useState<Record<string, Effective>>({});

  const load = useCallback(async () => {
    const r = await fetch("/api/routing", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as { routing: Record<string, number | null>; effective: Record<string, Effective> };
    setRouting(d.routing);
    setEffective(d.effective);
  }, []);

  // Recharge aussi quand un agent change (pause, suppression…).
  const signature = agents.map((a) => `${a.id}:${a.status}:${a.isDefault}`).join("|");
  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load, signature]);

  async function choose(channel: string, value: string) {
    const agentId = value === "auto" ? null : Number(value);
    setRouting((r) => ({ ...r, [channel]: agentId }));
    await fetch("/api/routing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, agentId }) });
    void load();
  }

  const live = CHANNEL_ROWS.every((c) => effective[c.id]?.status === "active");
  const active = agents.filter((a) => a.status === "active");
  const main = agents.find((a) => a.isDefault);
  const autoLabel = main ? `Automatique : agent principal (${main.name}${main.status === "paused" ? ", en pause" : ""})` : active.length === 1 ? `Automatique (${active[0].name})` : "Automatique (personne)";

  return (
    <section className="mt-4 rounded-2xl border border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-100 px-5 py-3.5">
        <div>
          <p className="font-semibold">Qui répond aux nouvelles conversations</p>
          <p className="text-xs text-zinc-500">Un agent par canal. Une conversation déjà commencée garde son agent (change-le depuis la discussion).</p>
        </div>
        {routing && (
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ${live ? "bg-green-50 text-green-700 ring-green-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>
            ● {live ? "En direct" : `${CHANNEL_ROWS.filter((c) => effective[c.id]?.status !== "active").length} canal sans réponse`}
          </span>
        )}
      </div>
      <div className="divide-y divide-zinc-100">
        {CHANNEL_ROWS.map((c) => {
          const eff = effective[c.id];
          const value = routing?.[c.id] ?? null;
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-3 text-sm">
              <span className="flex w-44 items-center gap-2 font-medium">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                {c.label}
              </span>
              <select
                value={value === null ? "auto" : String(value)}
                onChange={(e) => choose(c.id, e.target.value)}
                disabled={!routing}
                className="min-w-64 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
              >
                <option value="auto">{autoLabel}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.status === "paused" ? " (en pause)" : ""}
                  </option>
                ))}
                <option value="0">Personne ne répond</option>
              </select>
              <span className={`ml-auto text-xs ${eff?.status === "active" ? "text-green-700" : "text-amber-700"}`}>
                {eff
                  ? eff.status === "active"
                    ? `✓ ${eff.name} répond`
                    : `⏸ ${eff.name} est en pause : aucune réponse sur ce canal`
                  : value === 0
                    ? "Aucune réponse automatique"
                    : "⚠ Aucun agent actif pour ce canal"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
