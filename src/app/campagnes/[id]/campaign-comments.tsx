"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Comment = {
  commentId: string;
  username: string;
  fullName: string | null;
  text: string;
  ts: number;
  category: "question" | "interest" | "compliment" | "negative" | "spam" | "other" | null;
  replyText: string | null;
  dmText: string | null;
  like: boolean;
  status: "new" | "pending" | "scheduled" | "done" | "ignored" | "alert" | "skipped" | "failed";
  doAt: number | null;
  doneAt: number | null;
  dmJid: string | null;
  note: string | null;
  postHeadline: string | null;
};

const CATEGORY: Record<NonNullable<Comment["category"]>, { label: string; cls: string }> = {
  question: { label: "Question", cls: "bg-sky-50 text-sky-700" },
  interest: { label: "Intéressé", cls: "bg-blue-50 text-blue-700" },
  compliment: { label: "Compliment", cls: "bg-pink-50 text-pink-700" },
  negative: { label: "Négatif", cls: "bg-red-50 text-red-600" },
  spam: { label: "Spam", cls: "bg-zinc-100 text-zinc-500" },
  other: { label: "Autre", cls: "bg-zinc-100 text-zinc-600" },
};
const STATUS: Record<Comment["status"], string> = {
  new: "L'IA prépare…",
  pending: "À valider",
  scheduled: "Envoi prévu",
  done: "Répondu",
  ignored: "Ignoré",
  alert: "À traiter par toi",
  skipped: "Limite du jour",
  failed: "Échec",
};

/** Commentaires sous les publications de la campagne, avec la réponse proposée par l'IA. */
export function CampaignComments({ campaignId, enabled, approval }: { campaignId: number; enabled: boolean; approval: "manual" | "auto" }) {
  const [list, setList] = useState<Comment[] | null>(null);
  const [filter, setFilter] = useState<"todo" | "all">("todo");

  const load = useCallback(async () => {
    const r = await fetch(`/api/campaigns/${campaignId}/comments`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setList(((await r.json()) as { comments: Comment[] }).comments);
  }, [campaignId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(load, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [load]);

  const todo = (list ?? []).filter((c) => ["new", "pending", "alert", "failed"].includes(c.status));
  const shown = filter === "todo" ? todo : (list ?? []);

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Commentaires</h2>
          <p className="text-xs text-zinc-500">
            {enabled
              ? `Relevés toutes les 3 minutes sous les publications de la campagne. ${approval === "manual" ? "Chaque réponse attend ta validation." : "Réponses envoyées automatiquement, 2 à 12 minutes après le commentaire."}`
              : "Réponses aux commentaires désactivées dans les réglages de la campagne (étape « Les interactions »)."}
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-zinc-200 bg-white p-1 text-sm">
          <button onClick={() => setFilter("todo")} className={`rounded-lg px-3 py-1 ${filter === "todo" ? "bg-zinc-100 font-semibold" : "text-zinc-500"}`}>
            À traiter {todo.length > 0 && <span className="ml-1 rounded-md bg-amber-100 px-1.5 text-xs text-amber-700">{todo.length}</span>}
          </button>
          <button onClick={() => setFilter("all")} className={`rounded-lg px-3 py-1 ${filter === "all" ? "bg-zinc-100 font-semibold" : "text-zinc-500"}`}>
            Tous
          </button>
        </div>
      </div>

      {list && shown.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-8 text-center text-sm text-zinc-500">
          {filter === "todo" ? "Rien à traiter pour l'instant." : "Aucun commentaire pour l'instant sous les publications de cette campagne."}
        </div>
      )}
      <div className="space-y-3">
        {shown.map((c) => (
          <CommentCard key={c.commentId} c={c} onDone={load} />
        ))}
      </div>
    </section>
  );
}

function CommentCard({ c, onDone }: { c: Comment; onDone: () => void }) {
  const [reply, setReply] = useState(c.replyText ?? "");
  const [dm, setDm] = useState(c.dmText ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = c.status === "pending" || c.status === "alert" || c.status === "failed";

  async function act(action: "approve" | "ignore" | "retry") {
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/campaign-comments/${encodeURIComponent(c.commentId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "approve" ? { action, reply, dm: dm.trim() || null } : { action }),
    });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r.ok) return setError(d.error ?? "Action impossible.");
    onDone();
  }

  const field = "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500";
  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm ${c.status === "alert" ? "border-red-200" : c.status === "pending" ? "border-amber-200" : "border-zinc-200"}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-zinc-900">@{c.username}</span>
        {c.category && <span className={`rounded-md px-1.5 py-0.5 font-semibold ${CATEGORY[c.category].cls}`}>{CATEGORY[c.category].label}</span>}
        <span className="text-zinc-400">{new Date(c.ts).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        {c.postHeadline && <span className="truncate text-zinc-400">· sous « {c.postHeadline} »</span>}
        <span className={`ml-auto rounded-md px-2 py-0.5 font-semibold ${c.status === "done" ? "bg-blue-50 text-blue-700" : c.status === "alert" || c.status === "failed" ? "bg-red-50 text-red-600" : "bg-zinc-100 text-zinc-600"}`}>
          {STATUS[c.status]}
          {c.status === "scheduled" && c.doAt ? ` à ${new Date(c.doAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-800">« {c.text} »</p>
      {c.note && <p className="mt-1 text-xs text-zinc-500">{c.note}</p>}

      {editable ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-zinc-500">
            Réponse publique
            <textarea className={`${field} mt-1 resize-y`} rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="(aucune réponse publique)" />
          </label>
          <label className="block text-xs font-medium text-zinc-500">
            Message privé (avec le lien)
            <textarea className={`${field} mt-1 resize-y`} rows={3} value={dm} onChange={(e) => setDm(e.target.value)} placeholder="(pas de message privé)" />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => act("approve")} disabled={busy || (!reply.trim() && !dm.trim() && !c.like)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? "…" : "✓ Valider et envoyer"}
            </button>
            {c.status === "failed" && (
              <button onClick={() => act("retry")} disabled={busy} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50">
                ↻ Repréparer
              </button>
            )}
            <button onClick={() => act("ignore")} disabled={busy} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:bg-zinc-100">
              Ignorer
            </button>
          </div>
        </div>
      ) : (
        (c.replyText || c.dmText) && (
          <div className="mt-3 space-y-1.5 rounded-xl bg-zinc-50 p-3 text-sm">
            {c.replyText && (
              <p>
                <span className="text-xs font-semibold text-zinc-500">Réponse : </span>
                {c.replyText}
              </p>
            )}
            {c.dmText && (
              <p className="whitespace-pre-line">
                <span className="text-xs font-semibold text-zinc-500">En privé : </span>
                {c.dmText}
              </p>
            )}
            {c.dmJid && (
              <Link href={`/?c=${encodeURIComponent(c.dmJid)}`} className="inline-block text-xs font-semibold text-blue-700 hover:underline">
                Ouvrir la conversation →
              </Link>
            )}
          </div>
        )
      )}
    </article>
  );
}
