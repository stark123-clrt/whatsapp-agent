"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_CAMPAIGN,
  OBJECTIVES,
  TONES,
  type Campaign,
  type CampaignSettings,
  type Objective,
} from "@/lib/campaign-types";
import { Toggle } from "../agents/[id]/ui";
import { CatalogPicker, usable, type CatalogProduct } from "./catalog-picker";

export type AgentLite = { id: number; name: string; status: "active" | "paused"; website: string | null };

const STEPS = ["L'essentiel", "Le contenu", "Les interactions", "La validation"];
const field = "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15";
const label = "mb-1.5 block text-[11px] font-semibold tracking-wide text-zinc-500 uppercase";
/** « ubfparis.com » → « https://ubfparis.com » */
const withScheme = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t && !/^https?:\/\//i.test(t) ? `https://${t}` : t;
};
const today = () => new Date().toISOString().slice(0, 10);
const plus = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

type Form = { name: string; agentId: number | null; startsOn: string; endsOn: string; settings: CampaignSettings };

/** Assistant de création (et de modification) d'une campagne Instagram. */
export function CampaignWizard({
  campaign,
  agents,
  onClose,
  onSaved,
}: {
  campaign: Campaign | null;
  agents: AgentLite[];
  onClose: () => void;
  onSaved: (c: Campaign) => void;
}) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(() => ({
    name: campaign?.name ?? "",
    agentId: campaign?.agentId ?? agents.find((a) => a.status === "active")?.id ?? agents[0]?.id ?? null,
    startsOn: campaign?.startsOn ?? today(),
    endsOn: campaign?.endsOn ?? plus(today(), 30),
    settings: campaign?.settings ?? { ...DEFAULT_CAMPAIGN, link: withScheme(agents.find((a) => a.status === "active")?.website ?? agents[0]?.website) },
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [logoBusy, setLogoBusy] = useState(false);
  const s = f.settings;
  const set = (patch: Partial<CampaignSettings>) => setF((x) => ({ ...x, settings: { ...x.settings, ...patch } }));
  const agent = agents.find((a) => a.id === f.agentId);

  function check(n: number): string | null {
    if (n === 0) {
      if (!f.name.trim()) return "Donne un nom à la campagne.";
      if (!f.agentId) return "Choisis l'agent qui connaît l'entreprise.";
      if (s.link && !/^https?:\/\/\S+\.\S+/.test(withScheme(s.link))) return "Ce lien ne ressemble pas à une adresse de site (ex. : https://votre-site.fr).";
      if (f.endsOn < f.startsOn) return "La date de fin est avant la date de début.";
    }
    if (n === 1) {
      if (!s.formats.post && !s.formats.story) return "Choisis au moins un format (publication ou story).";
      if (s.objective === "sales" && !products.some(usable)) return "Importe les produits du site (ou ajoute-en un à la main) : une campagne de vente montre de vrais produits.";
    }
    return null;
  }

  function next() {
    const err = check(step);
    setError(err);
    if (!err) setStep((x) => Math.min(STEPS.length - 1, x + 1));
  }

  async function save() {
    for (let i = 0; i < STEPS.length; i++) {
      const err = check(i);
      if (err) {
        setStep(i);
        return setError(err);
      }
    }
    setBusy(true);
    setError(null);
    const r = await fetch(campaign ? `/api/campaigns/${campaign.id}` : "/api/campaigns", {
      method: campaign ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, settings: { ...f.settings, link: withScheme(f.settings.link) } }),
    });
    const d = (await r.json().catch(() => ({}))) as { campaign?: Campaign; error?: string };
    setBusy(false);
    if (!r.ok || !d.campaign) return setError(d.error ?? "Enregistrement impossible.");
    onSaved(d.campaign);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className="flex max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-zinc-100 px-7 pt-5 pb-4">
            <h3 className="text-lg font-semibold">{campaign ? "Modifier la campagne" : "Nouvelle campagne Instagram"}</h3>
            <div className="mt-3 flex gap-2">
              {STEPS.map((t, i) => (
                <button
                  key={t}
                  onClick={() => (i < step || !check(step) ? setStep(i) : setError(check(step)))}
                  className={`flex flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                    i === step ? "bg-violet-50 font-semibold text-violet-700" : i < step ? "text-zinc-700 hover:bg-zinc-50" : "text-zinc-400 hover:bg-zinc-50"
                  }`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${i <= step ? "bg-violet-600 text-white" : "bg-zinc-200 text-zinc-500"}`}>
                    {i < step ? "✓" : i + 1}
                  </span>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-7 py-6">
            {step === 0 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className={label}>Nom de la campagne</span>
                    <input autoFocus className={field} value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex. : Collection hiver" />
                  </div>
                  <div>
                    <span className={label}>Agent (connaît l&apos;entreprise)</span>
                    <select className={field} value={f.agentId ?? ""} onChange={(e) => setF({ ...f, agentId: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">Choisir…</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.status === "paused" ? " (en pause)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className={label}>Début</span>
                    <input type="date" className={field} value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} />
                  </div>
                  <div>
                    <span className={label}>Fin</span>
                    <input type="date" className={field} value={f.endsOn} min={f.startsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} />
                  </div>
                </div>
                <div>
                  <span className={label}>Objectif</span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(OBJECTIVES) as Objective[]).map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => set({ objective: o })}
                        className={`rounded-xl border px-3 py-2.5 text-sm transition ${s.objective === o ? "border-violet-600 bg-violet-50 font-semibold text-violet-700" : "border-zinc-200 hover:border-zinc-300"}`}
                      >
                        {OBJECTIVES[o]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className={label}>Lien de destination (site web)</span>
                  <input className={field} value={s.link} onChange={(e) => set({ link: e.target.value.trim() })} onBlur={() => set({ link: withScheme(s.link) })} placeholder="https://votre-site.fr/collection" />
                  <p className="mt-1 text-xs text-zinc-500">Ajouté en autocollant cliquable sur les stories, et envoyé en message privé. Un suivi est ajouté pour mesurer les visites venues d&apos;Instagram.</p>
                </div>
                <div className="rounded-xl border border-zinc-200 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Mettre en avant une offre</p>
                      <p className="text-xs text-zinc-500">Réduction, code promo, livraison offerte…</p>
                    </div>
                    <Toggle checked={s.offer.enabled} onChange={(v) => set({ offer: { ...s.offer, enabled: v } })} label="Offre" />
                  </div>
                  {s.offer.enabled && (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <input className={`${field} col-span-3`} value={s.offer.text} maxLength={120} onChange={(e) => set({ offer: { ...s.offer, text: e.target.value } })} placeholder="Ex. : -10 % sur la première commande" />
                      <input className={field} value={s.offer.code} maxLength={30} onChange={(e) => set({ offer: { ...s.offer, code: e.target.value.toUpperCase().replace(/\s/g, "") } })} placeholder="Code (option)" />
                      <input type="date" className={`${field} col-span-2`} value={s.offer.until} onChange={(e) => set({ offer: { ...s.offer, until: e.target.value } })} title="Valable jusqu'au (option)" />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className={label}>Public visé</span>
                    <input className={field} value={s.audience} maxLength={160} onChange={(e) => set({ audience: e.target.value })} placeholder="Ex. : femmes 25-45 ans, amatrices de bijoux" />
                  </div>
                  <div>
                    <span className={label}>Ton</span>
                    <select className={field} value={s.tone} onChange={(e) => set({ tone: e.target.value as CampaignSettings["tone"] })}>
                      {(Object.keys(TONES) as CampaignSettings["tone"][]).map((t) => (
                        <option key={t} value={t}>
                          {TONES[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className={label}>Formats</span>
                    <div className="flex gap-2">
                      {(
                        [
                          ["post", "Publications"],
                          ["story", "Stories"],
                        ] as const
                      ).map(([k, t]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => set({ formats: { ...s.formats, [k]: !s.formats[k] } })}
                          className={`flex-1 rounded-xl border px-3 py-2.5 text-sm transition ${s.formats[k] ? "border-violet-600 bg-violet-50 font-semibold text-violet-700" : "border-zinc-200 text-zinc-500"}`}
                        >
                          {s.formats[k] ? "✓ " : ""}
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className={label}>Rythme</span>
                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1">
                      {(
                        [
                          ["auto", "Automatique"],
                          ["manual", "Manuel"],
                        ] as const
                      ).map(([k, t]) => (
                        <button key={k} type="button" onClick={() => set({ rhythm: k })} className={`rounded-lg py-1.5 text-sm ${s.rhythm === k ? "bg-white font-semibold shadow-sm" : "text-zinc-500"}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {s.rhythm === "auto" ? (
                  <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm leading-relaxed text-violet-900">
                    🤖 <strong>L&apos;agent décide</strong> combien publier chaque jour, sous les plafonds du compte (par défaut jusqu&apos;à 3 publications et 10 stories) : il
                    démarre doucement les 2 premières semaines, publie plus quand l&apos;engagement est bon, ralentit quand l&apos;audience décroche. Publications aux heures de forte
                    audience, stories réparties de 9 h à 21 h 30.
                  </div>
                ) : (
                  <>
                    <div>
                      <span className={label}>Contenus par jour</span>
                      <div className="grid w-48 grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1">
                        {[1, 2, 3].map((n) => (
                          <button key={n} type="button" onClick={() => set({ perDay: n })} className={`rounded-lg py-1.5 text-sm ${s.perDay === n ? "bg-white font-semibold shadow-sm" : "text-zinc-500"}`}>
                            {n}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">La première semaine : 1 par jour, pour habituer Instagram.</p>
                    </div>
                <div>
                  <span className={label}>Heures de publication (heure de Paris)</span>
                  <div className="flex gap-2">
                    {Array.from({ length: s.perDay }, (_, i) => (
                      <input
                        key={i}
                        type="time"
                        className={`${field} max-w-36`}
                        value={s.slots[i] ?? DEFAULT_CAMPAIGN.slots[i]}
                        onChange={(e) => {
                          const slots = [...DEFAULT_CAMPAIGN.slots.map((d, j) => s.slots[j] ?? d)];
                          slots[i] = e.target.value;
                          set({ slots: slots.slice(0, 3) });
                        }}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">Avec quelques minutes de décalage au hasard, pour un rythme naturel.</p>
                </div>
                  </>
                )}
                <div className="flex items-start justify-between gap-5 rounded-xl border border-zinc-200 p-4">
                  <div>
                    <p className="text-sm font-medium">Attirer avant de vendre</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                      En plus des contenus {s.objective === "sales" ? "produits" : "de marque"}, l&apos;agent publie des <strong>questions</strong>, des <strong>conseils</strong> et des{" "}
                      <strong>sondages en story</strong>{s.objective === "sales" ? " (dont des « ceci ou cela » entre 2 produits)" : ""}. Beaucoup au début pour gagner des abonnés, puis plus
                      d&apos;annonces quand l&apos;audience grandit. Les votes nourrissent ses recommandations.
                    </p>
                  </div>
                  <Toggle checked={s.engagement === "auto"} onChange={(v) => set({ engagement: v ? "auto" : "off" })} label="Attirer avant de vendre" />
                </div>
                {s.objective === "sales" ? (
                  <div>
                    <span className={label}>Produits à mettre en avant</span>
                    <CatalogPicker agentId={f.agentId} site={withScheme(s.link)} selected={s.productIds} onChange={(ids) => set({ productIds: ids })} onProducts={setProducts} />
                    <p className="mt-1 text-xs text-zinc-500">Chaque contenu montre un produit réel (photo, nom, prix), en rotation. Les stories renvoient vers la fiche du produit.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3 text-sm text-zinc-600">
                    🎨 Visuels : <strong>cartes aux couleurs de ta marque</strong>, avec ton logo. (Choisis l&apos;objectif « Vendre » pour montrer tes vrais produits.)
                  </div>
                )}
                <div>
                  <span className={label}>Logo de la marque (option)</span>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-50">
                      {logoBusy ? "Envoi…" : s.brand.logo ? "Changer le logo" : "Importer un logo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          setLogoBusy(true);
                          const form = new FormData();
                          form.append("file", file);
                          const r = await fetch("/api/campaigns/logo", { method: "POST", body: form });
                          const d = (await r.json().catch(() => ({}))) as { file?: string; error?: string };
                          setLogoBusy(false);
                          if (!r.ok || !d.file) return setError(d.error ?? "Logo refusé.");
                          set({ brand: { ...s.brand, logo: d.file } });
                        }}
                      />
                    </label>
                    {s.brand.logo ? (
                      <button type="button" onClick={() => set({ brand: { ...s.brand, logo: null } })} className="text-sm text-zinc-500 hover:text-red-600">
                        Retirer
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-500">PNG transparent de préférence. Sans logo, le nom de la marque s&apos;affiche.</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className={label}>Couleur de la marque</span>
                    <div className="flex items-center gap-2">
                      {["#111827", "#7c3aed", "#db2777", "#0f766e", "#b45309", "#1d4ed8"].map((c) => (
                        <button key={c} type="button" onClick={() => set({ brand: { ...s.brand, color: c } })} aria-label={c} className={`h-8 w-8 rounded-full transition hover:scale-110 ${s.brand.color === c ? "ring-2 ring-zinc-900 ring-offset-2" : ""}`} style={{ background: c }} />
                      ))}
                      <input type="color" value={s.brand.color} onChange={(e) => set({ brand: { ...s.brand, color: e.target.value } })} className="h-8 w-10 cursor-pointer rounded-lg border border-zinc-200 p-0.5" aria-label="Couleur personnalisée" />
                    </div>
                  </div>
                  <div>
                    <span className={label}>Texte sur la couleur</span>
                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1">
                      {(
                        [
                          ["#ffffff", "Blanc"],
                          ["#111111", "Noir"],
                        ] as const
                      ).map(([c, t]) => (
                        <button key={c} type="button" onClick={() => set({ brand: { ...s.brand, textColor: c } })} className={`rounded-lg py-1.5 text-sm ${s.brand.textColor === c ? "bg-white font-semibold shadow-sm" : "text-zinc-500"}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <span className={label}>Hashtags toujours ajoutés</span>
                  <input
                    className={field}
                    value={s.hashtags.map((h) => `#${h}`).join(" ")}
                    onChange={(e) => set({ hashtags: e.target.value.split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean) })}
                    placeholder="#mamarque #paris"
                  />
                  <label className="mt-2 flex items-center gap-2 text-sm text-zinc-600">
                    <input type="checkbox" checked={s.autoHashtags} onChange={(e) => set({ autoHashtags: e.target.checked })} className="accent-violet-600" />
                    L&apos;IA ajoute aussi des hashtags adaptés à chaque contenu
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className={label}>À mentionner (option)</span>
                    <input className={field} value={s.mentions} maxLength={200} onChange={(e) => set({ mentions: e.target.value })} placeholder="Ex. : livraison offerte dès 50 €" />
                  </div>
                  <div>
                    <span className={label}>Sujets à éviter (option)</span>
                    <input className={field} value={s.forbidden} maxLength={200} onChange={(e) => set({ forbidden: e.target.value })} placeholder="Ex. : prix des concurrents, politique" />
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                  💬 L&apos;IA lit les commentaires sous tes publications (toutes les 3 minutes), répond en public et écrit en privé avec le lien. Avec « Je valide chaque contenu », chaque réponse attend aussi ta validation.
                </div>
                <Line title="Répondre aux commentaires" text="L'IA répond publiquement, avec le contexte de l'entreprise." checked={s.interactions.replyComments} onChange={(v) => set({ interactions: { ...s.interactions, replyComments: v } })} />
                <Line title="Écrire en privé aux personnes qui commentent" text="Un message privé avec la réponse détaillée et le lien du site." checked={s.interactions.dmCommenters} onChange={(v) => set({ interactions: { ...s.interactions, dmCommenters: v } })} />
                {s.interactions.dmCommenters && (
                  <div>
                    <span className={label}>Seulement si le commentaire contient (option)</span>
                    <input className={field} value={s.interactions.keyword} maxLength={40} onChange={(e) => set({ interactions: { ...s.interactions, keyword: e.target.value.toUpperCase() } })} placeholder="Ex. : INFO (vide = tous les commentaires utiles)" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className={label}>Réponses maximum par jour</span>
                    <input type="number" min={0} max={100} className={field} value={s.interactions.maxReplies} onChange={(e) => set({ interactions: { ...s.interactions, maxReplies: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } })} />
                  </div>
                  <div>
                    <span className={label}>Messages privés maximum par jour</span>
                    <input type="number" min={0} max={50} className={field} value={s.interactions.maxDms} onChange={(e) => set({ interactions: { ...s.interactions, maxDms: Math.min(50, Math.max(0, Number(e.target.value) || 0)) } })} />
                  </div>
                </div>
                <p className="text-xs text-zinc-500">Les commentaires négatifs ou insultants ne reçoivent jamais de réponse automatique : ils te sont signalés.</p>
              </>
            )}

            {step === 3 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["manual", "Je valide chaque contenu", "L'IA prépare, tu cliques « Valider » (ou modifies, régénères). Recommandé pour commencer."],
                      ["auto", "Publication automatique", "Les contenus partent à l'heure prévue sans validation. Quand tu as confiance."],
                    ] as const
                  ).map(([k, t, d]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => set({ approval: k })}
                      className={`rounded-xl border p-4 text-left transition ${s.approval === k ? "border-violet-600 bg-violet-50" : "border-zinc-200 hover:border-zinc-300"}`}
                    >
                      <p className={`font-semibold ${s.approval === k ? "text-violet-700" : ""}`}>
                        {s.approval === k ? "● " : "○ "}
                        {t}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{d}</p>
                    </button>
                  ))}
                </div>
                <div className="rounded-xl bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700">
                  <p className="font-semibold text-zinc-900">Résumé</p>
                  <p className="mt-1">
                    « {f.name || "Sans nom"} » avec l&apos;agent <strong>{agent?.name ?? "?"}</strong>, du {f.startsOn} au {f.endsOn}. Objectif : {OBJECTIVES[s.objective].toLowerCase()}.
                  </p>
                  <p>
                    {s.rhythm === "auto"
                      ? `Rythme automatique : l'agent décide chaque jour combien de ${[s.formats.post && "publications", s.formats.story && "stories"].filter(Boolean).join(" et ")} publier, selon l'engagement.`
                      : `${s.perDay} contenu${s.perDay > 1 ? "s" : ""} par jour (${[s.formats.post && "publications", s.formats.story && "stories"].filter(Boolean).join(" et ")}), 1 par jour la première semaine.`}
                  </p>
                  <p>La campagne est créée en brouillon : tu l&apos;actives quand tu veux, depuis sa page.</p>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-zinc-100 px-7 py-3.5">
            {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
            <button onClick={step === 0 ? onClose : () => setStep(step - 1)} className="ml-auto rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
              {step === 0 ? "Annuler" : "← Retour"}
            </button>
            {step < STEPS.length - 1 ? (
              <button onClick={next} className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700">
                Suivant →
              </button>
            ) : (
              <button onClick={save} disabled={busy} className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                {busy ? "Enregistrement…" : campaign ? "Enregistrer" : "Créer la campagne"}
              </button>
            )}
          </div>
        </div>

        <aside className="hidden w-80 shrink-0 flex-col border-l border-zinc-100 bg-zinc-50 p-5 lg:flex">
          <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">Aperçu d&apos;une carte</p>
          <Preview brand={agent?.name ?? f.name ?? "Votre marque"} settings={s} productId={s.objective === "sales" ? (products.filter(usable).find((p) => !s.productIds.length || s.productIds.includes(p.id))?.id ?? null) : null} />
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            Le texte réel est écrit par l&apos;IA pour chaque contenu.{s.objective === "sales" ? " Le prix affiché est revérifié sur le site juste avant chaque publication." : ""}
          </p>
        </aside>
      </div>
    </div>
  );
}

function Line({ title, text, checked, onChange }: { title: string; text: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-5 rounded-xl border border-zinc-200 p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{text}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/** Aperçu rendu par le serveur (même moteur que les vrais visuels). */
function Preview({ brand, settings: s, productId }: { brand: string; settings: CampaignSettings; productId: number | null }) {
  const [src, setSrc] = useState<string | null>(null);
  const headline =
    s.offer.enabled && s.offer.text ? s.offer.text : { sales: "La pièce qui va tout changer", traffic: "Découvrez la nouvelle collection", awareness: "Bienvenue dans notre univers", promo: "Offre spéciale cette semaine" }[s.objective];
  const key = JSON.stringify([brand, headline, s.brand, s.offer.code, s.offer.enabled, s.link, productId]);
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    const t = setTimeout(async () => {
      const r = await fetch("/api/campaigns/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "post",
          headline: productId ? "Coup de cœur du moment" : headline,
          brandName: brand,
          color: s.brand.color,
          textColor: s.brand.textColor,
          badge: s.offer.enabled && s.offer.code ? `Code ${s.offer.code}` : "",
          logo: s.brand.logo,
          productId,
          footer: (() => {
            try {
              return s.link ? new URL(withScheme(s.link)).hostname.replace(/^www[.]/, "") : "";
            } catch {
              return "";
            }
          })(),
        }),
      }).catch(() => null);
      if (!r?.ok || !alive) return;
      url = URL.createObjectURL(await r.blob());
      if (alive) setSrc(url);
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- « key » résume toutes les valeurs utilisées
  }, [key]);
  return (
    <div className="mt-3 overflow-hidden rounded-xl bg-zinc-200 shadow-sm" style={{ aspectRatio: "4 / 5" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- image générée à la volée */}
      {src && <img src={src} alt="Aperçu" className="h-full w-full object-cover" />}
    </div>
  );
}
