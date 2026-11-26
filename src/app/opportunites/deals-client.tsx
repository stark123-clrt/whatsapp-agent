"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Deal, DealPriority, Pipeline, Stage } from "@/lib/deals-types";
import { Avatar } from "../avatar";
import { DealModal } from "./deal-modal";
import { ICONS, Icon, PRIORITY, StageIcon, contactName, eur, type ContactLite } from "./shared";
import { StagesModal } from "./stages-modal";

const DAY = 86_400_000;
type View = "kanban" | "list" | "table";
type Data = { pipelines: Pipeline[]; stages: Stage[]; deals: Deal[]; contacts: ContactLite[] };

const sameMonth = (ts: number | null, now: number) => {
  if (!ts) return false;
  const a = new Date(ts);
  const b = new Date(now);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
};
const closeTs = (d: Deal) => (d.closeDate ? new Date(`${d.closeDate}T23:59:59`).getTime() : null);

export function DealsClient() {
  const [data, setData] = useState<Data | null>(null);
  const [pipelineId, setPipelineId] = useState<number | null>(null);
  const [segment, setSegment] = useState("all");
  const [chips, setChips] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<{ priority: DealPriority | ""; contact: "" | "with" | "without"; tag: string }>({ priority: "", contact: "", tag: "" });
  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState<View>("kanban");
  const [editing, setEditing] = useState<{ deal: Deal | null; stageId: number } | null>(null);
  const [stagesOpen, setStagesOpen] = useState<"edit" | "new" | null>(null);
  const [now, setNow] = useState(0);
  const search = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/deals", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as Data;
    setNow(Date.now());
    setData(d);
    setPipelineId((cur) => (cur && d.pipelines.some((p) => p.id === cur) ? cur : (d.pipelines[0]?.id ?? null)));
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      const v = localStorage.getItem("deals_view") as View | null;
      if (v === "kanban" || v === "list" || v === "table") setView(v);
      const p = Number(localStorage.getItem("deals_pipeline"));
      if (p) setPipelineId(p);
      void load();
    }, 0);
    // « / » pour aller dans la recherche.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [load]);

  const pipeline = data?.pipelines.find((p) => p.id === pipelineId) ?? data?.pipelines[0] ?? null;
  const stages = useMemo(() => (data && pipeline ? data.stages.filter((s) => s.pipelineId === pipeline.id) : []), [data, pipeline]);
  const stageOf = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const contactOf = useMemo(() => new Map((data?.contacts ?? []).map((c) => [c.jid, c])), [data]);
  const deals = useMemo(() => (data ? data.deals.filter((d) => stageOf.has(d.stageId)) : []), [data, stageOf]);
  const isOpen = useCallback((d: Deal) => stageOf.get(d.stageId)?.kind === "open", [stageOf]);
  const isWon = useCallback((d: Deal) => stageOf.get(d.stageId)?.kind === "won", [stageOf]);

  const highValue = useMemo(() => {
    const values = deals.map((d) => d.value).filter((v) => v > 0).sort((a, b) => a - b);
    return values.length ? values[Math.floor(values.length * 0.75)] : Infinity;
  }, [deals]);

  const SEGMENTS: { id: string; label: string; test: (d: Deal) => boolean }[] = [
    { id: "all", label: "Tout", test: () => true },
    { id: "open", label: "Pipeline ouvert", test: isOpen },
    { id: "wonMonth", label: "Gagnées ce mois-ci", test: (d) => isWon(d) && sameMonth(d.wonAt, now) },
    { id: "hot", label: "Opportunités chaudes", test: (d) => isOpen(d) && d.probability >= 70 },
    { id: "idle", label: "Inactif 14j+", test: (d) => isOpen(d) && now - d.updatedAt > 14 * DAY },
    { id: "closeMonth", label: "Clôture ce mois-ci", test: (d) => sameMonth(closeTs(d), now) },
  ];
  const CHIPS: { id: string; label: string; test: (d: Deal) => boolean }[] = [
    { id: "value", label: "Valeur élevée", test: (d) => d.value > 0 && d.value >= highValue },
    { id: "close7", label: "Clôture 7 j", test: (d) => isOpen(d) && closeTs(d) !== null && closeTs(d)! - now < 7 * DAY && closeTs(d)! >= now - DAY },
    { id: "late", label: "En retard", test: (d) => isOpen(d) && closeTs(d) !== null && closeTs(d)! < now },
    { id: "high", label: "Priorité haute", test: (d) => d.priority === "high" },
    { id: "nocontact", label: "Sans contact", test: (d) => !d.jid },
  ];

  const seg = SEGMENTS.find((s) => s.id === segment) ?? SEGMENTS[0];
  const shown = deals.filter((d) => {
    if (!seg.test(d)) return false;
    for (const c of chips) if (!CHIPS.find((x) => x.id === c)?.test(d)) return false;
    if (filter.priority && d.priority !== filter.priority) return false;
    if (filter.contact === "with" && !d.jid) return false;
    if (filter.contact === "without" && d.jid) return false;
    if (filter.tag && !d.tags.includes(filter.tag)) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const c = d.jid ? contactOf.get(d.jid) : undefined;
    return [d.title, d.company, contactName(c), d.source, ...d.tags].some((x) => (x ?? "").toLowerCase().includes(q));
  });

  const sum = (list: Deal[]) => list.reduce((n, d) => n + d.value, 0);
  const openDeals = deals.filter(isOpen);
  const wonDeals = deals.filter(isWon);
  const wonMonth = wonDeals.filter((d) => sameMonth(d.wonAt, now));
  const weighted = Math.round(openDeals.reduce((n, d) => n + (d.value * d.probability) / 100, 0));
  const allTags = [...new Set(deals.flatMap((d) => d.tags))].sort();
  const activeFilters = [filter.priority, filter.contact, filter.tag].filter(Boolean).length;

  async function patch(id: number, body: Record<string, unknown>) {
    // Affichage immédiat, puis enregistrement.
    setData((d) => (d ? { ...d, deals: d.deals.map((x) => (x.id === id ? { ...x, ...body, updatedAt: Date.now() } : x)) } : d));
    const r = await fetch(`/api/deals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) void load();
    else void load();
  }

  async function quickAdd(stageId: number, title: string) {
    await fetch("/api/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stageId, title }) });
    void load();
  }

  async function createStage(name: string): Promise<number | null> {
    if (!pipeline) return null;
    const body = [...stages.filter((s) => s.kind === "open"), null, ...stages.filter((s) => s.kind !== "open")].map((s) =>
      s ? { id: s.id, name: s.name, color: s.color, kind: s.kind, triggerTags: s.triggerTags, defaultValue: s.defaultValue, idleDays: s.idleDays, idleTarget: s.idleTarget } : { name, color: "#06b6d4", kind: "open" },
    );
    const r = await fetch(`/api/pipelines/${pipeline.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stages: body }) });
    if (!r.ok) return null;
    const d = (await (await fetch("/api/deals", { cache: "no-store" })).json()) as Data;
    setData(d);
    return d.stages.find((s) => s.pipelineId === pipeline.id && s.name === name.trim() && !stages.some((x) => x.id === s.id))?.id ?? null;
  }

  function choosePipeline(id: number) {
    setPipelineId(id);
    localStorage.setItem("deals_pipeline", String(id));
  }

  function chooseView(v: View) {
    setView(v);
    localStorage.setItem("deals_view", v);
  }

  const firstOpen = stages.find((s) => s.kind === "open")?.id ?? stages[0]?.id ?? 0;

  return (
    <main className="min-h-full bg-zinc-50 px-8 py-7" onClick={() => filterOpen && setFilterOpen(false)}>
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Opportunités</h1>
          <p className="mt-1 text-zinc-500">
            {data ? (
              <>
                {deals.length} opportunité{deals.length > 1 ? "s" : ""} · <span className="font-semibold text-zinc-800">{eur(sum(openDeals))}</span> dans le pipeline
              </>
            ) : (
              "Chargement…"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && data.pipelines.length > 1 && (
            <div className="flex gap-1 rounded-xl border border-zinc-200 bg-white p-1">
              {data.pipelines.map((p) => (
                <button key={p.id} onClick={() => choosePipeline(p.id)} className={`rounded-lg px-3 py-1.5 text-sm ${p.id === pipeline?.id ? "bg-zinc-900 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"}`}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setStagesOpen("new")} className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-600 hover:bg-white">
            <Icon d={ICONS.plus} /> Nouveau pipeline
          </button>
          <button onClick={() => setStagesOpen("edit")} disabled={!pipeline} className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50">
            <Icon d={ICONS.gear} /> Étapes
          </button>
          <button
            onClick={() => setEditing({ deal: null, stageId: firstOpen })}
            disabled={!pipeline}
            className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700"
          >
            <Icon d={ICONS.plus} /> Nouvelle opportunité
          </button>
        </div>
      </div>

      {/* Segments */}
      <div className="mt-6 inline-flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1">
        {SEGMENTS.map((s) => {
          const on = s.id === segment;
          return (
            <button key={s.id} onClick={() => setSegment(s.id)} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition ${on ? "bg-zinc-100 font-semibold text-zinc-900" : "text-zinc-500 hover:text-zinc-800"}`}>
              {s.label}
              <span className={`rounded-md px-1.5 text-xs ${on ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"}`}>{deals.filter(s.test).length}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => setChips(new Set())}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${chips.size === 0 ? "bg-green-600 text-white shadow-sm" : "border border-zinc-200 bg-white text-zinc-600"}`}
        >
          Tous
        </button>
        {CHIPS.map((c) => {
          const on = chips.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() =>
                setChips((prev) => {
                  const next = new Set(prev);
                  if (next.has(c.id)) next.delete(c.id);
                  else next.add(c.id);
                  return next;
                })
              }
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition ${on ? "border-green-600 bg-green-600 font-medium text-white" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"}`}
            >
              {c.label}
              <span className={`rounded-md px-1.5 text-xs ${on ? "bg-white/20" : "bg-zinc-100 text-zinc-500"}`}>{deals.filter(c.test).length}</span>
            </button>
          );
        })}
      </div>

      {/* Chiffres clés */}
      {deals.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Tile icon={ICONS.trend} tone="text-violet-600 bg-violet-50" title="Pipeline ouvert" value={eur(sum(openDeals))} sub={`${openDeals.length} opportunité${openDeals.length > 1 ? "s" : ""}`} />
          <Tile icon={ICONS.target} tone="text-rose-600 bg-rose-50" title="Prévision pondérée" value={eur(weighted)} sub="valeur × probabilité" hint="Ce que le pipeline ouvert devrait rapporter, compte tenu des probabilités." />
          <Tile icon={ICONS.trophy} tone="text-amber-600 bg-amber-50" title="Gagnées ce mois-ci" value={eur(sum(wonMonth))} sub={`${wonMonth.length} opportunité${wonMonth.length > 1 ? "s" : ""}`} />
          <Tile icon={ICONS.coins} tone="text-green-600 bg-green-50" title="Total gagné" value={eur(sum(wonDeals))} sub={`${wonDeals.length} opportunité${wonDeals.length > 1 ? "s" : ""} au total`} />
        </div>
      )}

      {/* Recherche, filtres, vues */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="flex w-full max-w-xs items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 focus-within:border-zinc-400">
          <Icon d={ICONS.search} />
          <input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…" className="w-full bg-transparent text-sm outline-none" />
          {!query && <kbd className="rounded border border-zinc-200 px-1.5 text-[11px] text-zinc-400">/</kbd>}
        </label>
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className={`flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 ${activeFilters ? "border-green-600 text-green-700" : "border-zinc-200"}`}
          >
            <Icon d={ICONS.filter} /> Filtrer {activeFilters > 0 && <span className="rounded-md bg-green-100 px-1.5 text-xs">{activeFilters}</span>}
          </button>
          {filterOpen && (
            <div className="absolute top-full left-0 z-20 mt-2 w-64 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
              <FilterSelect label="Priorité" value={filter.priority} onChange={(v) => setFilter({ ...filter, priority: v as DealPriority | "" })}>
                <option value="">Toutes</option>
                {(Object.keys(PRIORITY) as DealPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY[p].label}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Contact" value={filter.contact} onChange={(v) => setFilter({ ...filter, contact: v as "" | "with" | "without" })}>
                <option value="">Peu importe</option>
                <option value="with">Avec un contact lié</option>
                <option value="without">Sans contact</option>
              </FilterSelect>
              <FilterSelect label="Étiquette" value={filter.tag} onChange={(v) => setFilter({ ...filter, tag: v })}>
                <option value="">Toutes</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </FilterSelect>
              {activeFilters > 0 && (
                <button onClick={() => setFilter({ priority: "", contact: "", tag: "" })} className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
                  Réinitialiser
                </button>
              )}
            </div>
          )}
        </div>
        <div className="ml-auto flex gap-1 rounded-xl border border-zinc-200 bg-white p-1">
          {(
            [
              ["kanban", "Kanban", ICONS.kanban],
              ["list", "Liste", ICONS.list],
              ["table", "Tableau", ICONS.table],
            ] as const
          ).map(([id, text, icon]) => (
            <button key={id} onClick={() => chooseView(id)} className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm ${view === id ? "bg-zinc-100 font-semibold" : "text-zinc-500 hover:text-zinc-800"}`}>
              <Icon d={icon} /> {text}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      {data && deals.length === 0 ? (
        <div className="mt-5 flex flex-col items-center rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center shadow-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-600">
            <Icon d={ICONS.trend} size={28} />
          </span>
          <p className="mt-4 text-lg font-semibold">Aucune opportunité pour le moment</p>
          <p className="mt-1 max-w-md text-sm text-zinc-500">
            Ajoute ta première opportunité, ou laisse l&apos;IA les créer : donne une étiquette déclencheuse à une étape (bouton Étapes), et chaque contact qui la reçoit arrive ici.
          </p>
          <button onClick={() => setEditing({ deal: null, stageId: firstOpen })} className="mt-5 flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700">
            <Icon d={ICONS.plus} /> Nouvelle opportunité
          </button>
        </div>
      ) : view === "kanban" ? (
        <Kanban
          stages={stages}
          deals={shown}
          contactOf={contactOf}
          now={now}
          onOpen={(deal) => setEditing({ deal, stageId: deal.stageId })}
          onAdd={(stageId) => setEditing({ deal: null, stageId })}
          onQuickAdd={quickAdd}
          onMove={(id, stageId) => patch(id, { stageId, position: -Date.now() })}
          onMark={(id, kind) => {
            const target = stages.find((s) => s.kind === kind);
            if (target) void patch(id, { stageId: target.id });
          }}
          onDelete={async (id) => {
            await fetch(`/api/deals/${id}`, { method: "DELETE" });
            void load();
          }}
        />
      ) : (
        <Rows view={view} stages={stages} deals={shown} contactOf={contactOf} now={now} onOpen={(deal) => setEditing({ deal, stageId: deal.stageId })} />
      )}

      {editing && data && (
        <DealModal
          key={editing.deal?.id ?? `new${editing.stageId}`}
          deal={editing.deal}
          stages={stages}
          contacts={data.contacts}
          defaultStageId={editing.stageId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
          onCreateStage={createStage}
        />
      )}
      {stagesOpen && (
        <StagesModal
          pipeline={stagesOpen === "edit" ? pipeline : null}
          stages={stagesOpen === "edit" ? stages : []}
          onClose={() => setStagesOpen(null)}
          onSaved={(id) => {
            setStagesOpen(null);
            if (id) choosePipeline(id);
            void load();
          }}
        />
      )}
    </main>
  );
}

function Tile({ icon, tone, title, value, sub, hint }: { icon: string; tone: string; title: string; value: string; sub: string; hint?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm" title={hint}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon d={icon} size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{title}</p>
        <p className="text-xl font-bold text-zinc-900 tabular-nums">{value}</p>
        <p className="text-xs text-zinc-500">{sub}</p>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{label}</p>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400">
        {children}
      </select>
    </div>
  );
}

type BoardProps = {
  stages: Stage[];
  deals: Deal[];
  contactOf: Map<string, ContactLite>;
  now: number;
  onOpen: (d: Deal) => void;
};

function Kanban({
  stages,
  deals,
  contactOf,
  now,
  onOpen,
  onAdd,
  onQuickAdd,
  onMove,
  onMark,
  onDelete,
}: BoardProps & {
  onAdd: (stageId: number) => void;
  onQuickAdd: (stageId: number, title: string) => void;
  onMove: (id: number, stageId: number) => void;
  onMark: (id: number, kind: "won" | "lost") => void;
  onDelete: (id: number) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [adding, setAdding] = useState<{ stageId: number; title: string } | null>(null);

  return (
    <div className="mt-5 flex gap-4 overflow-x-auto pb-4">
      {stages.map((s) => {
        const list = deals.filter((d) => d.stageId === s.id);
        const total = list.reduce((n, d) => n + d.value, 0);
        const avg = list.length ? Math.round(list.reduce((n, d) => n + d.probability, 0) / list.length) : 0;
        const tint = s.kind === "won" ? "bg-emerald-50/60 border-emerald-200" : s.kind === "lost" ? "bg-red-50/50 border-red-200" : "bg-white border-zinc-200";
        return (
          <section
            key={s.id}
            onDragOver={(e) => {
              if (dragging === null) return;
              e.preventDefault();
              setOver(s.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging !== null) onMove(dragging, s.id);
              setDragging(null);
              setOver(null);
            }}
            className={`flex max-h-[calc(100vh-260px)] min-h-[420px] w-[300px] shrink-0 flex-col rounded-2xl border transition ${tint} ${over === s.id ? "ring-2 ring-green-500/40" : ""}`}
          >
            <header className="px-4 pt-3.5 pb-2">
              <div className="flex items-center gap-2">
                <span className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold tracking-wide uppercase" style={{ color: s.color, background: `${s.color}18` }}>
                  <StageIcon kind={s.kind} color={s.color} size={13} />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500" title="Nombre · probabilité moyenne">
                  {list.length} · {avg} %
                </span>
                <button onClick={() => onAdd(s.id)} aria-label={`Ajouter dans ${s.name}`} className="ml-auto rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800">
                  <Icon d={ICONS.plus} />
                </button>
              </div>
              <p className={`mt-1.5 text-base font-bold tabular-nums ${s.kind === "won" ? "text-emerald-700" : s.kind === "lost" ? "text-red-600" : "text-zinc-800"}`}>{eur(total)}</p>
            </header>

            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-2">
              {list.map((d) => (
                <Card
                  key={d.id}
                  deal={d}
                  contact={d.jid ? contactOf.get(d.jid) : undefined}
                  stage={s}
                  now={now}
                  dragging={dragging === d.id}
                  onDragStart={() => setDragging(d.id)}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  onOpen={() => onOpen(d)}
                  onMark={(k) => onMark(d.id, k)}
                  onDelete={() => onDelete(d.id)}
                />
              ))}
              {!list.length && (
                <div className="flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 px-4 text-center text-xs text-zinc-400">
                  Glisse une opportunité ici ou ajoutes-en une ci-dessous.
                </div>
              )}
            </div>

            <footer className="border-t border-zinc-100/80 p-2">
              {adding?.stageId === s.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (adding.title.trim()) onQuickAdd(s.id, adding.title.trim());
                    setAdding(null);
                  }}
                >
                  <input
                    autoFocus
                    value={adding.title}
                    onChange={(e) => setAdding({ stageId: s.id, title: e.target.value })}
                    onBlur={() => setAdding(null)}
                    onKeyDown={(e) => e.key === "Escape" && setAdding(null)}
                    placeholder="Titre, puis Entrée"
                    className="w-full rounded-lg border border-green-500 bg-white px-3 py-2 text-sm outline-none"
                  />
                </form>
              ) : (
                <button onClick={() => setAdding({ stageId: s.id, title: "" })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-zinc-500 hover:bg-white/80 hover:text-zinc-800">
                  <Icon d={ICONS.plus} /> Ajouter une opportunité
                </button>
              )}
            </footer>
          </section>
        );
      })}
    </div>
  );
}

function Card({
  deal: d,
  contact,
  stage,
  now,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
  onMark,
  onDelete,
}: {
  deal: Deal;
  contact: ContactLite | undefined;
  stage: Stage;
  now: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onMark: (kind: "won" | "lost") => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const due = closeTs(d);
  const late = stage.kind === "open" && due !== null && due < now;
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`group relative cursor-grab rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${dragging ? "rotate-1 opacity-40" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        {contact ? (
          <span className="shrink-0 scale-90">
            <Avatar jid={contact.jid} name={contact.name} phone={contact.phone} channel={contact.channel} />
          </span>
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-500">{d.title.charAt(0).toUpperCase()}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-zinc-900">{d.title}</p>
          {(d.company || contact) && (
            <p className="flex items-center gap-1 truncate text-xs text-zinc-500">
              <Icon d={ICONS.building} size={12} /> {d.company ?? contactName(contact)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center opacity-60 transition group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          {contact && (
            <Link href={`/?c=${encodeURIComponent(contact.jid)}`} title="Ouvrir la discussion" className="rounded-md p-1 text-green-600 hover:bg-green-50">
              <Icon d={ICONS.chat} size={15} />
            </Link>
          )}
          <button onClick={() => setMenu(!menu)} aria-label="Actions" className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800">
            <Icon d={ICONS.dots} size={15} />
          </button>
          {menu && (
            <div className="absolute top-10 right-2 z-10 w-44 rounded-xl border border-zinc-200 bg-white py-1 text-sm shadow-xl" onMouseLeave={() => setMenu(false)}>
              {stage.kind !== "won" && (
                <button onClick={() => onMark("won")} className="block w-full px-3 py-2 text-left text-emerald-700 hover:bg-emerald-50">
                  ✓ Marquer gagnée
                </button>
              )}
              {stage.kind !== "lost" && (
                <button onClick={() => onMark("lost")} className="block w-full px-3 py-2 text-left text-zinc-600 hover:bg-zinc-50">
                  ✕ Marquer perdue
                </button>
              )}
              <button onClick={onDelete} className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50">
                Supprimer
              </button>
            </div>
          )}
        </div>
      </div>

      {d.description && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-500">{d.description}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className={`rounded-md px-1.5 py-0.5 font-semibold ${d.probability >= 70 ? "bg-green-50 text-green-700" : d.probability >= 40 ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-500"}`}>{d.probability} %</span>
        {d.priority !== "none" && (
          <span className="flex items-center gap-1 rounded-md border border-zinc-200 px-1.5 py-0.5 text-zinc-600">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: PRIORITY[d.priority].color }} />
            {PRIORITY[d.priority].label}
          </span>
        )}
        {d.closeDate && (
          <span className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${late ? "border-red-200 bg-red-50 text-red-600" : "border-zinc-200 text-zinc-600"}`} title={late ? "Date de clôture dépassée" : "Date de clôture"}>
            <Icon d={ICONS.calendar} size={12} />
            {new Date(`${d.closeDate}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </span>
        )}
        {d.tags.length > 0 && (
          <span className="flex items-center gap-1 rounded-md border border-zinc-200 px-1.5 py-0.5 text-zinc-600" title={d.tags.join(", ")}>
            <Icon d={ICONS.tag} size={12} /> {d.tags.length}
          </span>
        )}
        <span className="ml-auto font-bold text-zinc-800 tabular-nums">{eur(d.value)}</span>
      </div>
    </article>
  );
}

function Rows({ view, stages, deals, contactOf, now, onOpen }: BoardProps & { view: "list" | "table" }) {
  const [sort, setSort] = useState<{ by: "title" | "value" | "probability" | "close" | "updated"; dir: 1 | -1 }>({ by: "updated", dir: -1 });
  const stageOf = new Map(stages.map((s) => [s.id, s]));

  if (view === "list") {
    return (
      <div className="mt-5 space-y-4">
        {stages.map((s) => {
          const list = deals.filter((d) => d.stageId === s.id);
          if (!list.length) return null;
          return (
            <section key={s.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <header className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3">
                <StageIcon kind={s.kind} color={s.color} />
                <span className="font-semibold">{s.name}</span>
                <span className="text-sm text-zinc-400">{list.length}</span>
                <span className="ml-auto font-semibold tabular-nums">{eur(list.reduce((n, d) => n + d.value, 0))}</span>
              </header>
              {list.map((d) => (
                <button key={d.id} onClick={() => onOpen(d)} className="flex w-full items-center gap-4 border-b border-zinc-50 px-5 py-3 text-left text-sm last:border-0 hover:bg-zinc-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.title}</span>
                    <span className="block truncate text-xs text-zinc-500">{[d.company, contactName(d.jid ? contactOf.get(d.jid) : undefined)].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                  {d.priority !== "none" && <span className="h-2 w-2 rounded-full" style={{ background: PRIORITY[d.priority].color }} title={PRIORITY[d.priority].label} />}
                  <span className="w-12 text-right text-zinc-500">{d.probability} %</span>
                  <span className="w-24 text-right font-semibold tabular-nums">{eur(d.value)}</span>
                </button>
              ))}
            </section>
          );
        })}
        {!deals.length && <p className="py-10 text-center text-sm text-zinc-500">Aucune opportunité ne correspond.</p>}
      </div>
    );
  }

  const key = (d: Deal) => (sort.by === "title" ? d.title.toLowerCase() : sort.by === "value" ? d.value : sort.by === "probability" ? d.probability : sort.by === "close" ? (closeTs(d) ?? Infinity) : d.updatedAt);
  const sorted = [...deals].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  });
  const th = (by: typeof sort.by, text: string, right?: boolean) => (
    <th className={`px-4 py-3 ${right ? "text-right" : ""}`}>
      <button onClick={() => setSort((s) => ({ by, dir: s.by === by ? (s.dir === 1 ? -1 : 1) : -1 }))} className={`uppercase hover:text-zinc-800 ${sort.by === by ? "text-zinc-800" : ""}`}>
        {text} {sort.by === by ? (sort.dir === 1 ? "↑" : "↓") : ""}
      </button>
    </th>
  );

  return (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-zinc-100 text-left text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
            {th("title", "Opportunité")}
            <th className="px-4 py-3">Contact</th>
            <th className="px-4 py-3">Étape</th>
            {th("value", "Valeur", true)}
            {th("probability", "Probabilité", true)}
            <th className="px-4 py-3">Priorité</th>
            {th("close", "Clôture")}
            {th("updated", "Mise à jour")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => {
            const s = stageOf.get(d.stageId);
            const c = d.jid ? contactOf.get(d.jid) : undefined;
            const due = closeTs(d);
            return (
              <tr key={d.id} onClick={() => onOpen(d)} className="cursor-pointer border-b border-zinc-50 hover:bg-zinc-50/70">
                <td className="px-4 py-3">
                  <span className="block font-semibold">{d.title}</span>
                  {d.company && <span className="text-xs text-zinc-500">{d.company}</span>}
                </td>
                <td className="px-4 py-3 text-zinc-600">{contactName(c) ?? <span className="text-zinc-300">—</span>}</td>
                <td className="px-4 py-3">
                  {s && (
                    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold uppercase" style={{ color: s.color, background: `${s.color}18` }}>
                      <StageIcon kind={s.kind} color={s.color} size={12} /> {s.name}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{eur(d.value)}</td>
                <td className="px-4 py-3 text-right text-zinc-600">{d.probability} %</td>
                <td className="px-4 py-3">
                  {d.priority === "none" ? (
                    <span className="text-zinc-300">—</span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: PRIORITY[d.priority].color }} />
                      {PRIORITY[d.priority].label}
                    </span>
                  )}
                </td>
                <td className={`px-4 py-3 ${s?.kind === "open" && due && due < now ? "font-medium text-red-600" : "text-zinc-600"}`}>
                  {d.closeDate ? new Date(`${d.closeDate}T12:00:00`).toLocaleDateString("fr-FR") : <span className="text-zinc-300">—</span>}
                </td>
                <td className="px-4 py-3 text-zinc-500">{new Date(d.updatedAt).toLocaleDateString("fr-FR")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!deals.length && <p className="py-10 text-center text-sm text-zinc-500">Aucune opportunité ne correspond.</p>}
    </div>
  );
}
