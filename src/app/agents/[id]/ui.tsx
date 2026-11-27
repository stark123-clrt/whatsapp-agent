"use client";

import { Icon as UiIcon, type IconName } from "@/app/icons";

/** Petits composants partagés par les onglets de la page agent. */

export function Card({
  title,
  badge,
  description,
  action,
  children,
}: {
  title: string;
  badge?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            {title}
            {badge && <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">● {badge}</span>}
          </h3>
          {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
        </div>
        {action}
      </div>
      {children && <div className="px-6 py-5">{children}</div>}
    </section>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-zinc-300"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-5.5" : "left-0.5"}`} />
    </button>
  );
}

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6 rounded-xl border border-zinc-100 bg-zinc-50/50 px-4 py-3.5">
      <div>
        <p className="text-sm font-medium text-zinc-900">{title}</p>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export const inputClass = "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-zinc-400";

export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <UiIcon name="alert" size={16} className="mt-0.5 shrink-0 text-amber-600" />
      <div>{children}</div>
    </div>
  );
}

export function Info({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      <UiIcon name="info" size={16} className="mt-0.5 shrink-0 text-blue-700" />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ icon, title, text, children }: { icon: IconName; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
        <UiIcon name={icon} size={26} />
      </span>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 max-w-md text-sm text-zinc-500">{text}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function Soon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-200 px-4 py-3 text-sm text-zinc-500">
      {children}
      <span className="text-xs font-medium text-zinc-400">Bientôt</span>
    </div>
  );
}
