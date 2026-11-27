"use client";

import { Icon as UiIcon } from "@/app/icons";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_WIDGET, LAUNCHER_ICONS, RADIUS, THEMES, type WidgetSettings } from "@/lib/widget-settings";
import { Toggle, inputClass } from "../agents/[id]/ui";
import { WidgetChat } from "../w/widget-chat";
import { WidgetManager } from "./widget-manager";

export type WidgetData = { id: number; key: string; settings: WidgetSettings; createdAt: number; updatedAt: number };

/** Carte « Widget de chat pour site web » de la page Canaux. */
export function WidgetCard() {
  const [widget, setWidget] = useState<WidgetData | null>(null);
  const [volume, setVolume] = useState<{ day: string; count: number }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/widget", { cache: "no-store" }).catch(() => null);
    if (r?.ok) {
      const d = (await r.json()) as { widget: WidgetData | null; volume: { day: string; count: number }[] };
      setWidget(d.widget);
      setVolume(d.volume ?? []);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  async function copySnippet() {
    if (!widget) return;
    await navigator.clipboard.writeText(snippetFor(widget.key));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const total = volume.reduce((n, v) => n + v.count, 0);
  const s = widget?.settings;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-6 px-6 py-5">
        <div>
          <h3 className="font-semibold">Widget de chat pour site web</h3>
          <p className="mt-1 text-sm text-zinc-500">Une bulle de chat IA à coller sur ton site ou celui de tes clients. Elle répond avec ton agent, 24 h/24.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {widget ? (
            <>
              <button onClick={copySnippet} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50">
                {copied ? "✓ Copié" : "Copier le code"}
              </button>
              <button onClick={() => setManaging(true)} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                Gérer
              </button>
            </>
          ) : (
            loaded && (
              <button onClick={() => setCreating(true)} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50">
                Connecter
              </button>
            )
          )}
        </div>
      </div>

      <div className="border-t border-zinc-100 px-6 py-5">
        {widget && s ? (
          <>
            <div className="flex items-center gap-4">
              <span
                className="flex h-11 w-11 items-center justify-center overflow-hidden text-lg font-semibold"
                style={{ background: s.colors.brand, color: s.colors.brandText, borderRadius: RADIUS[s.corners].button === 999 ? 999 : 12 }}
              >
                {s.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/public/widget/${widget.key}/logo?v=${widget.updatedAt}`} alt="" className="h-full w-full object-cover" />
                ) : (
                  <LauncherSvg icon={s.launcherIcon} size={22} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold">
                  {s.name}
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">● CONNECTÉ</span>
                </p>
                <p className="truncate text-sm text-zinc-500">
                  Thème {THEMES[s.theme].label} ·{" "}
                  {s.allowedDomains.length ? `Autorisé sur ${s.allowedDomains.join(", ")}` : "Utilisable sur tous les sites"}
                </p>
              </div>
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                <span>Volume d&apos;envoi · 30 derniers jours</span>
                <span className="normal-case">
                  {total} envoyé{total > 1 ? "s" : ""}
                </span>
              </div>
              <Sparkline values={volume.map((v) => v.count)} color={s.colors.brand} />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-500"><UiIcon name="chat" size={20} className="" /></span>
            <div>
              <p className="flex items-center gap-2 font-semibold">
                Web widget
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-500">● NON CONNECTÉ</span>
              </p>
              <p className="text-sm text-zinc-500">Crée ton widget en une minute, puis colle une ligne de code sur ton site.</p>
            </div>
          </div>
        )}
      </div>

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={(w) => {
            setWidget(w);
            void load();
          }}
          onCustomize={() => {
            setCreating(false);
            setManaging(true);
          }}
        />
      )}
      {managing && widget && (
        <WidgetManager
          widget={widget}
          onClose={() => setManaging(false)}
          onSaved={(w) => setWidget(w)}
          onDeleted={() => {
            setManaging(false);
            setWidget(null);
          }}
        />
      )}
    </section>
  );
}

export function snippetFor(key: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `<script src="${origin}/widget/${key}" defer></script>`;
}

const SWATCHES = ["#25D366", "#2563eb", "#7c3aed", "#ec4899", "#f97316", "#0f766e", "#18181b"];

/** « Connecter » : les réglages essentiels, avec l'aperçu en direct, puis le code à coller. */
function CreateModal({ onClose, onCreated, onCustomize }: { onClose: () => void; onCreated: (w: WidgetData) => void; onCustomize: () => void }) {
  const [s, setS] = useState<WidgetSettings>(DEFAULT_WIDGET);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<WidgetData | null>(null);
  const [copied, setCopied] = useState(false);
  const set = (patch: Partial<WidgetSettings>) => setS((p) => ({ ...p, ...patch }));

  async function save() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/widget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: s }) });
    const d = (await r.json().catch(() => ({}))) as { widget?: WidgetData; error?: string };
    setBusy(false);
    if (!r.ok || !d.widget) return setError(d.error ?? "Création impossible.");
    setCreated(d.widget);
    onCreated(d.widget);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex w-full flex-col md:w-[440px] md:shrink-0">
          <div className="border-b border-zinc-100 px-7 py-5">
            <h3 className="text-lg font-semibold">{created ? "Ton widget est prêt" : "Connecter le widget de chat"}</h3>
            <p className="mt-0.5 text-sm text-zinc-500">
              {created ? "Colle ce code juste avant </body> sur chaque page où le chat doit apparaître." : "L'essentiel pour commencer. Tout le reste se règle ensuite dans « Gérer »."}
            </p>
          </div>

          {created ? (
            <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">
              <pre className="rounded-xl bg-zinc-950 p-4 font-mono text-[12.5px] leading-relaxed break-all whitespace-pre-wrap text-blue-300">{snippetFor(created.key)}</pre>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(snippetFor(created.key));
                  setCopied(true);
                }}
                className="w-full rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                {copied ? "✓ Code copié" : "Copier le code"}
              </button>
              <ul className="space-y-1.5 text-sm text-zinc-600">
                <li>• WordPress : extension « Insert Headers and Footers », zone pied de page.</li>
                <li>• Shopify : Thème → Modifier le code → theme.liquid, avant &lt;/body&gt;.</li>
                <li>• Wix, Webflow, Framer : réglages du site → Code personnalisé.</li>
              </ul>
              <a href={`/w/${created.key}`} target="_blank" rel="noreferrer" className="block text-sm font-medium text-blue-700 hover:underline">
                Tester le chat maintenant ↗
              </a>
            </div>
          ) : (
            <div className="flex-1 space-y-5 overflow-y-auto px-7 py-6">
              <Labeled label="Nom affiché">
                <input className={inputClass} value={s.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} placeholder="Ex. : Boutique Lumière" />
              </Labeled>
              <Labeled label="Couleur">
                <div className="flex flex-wrap items-center gap-2">
                  {SWATCHES.map((c) => (
                    <button
                      key={c}
                      onClick={() => set({ colors: { ...s.colors, brand: c } })}
                      aria-label={c}
                      className={`h-8 w-8 rounded-full transition hover:scale-110 ${s.colors.brand.toLowerCase() === c.toLowerCase() ? "ring-2 ring-zinc-900 ring-offset-2" : ""}`}
                      style={{ background: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={s.colors.brand}
                    onChange={(e) => set({ colors: { ...s.colors, brand: e.target.value } })}
                    className="h-8 w-10 cursor-pointer rounded-lg border border-zinc-200 bg-white p-0.5"
                    aria-label="Couleur personnalisée"
                  />
                </div>
              </Labeled>
              <Labeled label="Position">
                <Segmented
                  value={s.position}
                  onChange={(v) => set({ position: v })}
                  options={[
                    { value: "bottom-left", label: "En bas à gauche" },
                    { value: "bottom-right", label: "En bas à droite" },
                  ]}
                />
              </Labeled>
              <Labeled label="Message d'accueil">
                <textarea className={`${inputClass} resize-none`} rows={2} value={s.welcome} maxLength={300} onChange={(e) => set({ welcome: e.target.value })} />
              </Labeled>
              <Labeled label="Texte de la zone de saisie">
                <input className={inputClass} value={s.placeholder} maxLength={60} onChange={(e) => set({ placeholder: e.target.value })} />
              </Labeled>
              <SwitchLine
                title="Demander le nom et l'e-mail"
                text="Avant le premier message, pour pouvoir recontacter le visiteur."
                checked={s.lead.enabled}
                onChange={(v) => set({ lead: { ...s.lead, enabled: v } })}
              />
              <SwitchLine title="Mention « Propulsé par l'IA »" text="Petite ligne discrète sous la zone de saisie." checked={s.poweredBy} onChange={(v) => set({ poweredBy: v })} />
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-zinc-100 px-7 py-4">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
              {created ? "Fermer" : "Annuler"}
            </button>
            {created ? (
              <button onClick={onCustomize} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Personnaliser davantage →
              </button>
            ) : (
              <button onClick={save} disabled={busy || !s.name.trim()} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300">
                {busy ? "Création…" : "Enregistrer le widget"}
              </button>
            )}
          </div>
        </div>

        <div className="hidden flex-1 border-l border-zinc-100 bg-zinc-50 p-6 md:block">
          <WidgetStage settings={s} previewLead={s.lead.enabled} />
        </div>
      </div>
    </div>
  );
}

/** Aperçu : une fausse page de site avec le bouton et la fenêtre de chat. */
export function WidgetStage({
  settings: s,
  logoUrl,
  previewLead,
  view = "open",
}: {
  settings: WidgetSettings;
  logoUrl?: string | null;
  previewLead?: boolean;
  view?: "open" | "closed";
}) {
  const left = s.position === "bottom-left";
  const side = left ? { left: Math.min(s.offsetX, 40) } : { right: Math.min(s.offsetX, 40) };
  const bottom = Math.min(s.offsetY, 40);
  const r = RADIUS[s.corners];
  return (
    <div className="flex h-full min-h-[600px] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-blue-300" />
        <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-[11px] text-zinc-400">https://votre-site.fr</span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {/* Contenu fictif du site */}
        <div className="space-y-4 p-8 opacity-70">
          <div className="h-5 w-40 rounded bg-zinc-200" />
          <div className="h-9 w-3/4 rounded bg-zinc-100" />
          <div className="h-3 w-2/3 rounded bg-zinc-100" />
          <div className="h-3 w-1/2 rounded bg-zinc-100" />
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-zinc-100" />
            ))}
          </div>
        </div>

        {view === "open" ? (
          <div className="absolute top-4 overflow-hidden shadow-2xl" style={{ ...side, bottom: bottom + 70, width: 340, borderRadius: r.panel }}>
            <WidgetChat mode="preview" settings={s} logoUrl={logoUrl} previewLead={previewLead} />
          </div>
        ) : (
          s.proactive.enabled && (
            <div className="absolute w-64 rounded-2xl bg-white p-3.5 text-sm shadow-xl" style={{ ...side, bottom: bottom + 74, borderRadius: Math.min(r.panel, 16) }}>
              <p className="flex items-center gap-2 text-[13px] font-semibold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px]" style={{ background: s.colors.brand, color: s.colors.brandText }}>
                  {(s.name || "?").charAt(0).toUpperCase()}
                </span>
                {s.name}
              </p>
              <p className="mt-1.5 leading-snug text-zinc-700">{s.proactive.message}</p>
              <div className="mt-2.5 flex gap-2">
                <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: s.colors.brand, color: s.colors.brandText }}>
                  {s.proactive.accept}
                </span>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">{s.proactive.refuse}</span>
              </div>
            </div>
          )
        )}

        <div
          className="absolute flex h-14 w-14 items-center justify-center shadow-lg"
          style={{ ...side, bottom, background: s.colors.brand, color: s.colors.brandText, borderRadius: r.button }}
        >
          {view === "open" ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <LauncherSvg icon={s.launcherIcon} size={26} />
          )}
        </div>
      </div>
    </div>
  );
}

export function LauncherSvg({ icon, size }: { icon: WidgetSettings["launcherIcon"]; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={LAUNCHER_ICONS[icon]} />
    </svg>
  );
}

export function Labeled({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{label}</p>
      {children}
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function SwitchLine({ title, text, checked, onChange }: { title: string; text?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-5">
      <div>
        <p className="text-sm font-medium text-zinc-900">{title}</p>
        {text && <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{text}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[] }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-zinc-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${value === o.value ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sparkline({ values, color = "#a855f7" }: { values: number[]; color?: string }) {
  const max = Math.max(1, ...values);
  const w = 600;
  const h = 60;
  const points = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-16 w-full" aria-label="Volume d'envoi">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
