"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Dashboard, Metric } from "@/lib/dashboard";
import { PeriodPicker, Picker, PRESETS, type Period } from "./filters";

type Data = { dashboard: Dashboard; agents: { id: number; name: string }[]; tags: string[] };

const ACCENT = "#2a6cdc"; // une seule série par graphique : la couleur de l'appli
const fr = (n: number) => n.toLocaleString("fr-FR");
const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", web: "Site web", messenger: "Messenger", telegram: "Telegram", sms: "SMS", email: "E-mail" };

function duration(s: number) {
  if (!s) return "—";
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86_400) return `${(s / 3600).toFixed(1).replace(".", ",")} h`;
  return `${(s / 86_400).toFixed(1).replace(".", ",")} j`;
}

function bucketLabel(ts: number, bucket: Dashboard["range"]["bucket"]) {
  const d = new Date(ts);
  if (bucket === "hour") return d.toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  if (bucket === "week") return `Semaine du ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

/** Petite courbe de tendance d'une carte (une seule série, sans axe). */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2 || values.every((v) => v === 0)) return <div className="h-10" />;
  const max = Math.max(...values);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(38 - (v / max) * 34).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
      <polyline points={pts} fill="none" stroke={ACCENT} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Delta({ m, lowerIsBetter = false, unit = "" }: { m: Metric; lowerIsBetter?: boolean; unit?: string }) {
  if (!m.previous && !m.value) return <span className="text-xs text-zinc-400">—</span>;
  if (!m.previous) return <span className="text-xs text-zinc-500">nouveau</span>;
  const diff = unit === "pts" ? m.value - m.previous : Math.round(((m.value - m.previous) / m.previous) * 100);
  if (diff === 0) return <span className="text-xs text-zinc-500">= période préc.</span>;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <span className={`text-xs font-medium ${good ? "text-blue-700" : "text-red-600"}`} title="Comparé à la période précédente de même durée">
      {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}
      {unit === "pts" ? " pts" : " %"}
    </span>
  );
}

function Card({ label, help, value, m, lowerIsBetter, unit, children }: { label: string; help: string; value: string; m: Metric; lowerIsBetter?: boolean; unit?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-zinc-500" title={help}>
          {label} <span className="cursor-help text-zinc-300">ⓘ</span>
        </p>
        <Delta m={m} lowerIsBetter={lowerIsBetter} unit={unit} />
      </div>
      <p className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 tabular-nums">{value}</p>
      {children}
      <div className="mt-auto pt-2">
        <Spark values={m.series} />
      </div>
    </div>
  );
}

/** Barres verticales (une série), avec infobulle au survol. */
function Bars({ values, labels, format, height = 160 }: { values: number[]; labels: string[]; format: (v: number) => string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  const W = 600;
  const pad = { l: 34, r: 4, t: 8, b: 4 };
  const bw = (W - pad.l - pad.r) / values.length;
  const base = height - pad.b;
  const y = (v: number) => base - (v / max) * (base - pad.t);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" onMouseLeave={() => setHover(null)} role="img" aria-label="Graphique en barres">
        {[0, Math.round(max / 2), max].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#f4f4f5" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize={12} fill="#a1a1aa">
              {v}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const h = base - y(v);
          const w = Math.max(2, bw - 2);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={base - pad.t} fill="transparent" />
              {v > 0 && <rect x={pad.l + i * bw + 1} y={base - h} width={w} height={h} rx={Math.min(4, w / 2)} fill={ACCENT} opacity={hover === null || hover === i ? 1 : 0.45} />}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: `${Math.min(72, ((pad.l + hover * bw) / W) * 100)}%` }}
        >
          <p className="text-zinc-500">{labels[hover]}</p>
          <p className="font-semibold text-zinc-900">{format(values[hover])}</p>
        </div>
      )}
    </div>
  );
}

const ACTIVITY: Record<string, { label: string; unit: string; key: keyof Dashboard["metrics"] }> = {
  received: { label: "Messages reçus", unit: "messages reçus", key: "received" },
  ai: { label: "Réponses IA", unit: "réponses IA", key: "aiReplies" },
  human: { label: "Réponses humaines", unit: "réponses humaines", key: "humanReplies" },
  conversations: { label: "Discussions actives", unit: "discussions", key: "conversations" },
  newChats: { label: "Nouvelles discussions", unit: "nouvelles discussions", key: "newChats" },
};

function rangeOf(p: Period): { from: number; to: number } {
  if (p.preset === "custom") return { from: p.from, to: p.to };
  const days = PRESETS.find((x) => x.id === p.preset)!.days;
  const end = new Date();
  end.setHours(24, 0, 0, 0); // jusqu'à la fin de la journée
  return { from: end.getTime() - days * 86_400_000, to: end.getTime() };
}

export function DashboardClient() {
  const [period, setPeriod] = useState<Period>({ preset: "30d" });
  const [agent, setAgent] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [activity, setActivity] = useState<keyof typeof ACTIVITY>("received");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Période calculée au moment du chargement (l'heure actuelle n'est jamais lue pendant le rendu).
    const { from, to } = rangeOf(period);
    const q = new URLSearchParams({ from: String(from), to: String(to) });
    if (agent[0]) q.set("agent", agent[0]);
    if (tags.length) q.set("tags", tags.join(","));
    const r = await fetch(`/api/dashboard?${q}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setData(await r.json());
    setLoading(false);
  }, [period, agent, tags]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    const iv = setInterval(load, 60_000);
    return () => {
      clearTimeout(id);
      clearInterval(iv);
    };
  }, [load]);

  const d = data?.dashboard;
  const m = d?.metrics;
  const periodText = period.preset === "custom" ? "période choisie" : `${PRESETS.find((p) => p.id === period.preset)!.label.replace(" j", " derniers jours").replace(" m", " derniers mois")}`;
  const labels = d ? d.labels.map((t) => bucketLabel(t, d.range.bucket)) : [];
  const busiest = d ? d.hours.indexOf(Math.max(...d.hours)) : -1;
  const channelMax = d ? Math.max(1, ...d.channels.map((c) => c.received + c.replies)) : 1;
  const sent = m ? m.aiReplies.value + m.humanReplies.value : 0;

  return (
    <main className="min-h-full px-8 py-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="mt-1 text-zinc-500">
            Messagerie — {periodText}
            {loading && <span className="ml-2 text-xs text-zinc-400">mise à jour…</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Picker
            label="agents"
            allLabel="Tous les agents"
            options={(data?.agents ?? []).map((a) => ({ value: String(a.id), label: a.name }))}
            selected={agent}
            onChange={setAgent}
          />
          <Picker
            label="tags"
            allLabel="Tous les tags"
            multi
            icon={
              <svg viewBox="0 0 20 20" className="h-4 w-4 text-zinc-400" fill="currentColor" aria-hidden>
                <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h4.09a2.5 2.5 0 0 1 1.77.73l6.91 6.91a2 2 0 0 1 0 2.83l-4.59 4.59a2 2 0 0 1-2.83 0L2.73 10.15A2.5 2.5 0 0 1 2 8.38V4.5ZM6 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
              </svg>
            }
            options={(data?.tags ?? []).map((t) => ({ value: t, label: t }))}
            selected={tags}
            onChange={setTags}
          />
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </div>

      {!d || !m ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card label="MESSAGES REÇUS" help="Messages écrits par tes clients sur tous les canaux." value={fr(m.received.value)} m={m.received} />
            <Card label="RÉPONSES IA" help="Messages envoyés par tes agents IA." value={fr(m.aiReplies.value)} m={m.aiReplies}>
              <p className="text-xs text-zinc-500">{m.aiShare.value} % des réponses</p>
            </Card>
            <Card label="RÉPONSES HUMAINES" help="Messages envoyés par toi ou ton équipe (Discussions ou téléphone)." value={fr(m.humanReplies.value)} m={m.humanReplies} />
            <Card label="TEMPS DE RÉPONSE" help="Temps médian entre le message d'un client et la première réponse (IA ou humaine)." value={duration(m.responseTime.value)} m={m.responseTime} lowerIsBetter />
            <Card label="DISCUSSIONS ACTIVES" help="Discussions où un client a écrit pendant la période." value={fr(m.conversations.value)} m={m.conversations} />
            <Card label="NOUVELLES DISCUSSIONS" help="Personnes qui t'ont écrit pour la première fois." value={fr(m.newChats.value)} m={m.newChats} />
            <Card label="LIVRÉS" help="WhatsApp uniquement : messages envoyés arrivés sur le téléphone du client." value={fr(m.delivered.value)} m={m.delivered}>
              <p className="text-xs text-zinc-500">WhatsApp</p>
            </Card>
            <Card label="LUS" help="WhatsApp uniquement : messages envoyés que le client a ouverts (si ses confirmations de lecture sont activées)." value={fr(m.read.value)} m={m.read}>
              <p className="text-xs text-zinc-500">{m.delivered.value ? `${Math.round((m.read.value / m.delivered.value) * 100)} % des livrés` : "WhatsApp"}</p>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Activité</h2>
                <select
                  value={activity}
                  onChange={(e) => setActivity(e.target.value as keyof typeof ACTIVITY)}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-zinc-400"
                >
                  {Object.entries(ACTIVITY).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-zinc-500">
                {ACTIVITY[activity].label} par {d.range.bucket === "hour" ? "heure" : d.range.bucket === "day" ? "jour" : "semaine"} — total {fr(m[ACTIVITY[activity].key].value)}
              </p>
              <div className="mt-3">
                <Bars values={m[ACTIVITY[activity].key].series} labels={labels} format={(v) => `${fr(v)} ${ACTIVITY[activity].unit}`} />
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold">Par canal</h2>
              <p className="text-xs text-zinc-500">Messages reçus et réponses envoyées</p>
              {d.channels.length ? (
                <ul className="mt-4 space-y-3">
                  {d.channels.map((c) => (
                    <li key={c.channel}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium">{CHANNEL[c.channel] ?? c.channel}</span>
                        <span className="text-xs text-zinc-500 tabular-nums">
                          {fr(c.received)} reçus · {fr(c.replies)} envoyés
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-zinc-100">
                        <div className="h-2 rounded-full" style={{ width: `${((c.received + c.replies) / channelMax) * 100}%`, background: ACCENT }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-zinc-400">Aucun message sur cette période.</p>
              )}
              <div className="mt-5 border-t border-zinc-100 pt-4">
                <p className="text-xs font-semibold text-zinc-500">QUI RÉPOND</p>
                {sent ? (
                  <>
                    <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                      <div style={{ width: `${m.aiShare.value}%`, background: ACCENT }} />
                      <div className="flex-1 bg-zinc-300" />
                    </div>
                    <div className="mt-1.5 flex justify-between text-xs text-zinc-600">
                      <span>
                        <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: ACCENT }} />
                        IA {m.aiShare.value} %
                      </span>
                      <span>
                        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-zinc-300" />
                        Humain {100 - m.aiShare.value} %
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-zinc-400">Aucune réponse sur cette période.</p>
                )}
              </div>
            </section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm xl:col-span-2">
              <h2 className="font-semibold">Heures les plus actives</h2>
              <p className="text-xs text-zinc-500">
                Messages reçus selon l&apos;heure (heure de Paris){busiest >= 0 && d.hours[busiest] > 0 ? ` — pic vers ${busiest} h` : ""}
              </p>
              <div className="mt-3">
                <Bars values={d.hours} labels={d.hours.map((_, h) => `${h} h – ${h + 1} h`)} format={(v) => `${fr(v)} messages reçus`} height={130} />
                <div className="mt-1 flex justify-between pl-[5.5%] text-[11px] text-zinc-400">
                  {[0, 6, 12, 18, 23].map((h) => (
                    <span key={h}>{h} h</span>
                  ))}
                </div>
              </div>
            </section>

            <div className="grid gap-4">
              <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Opportunités</h2>
                  <Link href="/opportunites" className="text-xs font-medium text-blue-700 hover:underline">
                    Ouvrir
                  </Link>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <dt className="text-xs text-zinc-500">Créées</dt>
                    <dd className="text-xl font-bold tabular-nums">{d.deals.created}</dd>
                    <dd className="text-[11px] text-zinc-400">{fr(d.deals.createdValue)} €</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Gagnées</dt>
                    <dd className="text-xl font-bold tabular-nums">{d.deals.won}</dd>
                    <dd className="text-[11px] text-zinc-400">{fr(d.deals.wonValue)} €</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Perdues</dt>
                    <dd className="text-xl font-bold tabular-nums">{d.deals.lost}</dd>
                  </div>
                </dl>
              </section>
              {d.instagram && (
                <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">Instagram</h2>
                    <Link href="/campagnes" className="text-xs font-medium text-blue-700 hover:underline">
                      Performances
                    </Link>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
                    <div>
                      <dt className="text-xs text-zinc-500">Abonnés</dt>
                      <dd className="text-xl font-bold tabular-nums">{d.instagram.followers !== null ? fr(d.instagram.followers) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Contenus publiés</dt>
                      <dd className="text-xl font-bold tabular-nums">{d.instagram.published}</dd>
                    </div>
                  </dl>
                </section>
              )}
            </div>
          </div>
          {(agent.length > 0 || tags.length > 0) && (
            <p className="mt-4 text-xs text-zinc-500">
              Filtré : {agent.length ? `agent « ${data?.agents.find((a) => String(a.id) === agent[0])?.name ?? "?"} »` : ""}
              {agent.length && tags.length ? " · " : ""}
              {tags.length ? `tags ${tags.map((t) => `« ${t} »`).join(", ")}` : ""}. Les opportunités ne comptent que celles liées à ces discussions.
            </p>
          )}
        </>
      )}
    </main>
  );
}
