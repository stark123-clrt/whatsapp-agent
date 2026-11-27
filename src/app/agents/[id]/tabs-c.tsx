"use client";

import { Icon as UiIcon } from "@/app/icons";

import { useEffect, useRef, useState } from "react";
import type { EntryRule } from "@/lib/agent-settings";
import type { TabProps } from "./editor";
import { Card, Field, Info, inputClass, Soon, Toggle, ToggleRow, Warning } from "./ui";

// ---------------- 8. Suivis (relances automatiques) ----------------

export function FollowupsTab({ settings: s, update }: TabProps) {
  const fu = s.followups;
  const setFu = (p: Partial<typeof fu>) => update((x) => ({ ...x, followups: { ...x.followups, ...p } }));
  const total = fu.cycles.reduce((n, c) => n + c.messages, 0);
  return (
    <>
      <div>
        <h2 className="text-lg font-semibold">Relances automatiques</h2>
        <p className="text-sm text-zinc-500">
          Jusqu&apos;à 9 messages répartis sur 3 cycles pour relancer les conversations inactives, avec un ton différent à chaque cycle. Les relances s&apos;arrêtent dès que
          le contact répond et sont écrites dans la langue de la conversation.
        </p>
      </div>
      <Card title="Activer les relances automatiques" badge="Enregistrement à la sauvegarde">
        <ToggleRow
          title={fu.enabled ? `Relances activées (${total} message${total > 1 ? "s" : ""} maximum par contact)` : "Relances désactivées"}
          description="Les heures d'activité sont respectées et le sujet de la conversation est repris automatiquement. Un contact peut être exclu depuis Préférences → « Suivis » dans sa discussion."
          checked={fu.enabled}
          onChange={(v) => setFu({ enabled: v })}
        />
        <div className="mt-4">
          <Warning>
            <strong>Nouveau numéro ou compte ? Laisse cette option désactivée pour l&apos;instant.</strong> Des relances sans réponse sur un numéro récent peuvent le
            faire signaler ou bloquer par WhatsApp. Attends environ un mois d&apos;échanges normaux avant de les activer.
          </Warning>
        </div>
      </Card>
      {fu.enabled && (
        <Card title="Cycles de relance" description="Le délai est compté depuis le dernier message envoyé au contact.">
          <div className="space-y-4">
            {fu.cycles.map((c, i) => {
              const setCycle = (p: Partial<typeof c>) => setFu({ cycles: fu.cycles.map((x, j) => (j === i ? { ...x, ...p } : x)) });
              return (
                <div key={i} className="grid gap-4 rounded-xl border border-zinc-200 p-4 sm:grid-cols-[auto_1fr_1fr_2fr]">
                  <span className="pt-7 text-sm font-semibold">Cycle {i + 1}</span>
                  <Field label="Délai (heures)">
                    <input type="number" min={1} max={720} value={c.delayHours} onChange={(e) => setCycle({ delayHours: Math.max(1, Math.min(720, Number(e.target.value) || 1)) })} className={inputClass} />
                  </Field>
                  <Field label="Messages">
                    <select value={c.messages} onChange={(e) => setCycle({ messages: Number(e.target.value) })} className={inputClass}>
                      {[1, 2, 3].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Ton de la relance">
                    <input value={c.tone} onChange={(e) => setCycle({ tone: e.target.value.slice(0, 120) })} className={inputClass} />
                  </Field>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}

// ---------------- 9. Points d'entrée ----------------

export function EntryTab({ settings: s, update }: TabProps) {
  const setRules = (fn: (r: EntryRule[]) => EntryRule[]) => update((x) => ({ ...x, entryRules: fn(x.entryRules) }));
  return (
    <>
      <div>
        <h2 className="text-lg font-semibold">Points d&apos;entrée</h2>
        <p className="text-sm text-zinc-500">Règles qui dirigent une nouvelle conversation vers cet agent.</p>
      </div>
      <Card title="Widget de chat pour site web" description="Les chats venant d'un widget installé sur ton site arrivent directement à cet agent.">
        <Soon>Obtenir le code d&apos;intégration</Soon>
      </Card>
      <Card
        title="Règles"
        description="La première correspondance l'emporte : les règles de mots-clés sont vérifiées avant le canal par défaut."
        action={
          <button
            onClick={() => setRules((r) => [...r, { id: crypto.randomUUID(), kind: "keyword", keywords: "", enabled: true }])}
            className="shrink-0 text-sm font-medium text-green-700 hover:underline"
          >
            ＋ Nouveau point d&apos;entrée
          </button>
        }
      >
        <ul className="space-y-3">
          {s.entryRules.map((rule) => {
            const set = (p: Partial<EntryRule>) => setRules((r) => r.map((x) => (x.id === rule.id ? { ...x, ...p } : x)));
            return (
              <li key={rule.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3">
                {rule.kind === "default" ? (
                  <div className="flex-1">
                    <span className="rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">◎ Canal par défaut</span>{" "}
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">WhatsApp</span>
                    <p className="mt-1 text-sm text-zinc-600">Par défaut pour ce canal : toutes les nouvelles conversations sans autre règle.</p>
                  </div>
                ) : (
                  <div className="min-w-64 flex-1">
                    <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">Mots-clés</span>
                    <input
                      value={rule.keywords}
                      onChange={(e) => set({ keywords: e.target.value })}
                      placeholder="promo, soldes, devis (séparés par des virgules)"
                      className={`${inputClass} mt-2`}
                    />
                    <p className="mt-1 text-xs text-zinc-500">Si le premier message contient un de ces mots, la conversation est confiée à cet agent.</p>
                  </div>
                )}
                <Toggle checked={rule.enabled} onChange={(v) => set({ enabled: v })} label="Activer la règle" />
                <button
                  onClick={() => setRules((r) => r.filter((x) => x.id !== rule.id))}
                  disabled={rule.kind === "default" && s.entryRules.filter((r) => r.kind === "default").length === 1}
                  className="text-zinc-400 hover:text-red-600 disabled:opacity-30"
                  aria-label="Supprimer la règle"
                >
                  <UiIcon name="trash" size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      <Info>Les points d&apos;entrée dirigent une conversation vers cet agent. Tu peux aussi changer l&apos;agent d&apos;une discussion depuis son menu « ⋯ ».</Info>
    </>
  );
}

// ---------------- 10. Essayer ----------------

type TryMsg = { role: "user" | "assistant"; content: string; actions?: { kind: string; value: string }[] };

export function TryTab({ agent, settings: s, update, saveNow }: TabProps) {
  const [messages, setMessages] = useState<TryMsg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(true);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  async function send(history: TryMsg[]) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/agents/${agent.id}/try`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.map((m) => ({ role: m.role, content: m.content })) }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Échec.");
    const replies: TryMsg[] = (body.bubbles as string[]).map((b, i, all) => ({
      role: "assistant",
      content: b,
      actions: i === all.length - 1 ? body.actions : undefined,
    }));
    setMessages([...history, ...replies]);
  }

  function submit() {
    if (!text.trim() || busy) return;
    const next: TryMsg[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(next);
    setText("");
    void send(next);
  }

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold">Essayer</h2>
        <p className="text-sm text-zinc-500">
          Discute avec l&apos;agent comme le ferait un contact. Il répond avec ses instructions, ses FAQ et ses réglages actuels. Rien n&apos;est envoyé sur WhatsApp.
        </p>
      </div>
      {!s.transparency && (
        <Warning>La transparence de l&apos;IA est désactivée : rien n&apos;indique aux contacts que les réponses sont rédigées par une IA.</Warning>
      )}
      <Info>Ce chat de test est plus rapide qu&apos;une vraie conversation : les délais de réponse sont ignorés ici.</Info>

      <div className={`grid gap-5 ${showInstructions ? "lg:grid-cols-2" : ""}`}>
        {showInstructions && (
          <Card
            title="Instructions de l'IA"
            description="Modifie, enregistre, puis teste à droite."
            action={
              <button onClick={() => saveNow()} className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                Enregistrer
              </button>
            }
          >
            <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
              {(
                [
                  ["persona", "Persona"],
                  ["objective", "Objectif"],
                  ["business", "Contexte métier"],
                  ["behavior", "Comportement"],
                  ["escalation", "Escalade et conclusion"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <textarea
                    value={s.sections[key]}
                    onChange={(e) => update((x) => ({ ...x, sections: { ...x.sections, [key]: e.target.value } }))}
                    rows={key === "persona" ? 10 : 5}
                    className={`${inputClass} leading-relaxed`}
                  />
                </Field>
              ))}
            </div>
          </Card>
        )}

        <Card
          title="Conversation de test"
          description="Les modifications non enregistrées ne sont pas prises en compte : enregistre d'abord."
          action={
            <div className="flex shrink-0 gap-3 text-xs">
              <button onClick={() => setShowInstructions(!showInstructions)} className="text-zinc-600 hover:underline">
                {showInstructions ? "Masquer les instructions" : "Afficher les instructions"}
              </button>
              <button onClick={() => setMessages([])} className="text-red-600 hover:underline">
                ↻ Recommencer
              </button>
            </div>
          }
        >
          <div className="flex h-[28rem] flex-col">
            <div className="flex-1 space-y-2 overflow-y-auto rounded-xl bg-zinc-50 p-3">
              {messages.length === 0 && <p className="py-10 text-center text-sm text-zinc-400">Écris un premier message comme si tu étais un client.</p>}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm shadow-sm ${m.role === "user" ? "bg-zinc-200" : "bg-[#D9FDD3]"}`}>
                    {m.role === "assistant" && <p className="mb-0.5 text-xs font-medium text-green-700">IA</p>}
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.actions && m.actions.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {m.actions.map((a, j) => (
                          <span key={j} className="rounded bg-white/70 px-1.5 py-0.5 text-[11px] text-zinc-600">
                            {{ TAG: "Tag", TACHE: "Tâche", NOM: "Nom", INFO: "Info", HUMAIN: "Humain", MEDIA: "Média" }[a.kind] ?? a.kind} : {a.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {busy && <p className="text-sm font-medium text-green-700">L&apos;IA écrit…</p>}
              <div ref={bottom} />
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-3 flex gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                placeholder="Écris en tant que contact…"
                className={`${inputClass} resize-none`}
              />
              <button onClick={submit} disabled={busy || !text.trim()} className="rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-green-300">
                ➤
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-400">Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne</p>
          </div>
        </Card>
      </div>
    </>
  );
}
