"use client";

import { Icon as UiIcon } from "@/app/icons";

import { useCallback, useEffect, useState } from "react";
import type { Faq, KbPage, KbSource } from "@/lib/kb";
import { FaqSection } from "./faq-section";

type Data = { sources: KbSource[]; manualFaqs: Faq[]; agents: { id: number; name: string }[] };

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function KbClient() {
  const [data, setData] = useState<Data | null>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [closed, setClosed] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch("/api/kb", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, []);

  const busy = data?.sources.some((s) => s.pages.some((p) => p.status === "pending" || p.status === "processing"));
  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, busy ? 2500 : 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load, busy]);

  async function act(url: string, method: "POST" | "DELETE", confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    await fetch(url, { method });
    void load();
  }

  const q = search.trim().toLowerCase();
  const sources = (data?.sources ?? [])
    .map((s) => ({ ...s, pages: s.pages.filter((p) => !q || `${p.url} ${p.title ?? ""} ${s.name}`.toLowerCase().includes(q)) }))
    .filter((s) => s.pages.length > 0 || !q);
  const agentName = (id: number | null) => data?.agents.find((a) => a.id === id)?.name;

  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-10">
      <h1 className="text-3xl font-bold">Base de connaissances</h1>
      <p className="mt-1 text-zinc-600">Tout ce que ton IA utilise pour répondre : sources importées et bibliothèque de FAQ.</p>

      <div className="mt-8 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Pages et fichiers importés</h2>
          <p className="text-sm text-zinc-500">Importe des pages web — l&apos;IA génère des FAQ à partir de leur contenu.</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          disabled={!data?.agents.length}
          title={data?.agents.length ? undefined : "Crée d'abord un agent"}
          className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-300"
        >
          ＋ Ajouter une source
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 p-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher des pages, fichiers et sites web…"
            className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm outline-none focus:border-zinc-400"
          />
        </div>

        {data && sources.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">
            {data.sources.length === 0
              ? "Aucune source pour l'instant. Crée un agent à partir de ton site, ou clique sur « Ajouter une source »."
              : "Aucun résultat."}
          </p>
        )}

        {sources.map((s) => {
          const faqs = s.pages.reduce((n, p) => n + p.faqCount, 0);
          const open = !closed.has(s.id);
          return (
            <div key={s.id} className="border-b border-zinc-100 last:border-0">
              <div className="flex items-center gap-3 px-5 py-3.5">
                <button
                  onClick={() =>
                    setClosed((c) => {
                      const n = new Set(c);
                      if (n.has(s.id)) n.delete(s.id);
                      else n.add(s.id);
                      return n;
                    })
                  }
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <span className={`text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
                  <UiIcon name={s.kind === "site" ? "globe" : "file"} size={16} className="shrink-0 text-zinc-400" />
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-sm text-zinc-500">
                    {s.pages.length} page{s.pages.length > 1 ? "s" : ""} · {faqs} FAQ
                  </span>
                </button>
                {agentName(s.agentId) && <span className="text-xs font-medium text-blue-700"><UiIcon name="link" size={13} className="mr-1 inline-block align-[-3px]" />{agentName(s.agentId)}</span>}
                {s.kind === "site" && (
                  <button onClick={() => act(`/api/kb/sources/${s.id}`, "POST")} className="rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100">
                    ↻ Actualiser
                  </button>
                )}
                <button
                  onClick={() => act(`/api/kb/sources/${s.id}`, "DELETE", `Supprimer « ${s.name} » et ses ${faqs} FAQ ? C'est définitif.`)}
                  className="rounded-lg px-2 py-1 hover:bg-red-50"
                  aria-label="Supprimer la source"
                >
                  <UiIcon name="trash" size={15} />
                </button>
              </div>
              {open && (
                <ul className="pb-2">
                  {s.pages.map((p) => (
                    <PageRow key={p.id} page={p} isSite={s.kind === "site"} onChanged={load} onAction={act} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <FaqSection
        agents={data?.agents ?? []}
        signal={(data?.sources ?? []).reduce((n, src) => n + src.pages.reduce((m, p) => m + p.faqCount, 0), 0)}
        onChanged={load}
      />

      {adding && data && (
        <AddSourceModal
          agents={data.agents}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            void load();
          }}
        />
      )}
    </main>
  );
}

const STATUS: Record<KbPage["status"], { label: string; className: string }> = {
  pending: { label: "EN ATTENTE", className: "bg-zinc-100 text-zinc-600" },
  processing: { label: "LECTURE…", className: "bg-sky-50 text-sky-700" },
  ready: { label: "PRÊT", className: "bg-blue-50 text-blue-700" },
  error: { label: "ERREUR", className: "bg-red-50 text-red-700" },
};

function PageRow({
  page,
  isSite,
  onChanged,
  onAction,
}: {
  page: KbPage;
  isSite: boolean;
  onChanged: () => void;
  onAction: (url: string, method: "POST" | "DELETE", confirmText?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [faqs, setFaqs] = useState<Faq[] | null>(null);

  const loadFaqs = useCallback(async () => {
    const res = await fetch(`/api/kb/pages/${page.id}`, { cache: "no-store" });
    if (res.ok) setFaqs((await res.json()).faqs);
  }, [page.id]);

  const path = isSite ? new URL(page.url).pathname.replace(/\/$/, "") || new URL(page.url).hostname : page.url;
  const st = STATUS[page.status];

  return (
    <li className="mx-4 rounded-xl hover:bg-zinc-50/70">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          onClick={() => {
            setOpen(!open);
            if (!open) void loadFaqs();
          }}
          disabled={page.faqCount === 0}
          className="flex min-w-0 flex-1 items-start gap-2 text-left disabled:cursor-default"
        >
          <span className={`mt-0.5 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{path}</span>
              <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${st.className}`}>● {st.label}</span>
              {page.status === "ready" && <span className="text-xs text-zinc-500">{page.faqCount} FAQ</span>}
            </span>
            {isSite && <span className="block truncate font-mono text-xs text-zinc-400">{page.url}</span>}
            {page.status === "error" && page.error && <span className="block text-xs text-red-600">{page.error}</span>}
          </span>
        </button>
        {isSite && (
          <a href={page.url} target="_blank" rel="noreferrer" className="rounded-lg px-1.5 py-1 hover:bg-zinc-100" aria-label="Ouvrir la page">
            <UiIcon name="link" size={15} />
          </a>
        )}
        <button onClick={() => onAction(`/api/kb/pages/${page.id}`, "POST")} className="rounded-lg px-1.5 py-1 hover:bg-zinc-100" aria-label="Relire la page">
          ↻
        </button>
        <button
          onClick={() => onAction(`/api/kb/pages/${page.id}`, "DELETE", `Supprimer cette page et ses ${page.faqCount} FAQ ?`)}
          className="rounded-lg px-1.5 py-1 hover:bg-red-50"
          aria-label="Supprimer la page"
        >
          <UiIcon name="trash" size={15} />
        </button>
      </div>
      {open && faqs && (
        <div className="mx-3 mb-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          {faqs.map((f) => (
            <FaqItem
              key={f.id}
              faq={f}
              onChanged={() => {
                void loadFaqs();
                onChanged();
              }}
            />
          ))}
        </div>
      )}
    </li>
  );
}

function FaqItem({ faq, onChanged }: { faq: Faq; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState(faq.question);
  const [a, setA] = useState(faq.answer);

  async function save() {
    await fetch(`/api/kb/faqs/${faq.id}`, { method: "PATCH", ...json({ question: q, answer: a }) });
    setEditing(false);
    onChanged();
  }

  async function remove() {
    if (!window.confirm("Supprimer cette FAQ ?")) return;
    await fetch(`/api/kb/faqs/${faq.id}`, { method: "DELETE" });
    onChanged();
  }

  if (editing) {
    return (
      <div className="space-y-2 px-4 py-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:border-zinc-400" />
        <textarea value={a} onChange={(e) => setA(e.target.value)} rows={3} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" />
        <div className="flex justify-end gap-2">
          <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button onClick={save} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Enregistrer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{faq.question}</p>
        {faq.section && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">{faq.section}</span>}
        <span className="text-xs text-zinc-400">utilisé {faq.used}×</span>
        <span className="ml-auto space-x-2 text-xs opacity-0 group-hover:opacity-100">
          <button onClick={() => setEditing(true)} className="text-blue-700 hover:underline">
            Modifier
          </button>
          <button onClick={remove} className="text-red-600 hover:underline">
            Supprimer
          </button>
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-600">{faq.answer}</p>
    </div>
  );
}


function AddSourceModal({ agents, onClose, onAdded }: { agents: { id: number; name: string }[]; onClose: () => void; onAdded: () => void }) {
  const [agentId, setAgentId] = useState(String(agents[0]?.id ?? ""));
  const [website, setWebsite] = useState("");
  const [pages, setPages] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/kb/discover", { method: "POST", ...json({ url: website }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Site inaccessible.");
    setPages(body.pages);
    setPicked(new Set((body.pages as string[]).slice(0, 15)));
  }

  async function add() {
    setBusy(true);
    const res = await fetch("/api/kb/sources", { method: "POST", ...json({ agentId: Number(agentId), website, pages: [...picked] }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Échec.");
    onAdded();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-7 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Ajouter une source</h2>
        <p className="text-sm text-zinc-500">Les pages choisies seront lues et transformées en FAQ pour l&apos;agent.</p>
        <label className="mt-5 block text-sm text-zinc-600">
          Agent
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm">
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 flex gap-2">
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="monsite.com" className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 font-mono text-sm outline-none focus:border-zinc-400" />
          <button onClick={find} disabled={!website.trim() || busy} className="rounded-xl border border-zinc-200 px-4 text-sm hover:bg-zinc-50 disabled:text-zinc-400">
            <UiIcon name="search" size={15} className="mr-1 inline-block align-[-3px]" />Trouver des pages
          </button>
        </div>
        {pages && (
          <ul className="mt-3 max-h-60 overflow-y-auto rounded-xl border border-zinc-200 py-1">
            {pages.map((p) => (
              <li key={p}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-1.5 text-sm hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    className="accent-blue-600"
                    checked={picked.has(p)}
                    disabled={!picked.has(p) && picked.size >= 25}
                    onChange={() =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (n.has(p)) n.delete(p);
                        else n.add(p);
                        return n;
                      })
                    }
                  />
                  <span className="truncate font-mono text-xs">{p.replace(/^https?:\/\//, "")}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 flex items-center justify-end gap-3">
          {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button onClick={add} disabled={busy || picked.size === 0} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300">
            Importer {picked.size || ""} page{picked.size > 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
