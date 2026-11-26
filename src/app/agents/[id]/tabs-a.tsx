"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DAYS, instructionsText, type AgentSettings } from "@/lib/agent-settings";
import type { AgentMedia } from "@/lib/kb";
import type { Overview, Prep, TabId, TabProps } from "./editor";
import { Card, Empty, Field, Info, inputClass, Toggle, ToggleRow, Warning } from "./ui";

// ---------------- 1. Vue d'ensemble ----------------

export function OverviewTab({
  agent,
  overview,
  preparation,
  days,
  setDays,
  patchAgent,
  goTo,
}: TabProps & { overview: Overview; preparation: Prep; days: number; setDays: (d: number) => void; patchAgent: (b: object, m: string) => Promise<void> }) {
  const missing = preparation.items.filter((i) => i.points < i.max);
  const working = preparation.items.filter((i) => i.points === i.max);
  const paused = agent.status === "paused";
  const next = paused ? null : missing.sort((a, b) => b.max - b.points - (a.max - a.points))[0];
  const total = overview.aiReplies + overview.human;
  const aiShare = total ? Math.round((overview.aiReplies / total) * 100) : 0;
  const color = preparation.score >= 80 ? "#16a34a" : preparation.score >= 50 ? "#d97706" : "#dc2626";

  return (
    <>
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold">Vue d&apos;ensemble</h2>
          <p className="text-sm text-zinc-500">Ses chiffres sur la période, son état de préparation et l&apos;activité récente.</p>
        </div>
        <div className="flex rounded-xl border border-zinc-200 bg-white p-1 text-sm">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`rounded-lg px-3 py-1 ${days === d ? "bg-zinc-100 font-semibold" : "text-zinc-500"}`}>
              {d} j
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Réponses IA" value={overview.aiReplies} />
        <Stat label="Messages reçus" value={overview.received} />
        <Stat label="Nouveaux contacts" value={overview.newContacts} />
        <Stat label="Réponses de ton équipe" value={overview.human} />
      </div>

      <Card title="Préparation" description="Niveau de préparation de l'agent pour les vraies conversations, noté de 0 à 100.">
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative h-24 w-24 shrink-0">
            <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f4f4f5" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${preparation.score} 100`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold">{preparation.score}</span>
          </div>
          <div className="min-w-0 flex-1">
            {paused ? (
              <>
                <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">ACTION REQUISE</span>
                <p className="mt-2 text-sm font-medium">L&apos;agent est en pause : il ne répond à personne.</p>
                <button onClick={() => patchAgent({ status: "active" }, "Agent activé.")} className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
                  Activer l&apos;agent
                </button>
              </>
            ) : next ? (
              <>
                <p className="text-sm font-medium">À améliorer : {next.label}</p>
                <p className="text-sm text-zinc-500">{next.detail}</p>
                <button onClick={() => goTo(next.tab as TabId)} className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
                  Prochaine étape recommandée →
                </button>
              </>
            ) : (
              <p className="text-sm font-medium text-green-700">Tout est prêt 🎉</p>
            )}
          </div>
        </div>
        <div className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {preparation.groups.map((g) => (
            <div key={g.group}>
              <div className="flex justify-between text-sm">
                <span>{g.group}</span>
                <span className="font-medium text-green-700">
                  {g.points}/{g.max}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-zinc-100">
                <div className={`h-1.5 rounded-full ${g.points === g.max ? "bg-green-600" : g.points ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${(g.points / g.max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {missing.length > 0 && (
        <Card title={`Nécessite une attention (${missing.length})`}>
          <ul className="space-y-3">
            {missing.map((i) => (
              <li key={i.label} className="flex items-start justify-between gap-4 text-sm">
                <span>
                  <span className="font-medium">⚠️ {i.label}</span>
                  <span className="block text-zinc-500">{i.detail}</span>
                </span>
                <button onClick={() => goTo(i.tab as TabId)} className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1 text-xs hover:bg-zinc-50">
                  Corriger
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`Ce qui fonctionne (${working.length})`}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {working.map((i) => (
            <li key={i.label} className="text-sm">
              <span className="font-medium">✅ {i.label}</span>
              <span className="ml-1 text-xs text-zinc-400">
                {i.points}/{i.max}
              </span>
              <span className="block text-zinc-500">{i.detail}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="IA vs humain" description="Qui a écrit les messages envoyés sur la période.">
          <div className="flex h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className="bg-green-600" style={{ width: `${aiShare}%` }} />
            <div className="bg-zinc-400" style={{ width: `${total ? 100 - aiShare : 0}%` }} />
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <p className="flex justify-between">
              <span>● IA</span>
              <span>
                {aiShare} % · <strong>{overview.aiReplies}</strong>
              </span>
            </p>
            <p className="flex justify-between text-zinc-600">
              <span>● Ton équipe</span>
              <span>
                {total ? 100 - aiShare : 0} % · <strong>{overview.human}</strong>
              </span>
            </p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Mini label="IA uniquement" value={overview.conversations.aiOnly} />
            <Mini label="Équipe uniquement" value={overview.conversations.humanOnly} />
            <Mini label="Mixte" value={overview.conversations.mixed} />
          </div>
        </Card>
        <Card title="Activité récente">
          {overview.recent.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucune activité pour l&apos;instant.</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {overview.recent.map((r, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    {r.sender === "contact" ? "💬" : r.sender === "ai" ? "🤖" : "🧑"}{" "}
                    {r.sender === "contact" ? `${r.who ?? "Contact"} a écrit` : r.sender === "ai" ? `L'IA a répondu à ${r.who ?? "un contact"}` : `Tu as répondu à ${r.who ?? "un contact"}`}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400">{new Date(r.ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
      <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-zinc-50 py-2">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}

// ---------------- 2. Instructions de l'IA ----------------

const SECTIONS: { key: keyof AgentSettings["sections"]; title: string; hint: string }[] = [
  { key: "persona", title: "Persona", hint: "Qui est l'IA : son prénom, sa personnalité, sa façon de parler (avec quelques exemples)." },
  { key: "objective", title: "Objectif", hint: "Sa mission et ce qu'est une conversation réussie." },
  { key: "business", title: "Contexte métier", hint: "Ce que fait ton entreprise : offre, prix clés, zones, contacts." },
  { key: "behavior", title: "Comportement conversationnel", hint: "Comment mener la discussion : questions, longueur, objections." },
  { key: "escalation", title: "Escalade et conclusion", hint: "Quand passer la main à un humain, comment conclure, ce qu'elle ne doit jamais faire." },
];

const LANGS = [
  ["fr", "🇫🇷 Français"],
  ["en", "🇬🇧 Anglais"],
  ["es", "🇪🇸 Espagnol"],
  ["de", "🇩🇪 Allemand"],
  ["it", "🇮🇹 Italien"],
  ["pt", "🇵🇹 Portugais"],
  ["nl", "🇳🇱 Néerlandais"],
  ["ar", "🇸🇦 Arabe"],
];

export function InstructionsTab({ agent, settings: s, update, reload, notify }: TabProps) {
  const [open, setOpen] = useState<Set<string>>(new Set(["persona", "objective"]));
  const [writing, setWriting] = useState(false);
  const budget = instructionsText(s).length + s.extraContext.resources.length + s.extraContext.other.length;
  const set = <K extends keyof AgentSettings>(k: K, v: AgentSettings[K]) => update((x) => ({ ...x, [k]: v }));

  async function setLanguage(language: string) {
    await fetch(`/api/agents/${agent.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language }) });
    notify("Langue enregistrée.");
    await reload();
  }

  async function writeFromSite() {
    setWriting(true);
    const res = await fetch(`/api/agents/${agent.id}/instructions`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setWriting(false);
    if (!res.ok) return notify(body.error ?? "Échec.");
    notify("Instructions rédigées à partir du site.");
    await reload();
  }

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold">Instructions de l&apos;IA</h2>
        <p className="text-sm text-zinc-500">La personnalité de l&apos;IA, son contexte, ses délais, ses limites et son modèle.</p>
      </div>

      {!s.transparency && (
        <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="flex-1">
            ⚠️ <strong>La transparence de l&apos;IA est désactivée.</strong> Rien n&apos;indique aux contacts que les réponses sont rédigées par une IA. Tu confirmes que ton
            utilisation est conforme aux lois sur la transparence applicables (par exemple l&apos;AI Act de l&apos;UE). Active l&apos;interrupteur pour l&apos;annoncer.
          </p>
          <Toggle checked={s.transparency} onChange={(v) => set("transparency", v)} label="Transparence de l'IA" />
        </div>
      )}

      <Card title="Mode test" description="Tant qu'il est activé, l'IA ne répond qu'aux contacts de test. Les autres arrivent dans les discussions et tu réponds toi-même.">
        <ToggleRow
          title={s.testMode ? "Mode test activé : l'IA répond seulement aux contacts de test" : "Mode test désactivé : l'IA répond à tout le monde"}
          description="Pour marquer un contact de test : ouvre sa discussion → Afficher les détails → Préférences → « Contact de test »."
          checked={s.testMode}
          onChange={(v) => set("testMode", v)}
        />
        {!s.testMode && (
          <div className="mt-3">
            <Warning>L&apos;IA répondra à toutes les personnes qui écrivent sur ce numéro, y compris tes proches si c&apos;est ton numéro personnel.</Warning>
          </div>
        )}
      </Card>

      <Card title="Brouillons uniquement" description="L'IA rédige chaque message comme un brouillon au lieu de l'envoyer. Tu le relis dans la discussion, puis tu l'envoies ou tu le modifies.">
        <ToggleRow title={s.draftsOnly ? "L'IA prépare des brouillons" : "L'IA envoie ses propres messages"} checked={s.draftsOnly} onChange={(v) => set("draftsOnly", v)} />
      </Card>

      <Card title="Langue principale" description="Utilisée pour ses instructions. Elle répondra toujours dans la langue utilisée par le contact.">
        <select value={agent.language} onChange={(e) => setLanguage(e.target.value)} className={`${inputClass} max-w-xs`}>
          {LANGS.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </Card>

      <Card
        title="Persona et objectif"
        description="Qui est l'IA, quel est son but, et ce qu'elle doit savoir. Ces textes sont lus à chaque réponse."
        action={
          agent.website ? (
            <button onClick={writeFromSite} disabled={writing} className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-50 disabled:text-zinc-400">
              {writing ? "L'IA rédige…" : "✨ Rédiger à partir du site"}
            </button>
          ) : undefined
        }
      >
        <div className="divide-y divide-zinc-100">
          {SECTIONS.map((sec) => {
            const isOpen = open.has(sec.key);
            return (
              <div key={sec.key} className="py-3">
                <button
                  onClick={() =>
                    setOpen((o) => {
                      const n = new Set(o);
                      if (n.has(sec.key)) n.delete(sec.key);
                      else n.add(sec.key);
                      return n;
                    })
                  }
                  className="flex w-full items-center justify-between text-left"
                >
                  <span>
                    <span className="text-xs font-semibold tracking-wide text-zinc-600 uppercase">{sec.title}</span>
                    <span className="block text-xs text-zinc-400">{sec.hint}</span>
                  </span>
                  <span className="text-zinc-400">{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && (
                  <textarea
                    value={s.sections[sec.key]}
                    onChange={(e) => update((x) => ({ ...x, sections: { ...x.sections, [sec.key]: e.target.value } }))}
                    rows={sec.key === "persona" ? 12 : 7}
                    className={`${inputClass} mt-3 leading-relaxed`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Budget de contexte" description="Nombre de caractères d'instructions lus par l'IA à chaque réponse (instructions + contexte supplémentaire).">
        <div className="flex justify-between text-sm">
          <span>{budget.toLocaleString("fr-FR")} / 100 000 caractères</span>
          <span>{Math.round((budget / 100_000) * 100)} %</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-zinc-100">
          <div className={`h-2 rounded-full ${budget > 90_000 ? "bg-red-500" : "bg-green-600"}`} style={{ width: `${Math.min(100, (budget / 100_000) * 100)}%` }} />
        </div>
      </Card>

      <Card title="Délai de réponse" description="Temps d'attente de l'IA avant de répondre, en secondes. Un délai aléatoire entre le minimum et le maximum rend les réponses plus naturelles.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Attente minimum (secondes)" hint="Entre 0 et 120.">
            <input type="number" min={0} max={120} value={s.delayMin} onChange={(e) => set("delayMin", clamp(e.target.value, 0, 120))} className={inputClass} />
          </Field>
          <Field label="Attente maximum (secondes)" hint="Doit être supérieure ou égale au minimum.">
            <input type="number" min={0} max={300} value={s.delayMax} onChange={(e) => set("delayMax", Math.max(s.delayMin, clamp(e.target.value, 0, 300)))} className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card title="Limites de réponse" description="Nombre de messages que l'IA peut envoyer avant de passer la main à un humain.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max de messages IA par conversation" hint="Au-delà, l'IA laisse la main à un humain. 0 = sans limite.">
            <input type="number" min={0} max={500} value={s.maxAiPerChat} onChange={(e) => set("maxAiPerChat", clamp(e.target.value, 0, 500))} className={inputClass} />
          </Field>
          <Field label="Nouvelle conversation après (heures)" hint="Si le contact revient après ce silence, le compteur repart à zéro. 0 = jamais.">
            <input type="number" min={0} max={720} value={s.limitResetHours} onChange={(e) => set("limitResetHours", clamp(e.target.value, 0, 720))} className={inputClass} />
          </Field>
          <Field label="Nombre max de messages par réponse" hint="1 = un seul message. Plus = réponse découpée en bulles.">
            <input type="number" min={1} max={6} value={s.maxBubbles} onChange={(e) => set("maxBubbles", clamp(e.target.value, 1, 6))} className={inputClass} />
          </Field>
          <Field label="Caractères que l'IA n'envoie jamais" hint="Ex. : — (tiret long, typique des textes d'IA).">
            <input value={s.forbiddenChars} onChange={(e) => set("forbiddenChars", e.target.value.slice(0, 20))} className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card title="Vitesse de réponse de l'IA" description="Équilibre entre temps de réflexion et rapidité.">
        <div className="grid gap-3 sm:grid-cols-4">
          {(
            [
              ["human", "Humain", "Le plus précis"],
              ["balanced", "Réfléchi", "Équilibré"],
              ["fast", "Rapide", "Intelligent et rapide"],
              ["very_fast", "Très rapide", "Le plus rapide"],
            ] as const
          ).map(([id, title, sub]) => (
            <Choice key={id} active={s.speed === id} onClick={() => set("speed", id)} title={title} sub={sub} />
          ))}
        </div>
      </Card>

      <Card title="Qualité de l'IA" description="Le modèle utilisé par cet agent (via Cloudflare).">
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice active={s.quality === "max"} onClick={() => set("quality", "max")} title="Max · recommandé" sub="DeepSeek V4.1 Flash : rapide, voit les images, très bon rapport qualité/prix." />
          <Choice active={s.quality === "pro"} onClick={() => set("quality", "pro")} title="Pro" sub="DeepSeek V4 Pro : raisonnement plus poussé, plus lent et plus coûteux." />
        </div>
      </Card>
    </>
  );
}

const clamp = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));

function Choice({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border px-4 py-3 text-left ${active ? "border-green-500 bg-green-50" : "border-zinc-200 hover:bg-zinc-50"}`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="block text-xs text-zinc-500">{sub}</span>
    </button>
  );
}

// ---------------- 3. Heures d'activité ----------------

export function HoursTab({ settings: s, update }: TabProps) {
  const setHours = (h: Partial<AgentSettings["hours"]>) => update((x) => ({ ...x, hours: { ...x.hours, ...h } }));
  return (
    <>
      <div>
        <h2 className="text-lg font-semibold">Heures d&apos;activité</h2>
        <p className="text-sm text-zinc-500">
          Périodes pendant lesquelles l&apos;agent peut répondre. En dehors, les messages sont mis en attente et l&apos;agent répond dès la réouverture.
        </p>
      </div>
      <Card title="Disponibilité">
        <ToggleRow title="Actif 24h/24 et 7j/7" description="L'agent répond à tout moment, chaque jour." checked={s.hours.always} onChange={(v) => setHours({ always: v })} />
        {!s.hours.always && (
          <div className="mt-5 space-y-3">
            <Field label="Fuseau horaire">
              <select value={s.hours.timezone} onChange={(e) => setHours({ timezone: e.target.value })} className={`${inputClass} max-w-xs`}>
                {["Europe/Paris", "Europe/Brussels", "Europe/Zurich", "Europe/London", "Africa/Douala", "Africa/Abidjan", "Africa/Dakar", "Africa/Casablanca", "America/Montreal", "Indian/Reunion"].map((tz) => (
                  <option key={tz}>{tz}</option>
                ))}
              </select>
            </Field>
            <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
              {DAYS.map((d) => {
                const day = s.hours.days[d.id];
                const setDay = (p: Partial<typeof day>) => setHours({ days: { ...s.hours.days, [d.id]: { ...day, ...p } } });
                return (
                  <div key={d.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                    <Toggle checked={day.on} onChange={(v) => setDay({ on: v })} label={d.label} />
                    <span className="w-24 text-sm font-medium">{d.label}</span>
                    {day.on ? (
                      <span className="flex items-center gap-2 text-sm">
                        de <input type="time" value={day.start} onChange={(e) => setDay({ start: e.target.value })} className="rounded-lg border border-zinc-200 px-2 py-1" />
                        à <input type="time" value={day.end} onChange={(e) => setDay({ end: e.target.value })} className="rounded-lg border border-zinc-200 px-2 py-1" />
                      </span>
                    ) : (
                      <span className="text-sm text-zinc-400">Fermé</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

// ---------------- 4. Média ----------------

export function MediaTab({ agent, notify }: TabProps) {
  const [media, setMedia] = useState<AgentMedia[] | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/agents/${agent.id}/media`, { cache: "no-store" });
    if (res.ok) setMedia((await res.json()).media);
  }, [agent.id]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function saveWhen(m: AgentMedia, when: string) {
    if (when === m.whenToSend) return;
    await fetch(`/api/agents/${agent.id}/media/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ when }) });
    notify("Consigne enregistrée.");
    void load();
  }

  async function remove(m: AgentMedia) {
    if (!window.confirm(`Supprimer « ${m.name} » ?`)) return;
    await fetch(`/api/agents/${agent.id}/media/${m.id}`, { method: "DELETE" });
    void load();
  }

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold">Bibliothèque multimédia</h2>
        <p className="text-sm text-zinc-500">
          Images, vidéos, audio ou PDF que l&apos;agent peut envoyer pendant une conversation. Chaque fichier a une consigne : quand l&apos;envoyer.
        </p>
      </div>
      <Card
        title={`${media?.length ?? 0} élément${(media?.length ?? 0) > 1 ? "s" : ""}`}
        badge="Enregistrement instantané"
        action={
          <button onClick={() => setAdding(true)} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
            ＋ Ajouter un média
          </button>
        }
      >
        {media && media.length === 0 ? (
          <Empty icon="✨" title="Aucun média pour l'instant" text="Importe des images, vidéos, fichiers audio ou PDF et indique à l'agent quand envoyer chacun d'eux.">
            <button onClick={() => setAdding(true)} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
              ＋ Ajouter un média
            </button>
          </Empty>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {media?.map((m) => (
              <li key={m.id} className="flex gap-3 rounded-xl border border-zinc-200 p-3">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 text-2xl">
                  {m.mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- fichier servi par l'API
                    <img src={`/api/agents/${agent.id}/media/${m.id}`} alt={m.name} className="h-full w-full object-cover" />
                  ) : m.mime.startsWith("video/") ? (
                    "🎬"
                  ) : m.mime.startsWith("audio/") ? (
                    "🎵"
                  ) : (
                    "📄"
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <button onClick={() => remove(m)} className="text-zinc-400 hover:text-red-600" aria-label="Supprimer">
                      🗑️
                    </button>
                  </div>
                  <textarea
                    defaultValue={m.whenToSend}
                    onBlur={(e) => saveWhen(m, e.target.value)}
                    rows={2}
                    placeholder="Quand l'envoyer ? Ex. : quand la cliente demande le catalogue"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1 text-xs outline-none focus:border-zinc-400"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Info>L&apos;IA choisit d&apos;elle-même d&apos;envoyer un fichier quand la situation correspond à sa consigne.</Info>
      {adding && (
        <AddMediaModal
          agentId={agent.id}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function AddMediaModal({ agentId, onClose, onAdded }: { agentId: number; onClose: () => void; onAdded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!/^(image|video|audio)\//.test(f.type) && f.type !== "application/pdf") return setError("Image, vidéo, audio ou PDF uniquement.");
    if (f.size > 32 * 1024 * 1024) return setError("Fichier trop lourd (32 Mo max).");
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  async function add() {
    if (!file) return setError("Choisis d'abord le fichier à envoyer (étape 1).");
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("when", when);
    const res = await fetch(`/api/agents/${agentId}/media`, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Échec de l'envoi.");
    onAdded();
  }

  const kind = file ? (file.type.startsWith("image/") ? "Image" : file.type.startsWith("video/") ? "Vidéo" : file.type.startsWith("audio/") ? "Audio" : "PDF") : "";
  const size = file ? (file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(file.size / 1024))} Ko`) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Ajouter un média</h2>
        <p className="mt-0.5 text-sm text-zinc-500">Un fichier que l&apos;agent enverra tout seul au bon moment.</p>

        <div className="mt-5 space-y-5">
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">1. Le fichier</p>
            <input ref={picker} type="file" accept="image/*,video/*,audio/*,application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            {file ? (
              <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50/60 p-3">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- aperçu local du fichier choisi
                  <img src={preview} alt="" className="h-14 w-14 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-white text-xs font-bold text-zinc-500">{kind}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-zinc-500">
                    {kind} · {size}
                  </p>
                </div>
                <button onClick={() => picker.current?.click()} className="rounded-lg px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100">
                  Changer
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => picker.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pick(e.dataTransfer.files?.[0]);
                }}
                className={`flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-7 text-center transition ${
                  dragging ? "border-green-500 bg-green-50" : "border-zinc-300 hover:border-green-500 hover:bg-green-50/40"
                }`}
              >
                <span className="text-2xl">📎</span>
                <span className="text-sm font-semibold text-zinc-800">Clique pour choisir un fichier</span>
                <span className="text-xs text-zinc-500">ou glisse-le ici · image, vidéo, audio ou PDF · 32 Mo max</span>
              </button>
            )}
          </div>

          <Field label="2. Quand l'envoyer ?" hint="L'IA lit cette consigne pour savoir quand envoyer le fichier.">
            <textarea value={when} onChange={(e) => setWhen(e.target.value)} rows={3} placeholder="Ex. : quand le contact demande une photo du produit, les tarifs ou le catalogue" className={inputClass} />
          </Field>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button onClick={add} disabled={busy} className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-green-300">
            {busy ? "Envoi…" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}
