import type { Channel } from "./db";

/** Infos d'affichage de chaque canal (nom, couleur, icône). */
export const CHANNELS: Record<Channel, { label: string; color: string; available: boolean }> = {
  whatsapp: { label: "WhatsApp", color: "#25D366", available: true },
  web: { label: "Site web", color: "#a855f7", available: true },
  instagram: { label: "Instagram", color: "#E1306C", available: true },
  messenger: { label: "Messenger", color: "#0084FF", available: false },
  telegram: { label: "Telegram", color: "#229ED9", available: false },
  sms: { label: "SMS", color: "#52525B", available: false },
  email: { label: "E-mail", color: "#71717A", available: false },
};

export const CHANNEL_IDS = Object.keys(CHANNELS) as Channel[];

/** Petite pastille ronde de la couleur du canal, avec son initiale. */
export function ChannelDot({ channel, size = 16 }: { channel: Channel; size?: number }) {
  const c = CHANNELS[channel];
  return (
    <span
      title={c.label}
      className="flex items-center justify-center rounded-full font-bold text-white ring-2 ring-white"
      style={{ background: c.color, width: size, height: size, fontSize: size * 0.55 }}
    >
      {c.label[0]}
    </span>
  );
}
