"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Item = { label: string; href?: string; icon: keyof typeof ICONS };

// Les entrées sans `href` sont les pages pas encore construites.
const SECTIONS: { title?: string; items: Item[] }[] = [
  { items: [{ label: "Tableau de bord", href: "/tableau-de-bord", icon: "grid" }] },
  {
    title: "Interagir",
    items: [
      { label: "Discussions", href: "/", icon: "chat" },
      { label: "Campagnes", href: "/campagnes", icon: "sparkles" },
      { label: "Diffusions", icon: "megaphone" },
      { label: "Rendez-vous", icon: "calendar" },
    ],
  },
  {
    title: "CRM",
    items: [
      { label: "Contacts", href: "/contacts", icon: "users" },
      { label: "Opportunités", href: "/opportunites", icon: "briefcase" },
    ],
  },
  {
    title: "Studio IA",
    items: [
      { label: "Agents IA", href: "/agents", icon: "chip" },
      { label: "Automatisations", icon: "robot" },
      { label: "Base de connaissances", href: "/base-de-connaissances", icon: "book" },
      { label: "Modèles", icon: "file" },
      { label: "Médiathèque", icon: "image" },
      { label: "Fonctions personnalisées", icon: "code" },
      { label: "Serveurs MCP", icon: "server" },
    ],
  },
  {
    title: "Réglages",
    items: [
      { label: "Canaux", href: "/parametres?section=channels", icon: "plug" },
      { label: "Paramètres", href: "/parametres", icon: "gear" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  // Pages publiques (chat des visiteurs, connexion) : pas de menu d'administration.
  if (pathname.startsWith("/w/") || pathname === "/login") return null;
  return <AdminSidebar pathname={pathname} />;
}

function AdminSidebar({ pathname }: { pathname: string }) {
  const currentSection = useSearchParams().get("section") ?? (pathname === "/parametres" ? "channels" : null);
  const { unread } = useLiveCounts();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (title: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  return (
    <nav className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <p className="px-6 pt-6 pb-4 text-base font-semibold">Stark Marketing</p>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SECTIONS.map((section, i) => (
          <div key={i} className="mb-4">
            {section.title && (
              <button
                onClick={() => toggle(section.title!)}
                aria-expanded={!closed.has(section.title)}
                className="flex w-full items-center justify-between px-3 pb-1 text-xs font-semibold tracking-wide text-zinc-400 uppercase hover:text-zinc-600"
              >
                {section.title}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={closed.has(section.title) ? "-rotate-90" : ""}
                  aria-hidden
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            )}
            <ul className={`space-y-0.5 ${section.title && closed.has(section.title) ? "hidden" : ""}`}>
              {section.items.map((item) => {
                const Icon = ICONS[item.icon];
                if (!item.href) {
                  return (
                    <li
                      key={item.label}
                      className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-400"
                    >
                      <Icon />
                      <span className="flex-1">{item.label}</span>
                      <span className="text-[11px]">Bientôt</span>
                    </li>
                  );
                }
                // « Canaux » et « Paramètres » partagent la même page : on compare aussi la section.
                const [itemPath, itemQuery] = item.href.split("?");
                const active =
                  pathname === itemPath &&
                  (itemQuery
                    ? currentSection === new URLSearchParams(itemQuery).get("section")
                    : itemPath !== "/parametres" || currentSection !== "channels");
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                        active
                          ? "bg-zinc-100 font-medium text-zinc-900"
                          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                      }`}
                    >
                      <Icon />
                      <span className="flex-1">{item.label}</span>
                      {item.href === "/" && unread > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 px-1.5 text-xs font-medium text-white">
                          {unread}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <button
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          window.location.replace("/login"); // rechargement complet : plus aucune donnée en mémoire
        }}
        className="mx-3 my-3 rounded-lg px-3 py-1.5 text-left text-xs text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
      >
        ⎋ Se déconnecter
      </button>
    </nav>
  );
}

/** Statut WhatsApp et nombre total de messages non lus. */
function useLiveCounts() {
  const [counts, setCounts] = useState<{ status: string | null; unread: number }>({ status: null, unread: 0 });
  useEffect(() => {
    const load = () =>
      fetch("/api/chats", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { whatsapp: string; chats: { unread: number }[] }) =>
          setCounts({ status: d.whatsapp, unread: d.chats.reduce((n, c) => n + c.unread, 0) }),
        )
        .catch(() => setCounts({ status: null, unread: 0 }));
    const first = setTimeout(load, 0);
    const id = setInterval(load, 4000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return counts;
}

const svg = (d: string) =>
  function Icon() {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    );
  };

const ICONS = {
  grid: svg("M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"),
  chat: svg("M4 5h16v11H8l-4 3V5z"),
  megaphone: svg("M4 10v4h3l7 4V6l-7 4H4zM18 9a4 4 0 0 1 0 6"),
  sparkles: svg("M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z"),
  calendar: svg("M4 6h16v14H4zM4 10h16M9 3v4M15 3v4"),
  users: svg("M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6"),
  briefcase: svg("M4 8h16v11H4zM9 8V5h6v3M4 13h16"),
  plug: svg("M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v4"),
  spark: svg("M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"),
  chip: svg("M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4"),
  robot: svg("M5 9h14v10H5zM12 5v4M9 13h.01M15 13h.01M9 16h6M3 12v3M21 12v3"),
  book: svg("M3 5a2 2 0 0 1 2-1h5a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H3zM21 5a2 2 0 0 0-2-1h-5a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"),
  file: svg("M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"),
  image: svg("M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9h.01"),
  code: svg("M9 7l-5 5 5 5M15 7l5 5-5 5"),
  server: svg("M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01"),
  gear: svg("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"),
};
