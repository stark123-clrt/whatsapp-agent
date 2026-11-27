"use client";

import type { DealPriority, StageKind } from "@/lib/deals-types";
import type { Channel } from "@/lib/db";

/** Petits éléments partagés par la page Opportunités et ses fenêtres. */

export type ContactLite = { jid: string; name: string | null; phone: string | null; channel: Channel };

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });
export const eur = (v: number) => (Math.abs(v) >= 10_000 ? compact.format(v) : money.format(v));

export const PRIORITY: Record<DealPriority, { label: string; color: string }> = {
  none: { label: "Aucune", color: "#a1a1aa" },
  low: { label: "Basse", color: "#3b82f6" },
  medium: { label: "Moyenne", color: "#f59e0b" },
  high: { label: "Haute", color: "#ef4444" },
};

export const contactName = (c: ContactLite | undefined) => (c ? (c.name ?? (c.phone ? `+${c.phone}` : "Contact")) : null);

export function StageIcon({ kind, color, size = 15 }: { kind: StageKind; color: string; size?: number }) {
  const d = kind === "won" ? "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 12l2.5 2.5 4.5-5" : kind === "lost" ? "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6" : "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Icon({ d, size = 16, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  plus: "M12 5v14M5 12h14",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  chat: "M4 5h16v11H8l-4 3V5z",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  building: "M4 21V5l8-3v19M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2",
  calendar: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  tag: "M3 12l9-9h9v9l-9 9zM16 8h.01",
  euro: "M17 6a7 7 0 1 0 0 12M4 10h9M4 14h9",
  flag: "M5 21V4h11l-1.5 4L16 12H5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  filter: "M4 5h16l-6 8v5l-4 2v-7z",
  kanban: "M4 5h16v14H4zM9.5 5v14M14.5 5v14",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  table: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3",
  coins: "M9 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM15 22a6 6 0 1 0 0-12",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3",
  close: "M6 6l12 12M18 6L6 18",
};

export function Modal({ title, subtitle, onClose, children, footer, wide }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${wide ? "max-w-4xl" : "max-w-xl"}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-zinc-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <Icon d={ICONS.close} size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-6 py-3.5">{footer}</div>
      </div>
    </div>
  );
}

export const field = "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15";
export const label = "mb-1.5 block text-[11px] font-semibold tracking-wide text-zinc-500 uppercase";
