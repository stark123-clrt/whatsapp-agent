"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";

type Item = { label: string; href?: string; icon: IconName };

// Les entrées sans `href` sont les pages pas encore construites.
const SECTIONS: { title?: string; items: Item[] }[] = [
  { items: [{ label: "Tableau de bord", href: "/tableau-de-bord", icon: "grid" }] },
  {
    title: "Interagir",
    items: [
      { label: "Discussions", href: "/", icon: "chat" },
      { label: "Campagnes", href: "/campagnes", icon: "sparkles" },
      { label: "Diffusions", href: "/diffusions", icon: "megaphone" },
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
  if (pathname.startsWith("/w/") || pathname.startsWith("/invitation/") || pathname === "/login") return null;
  return <AdminSidebar pathname={pathname} />;
}

function AdminSidebar({ pathname }: { pathname: string }) {
  const currentSection = useSearchParams().get("section") ?? (pathname === "/parametres" ? "channels" : null);
  const { unread } = useLiveCounts();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  // Menu réduit (icônes seules) : le choix est gardé dans le navigateur.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setCollapsed(localStorage.getItem("sidebar-collapsed") === "1"), 0);
    return () => clearTimeout(t);
  }, []);
  const setMenu = (v: boolean) => {
    setCollapsed(v);
    localStorage.setItem("sidebar-collapsed", v ? "1" : "0");
  };
  const toggle = (title: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  return (
    <nav
      className={`relative z-10 flex shrink-0 flex-col border-r border-zinc-200/80 bg-white/80 backdrop-blur-md transition-[width] duration-200 ${collapsed ? "w-[72px]" : "w-60"}`}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-3 pt-5 pb-3">
          <Link href="/tableau-de-bord" aria-label="Stark Marketing — tableau de bord" title="Tableau de bord">
            <Image src="/brand/symbol.png" alt="Stark" width={40} height={40} priority className="h-10 w-10" />
          </Link>
          <button onClick={() => setMenu(false)} title="Agrandir le menu" aria-label="Agrandir le menu" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <Icon name="expand" size={18} />
          </button>
        </div>
      ) : (
        <div className="relative flex items-center justify-center px-6 pt-6 pb-5">
          <Link href="/tableau-de-bord" aria-label="Stark Marketing — tableau de bord">
            <Image src="/brand/logo.png" alt="Stark Marketing" width={105} height={48} priority className="h-12 w-auto" />
          </Link>
          <button
            onClick={() => setMenu(true)}
            title="Réduire le menu"
            aria-label="Réduire le menu"
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg border border-zinc-200 bg-white p-1 text-zinc-400 hover:text-zinc-700"
          >
            <Icon name="collapse" size={16} />
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SECTIONS.map((section, i) => (
          <div key={i} className={collapsed ? "" : "mb-4"}>
            {section.title &&
              (collapsed ? (
                <hr className="mx-2 my-2.5 border-zinc-200" />
              ) : (
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
              ))}
            <ul className={`space-y-0.5 ${!collapsed && section.title && closed.has(section.title) ? "hidden" : ""}`}>
              {section.items.map((item) => {
                if (!item.href) {
                  return (
                    <li
                      key={item.label}
                      title={collapsed ? `${item.label} — bientôt` : undefined}
                      className={`flex cursor-default items-center rounded-lg py-2 text-sm text-zinc-400 ${collapsed ? "justify-center" : "gap-3 px-3"}`}
                    >
                      <Icon name={item.icon} size={collapsed ? 20 : 18} className="text-zinc-300" />
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">Bientôt</span>
                        </>
                      )}
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
                const badge = item.href === "/" ? unread : 0;
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex items-center rounded-lg py-2 text-sm transition-colors ${collapsed ? "justify-center" : "gap-3 px-3"} ${
                        active
                          ? "bg-zinc-100 font-medium text-zinc-900 before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-1 before:rounded-r-full before:bg-blue-600"
                          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                      }`}
                    >
                      <Icon name={item.icon} size={collapsed ? 20 : 18} className={active ? "text-blue-600" : "text-zinc-400"} />
                      {!collapsed && <span className="flex-1">{item.label}</span>}
                      {badge > 0 &&
                        (collapsed ? (
                          <span className="absolute top-0 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                            {badge > 99 ? "99+" : badge}
                          </span>
                        ) : (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-medium text-white">{badge}</span>
                        ))}
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
        title={collapsed ? "Se déconnecter" : undefined}
        aria-label="Se déconnecter"
        className={`mx-3 my-3 flex items-center rounded-lg py-2 text-left text-sm text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 ${collapsed ? "justify-center" : "gap-3 px-3"}`}
      >
        <Icon name="logout" size={collapsed ? 20 : 18} className="text-zinc-400" />
        {!collapsed && "Se déconnecter"}
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
