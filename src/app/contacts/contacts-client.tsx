"use client";

import { Icon as UiIcon, type IconName } from "@/app/icons";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHANNELS } from "@/lib/channels";
import type { Contact, ContactStatus } from "@/lib/contacts";
import type { Channel } from "@/lib/db";
import { Avatar } from "../avatar";

const DAY = 86_400_000;

const STATUS: Record<ContactStatus, { label: string; cls: string; icon?: IconName }> = {
  engage: { label: "ENGAGÉ", cls: "bg-orange-50 text-orange-600", icon: "spark" },
  nouveau: { label: "NOUVEAU", cls: "bg-sky-50 text-sky-600", icon: "sparkles" },
  "a-relancer": { label: "À RELANCER", cls: "bg-amber-50 text-amber-700" },
  inactif: { label: "INACTIF", cls: "bg-zinc-100 text-zinc-500" },
  client: { label: "CLIENT", cls: "bg-blue-50 text-blue-700", icon: "star" },
  dnd: { label: "NE PAS DÉRANGER", cls: "bg-red-50 text-red-600" },
};

/** Onglets (un seul actif) */
const SEGMENTS: { id: string; label: string; test: (c: Contact, now: number) => boolean }[] = [
  { id: "all", label: "Tous", test: () => true },
  { id: "hot", label: "Leads chauds", test: (c) => c.score >= 70 && !c.dnd },
  { id: "replied", label: "A répondu cette semaine", test: (c, now) => Boolean(c.lastInbound && now - c.lastInbound < 7 * DAY) },
  { id: "inactive", label: "Inactif (30j+)", test: (c, now) => now - (c.lastInbound ?? c.createdAt) > 30 * DAY },
  { id: "clients", label: "Clients", test: (c) => c.status === "client" },
  { id: "dnd", label: "Ne pas déranger", test: (c) => c.dnd },
];

/** Filtres rapides (cumulables) */
const QUICK: { id: string; label: string; icon: string; test: (c: Contact, now: number) => boolean }[] = [
  { id: "notag", label: "Sans tag", icon: "M3 12l9-9h9v9l-9 9zM16 8h.01", test: (c) => c.tags.length === 0 },
  { id: "noemail", label: "E-mail manquant", icon: "M4 6h16v12H4zM4 7l8 6 8-6", test: (c) => !c.email },
  { id: "botoff", label: "Bot désactivé", icon: "M5 21V4h11l-1.5 4L16 12H5", test: (c) => c.aiPaused },
  {
    id: "noreply",
    label: "Pas de réponse 24h+",
    icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
    test: (c, now) => c.lastSender === "contact" && now - c.lastAt > DAY,
  },
  { id: "ai", label: "A échangé avec l'IA", icon: "M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3z", test: (c) => c.aiReplies > 0 },
  { id: "new", label: "Nouveau cette semaine", icon: "M15 19a6 6 0 0 0-12 0M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 8v6M16 11h6", test: (c, now) => now - c.createdAt < 7 * DAY },
];

const COLUMNS = [
  { id: "score", label: "Score" },
  { id: "phone", label: "Téléphone" },
  { id: "email", label: "E-mail" },
  { id: "channel", label: "Canal" },
  { id: "status", label: "Statut" },
  { id: "tags", label: "Tags" },
  { id: "last", label: "Dernier message" },
  { id: "activity", label: "Dernière activité" },
  { id: "flags", label: "Drapeaux" },
] as const;
type ColumnId = (typeof COLUMNS)[number]["id"];
const DEFAULT_COLUMNS: ColumnId[] = ["score", "phone", "channel", "status", "tags", "last", "activity", "flags"];

type Sort = { by: "name" | "score" | "activity"; dir: 1 | -1 };

export function ContactsClient() {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [segment, setSegment] = useState("all");
  const [quick, setQuick] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<{ channel: Channel | ""; status: ContactStatus | ""; tag: string }>({ channel: "", status: "", tag: "" });
  const [columns, setColumns] = useState<ColumnId[]>(DEFAULT_COLUMNS);
  const [sort, setSort] = useState<Sort>({ by: "activity", dir: -1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(50);
  const [panel, setPanel] = useState<"filter" | "columns" | null>(null);
  const [creating, setCreating] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [toast, setToast] = useState<{ text: string; jid?: string } | null>(null);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const r = await fetch("/api/contacts", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as { contacts: Contact[]; tags: string[] };
    setNow(Date.now());
    setContacts(d.contacts);
    setAllTags(d.tags);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      void load();
      try {
        const saved = JSON.parse(localStorage.getItem("contacts_columns") ?? "null") as ColumnId[] | null;
        if (Array.isArray(saved)) setColumns(saved);
      } catch {
        /* réglage illisible : colonnes par défaut */
      }
    }, 0);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  function flash(text: string, jid?: string) {
    setToast({ text, jid });
    setTimeout(() => setToast(null), 4000);
  }

  const list = useMemo(() => contacts ?? [], [contacts]);
  const seg = SEGMENTS.find((s) => s.id === segment) ?? SEGMENTS[0];
  const base = useMemo(() => list.filter((c) => seg.test(c, now)), [list, seg, now]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const rows = base.filter((c) => {
      for (const id of quick) if (!QUICK.find((x) => x.id === id)?.test(c, now)) return false;
      if (filters.channel && c.channel !== filters.channel) return false;
      if (filters.status && c.status !== filters.status) return false;
      if (filters.tag && !c.tags.includes(filters.tag)) return false;
      if (!q) return true;
      return (
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (digits.length >= 3 && (c.phone ?? "").includes(digits)) ||
        (c.lastText ?? "").toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
    const key = (c: Contact) => (sort.by === "name" ? (c.name ?? c.phone ?? "").toLowerCase() : sort.by === "score" ? c.score : c.lastAt);
    return rows.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * sort.dir;
    });
  }, [base, quick, filters, query, sort, now]);

  const activeFilters = [filters.channel, filters.status, filters.tag].filter(Boolean).length;
  const visible = shown.slice(0, limit);
  const allChecked = visible.length > 0 && visible.every((c) => selected.has(c.jid));
  const has = (col: ColumnId) => columns.includes(col);

  function toggleQuick(id: string) {
    setQuick((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleColumn(id: ColumnId) {
    const next = has(id) ? columns.filter((c) => c !== id) : COLUMNS.map((c) => c.id).filter((c) => c === id || columns.includes(c));
    setColumns(next);
    localStorage.setItem("contacts_columns", JSON.stringify(next));
  }

  function sortBy(by: Sort["by"]) {
    setSort((s) => (s.by === by ? { by, dir: s.dir === 1 ? -1 : 1 } : { by, dir: by === "name" ? 1 : -1 }));
  }

  function exportCsv(rows: Contact[]) {
    const head = ["Nom", "Téléphone", "E-mail", "Canal", "Statut", "Score", "Tags", "Messages reçus", "Dernière activité", "Ajouté le"];
    const cell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const date = (ts: number) => new Date(ts).toLocaleString("fr-FR");
    const lines = rows.map((c) =>
      [c.name, c.phone ? `+${c.phone}` : "", c.email, CHANNELS[c.channel].label, STATUS[c.status].label, c.score, c.tags.join(", "), c.received, date(c.lastAt), date(c.createdAt)]
        .map(cell)
        .join(";"),
    );
    const blob = new Blob([`﻿${[head.map(cell).join(";"), ...lines].join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash(`${rows.length} contact${rows.length > 1 ? "s" : ""} exporté${rows.length > 1 ? "s" : ""}`);
  }

  async function addTag(tag: string) {
    const jids = [...selected];
    await Promise.all(
      jids.map((jid) => {
        const c = list.find((x) => x.jid === jid);
        if (!c || c.tags.includes(tag)) return null;
        return fetch(`/api/chats/${encodeURIComponent(jid)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags: [...c.tags, tag] }),
        });
      }),
    );
    setTagging(false);
    setSelected(new Set());
    flash(`Étiquette « ${tag} » ajoutée à ${jids.length} contact${jids.length > 1 ? "s" : ""}`);
    void load();
  }

  return (
    <main className="min-h-full px-8 py-7" onClick={() => panel && setPanel(null)}>
      {/* Contacts / Listes */}
      <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 text-sm">
        <span className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3.5 py-1.5 font-medium">
          <Icon d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" /> Contacts
        </span>
        <span title="Bientôt" className="flex cursor-default items-center gap-2 px-3.5 py-1.5 text-zinc-400">
          <Icon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /> Listes <span className="text-[11px]">· Bientôt</span>
        </span>
      </div>

      {/* En-tête */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <p className="mt-1 text-zinc-500">
            {contacts ? (
              <>
                {shown.length} sur {list.length} contact{list.length > 1 ? "s" : ""}
              </>
            ) : (
              "Chargement…"
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SoonBtn icon="M12 3v12M7 10l5 5 5-5M5 21h14" label="Importer" />
          <SoonBtn icon="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" label="Champs personnalisés" />
          <button onClick={() => exportCsv(shown)} disabled={!shown.length} className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">
            <Icon d="M5 12h14M13 6l6 6-6 6" /> Exporter
          </button>
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
            <Icon d="M15 19a6 6 0 0 0-12 0M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 8v6M16 11h6" /> Nouveau contact
          </button>
        </div>
      </div>

      {/* Segments */}
      <div className="mt-6 inline-flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1">
        {SEGMENTS.map((s) => {
          const count = list.filter((c) => s.test(c, now)).length;
          const on = segment === s.id;
          return (
            <button
              key={s.id}
              onClick={() => {
                setSegment(s.id);
                setSelected(new Set());
              }}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition ${on ? "bg-zinc-100 font-semibold text-zinc-900" : "text-zinc-500 hover:text-zinc-800"}`}
            >
              {s.label}
              <span className={`rounded-md px-1.5 text-xs ${on ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-500"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filtres rapides */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => setQuick(new Set())}
          className={`rounded-full border px-3.5 py-1.5 text-sm transition ${quick.size === 0 ? "border-zinc-300 bg-white font-medium" : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"}`}
        >
          Tous
        </button>
        {QUICK.map((f) => {
          const on = quick.has(f.id);
          const count = base.filter((c) => f.test(c, now)).length;
          return (
            <button
              key={f.id}
              onClick={() => toggleQuick(f.id)}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition ${
                on ? "border-blue-600 bg-blue-600 font-medium text-white shadow-sm" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
              }`}
            >
              <Icon d={f.icon} size={14} />
              {f.label}
              <span className={`rounded-md px-1.5 text-xs ${on ? "bg-white/20" : "bg-zinc-100 text-zinc-500"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Recherche, filtres, colonnes */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex w-full max-w-sm items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 focus-within:border-zinc-400">
          <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher nom, téléphone, e-mail, message…"
            className="w-full bg-transparent text-sm outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-zinc-400 hover:text-zinc-700" aria-label="Effacer">
              ✕
            </button>
          )}
        </label>

        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setPanel(panel === "filter" ? null : "filter")}
            className={`flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 ${activeFilters ? "border-blue-600 text-blue-700" : "border-zinc-200"}`}
          >
            <Icon d="M4 5h16l-6 8v5l-4 2v-7z" size={16} /> Filtrer
            {activeFilters > 0 && <span className="rounded-md bg-blue-100 px-1.5 text-xs">{activeFilters}</span>}
          </button>
          {panel === "filter" && (
            <div className="absolute top-full left-0 z-20 mt-2 w-72 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
              <Select label="Canal" value={filters.channel} onChange={(v) => setFilters({ ...filters, channel: v as Channel | "" })}>
                <option value="">Tous les canaux</option>
                {[...new Set(list.map((c) => c.channel))].map((ch) => (
                  <option key={ch} value={ch}>
                    {CHANNELS[ch].label}
                  </option>
                ))}
              </Select>
              <Select label="Statut" value={filters.status} onChange={(v) => setFilters({ ...filters, status: v as ContactStatus | "" })}>
                <option value="">Tous les statuts</option>
                {(Object.keys(STATUS) as ContactStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS[s].label.charAt(0) + STATUS[s].label.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
              <Select label="Étiquette" value={filters.tag} onChange={(v) => setFilters({ ...filters, tag: v })}>
                <option value="">Toutes les étiquettes</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              {activeFilters > 0 && (
                <button onClick={() => setFilters({ channel: "", status: "", tag: "" })} className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          )}
        </div>

        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setPanel(panel === "columns" ? null : "columns")} className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50">
            <Icon d="M4 5h16v14H4zM9.5 5v14M14.5 5v14" size={16} /> Colonnes
          </button>
          {panel === "columns" && (
            <div className="absolute top-full left-0 z-20 mt-2 w-56 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl">
              {COLUMNS.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-zinc-50">
                  <input type="checkbox" checked={has(c.id)} onChange={() => toggleColumn(c.id)} className="accent-blue-600" />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions groupées */}
      {selected.size > 0 && (
        <div className="sticky top-3 z-10 mt-4 flex items-center gap-3 rounded-2xl bg-zinc-900 px-5 py-3 text-sm text-white shadow-lg">
          <span className="font-medium">
            {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
          </span>
          <span className="flex-1" />
          <button onClick={() => setTagging(true)} className="rounded-lg px-3 py-1.5 hover:bg-white/10">
            + Ajouter une étiquette
          </button>
          <button onClick={() => exportCsv(list.filter((c) => selected.has(c.jid)))} className="rounded-lg px-3 py-1.5 hover:bg-white/10">
            Exporter
          </button>
          <button onClick={() => setSelected(new Set())} className="rounded-lg px-3 py-1.5 text-zinc-400 hover:bg-white/10 hover:text-white">
            Annuler
          </button>
        </div>
      )}

      {/* Tableau */}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
              <th className="w-12 py-3.5 pl-5">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(visible.map((c) => c.jid)))}
                  aria-label="Tout sélectionner"
                  className="accent-blue-600"
                />
              </th>
              <Th onClick={() => sortBy("name")} active={sort.by === "name"} dir={sort.dir}>
                Contact
              </Th>
              {has("score") && (
                <Th onClick={() => sortBy("score")} active={sort.by === "score"} dir={sort.dir}>
                  Score
                </Th>
              )}
              {has("phone") && <th className="px-3 py-3.5">Téléphone</th>}
              {has("email") && <th className="px-3 py-3.5">E-mail</th>}
              {has("channel") && <th className="px-3 py-3.5">Canal</th>}
              {has("status") && <th className="px-3 py-3.5">Statut</th>}
              {has("tags") && <th className="px-3 py-3.5">Tags</th>}
              {has("last") && <th className="px-3 py-3.5">Dernier message</th>}
              {has("activity") && (
                <Th onClick={() => sortBy("activity")} active={sort.by === "activity"} dir={sort.dir}>
                  Dernière activité
                </Th>
              )}
              {has("flags") && <th className="px-3 py-3.5 pr-5">Drapeaux</th>}
            </tr>
          </thead>
          <tbody>
            {!contacts &&
              [0, 1, 2, 3].map((i) => (
                <tr key={i} className="border-b border-zinc-50">
                  <td colSpan={12} className="px-5 py-4">
                    <div className="h-8 animate-pulse rounded-lg bg-zinc-100" style={{ width: `${80 - i * 12}%` }} />
                  </td>
                </tr>
              ))}
            {visible.map((c) => {
              const href = `/?c=${encodeURIComponent(c.jid)}`;
              return (
                <tr key={c.jid} className={`group border-b border-zinc-50 transition hover:bg-zinc-50/70 ${selected.has(c.jid) ? "bg-blue-50/40" : ""}`}>
                  <td className="py-3 pl-5">
                    <input
                      type="checkbox"
                      checked={selected.has(c.jid)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.jid)) next.delete(c.jid);
                          else next.add(c.jid);
                          return next;
                        })
                      }
                      aria-label={`Sélectionner ${c.name ?? c.phone ?? ""}`}
                      className="accent-blue-600"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Link href={href} className="flex items-center gap-3">
                      <Avatar jid={c.jid} name={c.name} phone={c.phone} channel={c.channel} />
                      <span className="min-w-0">
                        <span className="block max-w-[200px] truncate font-semibold text-zinc-900 group-hover:underline">
                          {c.name ?? (c.phone ? `+${c.phone}` : "Sans nom")}
                        </span>
                        {c.archived && <span className="text-[11px] text-zinc-400">Archivé</span>}
                      </span>
                    </Link>
                  </td>
                  {has("score") && (
                    <td className="px-3 py-3">
                      <ScoreBar score={c.score} />
                    </td>
                  )}
                  {has("phone") && <td className="px-3 py-3 font-mono text-[13px] whitespace-nowrap text-zinc-700">{c.phone ? `+${c.phone}` : <Dash />}</td>}
                  {has("email") && <td className="max-w-[180px] truncate px-3 py-3 text-zinc-600">{c.email ?? <Dash />}</td>}
                  {has("channel") && (
                    <td className="px-3 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold tracking-wide whitespace-nowrap uppercase"
                        style={{ color: CHANNELS[c.channel].color, background: `${CHANNELS[c.channel].color}14` }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: CHANNELS[c.channel].color }} />
                        {CHANNELS[c.channel].label}
                      </span>
                    </td>
                  )}
                  {has("status") && (
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold whitespace-nowrap ${STATUS[c.status].cls}`}>
                        {STATUS[c.status].icon && <UiIcon name={STATUS[c.status].icon!} size={12} className="mr-0.5 inline-block align-[-2px]" />}{STATUS[c.status].label}
                      </span>
                    </td>
                  )}
                  {has("tags") && (
                    <td className="px-3 py-3">
                      {c.tags.length ? (
                        <span className="flex max-w-[200px] flex-wrap gap-1">
                          {c.tags.slice(0, 3).map((t) => (
                            <span key={t} className="rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                              {t}
                            </span>
                          ))}
                          {c.tags.length > 3 && <span className="text-xs text-zinc-400">+{c.tags.length - 3}</span>}
                        </span>
                      ) : (
                        <Dash />
                      )}
                    </td>
                  )}
                  {has("last") && (
                    <td className="max-w-[220px] px-3 py-3">
                      <span className="block truncate text-zinc-500">
                        {c.lastText ? (
                          <>
                            {c.lastSender !== "contact" && <span className="text-zinc-400">{c.lastSender === "ai" ? "IA : " : "Vous : "}</span>}
                            {c.lastText}
                          </>
                        ) : c.lastType && c.lastType !== "text" ? (
                          <span className="text-zinc-400">{c.lastType === "image" ? "Photo" : c.lastType === "audio" ? "Vocal" : c.lastType === "video" ? "Vidéo" : "Document"}</span>
                        ) : (
                          <Dash />
                        )}
                      </span>
                    </td>
                  )}
                  {has("activity") && (
                    <td className="px-3 py-3 whitespace-nowrap text-zinc-500" title={new Date(c.lastAt).toLocaleString("fr-FR")}>
                      {ago(c.lastAt, now)}
                    </td>
                  )}
                  {has("flags") && (
                    <td className="px-3 py-3 pr-5">
                      <span className="flex items-center gap-2">
                        <Flag on={!c.aiPaused && !c.dnd} title={c.aiPaused ? "IA en pause" : "IA active"} d="M8 8h8v8H8zM12 4v4M4 12h4M16 12h4M9 20h6" color="text-blue-600" />
                        <Flag on={c.dnd} title="Ne pas déranger" d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z" color="text-red-500" />
                        <Flag on={c.testContact} title="Contact de test" d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" color="text-blue-500" />
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {contacts && !shown.length && (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <UiIcon name="search" size={30} className="text-zinc-300" />
            <p className="mt-3 font-semibold">{list.length ? "Aucun contact ne correspond" : "Aucun contact pour l'instant"}</p>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              {list.length
                ? "Essaie un autre onglet ou retire un filtre."
                : "Chaque personne qui t'écrit sur WhatsApp ou sur le widget de ton site apparaît ici automatiquement."}
            </p>
          </div>
        )}
        {shown.length > limit && (
          <button onClick={() => setLimit((l) => l + 50)} className="w-full border-t border-zinc-100 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
            Afficher plus ({shown.length - limit} restants)
          </button>
        )}
      </div>

      {creating && (
        <NewContactModal
          allTags={allTags}
          onClose={() => setCreating(false)}
          onCreated={(jid) => {
            setCreating(false);
            flash("Contact ajouté", jid);
            void load();
          }}
        />
      )}
      {tagging && <TagModal allTags={allTags} count={selected.size} onClose={() => setTagging(false)} onSave={addTag} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl bg-zinc-900 px-5 py-3 text-sm text-white shadow-xl">
          ✓ {toast.text}
          {toast.jid && (
            <Link href={`/?c=${encodeURIComponent(toast.jid)}`} className="font-semibold text-blue-400 hover:underline">
              Ouvrir la discussion →
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

function ago(ts: number, now: number) {
  const d = Math.max(0, now - ts);
  if (d < 60_000) return "à l'instant";
  if (d < 3_600_000) return `il y a ${Math.round(d / 60_000)} min`;
  if (d < DAY) return `il y a ${Math.round(d / 3_600_000)} h`;
  if (d < 30 * DAY) return `il y a ${Math.round(d / DAY)} j`;
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function ScoreBar({ score }: { score: number }) {
  const tone = score >= 70 ? { pill: "bg-blue-50 text-blue-700", bar: "bg-blue-500" } : score >= 40 ? { pill: "bg-amber-50 text-amber-700", bar: "bg-amber-400" } : { pill: "bg-zinc-100 text-zinc-500", bar: "bg-zinc-300" };
  return (
    <span className="flex items-center gap-2.5" title={`Score d'engagement : ${score}/100`}>
      <span className={`w-10 rounded-lg py-1 text-center text-[13px] font-bold ${tone.pill}`}>{score}</span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-zinc-100">
        <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${score}%` }} />
      </span>
    </span>
  );
}

function Th({ children, onClick, active, dir }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: 1 | -1 }) {
  return (
    <th className="px-3 py-3.5">
      <button onClick={onClick} className={`flex items-center gap-1 uppercase hover:text-zinc-800 ${active ? "text-zinc-800" : ""}`}>
        {children}
        <span className={active ? "" : "opacity-40"}>{active ? (dir === 1 ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

function Flag({ on, title, d, color }: { on: boolean; title: string; d: string; color: string }) {
  return (
    <span title={title} className={on ? color : "text-zinc-200"}>
      <Icon d={d} size={16} />
    </span>
  );
}

function Dash() {
  return <span className="text-zinc-300">—</span>;
}

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function SoonBtn({ icon, label }: { icon: string; label: string }) {
  return (
    <span title="Bientôt" className="flex cursor-default items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-400">
      <Icon d={icon} /> {label} <span className="text-[11px]">· Bientôt</span>
    </span>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{label}</p>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400">
        {children}
      </select>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

const input = "mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-zinc-400";

function NewContactModal({ allTags, onClose, onCreated }: { allTags: string[]; onClose: () => void; onCreated: (jid: string) => void }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", tags: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; jid?: string } | null>(null);
  const first = useRef<HTMLInputElement>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, tags: form.tags.split(",") }),
    });
    const d = (await r.json().catch(() => ({}))) as { jid?: string; error?: string };
    setBusy(false);
    if (!r.ok || !d.jid) return setError({ text: d.error ?? "Création impossible.", jid: d.jid });
    onCreated(d.jid);
  }

  return (
    <Modal title="Nouveau contact" onClose={onClose}>
      <p className="mt-1 text-sm text-zinc-500">Un contact WhatsApp. Sa discussion sera prête dans Discussions.</p>
      <form onSubmit={save} className="mt-5 space-y-4">
        <label className="block text-sm font-medium text-zinc-700">
          Nom
          <input ref={first} autoFocus className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Marie Dupont" />
        </label>
        <label className="block text-sm font-medium text-zinc-700">
          Numéro WhatsApp *
          <input className={`${input} font-mono`} inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+33 6 12 34 56 78" />
        </label>
        <label className="block text-sm font-medium text-zinc-700">
          E-mail
          <input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="marie@exemple.fr" />
        </label>
        <label className="block text-sm font-medium text-zinc-700">
          Étiquettes <span className="font-normal text-zinc-400">(séparées par des virgules)</span>
          <input className={input} list="contact-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Client, VIP" />
          <datalist id="contact-tags">
            {allTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        {error && (
          <p className="text-sm text-red-600">
            {error.text}{" "}
            {error.jid && (
              <Link href={`/?c=${encodeURIComponent(error.jid)}`} className="font-medium underline">
                Voir la discussion
              </Link>
            )}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button type="submit" disabled={busy || form.phone.replace(/\D/g, "").length < 8} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300">
            {busy ? "Ajout…" : "Ajouter le contact"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TagModal({ allTags, count, onClose, onSave }: { allTags: string[]; count: number; onClose: () => void; onSave: (tag: string) => void }) {
  const [tag, setTag] = useState("");
  return (
    <Modal title={`Ajouter une étiquette à ${count} contact${count > 1 ? "s" : ""}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (tag.trim()) onSave(tag.trim());
        }}
      >
        <input autoFocus list="bulk-tags" className={input} value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Ex. : Client, Salon 2026…" />
        <datalist id="bulk-tags">
          {allTags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {allTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {allTags.slice(0, 12).map((t) => (
              <button type="button" key={t} onClick={() => setTag(t)} className="rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                {t}
              </button>
            ))}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button type="submit" disabled={!tag.trim()} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300">
            Ajouter
          </button>
        </div>
      </form>
    </Modal>
  );
}
