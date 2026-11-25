"use client";

import { useCallback, useEffect, useState } from "react";
import type { WhatsAppState } from "@/lib/whatsapp";
import { AgentActivity } from "../agent-activity";

/** Section « Canaux » des paramètres : chaque canal de messagerie et sa connexion. */
export function ChannelsSection() {
  const [wa, setWa] = useState<WhatsAppState | null>(null);
  const [volume, setVolume] = useState<{ day: string; count: number }[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/whatsapp/status", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setWa(await res.json());
  }, []);

  useEffect(() => {
    const first = setTimeout(() => {
      void load();
      void fetch("/api/channels/stats", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setVolume(d.whatsapp ?? []))
        .catch(() => {});
    }, 0);
    const id = setInterval(load, connecting ? 2000 : 8000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load, connecting]);

  // Une fois connecté, la fenêtre du QR code se ferme toute seule.
  const connected = wa?.status === "open";
  useEffect(() => {
    if (connected && connecting) {
      const t = setTimeout(() => setConnecting(false), 1500);
      return () => clearTimeout(t);
    }
  }, [connected, connecting]);

  async function disconnect() {
    if (!window.confirm("Déconnecter ce numéro WhatsApp de l'appli ?\nL'agent ne recevra plus les messages jusqu'à la prochaine connexion.")) return;
    await fetch("/api/whatsapp/logout", { method: "POST" });
    void load();
  }

  const total = volume.reduce((n, v) => n + v.count, 0);
  const phone = wa?.me?.id.split(/[:@]/)[0];

  return (
    <>
      <h2 className="text-2xl font-bold">Canaux</h2>
      <p className="mt-1 text-zinc-600">WhatsApp, SMS, Instagram, Messenger et le widget de site web.</p>

      <div className="mt-6 space-y-5">
        <Card
          title="Instagram et Messenger"
          description="La connexion officielle Meta, via Facebook : messages privés, réponses aux commentaires par message privé et réponses aux Stories."
          action={<SoonButton label="Connecter" />}
        >
          <Row icon="📸" name="Meta" badge="NON CONNECTÉ" text="Pas encore connecté." />
        </Card>

        <Card
          title="WhatsApp Business API"
          description="Numéros WhatsApp officiels de Meta (Cloud API) : la méthode officielle, sans risque de blocage, avec modèles de messages."
          action={<SoonButton label="Connecter WhatsApp" primary />}
        >
          <p className="text-sm text-zinc-500">Aucun numéro WhatsApp Business pour l&apos;instant.</p>
        </Card>

        <Card
          title="WhatsApp Web"
          description="Associe ton WhatsApp en scannant un QR code, sans Business API. Évite d'écrire en masse à des inconnus avec un numéro récent."
          action={
            !connected && (
              <button
                onClick={() => {
                  setConnecting(true);
                  void fetch("/api/whatsapp/connect", { method: "POST" }).then(load);
                }}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
              >
                🟢 Connecter
              </button>
            )
          }
        >
          {connected ? (
            <>
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-green-50 text-xl">💬</span>
                <div className="flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {wa?.me?.name ?? "WhatsApp"}
                    <span className="rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">● CONNECTÉ</span>
                  </p>
                  <p className="font-mono text-sm text-zinc-500">+{phone}</p>
                </div>
                <button onClick={disconnect} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                  Déconnecter
                </button>
              </div>
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                  <span>Volume d&apos;envoi · 30 derniers jours</span>
                  <span className="normal-case">
                    {total} envoyé{total > 1 ? "s" : ""}
                  </span>
                </div>
                <Sparkline values={volume.map((v) => v.count)} />
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-500">
              {wa?.status === "connecting" || wa?.status === "idle" || !wa
                ? "Préparation de la connexion…"
                : "Aucun numéro WhatsApp Web associé. Clique sur Connecter pour scanner un code QR."}
            </p>
          )}
          <button onClick={() => setShowLog(!showLog)} className="mt-4 text-xs font-medium text-zinc-500 hover:text-zinc-800">
            {showLog ? "▾ Masquer l'activité de l'agent" : "▸ Voir l'activité de l'agent"}
          </button>
          {showLog && (
            <div className="mt-3">
              <AgentActivity />
            </div>
          )}
        </Card>

        <Card title="Telegram" description="Connecte un compte Telegram pour répondre aux messages privés depuis ton propre numéro." action={<SoonButton label="Connecter" />} />

        <Card title="Widget de chat pour site web" description="Intègre une bulle de chat IA sur ton site ou celui de tes clients." action={<SoonButton label="Gérer" />}>
          <Row icon="💬" name="Web widget" badge="BIENTÔT" text="Prochaine étape : une bulle de chat à coller sur n'importe quel site." />
        </Card>

        <Card
          title="Compte Twilio"
          description="Pour les SMS et les numéros WhatsApp gérés via Twilio."
          action={<SoonButton label="Gérer" />}
        >
          <Row icon="🔑" name="Compte Twilio" badge="NON CONFIGURÉ" text="Aucun compte Twilio connecté pour l'instant." />
        </Card>

        <Card
          title="Conformité réglementaire"
          description="Requis par Twilio pour les numéros SMS/voix dans certaines régions (numéros gratuits aux États-Unis, mobiles au Royaume-Uni…)."
          action={<SoonButton label="Démarrer" />}
        >
          <Row icon="🛡️" name="Dossier réglementaire" badge="NON DÉMARRÉ" text="Uniquement requis pour les numéros SMS/voix réglementés." />
        </Card>

        <Card
          title="Canal personnalisé"
          description="Ton propre canal (application, CRM ou widget) : envoie les messages à un webhook et reçois les réponses de l'IA par POST."
          action={<SoonButton label="Configurer" />}
        />
      </div>

      {connecting && !connected && <QrModal wa={wa} onClose={() => setConnecting(false)} />}
    </>
  );
}

function QrModal({ wa, onClose }: { wa: WhatsAppState | null; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Connecter WhatsApp Web</h3>
        {wa?.status === "qr" && wa.qrDataUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- QR code généré (data URL) */}
            <img src={wa.qrDataUrl} alt="QR code à scanner avec WhatsApp" width={260} height={260} className="mx-auto mt-5 rounded-lg" />
            <ol className="mt-5 list-decimal space-y-1 pl-6 text-left text-sm text-zinc-600">
              <li>Ouvre WhatsApp sur ton téléphone.</li>
              <li>Va dans Réglages → Appareils connectés.</li>
              <li>Touche « Connecter un appareil » et scanne ce code.</li>
            </ol>
          </>
        ) : wa?.status === "open" ? (
          <p className="mt-6 font-medium text-green-700">✅ Connecté !</p>
        ) : (
          <p className="mt-6 text-sm text-zinc-500">Génération du QR code…</p>
        )}
        {wa?.lastError && wa.status !== "open" && <p className="mt-3 text-xs text-zinc-400">{wa.lastError}</p>}
        <button onClick={onClose} className="mt-6 rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
          Fermer
        </button>
      </div>
    </div>
  );
}

function Card({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-6 px-6 py-5">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="border-t border-zinc-100 px-6 py-5">{children}</div>}
    </section>
  );
}

function Row({ icon, name, badge, text }: { icon: string; name: string; badge: string; text: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-xl">{icon}</span>
      <div>
        <p className="flex items-center gap-2 font-semibold">
          {name}
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-500">● {badge}</span>
        </p>
        <p className="text-sm text-zinc-500">{text}</p>
      </div>
    </div>
  );
}

function SoonButton({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <span
      title="Bientôt"
      className={`inline-flex cursor-default items-center gap-2 rounded-xl px-4 py-2 text-sm ${
        primary ? "bg-green-100 text-green-700" : "border border-zinc-200 text-zinc-400"
      }`}
    >
      {label} <span className="text-[11px]">· Bientôt</span>
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 600;
  const h = 60;
  const points = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-16 w-full" aria-label="Volume d'envoi">
      <polyline points={points} fill="none" stroke="#a855f7" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
