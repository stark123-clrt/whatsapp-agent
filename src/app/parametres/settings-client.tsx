"use client";

import Link from "next/link";
import { Icon, type IconName } from "../icons";
import { ChannelsSection } from "./channels";
import { ProfileSection } from "./profile-section";
import { TeamSection } from "./team-section";

type Section = { id: string; label: string; icon: IconName; ready?: boolean };

// Les sections sans « ready » sont prévues mais pas encore construites.
const GROUPS: { title: string; items: Section[] }[] = [
  {
    title: "Compte",
    items: [
      { id: "profile", label: "Profil", icon: "user", ready: true },
      { id: "reply-name", label: "Nom de réponse", icon: "pen" },
      { id: "security", label: "Sécurité et général", icon: "lock" },
    ],
  },
  {
    title: "Espace de travail",
    items: [
      { id: "company", label: "Entreprise", icon: "building" },
      { id: "logo", label: "Ton logo", icon: "brush" },
      { id: "team", label: "Équipe", icon: "users", ready: true },
      { id: "billing", label: "Facturation", icon: "card" },
      { id: "tags", label: "Tags", icon: "tag" },
    ],
  },
  {
    title: "Canaux",
    items: [
      { id: "channels", label: "Canaux", icon: "globe", ready: true },
      { id: "short-links", label: "Liens courts", icon: "link" },
    ],
  },
  {
    title: "Intégrations",
    items: [
      { id: "bookings", label: "Réservations et calendrier", icon: "calendar" },
      { id: "webhooks", label: "Webhooks", icon: "webhook" },
      { id: "api", label: "Accès API", icon: "key" },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

export function SettingsClient({ section }: { section: string }) {
  const current = ALL.find((s) => s.id === section) ?? ALL.find((s) => s.id === "channels")!;

  return (
    <div className="flex min-h-full shrink-0">
      <aside className="sticky top-0 h-svh w-72 shrink-0 self-start overflow-y-auto border-r border-zinc-200/80 bg-white/80 px-5 py-8 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="mt-1 text-sm text-zinc-500">Configure ton espace de travail.</p>
        {GROUPS.map((g) => (
          <div key={g.title} className="mt-6">
            <p className="px-3 text-xs font-semibold tracking-wide text-zinc-400 uppercase">{g.title}</p>
            <ul className="mt-2 space-y-0.5">
              {g.items.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/parametres?section=${s.id}`}
                    aria-current={s.id === current.id ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      s.id === current.id
                        ? "bg-zinc-100 font-medium text-zinc-900"
                        : s.ready
                          ? "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                          : "text-zinc-400 hover:bg-zinc-50"
                    }`}
                  >
                    <Icon name={s.icon} className={s.id === current.id ? "text-blue-600" : s.ready ? "text-zinc-400" : "text-zinc-300"} />
                    <span className="flex-1">{s.label}</span>
                    {!s.ready && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">Bientôt</span>}
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
        ) : current.id === "profile" ? (
          <ProfileSection />
        ) : current.id === "team" ? (
          <TeamSection />
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
