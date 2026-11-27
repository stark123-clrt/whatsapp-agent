"use client";

import { useEffect, useRef, useState } from "react";

/** Filtres du tableau de bord : listes déroulantes avec recherche, et période avec calendrier. */

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const Chevron = ({ up }: { up: boolean }) => (
  <svg viewBox="0 0 20 20" className={`h-4 w-4 text-zinc-400 transition-transform ${up ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Check = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type Option = { value: string; label: string };

/** Liste déroulante avec recherche ; `multi` = plusieurs choix (tags). */
export function Picker({ label, allLabel, icon, options, selected, onChange, multi = false }: {
  label: string;
  allLabel: string;
  icon?: React.ReactNode;
  options: Option[];
  selected: string[];
  onChange: (v: string[]) => void;
  multi?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useOutside(open, () => setOpen(false));
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const title = selected.length === 0 ? allLabel : selected.length === 1 ? (options.find((o) => o.value === selected[0])?.label ?? selected[0]) : `${selected.length} ${label}`;
  const pick = (v: string) => {
    if (!multi) {
      onChange([v]);
      setOpen(false);
      return;
    }
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          setQ("");
        }}
        className="flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-800 shadow-sm hover:border-zinc-300"
      >
        {icon}
        <span className="max-w-[12rem] truncate">{title}</span>
        <Chevron up={open} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher…"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <div className="mt-1.5 max-h-64 overflow-y-auto">
            <button onClick={() => (onChange([]), setOpen(false))} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-50">
              {allLabel}
              {selected.length === 0 && <Check />}
            </button>
            {shown.map((o) => (
              <button key={o.value} onClick={() => pick(o.value)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-50">
                <span className="truncate">{o.label}</span>
                {selected.includes(o.value) && <Check />}
              </button>
            ))}
            {!shown.length && <p className="px-3 py-2 text-sm text-zinc-400">{options.length ? "Aucun résultat" : "Aucun pour l'instant"}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Période ----------

export type Period = { preset: "7d" | "30d" | "90d" | "6m"; from?: undefined; to?: undefined } | { preset: "custom"; from: number; to: number };

export const PRESETS: { id: Exclude<Period["preset"], "custom">; label: string; days: number }[] = [
  { id: "7d", label: "7 j", days: 7 },
  { id: "30d", label: "30 j", days: 30 },
  { id: "90d", label: "90 j", days: 90 },
  { id: "6m", label: "6 m", days: 182 },
];

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const DAYS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const frDay = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  // « Aujourd'hui » est lu à l'ouverture du calendrier (jamais pendant le rendu de la page).
  const [today, setToday] = useState<Date>(() => new Date(0));
  const [month, setMonth] = useState({ y: 1970, m: 0 });
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [startH, setStartH] = useState("");
  const [startM, setStartM] = useState("00");
  const [endH, setEndH] = useState("");
  const [endM, setEndM] = useState("00");
  const todayKey = ymd(today);

  const first = new Date(month.y, month.m, 1);
  const offset = (first.getDay() + 6) % 7; // lundi en premier
  const cells = Array.from({ length: 42 }, (_, i) => new Date(month.y, month.m, 1 - offset + i));
  const canNext = month.y < today.getFullYear() || (month.y === today.getFullYear() && month.m < today.getMonth());

  function clickDay(key: string) {
    if (key > todayKey) return;
    if (!start || (start && end)) {
      setStart(key);
      setEnd(null);
    } else if (key < start) {
      setEnd(start);
      setStart(key);
    } else setEnd(key);
  }

  function apply() {
    if (!start) return;
    const e = end ?? start;
    const from = new Date(`${start}T${startH ? `${startH}:${startM}` : "00:00"}:00`).getTime();
    const to = endH ? new Date(`${e}T${endH}:${endM}:00`).getTime() : new Date(`${e}T00:00:00`).getTime() + 86_400_000;
    if (to <= from) return;
    onChange({ preset: "custom", from, to });
    setOpen(false);
  }

  const inRange = (k: string) => start && end && k > start && k < end;
  const sel = "rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400";
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const customLabel =
    value.preset === "custom"
      ? `${new Date(value.from).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${new Date(value.to - 1).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
      : "Personnalisé…";

  return (
    <div ref={ref} className="relative">
      <div className="flex h-10 items-center gap-0.5 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 text-sm">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange({ preset: p.id })}
            className={`rounded-lg px-3 py-1 font-medium ${value.preset === p.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => {
            if (!open) {
              const now = new Date();
              setToday(now);
              setMonth({ y: now.getFullYear(), m: now.getMonth() });
            }
            setOpen(!open);
          }}
          className={`rounded-lg px-3 py-1 font-medium ${value.preset === "custom" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
        >
          {customLabel}
        </button>
      </div>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[22rem] rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg">
          <div className="flex items-center gap-2">
            <select className={`${sel} flex-1`} value={month.m} onChange={(e) => setMonth({ ...month, m: Number(e.target.value) })}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select className={sel} value={month.y} onChange={(e) => setMonth({ ...month, y: Number(e.target.value) })}>
              {[today.getFullYear() - 2, today.getFullYear() - 1, today.getFullYear()].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button aria-label="Mois précédent" onClick={() => setMonth(month.m ? { ...month, m: month.m - 1 } : { y: month.y - 1, m: 11 })} className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-zinc-100">
              ‹
            </button>
            <button aria-label="Mois suivant" disabled={!canNext} onClick={() => setMonth(month.m === 11 ? { y: month.y + 1, m: 0 } : { ...month, m: month.m + 1 })} className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30">
              ›
            </button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-y-1 text-center text-xs">
            {DAYS.map((d) => (
              <span key={d} className="py-1 font-medium text-zinc-500">
                {d}
              </span>
            ))}
            {cells.map((d) => {
              const k = ymd(d);
              const other = d.getMonth() !== month.m;
              const future = k > todayKey;
              const edge = k === start || k === end;
              return (
                <button
                  key={k}
                  disabled={future}
                  onClick={() => clickDay(k)}
                  className={`mx-auto flex h-9 w-9 items-center justify-center rounded-xl text-sm ${
                    edge ? "bg-blue-600 font-semibold text-white" : inRange(k) ? "bg-blue-50 text-blue-800" : k === todayKey ? "border border-blue-400" : ""
                  } ${future || other ? "text-zinc-300" : edge ? "" : "text-zinc-800 hover:bg-zinc-100"}`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3 text-sm">
            {[
              { label: "Du", day: start, h: startH, setH: setStartH, m: startM, setM: setStartM },
              { label: "Au", day: end ?? start, h: endH, setH: setEndH, m: endM, setM: setEndM },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-2">
                <span className="w-6 text-zinc-500">{row.label}</span>
                <span className={`flex-1 ${row.day ? "font-medium text-zinc-800" : "text-zinc-400"}`}>{row.day ? frDay(row.day) : "Choisir une date"}</span>
                <select className={sel} value={row.h} onChange={(e) => row.setH(e.target.value)} aria-label={`Heure (${row.label})`}>
                  <option value="">--</option>
                  {hours.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <select className={sel} value={row.m} disabled={!row.h} onChange={(e) => row.setM(e.target.value)} aria-label={`Minutes (${row.label})`}>
                  {["00", "15", "30", "45"].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <p className="text-xs text-zinc-500">Laisse l&apos;heure sur -- pour couvrir toute la journée.</p>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
              Annuler
            </button>
            <button onClick={apply} disabled={!start} className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
              Appliquer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
