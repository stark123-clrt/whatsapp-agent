"use client";

import { Icon as UiIcon } from "@/app/icons";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BROADCAST_STATUS, type Broadcast } from "@/lib/broadcast-types";

type Agent = { id: number; name: string; paused: boolean };
type Recipient = { jid: string; name: string | null; phone: string | null; status: string; reason: string | null; text: string | null; sentAt: number | null; repliedAt: number | null; delivery: number; followup: string | null };

const PHASES = [
  { id: "draft", label: "Brouillon" },
  { id: "scheduled", label: "Programmée" },
  { id: "sending", label: "Envoi" },
  { id: "done", label: "Terminée" },
] as const;

function delivery(r: Recipient) {
  if (r.status === "pending") return { label: "En attente", cls: "text-zinc-400" };
  if (r.status === "skipped") return { label: r.reason ?? "Ignoré", cls: "text-zinc-400" };
  if (r.status === "failed") return { label: `Échec${r.reason ? ` : ${r.reason}` : ""}`, cls: "text-red-600" };
  if (r.repliedAt) return { label: "A répondu", cls: "text-green-700 font-semibold" };
  if (r.delivery >= 4) return { label: "Lu ✓✓", cls: "text-sky-600" };
  if (r.delivery >= 3) return { label: "Livré ✓✓", cls: "text-zinc-600" };
  return { label: "Envoyé ✓", cls: "text-zinc-600" };
}

export function BroadcastDetail({ id }: { id: number }) {
  const [b, setB] = useState<Broadcast | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [r1, r2] = await Promise.all([fetch(`/api/broadcasts/${id}`, { cache: "no-store" }).catch(() => null), fetch(`/api/broadcasts/${id}/recipients`, { cache: "no-store" }).catch(() => null)]);
    if (!r1?.ok) return setError("Diffusion introuvable.");
    const d = (await r1.json()) as { broadcast: Broadcast; agents: Agent[] };
    setB(d.broadcast);
    setAgents(d.agents);
    if (r2?.ok) setRecipients(((await r2.json()) as { recipients: Recipient[] }).recipients);
  }, [id]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    const iv = setInterval(load, 10_000);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [load]);

  async function act(action: "pause" | "resume" | "cancel") {
    if (action === "cancel" && !confirm("Annuler la diffusion ? Les messages pas encore partis ne seront pas envoyés (ceux déjà envoyés restent).")) return;
    setBusy(true);
    await fetch(`/api/broadcasts/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setBusy(false);
    void load();
  }

  if (error) return <main className="p-8 text-sm text-red-600">{error}</main>;
  if (!b) return <main className="min-h-full bg-zinc-50 p-8" />;

  const st = BROADCAST_STATUS[b.status];
  const s = b.settings;
  const agent = agents.find((a) => a.id === s.agentId) ?? null;
  const phase = b.status === "paused" ? "sending" : b.status === "cancelled" ? "done" : b.status;
  const phaseIdx = PHASES.findIndex((p) => p.id === phase);
  const done = b.stats.sent + b.stats.failed;
  const toSend = b.stats.total - b.stats.skipped;
  const pct = toSend ? Math.round((done / toSend) * 100) : 0;
  const tiles = [
    { label: "AUDIENCE", value: b.stats.total || "—", hint: b.stats.skipped ? `${b.stats.skipped} exclus (STOP, pas WhatsApp…)` : b.listName ?? "" },
    { label: "ENVOYÉS", value: b.stats.sent, hint: b.stats.failed ? `${b.stats.failed} échec(s)` : `${b.stats.pending} en attente` },
    { label: "LUS", value: b.stats.read, hint: `${b.stats.delivered} livrés` },
    { label: "RÉPONSES", value: b.stats.replied, hint: b.stats.sent ? `${Math.round((b.stats.replied / b.stats.sent) * 100)} % · ${b.stats.optout} STOP` : "" },
  ];

  return (
    <main className="min-h-full bg-zinc-50 px-8 py-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/diffusions" className="text-zinc-500 hover:text-zinc-800">
            ← Diffusions
          </Link>
          <span className="text-zinc-300">/</span>
          <span className="text-lg font-bold">{b.name}</span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
        </div>
        <div className="flex gap-2">
          {b.status === "draft" && (
            <Link href={`/diffusions/${id}/modifier`} className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-50">
              <UiIcon name="pen" size={14} className="mr-1 inline-block align-[-3px]" />Continuer la configuration
            </Link>
          )}
          {b.status === "sending" && (
            <button onClick={() => act("pause")} disabled={busy} className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-50">
              <UiIcon name="pause" size={14} className="mr-1 inline-block align-[-3px]" />Mettre en pause
            </button>
          )}
          {b.status === "paused" && (
            <button onClick={() => act("resume")} disabled={busy} className="rounded-xl bg-green-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-green-700">
              <UiIcon name="play" size={14} className="mr-1 inline-block align-[-3px]" />Reprendre
            </button>
          )}
          {["scheduled", "sending", "paused"].includes(b.status) && (
            <button onClick={() => act("cancel")} disabled={busy} className="rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              Annuler
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-zinc-200 bg-white px-6 py-4 shadow-sm">
        <ol className="flex items-center">
          {PHASES.map((p, i) => (
            <li key={p.id} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <span className={`h-3 w-3 rounded-full ${i <= phaseIdx ? "bg-green-600" : "bg-zinc-300"}`} />
                <span className={`text-xs font-semibold ${i <= phaseIdx ? "text-zinc-800" : "text-zinc-400"}`}>{b.status === "cancelled" && p.id === "done" ? "Annulée" : p.label}</span>
              </div>
              {i < PHASES.length - 1 && <span className={`mx-2 h-px flex-1 ${i < phaseIdx ? "bg-green-600" : "bg-zinc-200"}`} />}
            </li>
          ))}
        </ol>
      </div>

      {b.note && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{b.note}</p>}

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-zinc-500">{t.label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{t.value}</p>
            <p className="truncate text-xs text-zinc-500">{t.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-zinc-500">MESSAGE D&apos;OUVERTURE</p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{s.message || "—"}</p>
            {s.media && <p className="mt-2 text-xs text-zinc-500"><UiIcon name="clip" size={13} className="mr-1 inline-block align-[-3px]" />{s.media.name}</p>}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold tracking-wide text-zinc-500">PROGRESSION</p>
              {toSend > 0 && (
                <p className="text-xs text-zinc-500 tabular-nums">
                  {done} / {toSend} · {pct} %
                </p>
              )}
            </div>
            {b.stats.total ? (
              <>
                <div className="mt-2 h-2 rounded-full bg-zinc-100">
                  <div className="h-2 rounded-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-4 max-h-[28rem] overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-white text-xs text-zinc-500">
                      <tr>
                        <th className="py-2 font-medium">Contact</th>
                        <th className="py-2 font-medium">Envoyé</th>
                        <th className="py-2 font-medium">État</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.map((r) => {
                        const d = delivery(r);
                        return (
                          <tr key={r.jid} className="border-t border-zinc-100 align-top">
                            <td className="py-2 pr-3">
                              <Link href={`/?c=${encodeURIComponent(r.jid)}`} className="font-medium hover:underline">
                                {r.name ?? `+${r.phone}`}
                              </Link>
                              {r.text && <p className="line-clamp-1 text-xs text-zinc-400" title={r.text}>{r.text}</p>}
                            </td>
                            <td className="whitespace-nowrap py-2 pr-3 text-zinc-500">{r.sentAt ? new Date(r.sentAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                            <td className={`py-2 ${d.cls}`}>
                              {d.label}
                              {r.followup === "sent" && <span className="ml-1 text-xs text-zinc-400">· relancé</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">{b.status === "scheduled" ? "Les destinataires seront figés à l'heure d'envoi." : "Les envois apparaîtront ici une fois la diffusion lancée."}</p>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-zinc-500">DÉTAILS</p>
            <dl className="mt-3 space-y-2.5">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Canal</dt>
                <dd className="font-medium">WhatsApp Web</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Liste</dt>
                <dd className="truncate font-medium">{b.listName ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Envoi</dt>
                <dd className="text-right font-medium">
                  {s.schedule.mode === "later" && s.schedule.at ? new Date(s.schedule.at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "Dès le lancement"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Heures</dt>
                <dd className="font-medium">{s.window.enabled ? `${s.window.start} – ${s.window.end}` : "Toute la journée"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Rythme</dt>
                <dd className="text-right font-medium">
                  {s.urgent ? "Rapide" : "1 message / 30–90 s"}
                  {s.progressive.enabled ? ` · ${s.progressive.perDay}/jour` : ""}
                </dd>
              </div>
            </dl>
          </section>
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-zinc-500">RÉPONSES</p>
            <p className="mt-2 font-medium"><UiIcon name={agent ? "robot" : "users"} size={15} className="mr-1.5 inline-block align-[-3px] text-zinc-500" />
              {agent ? `${agent.name} gère les réponses` : "L'équipe gère les réponses (sans IA)"}</p>
            {agent?.paused && <p className="mt-1 text-xs text-amber-700"><UiIcon name="alert" size={13} className="mr-1 inline-block align-[-3px]" />Cet agent est en pause : les réponses ne seront pas traitées tant que tu ne l&apos;auras pas réactivé.</p>}
            <p className="mt-2 text-xs text-zinc-500">{s.followup.enabled ? `Relance unique après ${s.followup.afterHours / 24} jour(s) sans réponse.` : "Pas de relance."}</p>
            <p className="mt-2 text-xs text-zinc-500">Un contact qui répond « STOP » ne reçoit plus aucune diffusion.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
