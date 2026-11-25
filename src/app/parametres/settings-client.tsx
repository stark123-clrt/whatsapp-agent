"use client";

import Link from "next/link";
import { ChannelsSection } from "./channels";

type Section = { id: string; label: string; icon: string; ready?: boolean };

// Les sections sans « ready » sont prévues mais pas encore construites.
const GROUPS: { title: string; items: Section[] }[] = [
  {
    title: "Compte",
    items: [
      { id: "profile", label: "Profil", icon: "👤" },
      { id: "reply-name", label: "Nom de réponse", icon: "✏️" },
      { id: "security", label: "Sécurité et général", icon: "🔒" },
    ],
  },
  {
    title: "Espace de travail",
    items: [
      { id: "company", label: "Entreprise", icon: "🏢" },
      { id: "logo", label: "Ton logo", icon: "🖌️" },
      { id: "team", label: "Équipe", icon: "👥" },
      { id: "billing", label: "Facturation", icon: "💳" },
      { id: "tags", label: "Tags", icon: "🏷️" },
    ],
  },
  {
    title: "Canaux",
    items: [
      { id: "channels", label: "Canaux", icon: "🌐", ready: true },
      { id: "short-links", label: "Liens courts", icon: "🔗" },
    ],
  },
  {
    title: "Intégrations",
    items: [
      { id: "bookings", label: "Réservations et calendrier", icon: "📅" },
      { id: "webhooks", label: "Webhooks", icon: "🪝" },
      { id: "api", label: "Accès API", icon: "🔑" },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

export function SettingsClient({ section }: { section: string }) {
  const current = ALL.find((s) => s.id === section) ?? ALL.find((s) => s.id === "channels")!;

  return (
    <div className="flex min-h-full">
      <aside className="w-72 shrink-0 border-r border-zinc-200 bg-white px-5 py-8">
        <h1 className="text-2xl font-bold">Paramètres ⚙️</h1>
        <p className="mt-1 text-sm text-zinc-500">Configure ton espace de travail.</p>
        {GROUPS.map((g) => (
          <div key={g.title} className="mt-6">
            <p className="px-3 text-xs font-semibold tracking-wide text-zinc-400 uppercase">{g.title}</p>
            <ul className="mt-2 space-y-0.5">
              {g.items.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/parametres?section=${s.id}`}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                      s.id === current.id
                        ? "bg-green-50 font-semibold text-green-800 ring-1 ring-green-200"
                        : s.ready
                          ? "text-zinc-700 hover:bg-zinc-50"
                          : "text-zinc-400 hover:bg-zinc-50"
                    }`}
                  >
                    <span aria-hidden>{s.icon}</span>
                    <span className="flex-1">{s.label}</span>
                    {!s.ready && <span className="text-[11px]">Bientôt</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      <div className="min-w-0 flex-1 px-10 py-8">
        {current.id === "channels" ? (
          <ChannelsSection />
        ) : (
          <div>
            <h2 className="text-2xl font-bold">{current.label}</h2>
            <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm text-zinc-500">
              Cette section arrive bientôt.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
