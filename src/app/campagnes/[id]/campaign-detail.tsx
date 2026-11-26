"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OBJECTIVES, POST_STATUS, VISUALS, type Campaign, type CampaignPost } from "@/lib/campaign-types";
import { CampaignWizard, type AgentLite } from "../campaign-wizard";
import { CAMPAIGN_STATUS } from "../campaigns-client";
import { CampaignComments } from "./campaign-comments";

type Data = {
  campaign: Campaign;
  posts: CampaignPost[];
  agents: AgentLite[];
  instagram: { connected: boolean; username: string | null };
  plan: { posts: number; stories: number; engage: number; reason: string } | null;
};

const dayLabel = (ts: number) => {
  const d = new Date(ts);
  const today = new Date();
  const diff = Math.round((new Date(d.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 86_400_000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (diff === -1) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
};
const hour = (ts: number) => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function CampaignDetail({ id }: { id: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editPost, setEditPost] = useState<CampaignPost | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menu, setMenu] = useState(false);
  const [rhythm, setRhythm] = useState<{ maxPosts: number; maxStories: number } | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    const r = await fetch(`/api/campaigns/${id}`, { cache: "no-store" }).catch(() => null);
    if (r?.status === 404) return setMissing(true);
    if (r?.ok) setData(await r.json());
  }, [id]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch("/api/instagram/limits", { cache: "no-store" }).catch(() => null);
      if (r?.ok) setRhythm(((await r.json()) as { limits: { maxPosts: number; maxStories: number } }).limits);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const working = data?.posts.some((p) => p.status === "generating" || p.status === "publishing");
  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(load, working ? 4000 : 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [load, working]);

  function flash(text: string, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4500);
  }

  async function setStatus(status: Campaign["status"]) {
    setBusy("status");
    const r = await fetch(`/api/campaigns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!r.ok) return flash(d.error ?? "Impossible.", true);
    flash(status === "active" ? "Campagne activée : les prochains contenus se préparent." : status === "paused" ? "Campagne en pause : plus aucune publication." : "Campagne mise à jour.");
    void load();
  }

  async function act(post: CampaignPost, action: string, extra: Record<string, string> = {}) {
    setBusy(`${post.id}:${action}`);
    const r = await fetch(`/api/campaign-posts/${post.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!r.ok) flash(d.error ?? "Action impossible.", true);
    else flash({ approve: "Validé : il sera publié à l'heure prévue.", publish: "Publié sur Instagram 🎉", regenerate: "Nouvelle version prête.", reject: "Contenu écarté.", restore: "Contenu remis à valider.", edit: "Modifications enregistrées." }[action] ?? "OK");
    void load();
  }

  async function prepareNow(kind: "post" | "story", engage?: "question" | "tip" | "poll" | "versus") {
    setBusy(`new:${kind}`);
    setMenu(false);
    flash("L'IA prépare le contenu…");
    const r = await fetch(`/api/campaigns/${id}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, engage }) });
    setBusy(null);
    if (!r.ok) flash("Préparation impossible.", true);
    void load();
  }

  if (missing) {
    return (
      <main className="p-10 text-sm text-zinc-500">
        Cette campagne n&apos;existe plus. <Link href="/campagnes" className="font-medium text-violet-700 underline">Retour aux campagnes</Link>
      </main>
    );
  }
  if (!data) return <main className="p-10 text-sm text-zinc-500">Chargement…</main>;

  const { campaign: c, posts } = data;
  const agent = data.agents.find((a) => a.id === c.agentId);
  const count = (s: CampaignPost["status"]) => posts.filter((p) => p.status === s).length;
  const upcoming = posts.filter((p) => p.status !== "published" && p.status !== "rejected").sort((a, b) => a.scheduledAt - b.scheduledAt);
  const done = posts.filter((p) => p.status === "published" || p.status === "rejected").sort((a, b) => b.scheduledAt - a.scheduledAt);
  const groups = new Map<string, CampaignPost[]>();
  for (const p of upcoming) groups.set(dayLabel(p.scheduledAt), [...(groups.get(dayLabel(p.scheduledAt)) ?? []), p]);

  return (
    <main className="min-h-full bg-zinc-50 px-8 py-7">
      <Link href="/campagnes" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← Campagnes
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            {c.name}
            <span className={`rounded-md px-2 py-1 text-xs font-bold ${CAMPAIGN_STATUS[c.status].cls}`}>{CAMPAIGN_STATUS[c.status].label}</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {agent?.name ?? "Sans agent"} · {OBJECTIVES[c.settings.objective]} · du {new Date(`${c.startsOn}T12:00`).toLocaleDateString("fr-FR")} au {new Date(`${c.endsOn}T12:00`).toLocaleDateString("fr-FR")} ·{" "}
            {c.settings.approval === "manual" ? "validation avant publication" : "publication automatique"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEditing(true)} className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50">
            Modifier
          </button>
          {c.status === "active" ? (
            <button onClick={() => setStatus("paused")} disabled={busy === "status"} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100">
              ⏸ Mettre en pause
            </button>
          ) : (
            c.status !== "ended" && (
              <button onClick={() => setStatus("active")} disabled={busy === "status"} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700">
                ▶ {c.status === "draft" ? "Activer la campagne" : "Reprendre"}
              </button>
            )
          )}
        </div>
      </div>

      {!data.instagram.connected && (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>📸 Instagram n&apos;est pas connecté : les contenus se préparent, mais ne seront publiés qu&apos;une fois le compte connecté.</span>
          <Link href="/parametres?section=channels" className="shrink-0 font-semibold underline">
            Connecter
          </Link>
        </div>
      )}
      {c.status === "draft" && (
        <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          Brouillon : rien n&apos;est publié. Essaie « Préparer une publication » pour voir ce que l&apos;IA propose, puis active la campagne.
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile n={count("pending")} label="À valider" tone="text-amber-600" />
        <Tile n={count("scheduled")} label="Programmés" tone="text-sky-700" />
        <Tile n={count("published")} label="Publiés" tone="text-green-700" />
        <Tile n={count("failed")} label="Échecs" tone={count("failed") ? "text-red-600" : "text-zinc-400"} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Calendrier des contenus</h2>
          {data.plan ? (
            <p className="text-xs text-zinc-600">
              🤖 Aujourd&apos;hui, l&apos;agent prévoit <strong>{data.plan.posts} publication{data.plan.posts > 1 ? "s" : ""}</strong> et{" "}
              <strong>{data.plan.stories} stor{data.plan.stories > 1 ? "ies" : "y"}</strong>
              {data.plan.engage > 0 && (
                <>
                  , dont <strong>{data.plan.engage} pour attirer</strong> (questions, sondages, conseils)
                </>
              )}{" "}
              — {data.plan.reason}.
            </p>
          ) : (
            <p className="text-xs text-zinc-500">Rythme manuel : {c.settings.perDay} contenu{c.settings.perDay > 1 ? "s" : ""} par jour.</p>
          )}
          {rhythm && (
            <p className="text-xs text-zinc-500">
              Plafonds du compte (toutes campagnes) : {rhythm.maxPosts} publications et {rhythm.maxStories} stories par jour.{" "}
              <Link href="/parametres?section=channels" className="font-medium text-violet-700 hover:underline">
                Modifier
              </Link>
            </p>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setMenu(!menu)} disabled={Boolean(busy)} className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">
            {busy?.startsWith("new:") ? "Préparation…" : "✨ Préparer un contenu ▾"}
          </button>
          {menu && (
            <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-zinc-200 bg-white py-1 text-sm shadow-xl" onMouseLeave={() => setMenu(false)}>
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">Vendre</p>
              {c.settings.formats.post && (
                <button onClick={() => prepareNow("post")} className="block w-full px-3 py-2 text-left hover:bg-zinc-50">
                  🛍️ Publication {c.settings.objective === "sales" ? "produit" : "de marque"}
                </button>
              )}
              {c.settings.formats.story && (
                <button onClick={() => prepareNow("story")} className="block w-full px-3 py-2 text-left hover:bg-zinc-50">
                  🛍️ Story {c.settings.objective === "sales" ? "produit" : "de marque"}
                </button>
              )}
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">Attirer</p>
              {c.settings.formats.post && (
                <>
                  <button onClick={() => prepareNow("post", "question")} className="block w-full px-3 py-2 text-left hover:bg-zinc-50">
                    💬 Question (publication)
                  </button>
                  <button onClick={() => prepareNow("post", "tip")} className="block w-full px-3 py-2 text-left hover:bg-zinc-50">
                    💡 Conseil (publication)
                  </button>
                </>
              )}
              {c.settings.formats.story && (
                <>
                  <button onClick={() => prepareNow("story", "poll")} className="block w-full px-3 py-2 text-left hover:bg-zinc-50">
                    📊 Sondage (story)
                  </button>
                  {c.settings.objective === "sales" && (
                    <button onClick={() => prepareNow("story", "versus")} className="block w-full px-3 py-2 text-left hover:bg-zinc-50">
                      ⚖️ Ceci ou cela (story, 2 produits)
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {upcoming.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-500">
          {c.status === "active" ? "Les prochains contenus apparaissent ici dans quelques minutes (préparés jusqu'à 36 h à l'avance)." : "Aucun contenu à venir."}
        </div>
      )}
      {[...groups.entries()].map(([day, list]) => (
        <section key={day} className="mt-5">
          <p className="mb-2 text-sm font-semibold text-zinc-700 first-letter:uppercase">{day}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            {list.map((p) => (
              <PostCard key={p.id} post={p} busy={busy} onAct={act} onEdit={() => setEditPost(p)} />
            ))}
          </div>
        </section>
      ))}

      {done.length > 0 && (
        <section className="mt-8">
          <p className="mb-2 text-sm font-semibold text-zinc-700">Historique</p>
          <div className="grid gap-4 lg:grid-cols-2">
            {done.map((p) => (
              <PostCard key={p.id} post={p} busy={busy} onAct={act} onEdit={() => setEditPost(p)} />
            ))}
          </div>
        </section>
      )}

      <CampaignComments campaignId={c.id} enabled={c.settings.interactions.replyComments || c.settings.interactions.dmCommenters} approval={c.settings.approval} />

      <section className="mt-10 flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-white px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-red-700">Supprimer la campagne</p>
          <p className="text-xs text-zinc-500">Les contenus déjà publiés restent sur Instagram ; les brouillons et visuels sont effacés.</p>
        </div>
        {confirmDelete ? (
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="rounded-xl px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
              Annuler
            </button>
            <button
              onClick={async () => {
                await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
                router.push("/campagnes");
              }}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Oui, supprimer
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
            Supprimer
          </button>
        )}
      </section>

      {editing && (
        <CampaignWizard
          campaign={c}
          agents={data.agents}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            flash("Campagne enregistrée. Les contenus non validés seront préparés à nouveau.");
            void load();
          }}
        />
      )}
      {editPost && (
        <EditModal
          post={editPost}
          onClose={() => setEditPost(null)}
          onSave={async (headline, caption) => {
            const p = editPost;
            setEditPost(null);
            await act(p, "edit", { headline, caption });
          }}
        />
      )}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm text-white shadow-xl ${toast.error ? "bg-red-600" : "bg-zinc-900"}`}>{toast.text}</div>
      )}
    </main>
  );
}

function Tile({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
      <p className={`text-2xl font-bold tabular-nums ${tone}`}>{n}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

function PostCard({ post: p, busy, onAct, onEdit }: { post: CampaignPost; busy: string | null; onAct: (p: CampaignPost, a: string) => void; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const isBusy = (a: string) => busy === `${p.id}:${a}`;
  const btn = "rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50";
  const story = p.kind === "story";
  return (
    <article className={`flex gap-4 rounded-2xl border bg-white p-4 shadow-sm ${p.status === "pending" ? "border-amber-200" : "border-zinc-200"}`}>
      <div className={`relative shrink-0 overflow-hidden rounded-xl bg-zinc-100 ${story ? "h-48 w-27" : "h-40 w-32"}`}>
        {p.imageFile ? (
          // eslint-disable-next-line @next/next/no-img-element -- visuel généré
          <img src={`/api/campaign-posts/${p.id}/image?v=${encodeURIComponent(p.imageFile)}`} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-violet-500" />
          </div>
        )}
        <span className="absolute top-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{story ? "Story" : "Publication"}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-md px-2 py-0.5 font-bold ${POST_STATUS[p.status].cls}`}>{POST_STATUS[p.status].label}</span>
          <span className="text-zinc-500">{p.status === "published" && p.publishedAt ? `publié à ${hour(p.publishedAt)}` : `prévu à ${hour(p.scheduledAt)}`}</span>
          <span className="text-zinc-400">· {VISUALS[p.visual]?.label ?? "Visuel"}</span>
        </div>
        {p.intent === "engage" ? (
          <p className="mt-1.5 text-xs font-medium text-fuchsia-700">
            {{ question: "💬 Question — pour attirer", tip: "💡 Conseil — pour attirer", poll: "📊 Sondage — pour attirer", versus: "⚖️ Ceci ou cela — pour attirer" }[p.engageType ?? "question"]}
          </p>
        ) : (
          p.productTitle && <p className="mt-1.5 truncate text-xs font-medium text-violet-700">🛍️ {p.productTitle}</p>
        )}
        <p className="mt-1 font-semibold leading-snug">{p.headline ?? "L'IA rédige…"}</p>
        {p.caption && (
          <div className="mt-1">
            <p className={`text-xs leading-relaxed whitespace-pre-line text-zinc-600 ${open ? "" : "line-clamp-3"}`}>{p.caption}</p>
            <button onClick={() => setOpen(!open)} className="mt-0.5 text-xs font-medium text-violet-700 hover:underline">
              {open ? "Réduire" : "Voir toute la légende"}
            </button>
          </div>
        )}
        {p.poll && p.poll.options.length >= 2 && <PollView poll={p.poll} results={p.pollResults} />}
        {p.error && <p className="mt-1.5 text-xs text-red-600">⚠️ {p.error}</p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(p.status === "pending" || p.status === "failed") && (
            <button onClick={() => onAct(p, "approve")} disabled={Boolean(busy)} className={`${btn} bg-violet-600 text-white hover:bg-violet-700`}>
              {p.status === "failed" ? "Réessayer à l'heure prévue" : "✓ Valider"}
            </button>
          )}
          {["pending", "scheduled", "failed"].includes(p.status) && (
            <button onClick={() => onAct(p, "publish")} disabled={Boolean(busy)} className={`${btn} border border-zinc-200 hover:bg-zinc-50`}>
              {isBusy("publish") ? "Publication…" : "Publier maintenant"}
            </button>
          )}
          {["pending", "scheduled", "failed"].includes(p.status) && (
            <>
              <button onClick={onEdit} disabled={Boolean(busy)} className={`${btn} border border-zinc-200 hover:bg-zinc-50`}>
                Modifier
              </button>
              <button onClick={() => onAct(p, "regenerate")} disabled={Boolean(busy)} className={`${btn} border border-zinc-200 hover:bg-zinc-50`}>
                {isBusy("regenerate") ? "Régénération…" : "↻ Régénérer"}
              </button>
              <button onClick={() => onAct(p, "reject")} disabled={Boolean(busy)} className={`${btn} text-zinc-500 hover:bg-zinc-100`}>
                Écarter
              </button>
            </>
          )}
          {p.status === "rejected" && (
            <button onClick={() => onAct(p, "restore")} disabled={Boolean(busy)} className={`${btn} border border-zinc-200 hover:bg-zinc-50`}>
              Remettre à valider
            </button>
          )}
          {p.status === "published" && p.mediaCode && (
            <a href={`https://www.instagram.com/p/${p.mediaCode}/`} target="_blank" rel="noreferrer" className={`${btn} border border-zinc-200 hover:bg-zinc-50`}>
              Voir sur Instagram ↗
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function EditModal({ post, onClose, onSave }: { post: CampaignPost; onClose: () => void; onSave: (headline: string, caption: string) => void }) {
  const [headline, setHeadline] = useState(post.headline ?? "");
  const [caption, setCaption] = useState(post.caption ?? "");
  const field = "w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-violet-500";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Modifier le contenu</h3>
        <label className="mt-4 block text-sm font-medium text-zinc-700">
          Titre sur l&apos;image
          <input className={`${field} mt-1.5`} value={headline} maxLength={110} onChange={(e) => setHeadline(e.target.value)} />
        </label>
        <label className="mt-4 block text-sm font-medium text-zinc-700">
          {post.kind === "story" ? "Texte (non affiché sur Instagram pour une story)" : "Légende"}
          <textarea className={`${field} mt-1.5 resize-y`} rows={8} value={caption} maxLength={2200} onChange={(e) => setCaption(e.target.value)} />
        </label>
        <p className="mt-1 text-xs text-zinc-500">Le visuel est refait avec le nouveau titre, en gardant la même photo.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button onClick={() => onSave(headline, caption)} disabled={!headline.trim()} className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sondage : les 2 réponses, puis les votes une fois relus sur Instagram. */
function PollView({ poll, results }: { poll: { question: string; options: string[] }; results: { text: string; count: number }[] | null }) {
  const total = (results ?? []).reduce((n, r) => n + r.count, 0);
  return (
    <div className="mt-2 space-y-1 rounded-xl bg-fuchsia-50/60 p-2.5">
      {poll.options.map((o, i) => {
        const r = results?.find((x) => x.text === o) ?? results?.[i];
        const pct = total ? Math.round(((r?.count ?? 0) / total) * 100) : 0;
        return (
          <div key={o} className="relative overflow-hidden rounded-lg bg-white px-2.5 py-1.5 text-xs">
            {total > 0 && <div className="absolute inset-y-0 left-0 bg-fuchsia-100" style={{ width: `${pct}%` }} />}
            <span className="relative flex justify-between gap-2">
              <span className="font-medium">{o}</span>
              {total > 0 && <span className="text-zinc-500">{pct} %</span>}
            </span>
          </div>
        );
      })}
      <p className="text-[11px] text-zinc-500">{total > 0 ? `${total} vote${total > 1 ? "s" : ""} · l'agent s'en sert pour ses recommandations` : "Les votes s'afficheront ici après la publication."}</p>
    </div>
  );
}
