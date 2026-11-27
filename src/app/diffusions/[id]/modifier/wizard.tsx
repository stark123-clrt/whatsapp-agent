"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fillVariables, spin, spintaxCount, VARIABLES, type Broadcast, type BroadcastSettings, type ContactList } from "@/lib/broadcast-types";
import { ListModal, type LiteContact } from "../../list-modal";

type Quota = { day: number; totalDays: number; coldCap: number; coldLeft: number; dailyCap: number; dailyLeft: number };
type Agent = { id: number; name: string; paused: boolean };
type Product = { id: number; title: string; imageFile: string | null };

const STEPS = ["Audience", "Message", "Réponses", "Envoi", "Vérifier et lancer"];
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-6 py-4">
        <h3 className="font-semibold">{title}</h3>
        {hint && <p className="mt-0.5 text-sm text-zinc-500">{hint}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-green-600" : "bg-zinc-300"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-5.5" : "left-0.5"}`} />
    </button>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <p className="text-xs font-semibold tracking-wide text-zinc-500">{children}</p>;

/** Tirage pseudo-aléatoire reproductible (même aperçu tant qu'on ne demande pas « Autre version »). */
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

const toLocalInput = (ts: number | null) => {
  if (!ts) return "";
  const d = new Date(ts);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function BroadcastWizard({ id }: { id: number }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [s, setS] = useState<BroadcastSettings | null>(null);
  const [status, setStatus] = useState<Broadcast["status"]>("draft");
  const [problems, setProblems] = useState<string[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [contacts, setContacts] = useState<LiteContact[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [listModal, setListModal] = useState(false);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState(1);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const loadLists = useCallback(async () => {
    const r = await fetch("/api/contact-lists", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as { lists: ContactList[]; contacts: LiteContact[]; tags: string[] };
    setLists(d.lists);
    setContacts(d.contacts);
    setTags(d.tags);
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch(`/api/broadcasts/${id}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return setError("Diffusion introuvable.");
      const d = (await r.json()) as { broadcast: Broadcast; problems: string[]; quota: Quota; whatsapp: { connected: boolean }; agents: Agent[] };
      setName(d.broadcast.name);
      setS(d.broadcast.settings);
      setStatus(d.broadcast.status);
      setProblems(d.problems);
      setQuota(d.quota);
      setConnected(d.whatsapp.connected);
      setAgents(d.agents);
      void loadLists();
    }, 0);
    return () => clearTimeout(t);
  }, [id, loadLists]);

  async function save(next?: number) {
    if (!s) return;
    setBusy("save");
    setError(null);
    const r = await fetch(`/api/broadcasts/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, settings: s }) });
    const d = (await r.json().catch(() => ({}))) as { broadcast?: Broadcast; problems?: string[]; error?: string };
    setBusy(null);
    if (!d.broadcast) return setError(d.error ?? "Enregistrement impossible.");
    setProblems(d.problems ?? []);
    if (next !== undefined) {
      setStep(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function launch() {
    await save();
    setBusy("launch");
    const r = await fetch(`/api/broadcasts/${id}/launch`, { method: "POST" });
    const d = (await r.json().catch(() => ({}))) as { broadcast?: Broadcast; error?: string };
    setBusy(null);
    if (d.broadcast) router.push(`/diffusions/${id}`);
    else setError(d.error ?? "Lancement impossible.");
  }

  async function variants() {
    if (!s) return;
    setBusy("variants");
    setError(null);
    const r = await fetch("/api/broadcasts/variants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: s.message }) });
    const d = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
    setBusy(null);
    if (d.message) setS({ ...s, message: d.message });
    else setError(d.error ?? "Échec.");
  }

  async function upload(file: File) {
    if (!s) return;
    setBusy("media");
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const r = await fetch("/api/broadcasts/media", { method: "POST", body: form });
    const d = (await r.json().catch(() => ({}))) as { media?: BroadcastSettings["media"]; error?: string };
    setBusy(null);
    if (d.media) setS({ ...s, media: d.media });
    else setError(d.error ?? "Envoi du fichier impossible.");
  }

  async function pickProduct(p: Product) {
    if (!s) return;
    const r = await fetch(`/api/broadcasts/media?product=${p.id}`, { method: "POST" });
    const d = (await r.json().catch(() => ({}))) as { media?: BroadcastSettings["media"]; error?: string };
    if (d.media) {
      setS({ ...s, media: d.media });
      setProducts(null);
    } else setError(d.error ?? "Échec.");
  }

  async function openCatalog() {
    const all: Product[] = [];
    for (const a of agents) {
      const r = await fetch(`/api/catalog?agentId=${a.id}`, { cache: "no-store" }).catch(() => null);
      if (r?.ok) all.push(...((await r.json()) as { products: Product[] }).products.filter((p) => p.imageFile));
    }
    setProducts(all);
  }

  function insertVariable(key: string) {
    if (!s) return;
    const el = textRef.current;
    const tag = `{{${key}}}`;
    const pos = el?.selectionStart ?? s.message.length;
    const message = s.message.slice(0, pos) + tag + s.message.slice(el?.selectionEnd ?? pos);
    setS({ ...s, message });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos + tag.length, pos + tag.length);
    });
  }

  if (error && !s) return <main className="p-8 text-sm text-red-600">{error}</main>;
  if (!s) return <main className="min-h-full bg-zinc-50 p-8" />;
  if (status !== "draft")
    return (
      <main className="min-h-full bg-zinc-50 p-8 text-sm">
        Cette diffusion est déjà lancée.{" "}
        <Link href={`/diffusions/${id}`} className="font-semibold text-green-700 underline">
          Voir son suivi
        </Link>
      </main>
    );

  const list = lists.find((l) => l.id === s.listId) ?? null;
  const versions = spintaxCount(s.message);
  const exampleContact = contacts.find((c) => list?.jids.includes(c.jid) && c.name) ?? { name: "Sarah Martin", phone: "33612345678" };
  // L'aperçu change à chaque clic sur « Autre version » (seed) : une version tirée au hasard, comme à l'envoi.
  const preview = fillVariables(spin(s.message, seeded(seed)), exampleContact);
  const agent = agents.find((a) => a.id === s.agentId) ?? null;

  const canNext = [Boolean(name.trim() && s.listId), Boolean(s.message.trim()), !s.followup.enabled || Boolean(s.followup.message.trim()), s.schedule.mode === "now" || Boolean(s.schedule.at), true][step];
  const hint = ["Choisis une liste de contacts pour continuer", "Rédige ton message d'ouverture pour continuer", "Écris le message de relance pour continuer", "Choisis la date d'envoi pour continuer", ""][step];

  return (
    <main className="min-h-full bg-zinc-50 px-8 pb-6 pt-7">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/diffusions" className="text-zinc-500 hover:text-zinc-800">
            ← Diffusions
          </Link>
          <span className="text-zinc-300">/</span>
          <span className="truncate text-lg font-bold">{name || "Nouvelle diffusion"}</span>
        </div>

        <ol className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-2 ${i <= step ? "font-semibold text-zinc-900" : "text-zinc-400"} ${i < step ? "cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${i < step ? "bg-green-600 text-white" : i === step ? "border-2 border-green-500 text-green-700" : "bg-zinc-200 text-zinc-500"}`}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                {label}
              </button>
              {i < STEPS.length - 1 && <span className="h-px w-8 bg-zinc-300" />}
            </li>
          ))}
        </ol>

        <div className="mt-7 space-y-5">
          {step === 0 && (
            <>
              <div>
                <h2 className="text-lg font-semibold">Audience</h2>
                <p className="text-sm text-zinc-500">À qui cette diffusion est envoyée.</p>
              </div>
              <Section title="Nom de la diffusion">
                <Label>
                  NOM <span className="text-red-500">*</span>
                </Label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" />
              </Section>
              <Section title="Canal" hint="Le canal utilisé pour cette diffusion.">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-zinc-200 p-3 opacity-60">
                    <p className="text-sm font-semibold">WhatsApp Business (API)</p>
                    <p className="text-xs text-zinc-500">Bientôt</p>
                  </div>
                  <div className="rounded-xl border border-green-400 bg-green-50 p-3">
                    <p className="text-sm font-semibold">WhatsApp Web</p>
                    {connected ? (
                      quota && (
                        <p className="text-xs text-zinc-600">
                          Jour {quota.day} sur {quota.totalDays} · {quota.coldLeft} nouveau{quota.coldLeft > 1 ? "x" : ""} contact{quota.coldLeft > 1 ? "s" : ""} restant{quota.coldLeft > 1 ? "s" : ""} aujourd&apos;hui
                        </p>
                      )
                    ) : (
                      <p className="text-xs text-amber-700">Non connecté : les envois attendront la connexion.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-zinc-200 p-3 opacity-60">
                    <p className="text-sm font-semibold">SMS</p>
                    <p className="text-xs text-zinc-500">Bientôt</p>
                  </div>
                </div>
                {quota && (
                  <p className="mt-3 text-xs text-zinc-500">
                    Montée en charge pour protéger ton numéro : aujourd&apos;hui {quota.dailyCap} messages au maximum, dont {quota.coldCap} à des personnes qui ne t&apos;ont jamais écrit. Ces plafonds augmentent chaque jour pendant {quota.totalDays} jours.
                  </p>
                )}
              </Section>
              <Section title="Liste" hint="La liste de contacts à laquelle cette diffusion sera envoyée.">
                <div className="flex items-center justify-between">
                  <Label>
                    LISTE DE CONTACTS <span className="text-red-500">*</span>
                  </Label>
                  <button onClick={() => setListModal(true)} className="rounded-xl border border-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50">
                    ＋ {lists.length ? "Nouvelle liste" : "Créer ta première liste"}
                  </button>
                </div>
                {lists.length ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {lists.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => setS({ ...s, listId: l.id })}
                        className={`rounded-xl border p-3 text-left ${s.listId === l.id ? "border-green-400 bg-green-50" : "border-zinc-200 hover:border-zinc-300"}`}
                      >
                        <p className="text-sm font-semibold">
                          {l.kind === "smart" ? "✦ " : ""}
                          {l.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {l.count} contact{l.count > 1 ? "s" : ""} · {l.kind === "smart" ? "intelligente (mise à jour automatique)" : "statique"}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-zinc-500">Tu n&apos;as pas encore de liste de contacts : crée-en une pour commencer.</p>
                )}
              </Section>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <h2 className="text-lg font-semibold">Message</h2>
                <p className="text-sm text-zinc-500">Le message d&apos;ouverture. Reste court, personnel, et termine par une question : c&apos;est ce qui fait répondre.</p>
              </div>
              <section className="grid gap-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:grid-cols-[1.4fr_1fr]">
                <div>
                  <textarea
                    ref={textRef}
                    value={s.message}
                    onChange={(e) => setS({ ...s, message: e.target.value.slice(0, 1600) })}
                    rows={11}
                    placeholder={"{Salut|Bonjour|Hello} {{first_name}} ! ..."}
                    className="w-full resize-none rounded-xl border border-zinc-200 p-3.5 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-500">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="py-1">＋ Variable :</span>
                      {VARIABLES.map((v) => (
                        <button key={v.key} onClick={() => insertVariable(v.key)} className="rounded-lg border border-zinc-200 px-2 py-1 font-medium text-zinc-700 hover:bg-zinc-50">
                          {v.label}
                        </button>
                      ))}
                    </div>
                    <span>{s.message.length}/1600</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label>✦ PRÉVISUALISATION</Label>
                    {versions > 1 && (
                      <button onClick={() => setSeed(seed + 1)} className="text-xs font-medium text-green-700 hover:underline">
                        ↻ Autre version
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">Pour {exampleContact.name}</p>
                  <div className="mt-2 rounded-2xl bg-[#efeae2] p-3">
                    <div className="ml-auto max-w-[95%] whitespace-pre-wrap rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-sm shadow-sm">
                      {s.media && s.media.mime.startsWith("image/") && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/broadcasts/media?file=${s.media.file}`} alt="" className="mb-2 max-h-40 w-full rounded-lg object-cover" />
                      )}
                      {preview || <span className="text-zinc-400">Ton message apparaîtra ici…</span>}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">Chaque contact reçoit sa propre version, avec son prénom.</p>
                </div>
              </section>

              <Section title="Pièce jointe" hint="Une photo ou une vidéo envoyée avec ton message en légende (facultatif).">
                {s.media ? (
                  <div className="flex items-center gap-3">
                    {s.media.mime.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/broadcasts/media?file=${s.media.file}`} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-zinc-100 text-xl">🎬</span>
                    )}
                    <p className="flex-1 truncate text-sm">{s.media.name}</p>
                    <button onClick={() => setS({ ...s, media: null })} className="text-sm text-red-600 hover:underline">
                      Retirer
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-medium hover:bg-zinc-50">
                      {busy === "media" ? "Envoi…" : "⇪ Envoyer une photo ou une vidéo"}
                      <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                    </label>
                    <button onClick={openCatalog} className="rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-medium hover:bg-zinc-50">
                      🛍 Choisir un produit du catalogue
                    </button>
                  </div>
                )}
                {products && (
                  <div className="mt-3 rounded-xl border border-zinc-200 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Catalogue</p>
                      <button onClick={() => setProducts(null)} className="text-xs text-zinc-500">
                        Fermer
                      </button>
                    </div>
                    {products.length ? (
                      <div className="mt-2 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto md:grid-cols-5">
                        {products.map((p) => (
                          <button key={p.id} onClick={() => pickProduct(p)} className="rounded-lg border border-zinc-200 p-1.5 text-left hover:border-green-400">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/catalog/${p.id}/image`} alt="" className="aspect-square w-full rounded object-cover" />
                            <p className="mt-1 line-clamp-2 text-[11px]">{p.title}</p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-400">Aucun produit avec photo.</p>
                    )}
                  </div>
                )}
                <p className="mt-2 text-xs text-zinc-400">JPG, PNG, WebP ou vidéo MP4, 10 Mo maximum.</p>
              </Section>

              <Section title="Variantes de message (spintax)" hint="Chaque contact reçoit une version légèrement différente : les envois ne ressemblent plus à un même texte répété, ce qui évite que ton numéro soit signalé ou bloqué.">
                {!s.identical && versions < 2 && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                    ⚠ Requis avant le lancement : ce message partirait identique à chaque contact. C&apos;est ce qui fait restreindre les numéros WhatsApp.
                  </p>
                )}
                <p className="mt-3 text-sm text-zinc-600">
                  Écris des variantes avec des accolades et des barres, comme <code className="rounded bg-zinc-100 px-1">{"{Salut|Bonjour|Coucou}"}</code> : une option est tirée au hasard pour chaque contact. Ou laisse l&apos;IA les ajouter.
                </p>
                {versions > 1 && <p className="mt-2 text-sm font-semibold text-green-700">Ce message peut être envoyé sous {versions.toLocaleString("fr-FR")} versions différentes.</p>}
                <button onClick={variants} disabled={busy === "variants" || !s.message.trim()} className="mt-3 rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">
                  {busy === "variants" ? "L'IA ajoute des variantes…" : "✦ Ajouter des variantes avec l'IA"}
                </button>
                <div className="mt-4 flex items-center justify-between gap-4 border-t border-zinc-100 pt-4">
                  <div>
                    <Label>ENVOYER EXACTEMENT LE MÊME TEXTE À TOUT LE MONDE (DÉCONSEILLÉ)</Label>
                    <p className="mt-0.5 text-xs text-zinc-500">N&apos;active ceci que si tu acceptes le risque d&apos;un message identique pour tous.</p>
                  </div>
                  <Switch checked={s.identical} onChange={(v) => setS({ ...s, identical: v })} label="Même texte pour tous" />
                </div>
              </Section>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h2 className="text-lg font-semibold">Réponses</h2>
                <p className="text-sm text-zinc-500">Qui gère les conversations lancées par cette diffusion.</p>
              </div>
              <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="grid gap-3 md:grid-cols-2">
                  <button onClick={() => setS({ ...s, agentId: null })} className={`rounded-xl border p-4 text-left ${s.agentId === null ? "border-green-400 bg-green-50" : "border-zinc-200 hover:border-zinc-300"}`}>
                    <p className="font-semibold">👥 L&apos;équipe gère les réponses</p>
                    <p className="mt-0.5 text-sm text-zinc-500">Pas d&apos;IA : les réponses arrivent dans Discussions.</p>
                  </button>
                  {agents.map((a) => (
                    <button key={a.id} onClick={() => setS({ ...s, agentId: a.id })} className={`rounded-xl border p-4 text-left ${s.agentId === a.id ? "border-green-400 bg-green-50" : "border-zinc-200 hover:border-zinc-300"}`}>
                      <p className="font-semibold">
                        🤖 {a.name} {a.paused && <span className="ml-1 text-xs font-bold text-amber-600">EN PAUSE</span>}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-500">L&apos;agent répond, connaît ce message et ton catalogue.</p>
                    </button>
                  ))}
                </div>
                {agent?.paused && <p className="mt-3 text-sm text-amber-700">⚠ Cet agent est en pause : les réponses ne seront pas traitées tant que tu ne l&apos;auras pas réactivé.</p>}
                <div className="mt-5 flex items-center justify-between gap-4 border-t border-zinc-100 pt-4">
                  <div>
                    <p className="text-sm font-medium">Relancer les personnes qui ne répondent pas</p>
                    <p className="text-xs text-zinc-500">Une seule relance, jamais aux personnes qui ont répondu ou écrit STOP.</p>
                  </div>
                  <Switch checked={s.followup.enabled} onChange={(v) => setS({ ...s, followup: { ...s.followup, enabled: v } })} label="Relance" />
                </div>
                {s.followup.enabled && (
                  <div className="mt-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      Relancer après
                      <select
                        value={s.followup.afterHours}
                        onChange={(e) => setS({ ...s, followup: { ...s.followup, afterHours: Number(e.target.value) } })}
                        className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                      >
                        {[24, 48, 72, 120].map((h) => (
                          <option key={h} value={h}>
                            {h / 24} jour{h > 24 ? "s" : ""}
                          </option>
                        ))}
                      </select>
                      sans réponse
                    </label>
                    <textarea
                      value={s.followup.message}
                      onChange={(e) => setS({ ...s, followup: { ...s.followup, message: e.target.value } })}
                      rows={3}
                      placeholder={"{Petit rappel|Je me permets de revenir vers toi} {{first_name}} : ... ?"}
                      className="w-full resize-none rounded-xl border border-zinc-200 p-3 text-sm outline-none focus:border-green-500"
                    />
                  </div>
                )}
              </section>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <h2 className="text-lg font-semibold">Envoi</h2>
                <p className="text-sm text-zinc-500">Quand et à quel rythme la diffusion part.</p>
              </div>
              <Section title="Calendrier" hint="Envoie dès le lancement, ou choisis une date.">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ["now", "Envoyer maintenant"],
                      ["later", "Programmer pour plus tard"],
                    ] as const
                  ).map(([k, l]) => (
                    <button
                      key={k}
                      onClick={() => setS({ ...s, schedule: { ...s.schedule, mode: k } })}
                      className={`rounded-xl px-3.5 py-2 text-sm font-semibold ${s.schedule.mode === k ? "bg-green-600 text-white" : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}
                    >
                      {l}
                    </button>
                  ))}
                  {s.schedule.mode === "later" && (
                    <input
                      type="datetime-local"
                      value={toLocalInput(s.schedule.at)}
                      onChange={(e) => setS({ ...s, schedule: { ...s.schedule, at: e.target.value ? new Date(e.target.value).getTime() : null } })}
                      className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    />
                  )}
                </div>
              </Section>
              <Section title="Heures d'envoi" hint="N'envoie qu'aux heures où tes contacts acceptent d'être contactés (heure de Paris).">
                <div className="flex items-center justify-between">
                  <Label>ENVOYER UNIQUEMENT ENTRE</Label>
                  <Switch checked={s.window.enabled} onChange={(v) => setS({ ...s, window: { ...s.window, enabled: v } })} label="Heures d'envoi" />
                </div>
                {s.window.enabled && (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <input type="time" value={s.window.start} onChange={(e) => setS({ ...s, window: { ...s.window, start: e.target.value } })} className="rounded-lg border border-zinc-200 px-2 py-1.5" />
                      et
                      <input type="time" value={s.window.end} onChange={(e) => setS({ ...s, window: { ...s.window, end: e.target.value } })} className="rounded-lg border border-zinc-200 px-2 py-1.5" />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {DAYS.map((d, i) => {
                        const on = s.window.days.includes(i + 1);
                        return (
                          <button
                            key={d}
                            onClick={() => setS({ ...s, window: { ...s.window, days: on ? s.window.days.filter((x) => x !== i + 1) : [...s.window.days, i + 1].sort() } })}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${on ? "border-green-500 bg-green-50 text-green-800" : "border-zinc-200 text-zinc-500"}`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Section>
              <Section title="Envoi urgent" hint="Par défaut, les messages partent un par un, toutes les 30 à 90 secondes, avec des pauses. N'active l'envoi rapide que si le message perd sa valeur en arrivant tard.">
                <div className="flex items-center justify-between">
                  <Label>ENVOYER PLUS VITE, J&apos;ACCEPTE LE RISQUE</Label>
                  <Switch checked={s.urgent} onChange={(v) => setS({ ...s, urgent: v })} label="Envoi urgent" />
                </div>
              </Section>
              <Section title="Mode progressif" hint="Étale l'envoi sur plusieurs jours au lieu de tout envoyer le même jour.">
                <div className="flex items-center justify-between">
                  <Label>ACTIVER LE MODE PROGRESSIF</Label>
                  <Switch checked={s.progressive.enabled} onChange={(v) => setS({ ...s, progressive: { ...s.progressive, enabled: v } })} label="Mode progressif" />
                </div>
                {s.progressive.enabled && (
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    Au maximum
                    <input
                      type="number"
                      min={5}
                      max={500}
                      value={s.progressive.perDay}
                      onChange={(e) => setS({ ...s, progressive: { ...s.progressive, perDay: Number(e.target.value) } })}
                      className="w-24 rounded-lg border border-zinc-200 px-2 py-1.5"
                    />
                    envois par jour pour cette diffusion
                  </label>
                )}
              </Section>
            </>
          )}

          {step === 4 && (
            <>
              <div>
                <h2 className="text-lg font-semibold">Révision et lancement</h2>
                <p className="text-sm text-zinc-500">Vérifie tout, puis lance.</p>
              </div>
              <Section title="Audience">
                <p className="text-sm">
                  👥 {list ? `${list.count} contact${list.count > 1 ? "s" : ""} · ${list.name}` : "Aucune liste"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">Seuls les contacts WhatsApp sont joints ; ceux qui ont écrit STOP ou sont en « Ne pas déranger » sont exclus automatiquement.</p>
              </Section>
              <Section title="Canal et planification">
                <p className="text-sm font-medium">WhatsApp Web</p>
                <p className="text-sm text-zinc-500">
                  {s.schedule.mode === "later" && s.schedule.at ? `Programmé le ${new Date(s.schedule.at).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })}.` : "Envoi dès le lancement."}
                  {s.window.enabled ? ` Entre ${s.window.start} et ${s.window.end}.` : ""}
                  {s.progressive.enabled ? ` ${s.progressive.perDay} par jour au maximum.` : ""}
                  {s.urgent ? " Envoi rapide." : " Un message toutes les 30 à 90 s."}
                </p>
              </Section>
              <Section title="Message d'ouverture">
                <p className="whitespace-pre-wrap text-sm">{s.message}</p>
                {s.media && <p className="mt-2 text-xs text-zinc-500">📎 {s.media.name}</p>}
              </Section>
              <Section title="Réponses">
                <p className="text-sm">{agent ? agent.name : "L'équipe (sans IA)"}</p>
                <p className="text-xs text-zinc-500">{s.followup.enabled ? `Relance après ${s.followup.afterHours / 24} jour(s) sans réponse.` : "Aucune relance pour les personnes qui ne répondent pas."}</p>
              </Section>
              <Section title="Lancement">
                {problems.length ? (
                  <div className="space-y-2">
                    {problems.map((p) => (
                      <p key={p} className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                        ⚠ {p}{" "}
                        <button onClick={() => setStep(p.includes("liste") ? 0 : p.includes("relance") ? 2 : p.includes("date") ? 3 : 1)} className="font-semibold underline">
                          Corriger
                        </button>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-green-700">✓ Tout est prêt.</p>
                )}
                {!connected && <p className="mt-2 text-sm text-amber-700">WhatsApp n&apos;est pas connecté : la diffusion partira dès la reconnexion.</p>}
                <button onClick={launch} disabled={problems.length > 0 || busy !== null} className="mt-4 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40">
                  🚀 {busy === "launch" ? "Lancement…" : s.schedule.mode === "later" ? "Programmer la diffusion" : "Lancer la diffusion"}
                </button>
              </Section>
            </>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>

      {step < 4 && (
        <div className="sticky bottom-4 z-20 mx-auto mt-6 max-w-4xl">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white/95 px-5 py-3 shadow-lg backdrop-blur">
            <button onClick={() => (step ? setStep(step - 1) : router.push("/diffusions"))} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50">
              ‹ Retour
            </button>
            <div className="flex items-center gap-4">
              {!canNext && <span className="text-sm text-zinc-500">{hint}</span>}
              <button onClick={() => save(step + 1)} disabled={!canNext || busy !== null} className="rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40">
                {busy === "save" ? "Enregistrement…" : "Continuer ›"}
              </button>
            </div>
          </div>
        </div>
      )}

      {listModal && (
        <ListModal
          contacts={contacts}
          tags={tags}
          onClose={() => setListModal(false)}
          onCreated={(l) => {
            setListModal(false);
            setS({ ...s, listId: l.id });
            void loadLists();
          }}
        />
      )}
    </main>
  );
}
