"use client";

import { Icon as UiIcon } from "@/app/icons";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { TagRule } from "@/lib/agent-settings";
import type { Faq, KbSource } from "@/lib/kb";
import type { TabProps } from "./editor";
import { Card, Empty, Field, Info, inputClass, Soon, Toggle, ToggleRow, Warning } from "./ui";

const json = (body: unknown): RequestInit => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ---------------- 5. FAQ et connaissances ----------------

export function FaqTab({ agent, settings: s, update, notify }: TabProps) {
  const [data, setData] = useState<{ faqs: Faq[]; linked: KbSource[]; others: { id: number; name: string; pages: number }[] } | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/agents/${agent.id}/knowledge`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, [agent.id]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function addFaq() {
    const res = await fetch("/api/kb/faqs", { method: "POST", ...json({ question: q, answer: a, agentId: agent.id }) });
    if (!res.ok) return notify("Question et réponse obligatoires.");
    setQ("");
    setA("");
    setAdding(false);
    void load();
  }

  async function link(sourceId: number, agentId: number | null) {
    await fetch(`/api/kb/sources/${sourceId}`, { method: "PATCH", ...json({ agentId }) });
    notify(agentId ? "Source liée à l'agent." : "Source déliée.");
    void load();
  }

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold">FAQ et connaissances</h2>
        <p className="text-sm text-zinc-500">Ce que l&apos;IA sait : ses FAQ, ses sources et le contexte supplémentaire.</p>
      </div>

      <Card
        title={`FAQ de l'agent · ${data?.faqs.length ?? 0}`}
        badge="Enregistrement instantané"
        description={
          <>
            Les FAQ de ses sources, celles ajoutées pour lui et celles communes à tous les agents.{" "}
            <Link href="/base-de-connaissances" className="text-green-700 underline">
              Gérer la bibliothèque complète
            </Link>
          </>
        }
        action={
          <button onClick={() => setAdding(!adding)} className="shrink-0 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
            ＋ Ajouter des FAQ
          </button>
        }
      >
        {adding && (
          <div className="mb-4 space-y-2 rounded-xl border border-zinc-200 p-4">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Question" className={inputClass} autoFocus />
            <textarea value={a} onChange={(e) => setA(e.target.value)} rows={3} placeholder="Réponse" className={inputClass} />
            <div className="flex justify-end">
              <button onClick={addFaq} disabled={!q.trim() || !a.trim()} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:bg-green-300">
                Ajouter
              </button>
            </div>
          </div>
        )}
        {data && data.faqs.length === 0 && <p className="text-sm text-zinc-500">Aucune FAQ. Lie une source ou ajoute des questions.</p>}
        <ul className="max-h-[32rem] divide-y divide-zinc-100 overflow-y-auto">
          {data?.faqs.map((f) => (
            <FaqLine key={f.id} faq={f} onChanged={load} />
          ))}
        </ul>
      </Card>

      <Card title={`Sources de connaissances · ${data?.linked.length ?? 0}`} badge="Enregistrement instantané" description="Sites web et fichiers liés. Leurs FAQ servent à cet agent.">
        {data?.linked.length === 0 && <p className="text-sm text-zinc-500">Aucune source liée.</p>}
        <ul className="space-y-2">
          {data?.linked.map((src) => (
            <li key={src.id} className="rounded-xl border border-zinc-200">
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium">
                  <UiIcon name={src.kind === "site" ? "globe" : "file"} size={15} className="mr-1 inline-block align-[-3px] text-zinc-400" />{src.name}
                </span>
                <span className="flex items-center gap-3 text-xs">
                  <span className="text-zinc-500">
                    {src.pages.length} pages · {src.pages.reduce((n, p) => n + p.faqCount, 0)} FAQ
                  </span>
                  <button onClick={() => link(src.id, null)} className="text-red-600 hover:underline">
                    Tout dissocier
                  </button>
                </span>
              </div>
              {src.pages.find((p) => p.status === "error")?.error && (
                <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
                  <UiIcon name="alert" size={14} className="mr-1 inline-block align-[-3px]" />{src.pages.find((p) => p.status === "error")?.error}
                </p>
              )}
              <ul className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-600">
                {src.pages.map((p) => (
                  <li key={p.id} className="flex justify-between py-0.5">
                    <span className="truncate font-mono">{p.url.replace(/^https?:\/\/[^/]+/, "") || "/"}</span>
                    <span className={p.status === "error" ? "text-red-600" : ""} title={p.error ?? undefined}>
                      {{ ready: `${p.faqCount} FAQ`, error: "erreur", pending: "en attente", processing: "lecture…" }[p.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {data && data.others.length > 0 && (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="text-zinc-500">Lier une autre source :</span>
            <select defaultValue="" onChange={(e) => e.target.value && link(Number(e.target.value), agent.id)} className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5">
              <option value="">Choisir…</option>
              {data.others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.pages} pages)
                </option>
              ))}
            </select>
          </div>
        )}
      </Card>

      <Card title="Recherche web par IA" description="L'IA effectue des recherches sur le web en temps réel pour répondre.">
        <Soon>Recherche web en direct</Soon>
      </Card>

      <Card title="Contexte supplémentaire" description="Texte libre sur lequel l'IA peut s'appuyer, en plus des FAQ et des sources.">
        <div className="space-y-4">
          <Field label="Ressources" hint="Liens, références, documents utiles à citer.">
            <textarea
              value={s.extraContext.resources}
              onChange={(e) => update((x) => ({ ...x, extraContext: { ...x.extraContext, resources: e.target.value } }))}
              rows={4}
              className={inputClass}
            />
          </Field>
          <Field label="Autres informations" hint="Tout ce que l'IA doit savoir d'autre (promotions du moment, consignes…).">
            <textarea
              value={s.extraContext.other}
              onChange={(e) => update((x) => ({ ...x, extraContext: { ...x.extraContext, other: e.target.value } }))}
              rows={4}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>
    </>
  );
}

function FaqLine({ faq, onChanged }: { faq: Faq; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState(faq.question);
  const [a, setA] = useState(faq.answer);

  async function save() {
    await fetch(`/api/kb/faqs/${faq.id}`, { method: "PATCH", ...json({ question: q, answer: a }) });
    setEditing(false);
    onChanged();
  }
  async function remove() {
    if (!window.confirm("Supprimer cette FAQ ?")) return;
    await fetch(`/api/kb/faqs/${faq.id}`, { method: "DELETE" });
    onChanged();
  }

  if (editing) {
    return (
      <li className="space-y-2 py-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} className={inputClass} />
        <textarea value={a} onChange={(e) => setA(e.target.value)} rows={3} className={inputClass} />
        <div className="flex justify-end gap-2">
          <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-zinc-100">
            Annuler
          </button>
          <button onClick={save} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white">
            Enregistrer
          </button>
        </div>
      </li>
    );
  }
  return (
    <li className="group flex gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {faq.question}{" "}
          <span className={`ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${faq.pageId ? "bg-green-50 text-green-700" : "bg-sky-50 text-sky-700"}`}>
            {faq.pageId ? "Depuis la source" : faq.agentId ? "Ajoutée pour cet agent" : "Commune"}
          </span>
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm text-zinc-600">{faq.answer}</p>
      </div>
      <span className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
        <button onClick={() => setEditing(true)} aria-label="Modifier" className="rounded px-1 hover:bg-zinc-100">
          <UiIcon name="pen" size={15} />
        </button>
        <button onClick={remove} aria-label="Supprimer" className="rounded px-1 hover:bg-red-50">
          <UiIcon name="trash" size={15} />
        </button>
      </span>
    </li>
  );
}

// ---------------- 6. Capacités de l'IA ----------------

export function CapabilitiesTab({ settings: s, update }: TabProps) {
  const cap = (k: keyof typeof s.capabilities, v: boolean) => update((x) => ({ ...x, capabilities: { ...x.capabilities, [k]: v } }));
  return (
    <>
      <div>
        <h2 className="text-lg font-semibold">Capacités de l&apos;IA</h2>
        <p className="text-sm text-zinc-500">Ce que l&apos;IA de cet agent a le droit de faire pendant une conversation.</p>
      </div>
      <Card title="Fonctions personnalisées" description="Permettre à l'IA d'appeler ta propre API pendant une discussion.">
        <Empty icon="code" title="Aucune fonction personnalisée pour le moment" text="Bientôt : crée une fonction pour que l'IA consulte un stock, une commande ou un devis dans ton système." />
      </Card>
      <Card title="Outils connectés (serveurs MCP)" description="Outils externes que l'IA peut utiliser.">
        <Empty icon="server" title="Aucun serveur MCP pour le moment" text="Bientôt : branche des serveurs MCP dans les Paramètres, puis active-les ici." />
      </Card>
      <Card title="Réservations" description="Permettre à l'agent de prendre des rendez-vous selon tes disponibilités.">
        <Soon>Autoriser cet agent à réserver des rendez-vous</Soon>
      </Card>
      <Card title="Clôture des conversations" description="Comment l'IA termine une conversation.">
        <ToggleRow
          title="Vérification finale avant clôture"
          description="Avant de terminer une conversation, l'IA demande si elle peut aider pour autre chose."
          checked={s.capabilities.closingCheck}
          onChange={(v) => cap("closingCheck", v)}
        />
      </Card>
      <Card title="Mises à jour des contacts" description="Ce que l'IA a le droit de modifier sur tes contacts.">
        <div className="space-y-3">
          <ToggleRow
            title="Autoriser l'IA à mettre à jour les noms des contacts"
            description="Quand le contact donne son nom, l'IA renomme la fiche. Désactive si tu nommes tes contacts toi-même."
            checked={s.capabilities.updateNames}
            onChange={(v) => cap("updateNames", v)}
          />
          <ToggleRow
            title="Autoriser l'IA à collecter des informations supplémentaires"
            description="L'IA ajoute dans les notes du contact les détails utiles qu'il donne (adresse, taille, date…)."
            checked={s.capabilities.collectInfo}
            onChange={(v) => cap("collectInfo", v)}
          />
        </div>
      </Card>
      <Card title="Tâches" description="L'IA peut créer des tâches de suivi à partir des conversations.">
        <ToggleRow
          title="Autoriser l'IA à créer des tâches"
          description="Par exemple un rappel promis au client ou une question qu'elle n'a pas pu traiter. Les tâches apparaissent dans le panneau de détails de la discussion."
          checked={s.capabilities.createTasks}
          onChange={(v) => cap("createTasks", v)}
        />
      </Card>
      <Card title="Passage à un humain" description="Quand l'IA doit laisser la main à ton équipe.">
        <ToggleRow
          title="Autoriser l'IA à passer la main"
          description="Sur demande explicite, réclamation sérieuse ou sujet hors de son périmètre : l'IA prévient le contact, se met en pause dans la discussion et crée une tâche."
          checked={s.capabilities.handoff}
          onChange={(v) => cap("handoff", v)}
        />
      </Card>
      <Card title="Transparence de l'IA" description="L'IA indique-t-elle aux contacts qu'elle est une IA ?">
        <ToggleRow
          title="Indiquer aux contacts qu'ils discutent avec une IA"
          description="La première réponse de l'IA mentionne naturellement qu'il s'agit d'un assistant IA. Les réponses suivantes restent inchangées."
          checked={s.transparency}
          onChange={(v) => update((x) => ({ ...x, transparency: v }))}
        />
        {!s.transparency && (
          <div className="mt-3">
            <Warning>Désactivé : tu confirmes que ton utilisation est conforme aux lois sur la transparence applicables (par exemple l&apos;AI Act de l&apos;UE).</Warning>
          </div>
        )}
      </Card>
    </>
  );
}

// ---------------- 7. Tags ----------------

export function TagsTab({ agent, settings: s, update, saveNow, notify }: TabProps) {
  const [busy, setBusy] = useState<"generate" | "apply" | null>(null);
  const setRules = (fn: (r: TagRule[]) => TagRule[]) => update((x) => ({ ...x, tagRules: fn(x.tagRules) }));
  const newRule = (): TagRule => ({ id: crypto.randomUUID(), name: "", when: "", webhook: "", allowRemove: false });

  async function generate() {
    setBusy("generate");
    const res = await fetch(`/api/agents/${agent.id}/tags`, { method: "POST", ...json({ action: "generate" }) });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return notify(body.error ?? "Échec.");
    const existing = new Set(s.tagRules.map((r) => r.name.toLowerCase()));
    const fresh = (body.rules as TagRule[]).filter((r) => !existing.has(r.name.toLowerCase()));
    setRules((r) => [...r, ...fresh]);
    notify(`${fresh.length} tags proposés. Relis-les puis enregistre.`);
  }

  async function apply() {
    setBusy("apply");
    await saveNow();
    const res = await fetch(`/api/agents/${agent.id}/tags`, { method: "POST", ...json({ action: "apply" }) });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    notify(res.ok ? `${body.scanned} discussions analysées, ${body.tagged} étiquetées.` : (body.error ?? "Échec."));
  }

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold">Tags</h2>
        <p className="text-sm text-zinc-500">
          L&apos;IA étiquette les contacts au fil de la conversation (par exemple « Intéressé », « Budget &gt; 30 € »). Chaque tag peut prévenir une autre application
          (webhook) quand il est appliqué.
        </p>
      </div>
      <Card
        title={`Tags · ${s.tagRules.length}`}
        action={
          <div className="flex shrink-0 flex-wrap gap-2">
            <button onClick={generate} disabled={busy !== null} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-50 disabled:text-zinc-400">
              {busy === "generate" ? "L'IA réfléchit…" : "Générer avec l'IA"}
            </button>
            <button onClick={apply} disabled={busy !== null || !s.tagRules.length} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-50 disabled:text-zinc-400">
              {busy === "apply" ? "Analyse en cours…" : "Appliquer aux conversations existantes"}
            </button>
            <button onClick={() => setRules((r) => [...r, newRule()])} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-50">
              ＋ Ajouter un tag
            </button>
          </div>
        }
      >
        <Info>Décris quand l&apos;IA doit appliquer chaque tag. Elle lit la conversation en direct et étiquette le contact automatiquement. Garde ceux que tu utilises vraiment.</Info>
        {s.tagRules.length === 0 && <p className="mt-4 text-sm text-zinc-500">Aucun tag. Clique sur « Générer avec l&apos;IA » ou « Ajouter un tag ».</p>}
        <ul className="mt-4 space-y-4">
          {s.tagRules.map((rule) => {
            const set = (p: Partial<TagRule>) => setRules((r) => r.map((x) => (x.id === rule.id ? { ...x, ...p } : x)));
            return (
              <li key={rule.id} className="space-y-3 rounded-xl border border-zinc-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold"><UiIcon name="tag" size={14} className="mr-1 inline-block align-[-3px] text-zinc-400" />{rule.name || "Nouveau tag"}</span>
                  <button onClick={() => setRules((r) => r.filter((x) => x.id !== rule.id))} className="text-zinc-400 hover:text-red-600" aria-label="Supprimer le tag">
                    <UiIcon name="trash" size={15} />
                  </button>
                </div>
                <Field label="Nom *">
                  <input value={rule.name} onChange={(e) => set({ name: e.target.value.slice(0, 40) })} className={inputClass} />
                </Field>
                <Field label="Quand appliquer" hint="Indique à l'IA la situation qui doit déclencher ce tag.">
                  <textarea value={rule.when} onChange={(e) => set({ when: e.target.value.slice(0, 300) })} rows={2} className={inputClass} />
                </Field>
                <Field label="Notifier une autre application (optionnel)" hint="Adresse https (webhook) de ton CRM, Zapier ou Make : on y envoie le contact et le tag dès que l'IA l'applique.">
                  <input value={rule.webhook} onChange={(e) => set({ webhook: e.target.value.trim() })} placeholder="https://hooks.zapier.com/…" className={`${inputClass} font-mono`} />
                </Field>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span>
                    Laisser l&apos;IA retirer ce tag
                    <span className="block text-xs text-zinc-500">Bientôt : l&apos;IA pourra retirer le tag si la situation change.</span>
                  </span>
                  <Toggle checked={rule.allowRemove} onChange={(v) => set({ allowRemove: v })} label="Laisser l'IA retirer ce tag" />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
