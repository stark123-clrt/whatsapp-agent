"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Config = { needsSetup: boolean; setupCodeRequired: boolean; google: boolean };

const input = "mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function GoogleButton({ next }: { next: string }) {
  return (
    <a
      href={`/api/auth/google?next=${encodeURIComponent(next)}`}
      className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      Continuer avec Google
    </a>
  );
}

export function LoginForm() {
  const params = useSearchParams();
  const [config, setConfig] = useState<Config | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [error, setError] = useState<string | null>(params.get("error"));
  const [busy, setBusy] = useState(false);
  const next = (() => {
    const n = params.get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
  })();

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch("/api/auth/config", { cache: "no-store" }).catch(() => null);
      if (r?.ok) setConfig(await r.json());
    }, 0);
    return () => clearTimeout(t);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const setup = config?.needsSetup;
    const res = await fetch(setup ? "/api/auth/setup" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(setup ? { email, name, password, setupCode } : { email, password }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Connexion impossible.");
    window.location.assign(next);
  }

  const setup = config?.needsSetup;
  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <Image src="/brand/logo.png" alt="Stark Marketing" width={96} height={44} priority className="h-11 w-auto" />
      <h1 className="mt-5 text-xl font-semibold">{setup ? "Créer ton compte administrateur" : "Connexion"}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {setup ? "Premier compte de l'espace : tu pourras ensuite inviter ton équipe." : "Connecte-toi pour accéder à tes discussions."}
      </p>

      {config?.google && !setup && (
        <div className="mt-6">
          <GoogleButton next={next} />
          <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200" />
            ou avec ton e-mail
            <span className="h-px flex-1 bg-zinc-200" />
          </div>
        </div>
      )}

      <div className={config?.google && !setup ? "" : "mt-6"}>
        {setup && (
          <label className="block text-sm font-medium text-zinc-700">
            Ton nom
            <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </label>
        )}
        <label className={`block text-sm font-medium text-zinc-700 ${setup ? "mt-4" : ""}`}>
          E-mail
          <input type="email" autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </label>
        <label className="mt-4 block text-sm font-medium text-zinc-700">
          Mot de passe
          <input
            type="password"
            autoComplete={setup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
          {setup && <span className="mt-1 block text-xs font-normal text-zinc-500">8 caractères minimum, avec au moins une lettre et un chiffre.</span>}
        </label>
        {setup && config?.setupCodeRequired && (
          <label className="mt-4 block text-sm font-medium text-zinc-700">
            Code d&apos;installation
            <input type="password" autoComplete="off" value={setupCode} onChange={(e) => setSetupCode(e.target.value)} className={input} />
            <span className="mt-1 block text-xs font-normal text-zinc-500">L&apos;ancien mot de passe d&apos;accès à l&apos;appli : il protège la création du premier compte.</span>
          </label>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy || !email || !password || !config}
        className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
      >
        {busy ? "Un instant…" : setup ? "Créer mon compte" : "Se connecter"}
      </button>
      {!setup && <p className="mt-4 text-center text-xs text-zinc-500">Pas encore de compte ? Demande une invitation à l&apos;administrateur de l&apos;espace.</p>}
    </form>
  );
}
