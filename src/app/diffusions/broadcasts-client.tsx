"use client";

import { Icon as UiIcon } from "@/app/icons";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BROADCAST_STATUS, type Broadcast, type BroadcastStatus } from "@/lib/broadcast-types";
import { Icon } from "../icons";

type Quota = { day: number; totalDays: number; coldCap: number; coldLeft: number; dailyCap: number; dailyLeft: number };
type Data = { broadcasts: Broadcast[]; quota: Quota; whatsapp: { connected: boolean } };

const TABS: { id: "all" | BroadcastStatus; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "draft", label: "Brouillons" },
  { id: "scheduled", label: "Programmées" },
  { id: "sending", label: "En cours d'envoi" },
  { id: "paused", label: "En pause" },
  { id: "done", label: "Terminées" },
  { id: "cancelled", label: "Annulées" },
];

const ago = (ts: number, now: number) => {
  const m = Math.round((now - ts) / 60_000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
  return `il y a ${Math.round(m / 1440)} j`;
};

export function BroadcastsClient() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const r = await fetch("/api/broadcasts", { cache: "no-store" }).catch(() => null);
    if (r?.ok) {
      setData(await r.json());
      setNow(Date.now());
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    const iv = setInterval(load, 15_000);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [load]);

  async function create() {
    setBusy(true);
    const r = await fetch("/api/broadcasts", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const d = (await r.json().catch(() => ({}))) as { broadcast?: Broadcast };
    setBusy(false);
    if (d.broadcast) router.push(`/diffusions/${d.broadcast.id}/modifier`);
  }

  async function duplicate(id: number) {
    const r = await fetch(`/api/broadcasts/${id}`, { method: "POST" });
    const d = (await r.json().catch(() => ({}))) as { broadcast?: Broadcast };
    if (d.broadcast) router.push(`/diffusions/${d.broadcast.id}/modifier`);
  }

  async function remove(b: Broadcast) {
    if (!confirm(`Supprimer « ${b.name} » ? Les messages déjà envoyés restent dans les discussions ; seul le suivi de la diffusion est supprimé.`)) return;
    const r = await fetch(`/api/broadcasts/${b.id}`, { method: "DELETE" });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (d.error) alert(d.error);
    void load();
  }

  const all = data?.broadcasts ?? [];
  const count = (st: BroadcastStatus) => all.filter((b) => b.status === st).length;
  const shown = all.filter((b) => (tab === "all" || b.status === tab) && (!q.trim() || b.name.toLowerCase().includes(q.trim().toLowerCase())));
  const tiles = [
    { label: "TOTAL", value: all.length, icon: "megaphone" as const, cls: "bg-green-50 text-green-700" },
    { label: "EN COURS D'ENVOI", value: count("sending"), icon: "spark" as const, cls: "bg-green-50 text-green-700" },
    { label: "PROGRAMMÉES", value: count("scheduled"), icon: "calendar" as const, cls: "bg-sky-50 text-sky-700" },
    { label: "BROUILLONS", value: count("draft"), icon: "pen" as const, cls: "bg-zinc-100 text-zinc-600" },
  ];

  return (
    <main className="min-h-full bg-zinc-50 px-8 py-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Diffusions</h1>
          <p className="mt-1 text-zinc-500">Envois groupés sur WhatsApp : audience, message, réponses et planification au même endroit.</p>
        </div>
        <button onClick={create} disabled={busy} className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-60">
          <Icon name="plus" size={16} className="mr-1 inline-block align-[-3px]" />Nouvelle diffusion
        </button>
      </div>

      {data && !data.whatsapp.connected && (
        <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>WhatsApp n&apos;est pas connecté : tu peux préparer des diffusions, elles partiront à la reconnexion.</span>
          <Link href="/parametres?section=channels" className="shrink-0 font-semibold underline">
            Connecter
          </Link>
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold tracking-wide text-zinc-500">{t.label}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{t.value}</p>
            </div>
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${t.cls}`}>
              <Icon name={t.icon} size={20} />
            </span>
          </div>
        ))}
      </div>
      {data && (
        <p className="mt-3 text-xs text-zinc-500">
          Protection du numéro — jour {data.quota.day} sur {data.quota.totalDays} : encore {data.quota.dailyLeft} message{data.quota.dailyLeft > 1 ? "s" : ""} aujourd&apos;hui, dont {data.quota.coldLeft} à des personnes qui ne t&apos;ont jamais écrit.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher des diffusions…" className="h-10 w-72 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm outline-none focus:border-zinc-400" />
        <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 text-sm">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-lg px-3 py-1 font-medium ${tab === t.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-zinc-100 text-xs font-semibold tracking-wide text-zinc-500">
            <tr>
              <th className="px-5 py-3">DIFFUSION</th>
              <th className="px-3 py-3 text-right">AUDIENCE</th>
              <th className="px-3 py-3 text-right">ENVOYÉS</th>
              <th className="px-3 py-3 text-right">LUS</th>
              <th className="px-3 py-3 text-right">RÉPONSES</th>
              <th className="px-3 py-3 text-right">TAUX</th>
              <th className="px-3 py-3">STATUT</th>
              <th className="px-3 py-3">CRÉÉE</th>
              <th className="px-3 py-3">MODIFIÉE</th>
              <th className="px-5 py-3 text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => {
              const st = BROADCAST_STATUS[b.status];
              const rate = b.stats.sent ? Math.round((b.stats.replied / b.stats.sent) * 100) : 0;
              return (
                <tr key={b.id} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                  <td className="px-5 py-3">
                    <Link href={b.status === "draft" ? `/diffusions/${b.id}/modifier` : `/diffusions/${b.id}`} className="flex items-center gap-3 font-semibold hover:underline">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-600 text-xs font-bold text-white">WA</span>
                      <span className="truncate">{b.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-zinc-600">{b.stats.total || (b.listName ? b.listName : "—")}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{b.stats.sent}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{b.stats.read}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{b.stats.replied}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{rate} %</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="px-3 py-3 text-zinc-500">{now ? ago(b.createdAt, now) : ""}</td>
                  <td className="px-3 py-3 text-zinc-500">{now ? ago(b.updatedAt, now) : ""}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => duplicate(b.id)} title="Dupliquer" className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-zinc-100">
                      <UiIcon name="copy" size={15} />
                    </button>
                    <button onClick={() => remove(b)} title="Supprimer" disabled={b.status === "sending"} className="rounded-lg px-2 py-1 text-red-500 hover:bg-red-50 disabled:opacity-30">
                      <UiIcon name="trash" size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data && !shown.length && (
          <div className="px-6 py-14 text-center">
            <p className="text-lg font-semibold">{all.length ? "Aucune diffusion dans cet onglet" : "Aucune diffusion pour le moment"}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">Envoie une promo ou une nouveauté à une liste de contacts (par tag, par statut…). Les réponses arrivent dans Discussions et ton agent les prend en charge.</p>
          </div>
        )}
        {!data && <div className="h-40 animate-pulse" />}
      </div>
    </main>
  );
}
