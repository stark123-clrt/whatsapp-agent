"use client";

import { Icon as UiIcon } from "@/app/icons";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OBJECTIVES, type Campaign, type CampaignStatus, type PostStatus } from "@/lib/campaign-types";
import { CampaignWizard, type AgentLite } from "./campaign-wizard";
import { InstagramDashboard } from "./instagram-dashboard";

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "bg-zinc-100 text-zinc-600" },
  active: { label: "● Active", cls: "bg-blue-50 text-blue-700" },
  paused: { label: "En pause", cls: "bg-amber-50 text-amber-700" },
  ended: { label: "Terminée", cls: "bg-zinc-100 text-zinc-400" },
};

type Data = { campaigns: Campaign[]; counts: Record<number, Partial<Record<PostStatus, number>>>; agents: AgentLite[]; instagram: { connected: boolean; username: string | null } };

const frDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

export function CampaignsClient() {
  const [data, setData] = useState<Data | null>(null);
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const r = await fetch("/api/campaigns", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setData(await r.json());
  }, []);
  useEffect(() => {
    const id = setTimeout(load, 0);
    const poll = setInterval(load, 20_000);
    return () => {
      clearTimeout(id);
      clearInterval(poll);
    };
  }, [load]);

  return (
    <main className="min-h-full px-8 py-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campagnes</h1>
          <p className="mt-1 text-zinc-500">L&apos;IA publie pour ta marque sur Instagram : publications et stories, à ton rythme.</p>
        </div>
        <button onClick={() => setCreating(true)} disabled={!data} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700">
          ＋ Nouvelle campagne
        </button>
      </div>

      {data && !data.instagram.connected && (
        <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span><UiIcon name="instagram" size={15} className="mr-1 inline-block align-[-3px]" />Instagram n&apos;est pas connecté : tu peux préparer des campagnes, mais rien ne sera publié tant que le compte n&apos;est pas connecté.</span>
          <Link href="/parametres?section=channels" className="shrink-0 font-semibold underline">
            Connecter
          </Link>
        </div>
      )}

      {data?.instagram.connected && <InstagramDashboard />}

      {data && data.campaigns.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center shadow-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><UiIcon name="sparkles" size={26} className="" /></span>
          <p className="mt-4 text-lg font-semibold">Aucune campagne pour le moment</p>
          <p className="mt-1 max-w-md text-sm text-zinc-500">
            Crée ta première campagne : l&apos;IA, qui connaît déjà ton entreprise, prépare 1 à 3 contenus par jour avec leurs visuels. Tu valides, elle publie.
          </p>
          <button onClick={() => setCreating(true)} className="mt-5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700">
            ＋ Créer une campagne
          </button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {!data &&
            [0, 1].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-white" />)}
          {data?.campaigns.map((c) => {
            const n = data.counts[c.id] ?? {};
            const agent = data.agents.find((a) => a.id === c.agentId);
            return (
              <Link key={c.id} href={`/campagnes/${c.id}`} className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold group-hover:text-violet-700">{c.name}</p>
                    <p className="text-sm text-zinc-500">
                      {agent?.name ?? "Sans agent"} · {OBJECTIVES[c.settings.objective]}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${CAMPAIGN_STATUS[c.status].cls}`}>{CAMPAIGN_STATUS[c.status].label}</span>
                </div>
                <p className="mt-3 text-xs text-zinc-500">
                  Du {frDate(c.startsOn)} au {frDate(c.endsOn)} · {c.settings.perDay}/jour ·{" "}
                  {[c.settings.formats.post && "publications", c.settings.formats.story && "stories"].filter(Boolean).join(" + ")}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Stat n={n.pending ?? 0} label="À valider" tone={n.pending ? "text-amber-600" : ""} />
                  <Stat n={n.scheduled ?? 0} label="Programmés" />
                  <Stat n={n.published ?? 0} label="Publiés" tone={n.published ? "text-blue-700" : ""} />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {creating && data && (
        <CampaignWizard
          campaign={null}
          agents={data.agents}
          onClose={() => setCreating(false)}
          onSaved={(c) => {
            setCreating(false);
            router.push(`/campagnes/${c.id}`);
          }}
        />
      )}
    </main>
  );
}

function Stat({ n, label, tone = "" }: { n: number; label: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 py-2">
      <p className={`text-xl font-bold tabular-nums ${tone}`}>{n}</p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}
