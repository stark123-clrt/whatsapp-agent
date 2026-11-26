"use client";

import { useCallback, useEffect, useState } from "react";
import type { WhatsAppState } from "@/lib/whatsapp";
import { AgentActivity } from "../agent-activity";
import { InstagramCard } from "./instagram-card";
import { Sparkline, WidgetCard } from "./widget-card";

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
        <InstagramCard />

        <Card
          title="Instagram et Messenger (officiel)"
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
                onClick={() => setConnecting(true)}
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
                  <p className="font-mono text-sm text-zinc-500">
                    +{phone}
                    {wa?.expectedPhone === phone && <span className="ml-2 font-sans text-xs text-green-700">🔒 numéro autorisé</span>}
                  </p>
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
              {wa?.lastError && <span className="mb-1 block text-amber-700">⚠️ {wa.lastError}</span>}
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

        <WidgetCard />

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

      {connecting && <ConnectModal wa={wa} onClose={() => setConnecting(false)} onChanged={load} />}
    </>
  );
}

function ConnectModal({ wa, onClose, onChanged }: { wa: WhatsAppState | null; onClose: () => void; onChanged: () => void }) {
  const [phone, setPhone] = useState(wa?.expectedPhone ? `+${wa.expectedPhone}` : "");
  const [step, setStep] = useState<"form" | "qr" | "code">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(method: "qr" | "code") {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/whatsapp/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, method }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Échec.");
    setStep(method);
    onChanged();
  }

  const code = wa?.pairingCode;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-center text-lg font-semibold">Connecter WhatsApp Web</h3>

        {wa?.status === "open" ? (
          <p className="mt-6 text-center font-medium text-green-700">✅ Connecté !</p>
        ) : step === "form" ? (
          <>
            <label className="mt-5 block text-sm font-medium text-zinc-700">
              Numéro du compte WhatsApp
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+33 6 12 34 56 78"
                inputMode="tel"
                autoFocus
                className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 font-mono text-sm outline-none focus:border-zinc-400"
              />
            </label>
            <p className="mt-1.5 text-xs text-zinc-500">
              🔒 Seul ce numéro pourra se connecter. Si un autre compte scanne, il sera déconnecté immédiatement.
            </p>
            <div className="mt-5 grid gap-2">
              <button
                onClick={() => start("qr")}
                disabled={busy || phone.replace(/\D/g, "").length < 8}
                className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-green-300"
              >
                📷 Scanner un QR code
              </button>
              <button
                onClick={() => start("code")}
                disabled={busy || phone.replace(/\D/g, "").length < 8}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 disabled:text-zinc-400"
              >
                {busy ? "Préparation…" : "🔢 Recevoir un code de connexion"}
              </button>
            </div>
          </>
        ) : step === "qr" ? (
          wa?.status === "qr" && wa.qrDataUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- QR code généré (data URL) */}
              <img src={wa.qrDataUrl} alt="QR code à scanner avec WhatsApp" width={260} height={260} className="mx-auto mt-5 rounded-lg" />
              <ol className="mt-5 list-decimal space-y-1 pl-6 text-sm text-zinc-600">
                <li>Sur le téléphone du +{wa.expectedPhone}, ouvre WhatsApp.</li>
                <li>Réglages → Appareils connectés → Connecter un appareil.</li>
                <li>Scanne ce code.</li>
              </ol>
            </>
          ) : (
            <p className="mt-6 text-center text-sm text-zinc-500">Génération du QR code…</p>
          )
        ) : code ? (
          <>
            <p className="mt-6 text-center font-mono text-4xl font-bold tracking-widest">{code}</p>
            <ol className="mt-6 list-decimal space-y-1 pl-6 text-sm text-zinc-600">
              <li>Sur le téléphone du +{wa?.expectedPhone}, ouvre WhatsApp.</li>
              <li>Réglages → Appareils connectés → Connecter un appareil.</li>
              <li>Touche « Lier avec le numéro de téléphone à la place ».</li>
              <li>Saisis ce code.</li>
            </ol>
          </>
        ) : (
          <p className="mt-6 text-center text-sm text-zinc-500">Demande du code…</p>
        )}

        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
        {wa?.lastError && wa.status !== "open" && <p className="mt-3 text-center text-xs text-amber-700">{wa.lastError}</p>}
        <div className="mt-6 flex justify-center gap-2">
          {step !== "form" && wa?.status !== "open" && (
            <button onClick={() => setStep("form")} className="rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
              ← Changer de méthode
            </button>
          )}
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
            Fermer
          </button>
        </div>
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
