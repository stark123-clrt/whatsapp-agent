/** Icônes au trait de l'interface (menus) : même épaisseur, même taille, couleur du texte. */

const PATHS = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  chat: "M4 5h16v11H8l-4 3V5z",
  megaphone: "M4 10v4h3l7 4V6l-7 4H4zM18 9a4 4 0 0 1 0 6",
  sparkles: "M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z",
  calendar: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  users: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6",
  briefcase: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  plug: "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v4",
  spark: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  chip: "M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4",
  robot: "M5 9h14v10H5zM12 5v4M9 13h.01M15 13h.01M9 16h6M3 12v3M21 12v3",
  book: "M3 5a2 2 0 0 1 2-1h5a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H3zM21 5a2 2 0 0 0-2-1h-5a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9h.01",
  code: "M9 7l-5 5 5 5M15 7l5 5-5 5",
  server: "M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  pen: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2",
  building: "M5 21V4h10v17M15 9h4v12M3 21h18M8 8h2M8 12h2M8 16h2",
  brush: "M14 4l6 6-8.5 8.5a3 3 0 0 1-4.2 0l-1.8-1.8a3 3 0 0 1 0-4.2zM5.5 18.5L3 21",
  card: "M3 6h18v12H3zM3 10h18M7 15h3",
  tag: "M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  webhook: "M9 8a3 3 0 1 1 5 2.2L17 16M6 14a3 3 0 1 0 3 3h6M18 19a3 3 0 1 0-1.7-5.5L13 8",
  key: "M15 9a4 4 0 1 1-1.2-2.8A4 4 0 0 1 15 9zM12 12l-8 8M7 17l2 2M9 15l2 2",
  logout: "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}
