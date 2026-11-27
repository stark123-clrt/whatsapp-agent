"use client";

import { useEffect, useState } from "react";

type Day = { day: string; followers: number | null; newFollowers: number; follows: number; welcomes: number; posts: number; stories: number; comments: number; dms: number };
type Stats = {
  days: Day[];
  followersNow: number | null;
  followingNow: number | null;
  gained: number | null;
  totals: { newFollowers: number; follows: number; welcomes: number; posts: number; stories: number; comments: number; answered: number; dms: number; pollVotes: number; conversations: number };
};

const fr = (n: number) => n.toLocaleString("fr-FR");
const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
    </div>
  );
}

const W = 600;
const H = 140;
const PAD = { l: 44, r: 8, t: 12, b: 24 };

/** Courbe des abonnés (relevés quotidiens) : une seule série, survol jour par jour. */
function FollowersChart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = days.map((d, i) => ({ i, d, v: d.followers })).filter((p): p is { i: number; d: Day; v: number } => p.v !== null);
  if (pts.length < 2) return <p className="flex h-[140px] items-center justify-center text-xs text-zinc-400">La courbe se remplit avec un relevé par jour (il faut au moins 2 jours).</p>;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const lo = Math.max(0, min - Math.max(2, Math.round((max - min) * 0.15)));
  const hi = max + Math.max(2, Math.round((max - min) * 0.15));
  const x = (i: number) => PAD.l + (i / (days.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const path = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const h = hover !== null ? pts.reduce((a, b) => (Math.abs(b.i - hover) < Math.abs(a.i - hover) ? b : a)) : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (days.length - 1)));
        }}>
        {[lo, Math.round((lo + hi) / 2), hi].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#e4e4e7" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize={13} fill="#a1a1aa">{fr(v)}</text>
          </g>
        ))}
        <text x={PAD.l} y={H - 4} fontSize={13} fill="#a1a1aa">{dayLabel(days[0].day)}</text>
        <text x={W - PAD.r} y={H - 4} fontSize={13} fill="#a1a1aa" textAnchor="end">Aujourd&apos;hui</text>
        <path d={path} fill="none" stroke="#2a6cdc" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {h && (
          <g>
            <line x1={x(h.i)} x2={x(h.i)} y1={PAD.t} y2={H - PAD.b} stroke="#a1a1aa" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(h.i)} cy={y(h.v)} r={4.5} fill="#2a6cdc" stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-sm" style={{ left: `${Math.min(75, (x(h.i) / W) * 100)}%` }}>
          <p className="text-zinc-500">{dayLabel(h.d.day)}</p>
          <p className="font-semibold text-zinc-900">{fr(h.v)} abonnés</p>
        </div>
      )}
    </div>
  );
}

/** Ce que l'agent a fait chaque jour : une barre par jour, détail au survol. */
function ActivityBars({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = (d: Day) => d.follows + d.welcomes + d.posts + d.stories;
  const max = Math.max(1, ...days.map(total));
  const bw = (W - PAD.l - PAD.r) / days.length;
  const base = H - PAD.b;
  const hd = hover !== null ? days[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
        <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} stroke="#e4e4e7" />
        <text x={PAD.l - 6} y={PAD.t + 3} textAnchor="end" fontSize={13} fill="#a1a1aa">{max}</text>
        <text x={PAD.l} y={H - 4} fontSize={13} fill="#a1a1aa">{dayLabel(days[0].day)}</text>
        <text x={W - PAD.r} y={H - 4} fontSize={13} fill="#a1a1aa" textAnchor="end">Aujourd&apos;hui</text>
        {days.map((d, i) => {
          const v = total(d);
          const h = (v / max) * (base - PAD.t);
          const bx = PAD.l + i * bw + 1;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect x={PAD.l + i * bw} y={PAD.t} width={bw} height={base - PAD.t} fill="transparent" />
              {v > 0 && <rect x={bx} y={base - h} width={Math.max(2, bw - 2)} height={h} rx={Math.min(4, (bw - 2) / 2)} fill={hover === i ? "#2257b8" : "#2a6cdc"} />}
            </g>
          );
        })}
      </svg>
      {hd && hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-sm" style={{ left: `${Math.min(70, ((PAD.l + hover * bw) / W) * 100)}%` }}>
          <p className="text-zinc-500">{dayLabel(hd.day)}</p>
          <p>{hd.posts} publication(s) · {hd.stories} story(ies)</p>
          <p>{hd.follows} abonnement(s) · {hd.welcomes} bienvenue(s)</p>
          <p className="text-zinc-500">{hd.newFollowers} nouvel(s) abonné(s) · {hd.comments} commentaire(s) · {hd.dms} message(s)</p>
        </div>
      )}
    </div>
  );
}

/** Tableau de bord Instagram (30 jours) : progression du compte et travail de l'agent. */
export function InstagramDashboard() {
  const [s, setS] = useState<Stats | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    const load = async () => {
      const r = await fetch("/api/instagram/stats", { cache: "no-store" }).catch(() => null);
      if (r?.ok) setS(await r.json());
    };
    const id = setTimeout(load, 0);
    const iv = setInterval(load, 120_000);
    return () => {
      clearTimeout(id);
      clearInterval(iv);
    };
  }, []);

  if (!s) return null;
  const t = s.totals;
  const gained = s.gained ?? t.newFollowers;
  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Performances Instagram</h2>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>30 derniers jours</span>
          <button onClick={() => setTable(!table)} className="font-medium text-zinc-700 underline-offset-2 hover:underline">
            {table ? "Voir les graphiques" : "Voir le tableau"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Tile label="Abonnés" value={s.followersNow !== null ? fr(s.followersNow) : "—"} hint={s.followingNow !== null ? `${fr(s.followingNow)} abonnements` : "Premier relevé à venir"} />
        <Tile label="Abonnés gagnés" value={`${gained >= 0 ? "+" : ""}${fr(gained)}`} hint={`${fr(t.newFollowers)} nouveaux repérés`} />
        <Tile label="Suivis par l'agent" value={fr(t.follows)} hint={`${fr(t.welcomes)} messages de bienvenue`} />
        <Tile label="Contenus publiés" value={fr(t.posts + t.stories)} hint={`${t.posts} publications · ${t.stories} stories`} />
        <Tile label="Commentaires" value={fr(t.comments)} hint={`${t.answered} traités par l'agent`} />
        <Tile label="Messages privés" value={fr(t.dms)} hint={`${t.conversations} conversations · ${t.pollVotes} votes`} />
      </div>

      {table ? (
        <div className="mt-5 max-h-80 overflow-auto rounded-xl border border-zinc-100">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="sticky top-0 bg-zinc-50 text-zinc-500">
              <tr>
                {["Jour", "Abonnés", "Nouveaux", "Suivis", "Bienvenues", "Publications", "Stories", "Commentaires", "Messages"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...s.days].reverse().map((d) => (
                <tr key={d.day} className="border-t border-zinc-100">
                  <td className="px-3 py-1.5">{dayLabel(d.day)}</td>
                  <td className="px-3 py-1.5">{d.followers !== null ? fr(d.followers) : "—"}</td>
                  <td className="px-3 py-1.5">{d.newFollowers}</td>
                  <td className="px-3 py-1.5">{d.follows}</td>
                  <td className="px-3 py-1.5">{d.welcomes}</td>
                  <td className="px-3 py-1.5">{d.posts}</td>
                  <td className="px-3 py-1.5">{d.stories}</td>
                  <td className="px-3 py-1.5">{d.comments}</td>
                  <td className="px-3 py-1.5">{d.dms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-zinc-700">Évolution des abonnés</p>
            <FollowersChart days={s.days} />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-700">Actions de l&apos;agent par jour <span className="font-normal text-zinc-400">(publications, stories, abonnements, bienvenues)</span></p>
            <ActivityBars days={s.days} />
          </div>
        </div>
      )}
    </section>
  );
}
