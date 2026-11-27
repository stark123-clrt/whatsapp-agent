"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Connexion impossible.");
    // Retour à la page demandée (seulement une adresse interne).
    const next = params.get("next");
    window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <Image src="/brand/logo.png" alt="Stark Marketing" width={96} height={44} priority className="h-11 w-auto" />
      <h1 className="mt-5 text-xl font-semibold">Connexion</h1>
      <p className="mt-1 text-sm text-zinc-500">Connecte-toi pour accéder à tes discussions.</p>
      <label className="mt-6 block text-sm font-medium text-zinc-700">
        Mot de passe
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-zinc-400"
        />
      </label>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy || !password}
        className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
      >
        {busy ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
