import { CHANNEL_IDS, CHANNELS, ChannelDot } from "@/lib/channels";
import { AgentActivity } from "../agent-activity";
import { WhatsAppConnection } from "../whatsapp-connection";

export default function CanauxPage() {
  const upcoming = CHANNEL_IDS.filter((id) => !CHANNELS[id].available);
  return (
    <main className="mx-auto w-full max-w-4xl px-8 py-10">
      <h1 className="text-2xl font-semibold">Canaux</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Connecte tes comptes : toutes les conversations arrivent dans Discussions.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <WhatsAppConnection />
        <AgentActivity />
      </div>

      <h2 className="mt-10 text-sm font-medium text-zinc-500">Prochainement</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {upcoming.map((id) => (
          <li key={id} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <ChannelDot channel={id} size={28} />
            <span className="flex-1 text-sm font-medium">{CHANNELS[id].label}</span>
            <span className="text-xs text-zinc-400">Bientôt</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
