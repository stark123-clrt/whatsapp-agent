"use client";

import { useCallback, useEffect, useState } from "react";
import type { WhatsAppState } from "@/lib/whatsapp";

const POLL_MS = 2000;

const LABELS: Record<WhatsAppState["status"], string> = {
  idle: "Démarrage…",
  connecting: "Connexion en cours…",
  qr: "En attente du scan",
  open: "Connecté",
  closed: "Déconnecté",
};

export function WhatsAppConnection() {
  const [state, setState] = useState<WhatsAppState | null>(null);
  const [busy, setBusy] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/status", { cache: "no-store" });
      setState(await res.json());
      setFetchError(false);
    } catch {
      setFetchError(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const id = setInterval(refresh, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refresh]);

  async function post(path: string) {
    setBusy(true);
    try {
      const res = await fetch(path, { method: "POST" });
      setState(await res.json());
    } finally {
      setBusy(false);
    }
  }

  const status = state?.status ?? "idle";

  return (
    <section className="w-full rounded-xl border border-zinc-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Compte WhatsApp</h2>
        <span className="flex items-center gap-2 text-sm text-zinc-600">
          <span
            className={`h-2 w-2 rounded-full ${
              status === "open"
                ? "bg-green-600"
                : status === "closed"
                  ? "bg-red-500"
                  : "bg-amber-500"
            }`}
          />
          {LABELS[status]}
        </span>
      </div>

      {fetchError && (
        <p className="mt-4 text-sm text-red-600">
          Le serveur ne répond pas. Vérifie que l&apos;appli tourne.
        </p>
      )}

      {status === "qr" && state?.qrDataUrl && (
        <div className="mt-6 flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- image générée (data URL) */}
          <img
            src={state.qrDataUrl}
            alt="QR code à scanner avec WhatsApp"
            width={260}
            height={260}
            className="rounded-lg"
          />
          <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600">
            <li>Ouvre WhatsApp sur ton téléphone.</li>
            <li>Va dans Réglages → Appareils connectés.</li>
            <li>Touche « Connecter un appareil » et scanne ce code.</li>
          </ol>
        </div>
      )}

      {(status === "connecting" || status === "idle") && (
        <p className="mt-6 text-sm text-zinc-600">Préparation de la connexion…</p>
      )}

      {status === "open" && state?.me && (
        <div className="mt-6 space-y-1 text-sm">
          <p className="text-zinc-900">
            {state.me.name ?? "Compte connecté"}
          </p>
          <p className="font-mono text-zinc-500">+{state.me.id.split(/[:@]/)[0]}</p>
        </div>
      )}

      {state?.lastError && status !== "open" && (
        <p className="mt-4 text-sm text-zinc-500">{state.lastError}</p>
      )}

      <div className="mt-6 flex gap-3">
        {status === "closed" && (
          <button
            onClick={() => post("/api/whatsapp/connect")}
            disabled={busy}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Reconnecter
          </button>
        )}
        {status === "open" && (
          <button
            onClick={() => {
              if (confirm("Déconnecter ce compte WhatsApp de l'appli ?")) {
                void post("/api/whatsapp/logout");
              }
            }}
            disabled={busy}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Déconnecter
          </button>
        )}
      </div>
    </section>
  );
}
