"use client";

import { useEffect, useState } from "react";

type Limits = { maxPerDay: number; maxPosts: number; maxStories: number; minGapHours: number };
type Today = { posts: number; stories: number; total: number; lastAt: number | null };

/** « Rythme de publication » du compte Instagram, toutes campagnes confondues. */
export function InstagramRhythm() {
  const [limits, setLimits] = useState<Limits | null>(null);
  const [saved, setSaved] = useState<Limits | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const id = setTimeout(async () => {
      const r = await fetch("/api/instagram/limits", { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;
      const d = (await r.json()) as { limits: Limits; today: Today };
      setLimits(d.limits);
      setSaved(d.limits);
      setToday(d.today);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  async function save() {
    if (!limits) return;
    setBusy(true);
    const r = await fetch("/api/instagram/limits", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(limits) });
    const d = (await r.json().catch(() => null)) as { limits: Limits; today: Today } | null;
    setBusy(false);
    if (d) {
      setLimits(d.limits);
      setSaved(d.limits);
      setToday(d.today);
      setFlash(true);
      setTimeout(() => setFlash(false), 2000);
    }
  }

  if (!limits) return null;
  const dirty = JSON.stringify(limits) !== JSON.stringify(saved);
  const select = "rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-zinc-400";
  const opts = (max: number, from = 0) => Array.from({ length: max - from + 1 }, (_, i) => i + from);

  return (
    <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Rythme de publication (toutes campagnes)</p>
          <p className="text-xs text-zinc-500">Protège le compte : au-delà, les contenus sont décalés au lendemain, jamais publiés en rafale.</p>
        </div>
        {today && (
          <p className="text-xs text-zinc-600">
            Aujourd&apos;hui : <strong>{today.posts}</strong> publication{today.posts > 1 ? "s" : ""} · <strong>{today.stories}</strong> stor{today.stories > 1 ? "ies" : "y"}
          </p>
        )}
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Maximum par jour
          <select className={select} value={limits.maxPerDay} onChange={(e) => setLimits({ ...limits, maxPerDay: Number(e.target.value) })}>
            {opts(10, 1).map((n) => (
              <option key={n} value={n}>
                {n} contenu{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          dont publications
          <select className={select} value={limits.maxPosts} onChange={(e) => setLimits({ ...limits, maxPosts: Number(e.target.value) })}>
            {opts(10).map((n) => (
              <option key={n} value={n}>
                {n} max
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          dont stories
          <select className={select} value={limits.maxStories} onChange={(e) => setLimits({ ...limits, maxStories: Number(e.target.value) })}>
            {opts(10).map((n) => (
              <option key={n} value={n}>
                {n} max
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Écart minimum
          <select className={select} value={limits.minGapHours} onChange={(e) => setLimits({ ...limits, minGapHours: Number(e.target.value) })}>
            {[0, 0.5, 1, 1.5, 2, 3, 4, 6].map((h) => (
              <option key={h} value={h}>
                {h === 0 ? "Aucun" : h < 1 ? "30 min" : `${String(h).replace(".", ",")} h`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(dirty || flash) && (
        <div className="mt-3 flex justify-end">
          <button onClick={save} disabled={busy || !dirty} className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
            {flash ? "✓ Enregistré" : busy ? "Enregistrement…" : "Enregistrer le rythme"}
          </button>
        </div>
      )}
    </div>
  );
}
