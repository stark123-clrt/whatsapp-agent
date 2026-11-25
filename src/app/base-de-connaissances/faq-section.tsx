"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FaqWithSource } from "@/lib/kb";

const PAGE_SIZE = 20;
type Sort = "recent" | "old" | "used";
type Origin = "all" | "source" | "manual";

/** Onglet « Foire aux questions » : toutes les FAQ, quelle que soit leur origine. */
export function FaqSection({
  agents,
  signal,
  onChanged,
}: {
  agents: { id: number; name: string }[];
  signal: number; // change quand les sources changent → on recharge
  onChanged: () => void;
}) {
  const [faqs, setFaqs] = useState<FaqWithSource[] | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [origin, setOrigin] = useState<Origin>("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/kb/faqs", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setFaqs((await res.json()).faqs);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load, signal]);

  const changed = () => {
    void load();
    onChanged();
  };

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (faqs ?? []).filter(
      (f) =>
        (origin === "all" || (origin === "source" ? f.pageId !== null : f.pageId === null)) &&
        (!q || `${f.question} ${f.answer} ${f.section ?? ""}`.toLowerCase().includes(q)),
    );
    return filtered.sort((a, b) =>
      sort === "used" ? b.used - a.used : sort === "old" ? a.createdAt - b.createdAt || a.id - b.id : b.createdAt - a.createdAt || b.id - a.id,
    );
  }, [faqs, search, sort, origin]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = list.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const allShownSelected = shown.length > 0 && shown.every((f) => selected.has(f.id));

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice((n) => (n === message ? null : n)), 4000);
  }

  async function dedupe() {
    const res = await fetch("/api/kb/faqs/dedupe", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    flash(body.removed ? `${body.removed} doublon${body.removed > 1 ? "s" : ""} supprimé${body.removed > 1 ? "s" : ""}` : "Aucun doublon trouvé");
    changed();
  }

  async function bulkDelete() {
    if (!window.confirm(`Supprimer les ${selected.size} FAQ sélectionnées ? C'est définitif.`)) return;
    await fetch("/api/kb/faqs/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    setSelected(new Set());
    changed();
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/kb/faqs/import", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    flash(res.ok ? `${body.imported} FAQ importée${body.imported > 1 ? "s" : ""}` : (body.error ?? "Import impossible"));
    changed();
  }

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          Foire aux questions
          <span className="rounded-md bg-green-50 px-2 py-0.5 text-sm font-semibold text-green-700">{faqs?.length ?? 0}</span>
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {notice && <span className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">{notice}</span>}
          <button onClick={dedupe} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50">
            ✨ Dédupliquer
          </button>
          <div className="relative">
            <button onClick={() => setIoOpen((o) => !o)} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50">
              ⇄ Importer / Exporter
            </button>
            {ioOpen && (
              <>
                <button className="fixed inset-0 z-10 cursor-default" aria-label="Fermer" onClick={() => setIoOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-zinc-200 bg-white py-1.5 text-sm shadow-xl">
                  <button
                    onClick={() => {
                      setIoOpen(false);
                      // Téléchargement du fichier via un lien temporaire.
                      const link = document.createElement("a");
                      link.href = "/api/kb/faqs/export";
                      link.download = "";
                      link.click();
                    }}
                    className="block w-full px-4 py-2 text-left hover:bg-zinc-50"
                  >
                    ⬇️ Exporter en CSV (Excel)
                  </button>
                  <button
                    onClick={() => {
                      setIoOpen(false);
                      importInput.current?.click();
                    }}
                    className="block w-full px-4 py-2 text-left hover:bg-zinc-50"
                  >
                    ⬆️ Importer un CSV ou JSON
                    <span className="block text-xs text-zinc-500">Colonnes : question ; reponse</span>
                  </button>
                </div>
              </>
            )}
            <input
              ref={importInput}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="hidden"
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          <button onClick={() => setCreating(true)} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700">
            ＋ Nouvelle FAQ
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Rechercher des questions et réponses…"
          className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm outline-none focus:border-zinc-400"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={origin}
            onChange={(e) => {
              setOrigin(e.target.value as Origin);
              setPage(0);
            }}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            <option value="all">Toutes les origines</option>
            <option value="source">Depuis une source</option>
            <option value="manual">Ajoutées à la main</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
            <option value="recent">Plus récentes d&apos;abord</option>
            <option value="old">Plus anciennes d&apos;abord</option>
            <option value="used">Plus utilisées d&apos;abord</option>
          </select>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-zinc-200 bg-white">
        <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-3 text-sm">
          <input
            type="checkbox"
            className="accent-green-600"
            checked={allShownSelected}
            onChange={() =>
              setSelected((s) => {
                const n = new Set(s);
                for (const f of shown) {
                  if (allShownSelected) n.delete(f.id);
                  else n.add(f.id);
                }
                return n;
              })
            }
          />
          <span className="text-zinc-600">Tout sélectionner sur cette page</span>
          {selected.size > 0 && (
            <button onClick={bulkDelete} className="ml-auto rounded-lg bg-red-50 px-3 py-1.5 font-medium text-red-700 hover:bg-red-100">
              🗑️ Supprimer {selected.size} FAQ
            </button>
          )}
        </div>

        {faqs && list.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">
            {faqs.length === 0 ? "Aucune FAQ pour l'instant. Importe un site ou clique sur « Nouvelle FAQ »." : "Aucun résultat."}
          </p>
        )}

        <ol>
          {shown.map((f, i) => (
            <FaqRow
              key={f.id}
              faq={f}
              index={current * PAGE_SIZE + i + 1}
              selected={selected.has(f.id)}
              onSelect={() =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (n.has(f.id)) n.delete(f.id);
                  else n.add(f.id);
                  return n;
                })
              }
              onChanged={changed}
            />
          ))}
        </ol>

        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 border-t border-zinc-100 py-3 text-sm">
            <button disabled={current === 0} onClick={() => setPage(current - 1)} className="rounded-lg px-3 py-1 hover:bg-zinc-100 disabled:text-zinc-300">
              ← Précédent
            </button>
            <span className="text-zinc-500">
              Page {current + 1} / {pages}
            </span>
            <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="rounded-lg px-3 py-1 hover:bg-zinc-100 disabled:text-zinc-300">
              Suivant →
            </button>
          </div>
        )}
      </div>

      {creating && (
        <NewFaqModal
          agents={agents}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            changed();
          }}
        />
      )}
    </section>
  );
}

function FaqRow({
  faq,
  index,
  selected,
  onSelect,
  onChanged,
}: {
  faq: FaqWithSource;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState(faq.question);
  const [a, setA] = useState(faq.answer);

  async function save() {
    await fetch(`/api/kb/faqs/${faq.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, answer: a }),
    });
    setEditing(false);
    onChanged();
  }

  async function remove() {
    if (!window.confirm("Supprimer cette FAQ ?")) return;
    await fetch(`/api/kb/faqs/${faq.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <li className="flex gap-4 border-b border-zinc-100 px-5 py-4 last:border-0">
      <input type="checkbox" checked={selected} onChange={onSelect} className="mt-1 accent-green-600" aria-label="Sélectionner" />
      <span className="w-6 shrink-0 pt-0.5 text-right text-sm text-zinc-400">{index}.</span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="space-y-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:border-zinc-400" />
            <textarea value={a} onChange={(e) => setA(e.target.value)} rows={3} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
                Annuler
              </button>
              <button onClick={save} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
                Enregistrer
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{faq.question}</p>
              {faq.pageId !== null ? (
                <span className="rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Depuis la source</span>
              ) : (
                <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">Ajoutée à la main</span>
              )}
              {faq.section && faq.section !== "manuel" && (
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">{faq.section}</span>
              )}
              <span className="text-xs text-zinc-400">utilisé {faq.used}×</span>
            </div>
            <p className="mt-1 line-clamp-3 text-sm text-zinc-600">{faq.answer}</p>
          </>
        )}
      </div>
      {!editing && (
        <div className="flex shrink-0 items-start gap-1">
          {faq.sourceUrl && /^https?:/.test(faq.sourceUrl) && (
            <a href={faq.sourceUrl} target="_blank" rel="noreferrer" title={faq.sourceUrl} className="rounded-lg px-1.5 py-1 hover:bg-zinc-100">
              🔗
            </a>
          )}
          <button onClick={() => setEditing(true)} title="Modifier" className="rounded-lg px-1.5 py-1 hover:bg-zinc-100">
            ✏️
          </button>
          <button onClick={remove} title="Supprimer" className="rounded-lg px-1.5 py-1 hover:bg-red-50">
            🗑️
          </button>
        </div>
      )}
    </li>
  );
}

function NewFaqModal({ agents, onClose, onCreated }: { agents: { id: number; name: string }[]; onClose: () => void; onCreated: () => void }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [agentId, setAgentId] = useState("");

  async function create() {
    const res = await fetch("/api/kb/faqs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, answer: a, agentId: agentId ? Number(agentId) : null }),
    });
    if (res.ok) onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Nouvelle FAQ</h2>
        <div className="mt-4 space-y-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Question (ex. Livrez-vous en Belgique ?)" className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm outline-none focus:border-zinc-400" />
          <textarea value={a} onChange={(e) => setA(e.target.value)} rows={4} placeholder="Réponse" className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm outline-none focus:border-zinc-400" />
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm">
            <option value="">Pour tous les agents</option>
            {agents.map((ag) => (
              <option key={ag.id} value={ag.id}>
                Seulement pour {ag.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button onClick={create} disabled={!q.trim() || !a.trim()} className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-green-300">
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
