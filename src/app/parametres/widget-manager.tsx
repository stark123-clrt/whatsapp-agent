"use client";

import { Icon as UiIcon } from "@/app/icons";

import { useEffect, useRef, useState } from "react";
import { FONTS, LAUNCHER_ICONS, THEMES, type ActionButton, type LauncherIcon, type ThemeId, type WidgetSettings } from "@/lib/widget-settings";
import { Soon, inputClass } from "../agents/[id]/ui";
import { LauncherSvg, Labeled, Segmented, SwitchLine, WidgetStage, snippetFor, type WidgetData } from "./widget-card";

const SECTIONS = [
  { id: "apparence", label: "Apparence" },
  { id: "messages", label: "Messages" },
  { id: "engagement", label: "Engagement" },
  { id: "ia", label: "Intelligence" },
  { id: "contacts", label: "Contacts" },
  { id: "fonctions", label: "Fonctions" },
  { id: "securite", label: "Sécurité" },
  { id: "installation", label: "Installation" },
  { id: "danger", label: "Zone dangereuse" },
] as const;

const LANGUAGES: { value: WidgetSettings["language"]; label: string; soon?: boolean }[] = [
  { value: "auto", label: "Automatique (langue du navigateur)" },
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
  { value: "es", label: "Espagnol", soon: true },
  { value: "de", label: "Allemand", soon: true },
  { value: "it", label: "Italien", soon: true },
  { value: "pt", label: "Portugais", soon: true },
  { value: "nl", label: "Néerlandais", soon: true },
  { value: "ar", label: "Arabe", soon: true },
];

const ACTION_KINDS: { value: ActionButton["kind"]; label: string; placeholder: string }[] = [
  { value: "call", label: "Appeler", placeholder: "+33 1 23 45 67 89" },
  { value: "email", label: "E-mail", placeholder: "contact@votre-site.fr" },
  { value: "map", label: "Itinéraire", placeholder: "12 rue de la Paix, Paris" },
  { value: "link", label: "Lien", placeholder: "https://votre-site.fr/rdv" },
];

type AgentLite = { id: number; name: string; paused?: boolean };

/** « Gérer » : tous les réglages du widget, avec l'aperçu en direct. */
export function WidgetManager({
  widget,
  onClose,
  onSaved,
  onDeleted,
}: {
  widget: WidgetData;
  onClose: () => void;
  onSaved: (w: WidgetData) => void;
  onDeleted: () => void;
}) {
  const [saved, setSaved] = useState(widget.settings);
  const [s, setS] = useState(widget.settings);
  const [version, setVersion] = useState(widget.updatedAt);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string>("apparence");
  const [view, setView] = useState<"open" | "closed">("open");
  const [leadPreview, setLeadPreview] = useState(false);
  const [localLogo, setLocalLogo] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const set = (patch: Partial<WidgetSettings>) => setS((p) => ({ ...p, ...patch }));
  const logoUrl = s.logo ? (localLogo ?? `/api/public/widget/${widget.key}/logo?v=${version}`) : null;

  useEffect(() => {
    const id = setTimeout(() => {
      void fetch("/api/agents", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { agents: AgentLite[] }) => setAgents(d.agents ?? []))
        .catch(() => {});
    }, 0);
    return () => clearTimeout(id);
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/widget", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: s }) });
    const d = (await r.json().catch(() => ({}))) as { widget?: WidgetData; error?: string };
    setBusy(false);
    if (!r.ok || !d.widget) return setError(d.error ?? "Enregistrement impossible.");
    setSaved(d.widget.settings);
    setS(d.widget.settings);
    setVersion(d.widget.updatedAt);
    onSaved(d.widget);
    setFlash("Modifications enregistrées");
    setTimeout(() => setFlash(null), 2200);
  }

  // Ctrl/⌘ + S pour enregistrer, Échap pour fermer.
  const saveRef = useRef(save);
  const closeRef = useRef(requestClose);
  useEffect(() => {
    saveRef.current = save;
    closeRef.current = requestClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function requestClose() {
    if (dirty && !window.confirm("Des modifications ne sont pas enregistrées. Fermer quand même ?")) return;
    onClose();
  }

  function goTo(id: string) {
    setActive(id);
    document.getElementById(`wm-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onScroll() {
    const box = scroller.current;
    if (!box) return;
    const top = box.getBoundingClientRect().top;
    let current: string = SECTIONS[0].id;
    for (const sec of SECTIONS) {
      const el = document.getElementById(`wm-${sec.id}`);
      if (el && el.getBoundingClientRect().top - top < 140) current = sec.id;
    }
    if (current !== active) setActive(current);
  }

  async function uploadLogo(file: File) {
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const r = await fetch("/api/widget/logo", { method: "POST", body: form });
    const d = (await r.json().catch(() => ({}))) as { file?: string; error?: string };
    if (!r.ok || !d.file) return setError(d.error ?? "Import impossible.");
    setLocalLogo(URL.createObjectURL(file));
    set({ logo: d.file });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-50">
      {/* Barre du haut */}
      <header className="flex shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-6 py-3">
        <button onClick={requestClose} className="rounded-lg px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
          ← Canaux
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">Widget · {s.name || "Sans nom"}</p>
          <p className="text-xs text-zinc-500">
            {flash ? <span className="text-blue-700">✓ {flash}</span> : dirty ? "Modifications non enregistrées" : "Tout est enregistré"}
          </p>
        </div>
        {error && <p className="max-w-xs truncate text-sm text-red-600">{error}</p>}
        <button
          onClick={() => setS(saved)}
          disabled={!dirty || busy}
          className="rounded-xl px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Annuler les modifications
        </button>
        <button
          onClick={save}
          disabled={!dirty || busy}
          title="Ctrl + S"
          className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
        >
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sommaire */}
        <nav className="hidden w-52 shrink-0 space-y-0.5 overflow-y-auto border-r border-zinc-200 bg-white px-3 py-5 lg:block">
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              onClick={() => goTo(sec.id)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                active === sec.id ? "bg-zinc-100 font-medium text-zinc-900" : sec.id === "danger" ? "text-red-600 hover:bg-red-50" : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {sec.label}
            </button>
          ))}
        </nav>

        {/* Réglages */}
        <div ref={scroller} onScroll={onScroll} className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl space-y-6 px-6 py-8 pb-40">
            <Section id="apparence" title="Apparence" text="Le style du widget sur ton site.">
              <Labeled label="Thème">
                <div className="grid grid-cols-3 gap-2.5">
                  {(Object.keys(THEMES) as ThemeId[]).map((id) => {
                    const th = THEMES[id];
                    const on = s.theme === id;
                    return (
                      <button
                        key={id}
                        onClick={() => set({ theme: id, colors: th.colors, corners: th.corners, font: th.font })}
                        className={`overflow-hidden rounded-xl border text-left transition hover:-translate-y-0.5 ${on ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200"}`}
                      >
                        <div className="flex h-16 flex-col justify-end gap-1 p-2" style={{ background: th.colors.panel }}>
                          <span className="h-2.5 w-3/5 rounded-full" style={{ background: th.colors.botBubble }} />
                          <span className="h-2.5 w-2/5 self-end rounded-full" style={{ background: th.colors.brand }} />
                        </div>
                        <p className="border-t border-zinc-100 bg-white px-2.5 py-1.5 text-xs font-medium">{th.label}</p>
                      </button>
                    );
                  })}
                </div>
              </Labeled>
              <div className="grid grid-cols-2 gap-5">
                <Labeled label="Coins">
                  <Segmented
                    value={s.corners}
                    onChange={(v) => set({ corners: v })}
                    options={[
                      { value: "rounded", label: "Arrondis" },
                      { value: "soft", label: "Doux" },
                      { value: "square", label: "Carrés" },
                    ]}
                  />
                </Labeled>
                <Labeled label="Police">
                  <select className={inputClass} value={s.font} onChange={(e) => set({ font: e.target.value as WidgetSettings["font"] })} style={{ fontFamily: FONTS[s.font] }}>
                    <option value="default">Inter (par défaut)</option>
                    <option value="system">Police du système</option>
                    <option value="serif">Serif élégante</option>
                    <option value="mono">Monospace</option>
                  </select>
                </Labeled>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <Labeled label="Nom affiché">
                  <input className={inputClass} value={s.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
                </Labeled>
                <Labeled label="Sous-titre">
                  <input className={inputClass} value={s.subtitle} maxLength={60} onChange={(e) => set({ subtitle: e.target.value })} />
                </Labeled>
              </div>
              <Labeled label="Logo" hint="PNG, JPG, WebP ou SVG, 2 Mo max. Carré de préférence.">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-lg font-semibold text-zinc-500">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (s.name || "?").charAt(0).toUpperCase()
                    )}
                  </span>
                  <label className="cursor-pointer rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-50">
                    {s.logo ? "Changer" : "Importer un logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadLogo(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {s.logo && (
                    <button onClick={() => set({ logo: null })} className="text-sm text-zinc-500 hover:text-red-600">
                      Retirer
                    </button>
                  )}
                </div>
              </Labeled>
              <Labeled label="Icône du bouton">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(LAUNCHER_ICONS) as LauncherIcon[]).map((ic) => (
                    <button
                      key={ic}
                      onClick={() => set({ launcherIcon: ic })}
                      aria-label={ic}
                      className={`flex h-12 w-12 items-center justify-center rounded-full transition hover:scale-105 ${s.launcherIcon === ic ? "ring-2 ring-zinc-900 ring-offset-2" : ""}`}
                      style={{ background: s.colors.brand, color: s.colors.brandText }}
                    >
                      <LauncherSvg icon={ic} size={22} />
                    </button>
                  ))}
                </div>
              </Labeled>
              <Labeled label="Couleurs">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <ColorField label="Principale" value={s.colors.brand} onChange={(v) => set({ colors: { ...s.colors, brand: v } })} />
                  <ColorField label="Texte sur la couleur" value={s.colors.brandText} onChange={(v) => set({ colors: { ...s.colors, brandText: v } })} />
                  <ColorField label="Fond du chat" value={s.colors.panel} onChange={(v) => set({ colors: { ...s.colors, panel: v } })} />
                  <ColorField label="Bulle de l'IA" value={s.colors.botBubble} onChange={(v) => set({ colors: { ...s.colors, botBubble: v } })} />
                  <ColorField label="Texte de l'IA" value={s.colors.botText} onChange={(v) => set({ colors: { ...s.colors, botText: v } })} />
                </div>
              </Labeled>
              <Labeled label="Position">
                <div className="flex flex-wrap items-center gap-4">
                  <Segmented
                    value={s.position}
                    onChange={(v) => set({ position: v })}
                    options={[
                      { value: "bottom-left", label: "En bas à gauche" },
                      { value: "bottom-right", label: "En bas à droite" },
                    ]}
                  />
                  <NumberField label="Bord" value={s.offsetX} onChange={(v) => set({ offsetX: v })} />
                  <NumberField label="Bas" value={s.offsetY} onChange={(v) => set({ offsetY: v })} />
                </div>
              </Labeled>
            </Section>

            <Section id="messages" title="Messages" text="Ce que le visiteur lit en ouvrant le chat.">
              <Labeled label="Message d'accueil">
                <textarea className={`${inputClass} resize-none`} rows={3} maxLength={400} value={s.welcome} onChange={(e) => set({ welcome: e.target.value })} />
              </Labeled>
              <Labeled label="Texte de la zone de saisie">
                <input className={inputClass} value={s.placeholder} maxLength={60} onChange={(e) => set({ placeholder: e.target.value })} />
              </Labeled>
              <Labeled label="Questions de démarrage" hint="Des suggestions cliquables, affichées tant que le visiteur n'a rien écrit (6 max).">
                <RowsEditor values={s.starters} max={6} placeholder="Ex. : Quels sont vos tarifs ?" onChange={(v) => set({ starters: v })} />
              </Labeled>
              <SwitchLine
                title="Ligne de pied de page"
                text="Une courte phrase sous la zone de saisie (horaires, mention légale…)."
                checked={s.footer.enabled}
                onChange={(v) => set({ footer: { ...s.footer, enabled: v } })}
              />
              {s.footer.enabled && (
                <input className={inputClass} value={s.footer.text} maxLength={80} placeholder="Ex. : Réponse humaine du lundi au vendredi, 9h-18h" onChange={(e) => set({ footer: { ...s.footer, text: e.target.value } })} />
              )}
              <div className="grid grid-cols-2 gap-5">
                <Labeled label="Langue de l'interface">
                  <select className={inputClass} value={s.language} onChange={(e) => set({ language: e.target.value as WidgetSettings["language"] })}>
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value} disabled={l.soon}>
                        {l.label}
                        {l.soon ? " · bientôt" : ""}
                      </option>
                    ))}
                  </select>
                </Labeled>
                <div className="pt-6">
                  <SwitchLine title="Son de notification" text="Un petit « ding » à chaque réponse quand le chat est fermé." checked={s.sound} onChange={(v) => set({ sound: v })} />
                </div>
              </div>
              <SwitchLine title="Mention « Propulsé par l'IA »" checked={s.poweredBy} onChange={(v) => set({ poweredBy: v })} />
            </Section>

            <Section id="engagement" title="Engagement" text="Aller chercher le visiteur, au bon moment, sur les bonnes pages.">
              <SwitchLine
                title="Bulle proactive"
                text="Une petite bulle apparaît au-dessus du bouton après quelques secondes. Refusée, elle ne revient plus."
                checked={s.proactive.enabled}
                onChange={(v) => {
                  set({ proactive: { ...s.proactive, enabled: v } });
                  if (v) setView("closed");
                }}
              />
              {s.proactive.enabled && (
                <div className="space-y-4 rounded-xl border border-zinc-100 bg-zinc-50/60 p-4">
                  <Labeled label="Message">
                    <textarea className={`${inputClass} resize-none`} rows={2} maxLength={200} value={s.proactive.message} onChange={(e) => set({ proactive: { ...s.proactive, message: e.target.value } })} />
                  </Labeled>
                  <div className="grid grid-cols-2 gap-4">
                    <Labeled label="Bouton accepter">
                      <input className={inputClass} maxLength={24} value={s.proactive.accept} onChange={(e) => set({ proactive: { ...s.proactive, accept: e.target.value } })} />
                    </Labeled>
                    <Labeled label="Bouton refuser">
                      <input className={inputClass} maxLength={24} value={s.proactive.refuse} onChange={(e) => set({ proactive: { ...s.proactive, refuse: e.target.value } })} />
                    </Labeled>
                  </div>
                  <p className="rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-zinc-600">
                    <UiIcon name="bulb" size={15} className="mr-1 inline-block align-[-3px]" /><strong>Pour la tester</strong> : enregistre, attends 1 minute, puis ouvre ton site en ajoutant <code className="rounded bg-zinc-100 px-1">?aw_test</code> à la fin de l&apos;adresse (ex. : votre-site.fr<strong>?aw_test</strong>). Le widget te voit alors comme un nouveau visiteur.
                  </p>
                  <Labeled label={`Apparaît après ${s.proactive.delay} s`}>
                    <input type="range" min={0} max={60} value={s.proactive.delay} onChange={(e) => set({ proactive: { ...s.proactive, delay: Number(e.target.value) } })} className="w-full accent-blue-600" />
                  </Labeled>
                </div>
              )}
              <SwitchLine
                title="Nouveaux visiteurs uniquement"
                text="Le widget ne s'affiche plus pour quelqu'un qui a déjà discuté."
                checked={s.newVisitorsOnly}
                onChange={(v) => set({ newVisitorsOnly: v })}
              />
              <div className="grid grid-cols-2 gap-5">
                <Labeled label="Pages incluses" hint="Vide = toutes les pages. Ex. : /tarifs">
                  <TagInput values={s.includePaths} placeholder="/chemin" onChange={(v) => set({ includePaths: v })} />
                </Labeled>
                <Labeled label="Pages exclues" hint="Ex. : /panier, /compte">
                  <TagInput values={s.excludePaths} placeholder="/chemin" onChange={(v) => set({ excludePaths: v })} />
                </Labeled>
              </div>
            </Section>

            <Section id="ia" title="Intelligence" text="Qui répond, et à quel rythme.">
              <Labeled label="Agent IA" hint="Sur une page précise, tu peux aussi forcer un agent avec data-agent (voir Installation).">
                <select className={inputClass} value={s.agentId ?? ""} onChange={(e) => set({ agentId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Agent du canal « Site web » (Agents IA → Qui répond)</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="Vitesse de réponse">
                <input type="range" min={0} max={100} step={5} value={s.aiSpeed} onChange={(e) => set({ aiSpeed: Number(e.target.value) })} className="w-full accent-blue-600" />
                <div className="mt-1 flex justify-between text-xs text-zinc-500">
                  <span>Naturelle (prend son temps)</span>
                  <span className="font-medium text-zinc-700">{speedLabel(s.aiSpeed)}</span>
                  <span>Instantanée</span>
                </div>
              </Labeled>
              <SwitchLine
                title="Montrer que l'IA réfléchit"
                text={`Affiche « L'IA réfléchit… » à côté des trois points pendant la rédaction.`}
                checked={s.activityNote}
                onChange={(v) => set({ activityNote: v })}
              />
              <Soon>Traductions personnalisées de chaque texte du widget</Soon>
            </Section>

            <Section id="contacts" title="Contacts" text="Récupérer les coordonnées avant la discussion : elles arrivent dans la fiche du contact.">
              <SwitchLine
                title="Formulaire avant de discuter"
                checked={s.lead.enabled}
                onChange={(v) => {
                  set({ lead: { ...s.lead, enabled: v } });
                  setLeadPreview(v);
                  setView("open");
                }}
              />
              {s.lead.enabled && (
                <div className="space-y-4 rounded-xl border border-zinc-100 bg-zinc-50/60 p-4">
                  <Labeled label="Titre">
                    <input className={inputClass} maxLength={60} value={s.lead.title} onChange={(e) => set({ lead: { ...s.lead, title: e.target.value } })} />
                  </Labeled>
                  <Labeled label="Sous-titre">
                    <textarea className={`${inputClass} resize-none`} rows={2} maxLength={200} value={s.lead.subtitle} onChange={(e) => set({ lead: { ...s.lead, subtitle: e.target.value } })} />
                  </Labeled>
                  <p className="text-xs text-zinc-500">Prénom et e-mail sont toujours demandés.</p>
                  <SwitchLine title="Demander le nom de famille" checked={s.lead.lastName} onChange={(v) => set({ lead: { ...s.lead, lastName: v } })} />
                  <SwitchLine title="Demander le téléphone" checked={s.lead.phone} onChange={(v) => set({ lead: { ...s.lead, phone: v } })} />
                  <SwitchLine title="Case « politique de confidentialité »" text="Obligatoire à cocher pour commencer." checked={s.lead.requirePrivacy} onChange={(v) => set({ lead: { ...s.lead, requirePrivacy: v } })} />
                  {s.lead.requirePrivacy && (
                    <input className={inputClass} placeholder="https://votre-site.fr/confidentialite" value={s.lead.privacyUrl} onChange={(e) => set({ lead: { ...s.lead, privacyUrl: e.target.value } })} />
                  )}
                </div>
              )}
            </Section>

            <Section id="fonctions" title="Fonctions" text="Ce que le visiteur peut faire dans le chat.">
              <SwitchLine title="Sélecteur d'émojis" checked={s.emoji} onChange={(v) => set({ emoji: v })} />
              <SwitchLine title="Envoi de photos et de PDF" text="Un trombone à côté des émojis. Le visiteur peut aussi coller ou glisser une photo. 10 Mo max ; l'IA voit les photos." checked={s.attachments} onChange={(v) => set({ attachments: v })} />
              <Labeled label="Boutons d'action" hint="Jusqu'à 3 raccourcis dans l'en-tête : appeler, écrire, itinéraire ou lien.">
                <ActionsEditor values={s.actions} onChange={(v) => set({ actions: v })} />
              </Labeled>
            </Section>

            <Section id="securite" title="Sécurité" text="Où le widget a le droit de fonctionner.">
              <Labeled label="Domaines autorisés" hint="Vide = tous les sites. « *.exemple.fr » autorise aussi les sous-domaines.">
                <TagInput values={s.allowedDomains} placeholder="exemple.fr" onChange={(v) => set({ allowedDomains: v })} />
              </Labeled>
              <Soon>Pays bloqués</Soon>
              <Soon>Protection anti-robots Cloudflare Turnstile</Soon>
              <Soon>Visiteurs connectés (identité signée HMAC)</Soon>
            </Section>

            <Section id="installation" title="Installation" text="Une seule ligne à coller avant </body>.">
              <CopyBlock value={snippetFor(widget.key)} />
              <p className="text-xs leading-relaxed text-zinc-500">
                Pour qu&apos;un agent précis réponde sur une page, ajoute <code className="rounded bg-zinc-100 px-1 py-0.5">data-agent=&quot;ID&quot;</code> dans la balise
                {agents[0] ? ` (ex. : data-agent="${agents[0].id}" pour ${agents[0].name})` : ""}.
              </p>
              <Labeled label="Lien de partage" hint="Le chat en pleine page : à envoyer par e-mail, SMS ou à mettre dans une bio.">
                <CopyBlock value={`${typeof window === "undefined" ? "" : window.location.origin}/w/${widget.key}`} open />
              </Labeled>
              <Soon>Lien de démo pour un client (aperçu du widget sur son propre site)</Soon>
            </Section>

            <Section id="danger" title="Zone dangereuse" text="" danger>
              <DangerZone onDeleted={onDeleted} />
            </Section>
          </div>
        </div>

        {/* Aperçu */}
        <aside className="hidden w-[460px] shrink-0 flex-col border-l border-zinc-200 bg-zinc-100/70 p-5 xl:flex">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Aperçu en direct</p>
            <Segmented
              value={view === "open" && leadPreview && s.lead.enabled ? "lead" : view}
              onChange={(v) => {
                setView(v === "closed" ? "closed" : "open");
                setLeadPreview(v === "lead");
              }}
              options={[
                { value: "closed", label: "Fermé" },
                { value: "open", label: "Ouvert" },
                ...(s.lead.enabled ? [{ value: "lead" as const, label: "Formulaire" }] : []),
              ]}
            />
          </div>
          <div className="min-h-0 flex-1">
            <WidgetStage settings={s} logoUrl={logoUrl} view={view} previewLead={leadPreview} />
          </div>
          <p className="mt-3 text-center text-xs text-zinc-500">
            Écris dans l&apos;aperçu pour sentir le rythme ·{" "}
            <a href={`/w/${widget.key}`} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">
              tester avec la vraie IA ↗
            </a>
          </p>
        </aside>
      </div>
    </div>
  );
}

function speedLabel(v: number) {
  if (v >= 90) return "Instantanée";
  if (v >= 60) return "Rapide";
  if (v >= 30) return "Équilibrée";
  return "Posée";
}

function Section({ id, title, text, danger, children }: { id: string; title: string; text: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section id={`wm-${id}`} className={`scroll-mt-6 rounded-2xl border bg-white ${danger ? "border-red-200" : "border-zinc-200"}`}>
      <div className={`border-b px-6 py-4 ${danger ? "border-red-100" : "border-zinc-100"}`}>
        <h3 className={`font-semibold ${danger ? "text-red-700" : ""}`}>{title}</h3>
        {text && <p className="mt-0.5 text-sm text-zinc-500">{text}</p>}
      </div>
      <div className="space-y-5 px-6 py-5">{children}</div>
    </section>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-200 px-2.5 py-2 hover:border-zinc-300">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-7 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0" />
      <span className="min-w-0">
        <span className="block truncate text-xs text-zinc-600">{label}</span>
        <span className="block font-mono text-[11px] text-zinc-400 uppercase">{value}</span>
      </span>
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-600">
      {label}
      <input
        type="number"
        min={0}
        max={200}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(200, Number(e.target.value) || 0)))}
        className="w-20 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm outline-none focus:border-zinc-400"
      />
      px
    </label>
  );
}

function RowsEditor({ values, max, placeholder, onChange }: { values: string[]; max: number; placeholder: string; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2">
      {values.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input
            className={inputClass}
            value={v}
            maxLength={80}
            placeholder={placeholder}
            onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button onClick={() => onChange(values.filter((_, j) => j !== i))} aria-label="Retirer" className="rounded-xl px-3 text-zinc-400 hover:bg-red-50 hover:text-red-600">
            ✕
          </button>
        </div>
      ))}
      {values.length < max && (
        <button onClick={() => onChange([...values, ""])} className="rounded-xl border border-dashed border-zinc-300 px-3.5 py-2 text-sm text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50">
          + Ajouter une question
        </button>
      )}
    </div>
  );
}

function TagInput({ values, placeholder, onChange }: { values: string[]; placeholder: string; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2 py-1.5 focus-within:border-zinc-400">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 py-1 pr-1 pl-2.5 text-xs font-medium text-zinc-700">
          {v}
          <button onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Retirer ${v}`} className="rounded px-1 text-zinc-400 hover:text-red-600">
            ✕
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={values.length ? "" : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
          if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={add}
        className="min-w-[90px] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
      />
    </div>
  );
}

function ActionsEditor({ values, onChange }: { values: ActionButton[]; onChange: (v: ActionButton[]) => void }) {
  const update = (i: number, patch: Partial<ActionButton>) => onChange(values.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <div className="space-y-2">
      {values.map((a, i) => (
        <div key={a.id} className="grid grid-cols-[130px_1fr_1.3fr_auto] gap-2">
          <select className={inputClass} value={a.kind} onChange={(e) => update(i, { kind: e.target.value as ActionButton["kind"] })}>
            {ACTION_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input className={inputClass} placeholder="Libellé" maxLength={30} value={a.label} onChange={(e) => update(i, { label: e.target.value })} />
          <input className={inputClass} placeholder={ACTION_KINDS.find((k) => k.value === a.kind)?.placeholder} value={a.value} onChange={(e) => update(i, { value: e.target.value })} />
          <button onClick={() => onChange(values.filter((_, j) => j !== i))} aria-label="Retirer" className="rounded-xl px-3 text-zinc-400 hover:bg-red-50 hover:text-red-600">
            ✕
          </button>
        </div>
      ))}
      {values.length < 3 && (
        <button
          onClick={() => onChange([...values, { id: Math.random().toString(36).slice(2, 10), kind: "call", label: "Nous appeler", value: "" }])}
          className="rounded-xl border border-dashed border-zinc-300 px-3.5 py-2 text-sm text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50"
        >
          + Ajouter un bouton
        </button>
      )}
    </div>
  );
}

function CopyBlock({ value, open }: { value: string; open?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 truncate rounded-xl bg-zinc-950 px-4 py-3 font-mono text-[12.5px] text-blue-300">{value}</code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        className="shrink-0 rounded-xl border border-zinc-200 px-3.5 text-sm font-medium hover:bg-zinc-50"
      >
        {copied ? "✓ Copié" : "Copier"}
      </button>
      {open && (
        <a href={value} target="_blank" rel="noreferrer" className="flex shrink-0 items-center rounded-xl border border-zinc-200 px-3.5 text-sm font-medium hover:bg-zinc-50">
          Ouvrir ↗
        </a>
      )}
    </div>
  );
}

function DangerZone({ onDeleted }: { onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <p className="text-sm font-medium text-zinc-900">Supprimer le widget</p>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
          Le code collé sur les sites cessera de fonctionner. Les discussions déjà reçues restent dans Discussions.
        </p>
      </div>
      {confirming ? (
        <div className="flex shrink-0 gap-2">
          <button onClick={() => setConfirming(false)} className="rounded-xl px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await fetch("/api/widget", { method: "DELETE" });
              onDeleted();
            }}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? "Suppression…" : "Oui, supprimer"}
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} className="shrink-0 rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
          Supprimer
        </button>
      )}
    </div>
  );
}
