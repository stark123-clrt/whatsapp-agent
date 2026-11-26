"use client";

import { useCallback, useEffect, useState } from "react";
import { ToggleRow } from "@/app/agents/[id]/ui";

type Settings = {
  followBack: boolean;
  followEngaged: boolean;
  welcome: boolean;
  welcomeText: string;
  maxFollowsPerDay: number;
  maxWelcomesPerDay: number;
  skipSuspicious: boolean;
};
type Overview = {
  settings: Settings;
  caps: { follows: number; welcomes: number };
  today: { follows: number; welcomes: number; followCap: number; welcomeCap: number };
  paused: { until: number; reason: string | null } | null;
  started: boolean;
  lastScanAt: number | null;
  totals: { newFollowers: number; followBacks: number; engagedFollows: number; welcomes: number; skipped: number };
  queue: { follows: number; welcomes: number; next: { username: string; picture: string | null; action: "follow" | "welcome"; reason: string | null; at: number }[] };
  recent: { username: string; fullName: string | null; picture: string | null; at: number; followedBack: boolean; welcomed: boolean }[];
};

const REASON: Record<string, string> = { follower: "s'est abonné", dm: "t'a écrit", comment: "a commenté" };
const time = (ts: number) => new Date(ts).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", minute: "2-digit" });
const ago = (ts: number) => {
  const m = Math.round((Date.now() - ts) / 60_000);
  return m < 60 ? `il y a ${Math.max(1, m)} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
};

function Avatar({ src, name }: { src: string | null; name: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" referrerPolicy="no-referrer" className="h-7 w-7 shrink-0 rounded-full bg-zinc-100 object-cover" />
  ) : (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-500">{name.replace("@", "").charAt(0).toUpperCase()}</span>
  );
}

/** Croissance du compte : suivi en retour, personnes engagées, message de bienvenue, et ce que l'agent prépare. */
export function InstagramGrowth() {
  const [o, setO] = useState<Overview | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const r = await fetch("/api/instagram/growth", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as Overview;
    setO(d);
    setNow(Date.now());
    setText((t) => t || d.settings.welcomeText);
  }, []);

  useEffect(() => {
    const id = setTimeout(load, 0);
    const iv = setInterval(load, 60_000);
    return () => {
      clearTimeout(id);
      clearInterval(iv);
    };
  }, [load]);

  async function save(patch: Partial<Settings> & { resume?: boolean }) {
    setBusy(true);
    const r = await fetch("/api/instagram/growth", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const d = (await r.json().catch(() => null)) as Overview | null;
    setBusy(false);
    if (d) {
      setO(d);
      if (patch.welcomeText !== undefined) {
        setText(d.settings.welcomeText);
        setFlash(true);
        setTimeout(() => setFlash(false), 2000);
      }
    }
  }

  if (!o) return null;
  const s = o.settings;
  const select = "rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-zinc-400";
  const preview = text.replace(/\{pr[ée]nom\}/gi, "Sarah");

  return (
    <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Croissance du compte</p>
          <p className="text-xs text-zinc-500">
            L&apos;agent repère les nouveaux abonnés toutes les 2 h environ et agit au compte-gouttes, comme une vraie personne (jamais la nuit).
          </p>
        </div>
        <p className="text-xs text-zinc-600">
          Aujourd&apos;hui : <strong>{o.today.follows}</strong>/{o.today.followCap} abonnements · <strong>{o.today.welcomes}</strong>/{o.today.welcomeCap} bienvenues
        </p>
      </div>

      {o.paused && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>⏸ En pause jusqu&apos;à {time(o.paused.until)} pour protéger le compte. {o.paused.reason}</span>
          <button onClick={() => save({ resume: true })} disabled={busy} className="rounded-md border border-amber-300 bg-white px-2 py-1 font-semibold">
            Reprendre maintenant
          </button>
        </div>
      )}
      {!o.started && (
        <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Premier relevé en cours : tes abonnés actuels servent de point de départ, l&apos;agent n&apos;agit que sur les <strong>nouveaux</strong>.
        </p>
      )}

      <div className="mt-3 grid gap-2">
        <ToggleRow
          title="Suivre en retour les nouveaux abonnés"
          description="Entre 10 min et 3 h après leur abonnement, pour paraître naturel."
          checked={s.followBack}
          onChange={(v) => save({ followBack: v })}
        />
        <ToggleRow
          title="Suivre les personnes engagées"
          description="Celles qui t'écrivent en privé ou commentent tes publications."
          checked={s.followEngaged}
          onChange={(v) => save({ followEngaged: v })}
        />
        <ToggleRow
          title="Écarter les faux comptes"
          description="Pas de photo ni de publication, ou qui suivent des milliers de comptes : l'agent ne les suit pas."
          checked={s.skipSuspicious}
          onChange={(v) => save({ skipSuspicious: v })}
        />
        <ToggleRow
          title="Message de bienvenue aux nouveaux abonnés"
          description="Un message privé, envoyé 5 à 90 min après l'abonnement. La conversation apparaît dans Discussions et l'agent répond s'ils écrivent."
          checked={s.welcome}
          onChange={(v) => save({ welcome: v })}
        />
      </div>

      {s.welcome && (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3">
          <label className="text-xs font-medium text-zinc-600">
            Texte du message <span className="font-normal text-zinc-400">— {"{prénom}"} est remplacé par le prénom de la personne</span>
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={500}
            className="mt-1 w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              Aperçu : <span className="text-zinc-700">« {preview} »</span>
            </p>
            {(text !== s.welcomeText || flash) && (
              <button onClick={() => save({ welcomeText: text })} disabled={busy || text === s.welcomeText} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                {flash ? "✓ Enregistré" : "Enregistrer le message"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Abonnements par jour (maximum)
          <select className={select} value={s.maxFollowsPerDay} onChange={(e) => save({ maxFollowsPerDay: Number(e.target.value) })}>
            {[5, 10, 15, 20, 30, 40].map((n) => (
              <option key={n} value={n}>
                Jusqu&apos;à {n}
                {n === 20 ? " (conseillé)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Messages de bienvenue par jour (maximum)
          <select className={select} value={s.maxWelcomesPerDay} onChange={(e) => save({ maxWelcomesPerDay: Number(e.target.value) })}>
            {[3, 5, 10, 15, 20, 25].map((n) => (
              <option key={n} value={n}>
                Jusqu&apos;à {n}
                {n === 10 ? " (conseillé)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(o.today.followCap < s.maxFollowsPerDay || o.today.welcomeCap < s.maxWelcomesPerDay) && (
        <p className="mt-2 text-xs text-zinc-500">Montée en douceur : les plafonds augmentent chaque jour pendant les 2 premières semaines (aujourd&apos;hui {o.today.followCap} abonnements, {o.today.welcomeCap} bienvenues).</p>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <p className="text-xs font-semibold text-zinc-700">
            Ce que l&apos;agent prépare <span className="font-normal text-zinc-400">({o.queue.follows} abonnement{o.queue.follows > 1 ? "s" : ""}, {o.queue.welcomes} bienvenue{o.queue.welcomes > 1 ? "s" : ""})</span>
          </p>
          {o.queue.next.length ? (
            <ul className="mt-2 space-y-1.5">
              {o.queue.next.map((n, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <Avatar src={n.picture} name={n.username} />
                  <span className="min-w-0 flex-1 truncate">
                    {n.action === "follow" ? "Suivre" : "Bienvenue à"} <strong>@{n.username}</strong>
                    {n.reason && <span className="text-zinc-400"> · {REASON[n.reason] ?? n.reason}</span>}
                  </span>
                  <span className="shrink-0 text-zinc-400">{n.at <= now ? "bientôt" : time(n.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-zinc-400">Rien en attente pour l&apos;instant.{o.lastScanAt ? ` Dernier relevé ${ago(o.lastScanAt)}.` : ""}</p>
          )}
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <p className="text-xs font-semibold text-zinc-700">
            Nouveaux abonnés <span className="font-normal text-zinc-400">({o.totals.newFollowers} en 30 jours)</span>
          </p>
          {o.recent.length ? (
            <ul className="mt-2 space-y-1.5">
              {o.recent.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <Avatar src={r.picture} name={r.username} />
                  <span className="min-w-0 flex-1 truncate">
                    <strong>{r.fullName || `@${r.username}`}</strong> <span className="text-zinc-400">{ago(r.at)}</span>
                  </span>
                  {r.followedBack && <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">Suivi</span>}
                  {r.welcomed && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">Bienvenue</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-zinc-400">Les nouveaux abonnés apparaîtront ici.</p>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        30 derniers jours : <strong>{o.totals.followBacks}</strong> suivis en retour · <strong>{o.totals.engagedFollows}</strong> personnes engagées suivies · <strong>{o.totals.welcomes}</strong> bienvenues ·{" "}
        <strong>{o.totals.skipped}</strong> faux comptes écartés
      </p>
    </div>
  );
}
