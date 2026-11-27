"use client";


import { useEffect, useState } from "react";

type Limits = { maxPosts: number; maxStories: number; postGapHours: number; storyGapMinutes: number };
type Today = { posts: number; stories: number; total: number; lastAt: number | null };

const RECOMMENDED = { maxPosts: 3, maxStories: 10 };

/** Plafonds de sécurité du compte Instagram (toutes campagnes) : l'agent décide sous ces plafonds. */
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
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => i + from);

  return (
    <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Plafonds de sécurité (toutes campagnes)</p>
          <p className="text-xs text-zinc-500">En rythme automatique, l&apos;agent décide combien publier chaque jour sans jamais dépasser ces plafonds.</p>
        </div>
        {today && (
          <p className="text-xs text-zinc-600">
            Aujourd&apos;hui : <strong>{today.posts}</strong> publication{today.posts > 1 ? "s" : ""} · <strong>{today.stories}</strong> stor{today.stories > 1 ? "ies" : "y"}
          </p>
        )}
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Publications par jour
          <select className={select} value={limits.maxPosts} onChange={(e) => setLimits({ ...limits, maxPosts: Number(e.target.value) })}>
            {range(0, 25).map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Aucune" : `Jusqu'à ${n}`}
                {n === RECOMMENDED.maxPosts ? " (conseillé)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Stories par jour
          <select className={select} value={limits.maxStories} onChange={(e) => setLimits({ ...limits, maxStories: Number(e.target.value) })}>
            {range(0, 50).map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Aucune" : `Jusqu'à ${n}`}
                {n === RECOMMENDED.maxStories ? " (conseillé)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Entre deux publications
          <select className={select} value={limits.postGapHours} onChange={(e) => setLimits({ ...limits, postGapHours: Number(e.target.value) })}>
            {[0, 1, 1.5, 2, 3, 4, 6].map((h) => (
              <option key={h} value={h}>
                {h === 0 ? "Pas d'écart" : `${String(h).replace(".", ",")} h minimum`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Entre deux contenus
          <select className={select} value={limits.storyGapMinutes} onChange={(e) => setLimits({ ...limits, storyGapMinutes: Number(e.target.value) })}>
            {[0, 15, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "Pas d'écart" : `${m} min minimum`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        Conseillé : {RECOMMENDED.maxPosts} publications et {RECOMMENDED.maxStories} stories par jour, 2 h entre deux publications, 30 min entre deux contenus. Tu peux aller au-delà
        (jusqu&apos;à 25 publications et 50 stories, la limite d&apos;Instagram) : augmente progressivement, un compte qui publie soudain beaucoup peut être ralenti par Instagram.
      </p>
      {(dirty || flash) && (
        <div className="mt-3 flex justify-end">
          <button onClick={save} disabled={busy || !dirty} className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
            {flash ? "✓ Enregistré" : busy ? "Enregistrement…" : "Enregistrer les plafonds"}
          </button>
        </div>
      )}
    </div>
  );
}
