"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { GoogleButton, PasswordField } from "../../login/login-form";

type Info = { email: string; role: "admin" | "member"; google: boolean };

const input = "mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

/** Rejoindre l'espace : créer son compte (nom + mot de passe), ou avec Google pour la même adresse. */
export function InviteForm({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
      const d = (await r?.json().catch(() => ({}))) as Info & { error?: string };
      if (r?.ok) setInfo(d);
      else setError(d?.error ?? "Invitation introuvable.");
    }, 0);
    return () => clearTimeout(t);
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/auth/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, name, password }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d.error ?? "Création impossible.");
    window.location.assign("/");
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl shadow-blue-900/5 sm:p-10">
      <Image src="/brand/logo.png" alt="Stark Marketing" width={96} height={44} priority className="h-11 w-auto" />
      <h1 className="mt-5 text-xl font-semibold">Rejoindre l&apos;équipe</h1>
      {info ? (
        <>
          <p className="mt-1 text-sm text-zinc-500">
            Invitation pour <strong className="text-zinc-800">{info.email}</strong> ({info.role === "admin" ? "administrateur" : "membre"}).
          </p>
          {info.google && (
            <div className="mt-6">
              <GoogleButton next="/" />
              <p className="mt-2 text-center text-xs text-zinc-500">Avec le compte Google de {info.email}.</p>
              <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
                <span className="h-px flex-1 bg-zinc-200" />
                ou crée un mot de passe
                <span className="h-px flex-1 bg-zinc-200" />
              </div>
            </div>
          )}
          <label className={`block text-sm font-medium text-zinc-700 ${info.google ? "" : "mt-6"}`}>
            Ton nom
            <input autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </label>
          <PasswordField value={password} onChange={setPassword} create />
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy || !name.trim() || !password}
            className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
          >
            {busy ? "Création…" : "Créer mon compte"}
          </button>
        </>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">{error ?? "Chargement de l'invitation…"}</p>
      )}
    </form>
  );
}
