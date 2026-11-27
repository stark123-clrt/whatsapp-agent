"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Config = { needsSetup: boolean; setupCodeRequired: boolean; google: boolean };

const input = "mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);
const googleClass = "flex w-full items-center justify-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50";

/** Bouton « Continuer avec Google » (connexion d'un compte existant ou invité). */
export function GoogleButton({ next }: { next: string }) {
  return (
    <a href={`/api/auth/google?next=${encodeURIComponent(next)}`} className={googleClass}>
      <GoogleLogo />
      Continuer avec Google
    </a>
  );
}

function Divider({ text }: { text: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
      <span className="h-px flex-1 bg-zinc-200" />
      {text}
      <span className="h-px flex-1 bg-zinc-200" />
    </div>
  );
}

/** Mot de passe avec « Afficher » et, à la création, une jauge de solidité. */
export function PasswordField({ value, onChange, label = "Mot de passe", create = false }: { value: string; onChange: (v: string) => void; label?: string; create?: boolean }) {
  const [show, setShow] = useState(false);
  const score = [value.length >= 8, /[A-Za-z]/.test(value) && /\d/.test(value), value.length >= 12, /[^A-Za-z0-9]/.test(value) || /[A-Z]/.test(value)].filter(Boolean).length;
  const words = ["Trop court", "Faible", "Correct", "Bon mot de passe", "Excellent mot de passe"];
  return (
    <label className="mt-4 block text-sm font-medium text-zinc-700">
      {label}
      <span className="relative block">
        <input type={show ? "text" : "password"} autoComplete={create ? "new-password" : "current-password"} value={value} onChange={(e) => onChange(e.target.value)} className={`${input} pr-20`} />
        <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-3 mt-0.5 -translate-y-1/2 text-xs font-medium text-zinc-500 hover:text-zinc-800">
          {show ? "Masquer" : "Afficher"}
        </button>
      </span>
      {create && value && (
        <span className="mt-2 block">
          <span className="flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-1 flex-1 rounded-full ${i < score ? (score >= 3 ? "bg-blue-600" : "bg-amber-400") : "bg-zinc-200"}`} />
            ))}
          </span>
          <span className="mt-1 block text-xs font-normal text-zinc-500">{words[score]} · 8 caractères minimum, avec une lettre et un chiffre</span>
        </span>
      )}
    </label>
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

  const setup = Boolean(config?.needsSetup);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
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

  // Premier compte avec Google : le code d'installation est vérifié avant d'aller chez Google.
  async function setupWithGoogle() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setupCode }) });
    const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
    if (d.url) return window.location.assign(d.url);
    setBusy(false);
    setError(d.error ?? "Impossible de démarrer la connexion Google.");
  }

  const codeNeeded = setup && config?.setupCodeRequired;
  return (
    <form onSubmit={submit} className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl shadow-blue-900/5 sm:p-10">
      <p className="text-sm font-semibold text-blue-700">{setup ? "Installation — premier compte" : "Espace sécurisé"}</p>
      <h2 className="mt-1.5 text-3xl font-bold tracking-tight text-zinc-900">{setup ? "Créer votre compte" : "Connexion"}</h2>
      <p className="mt-2 text-sm text-zinc-500">
        {setup ? "Vous serez l'administrateur de l'espace et pourrez ensuite inviter votre équipe." : "Accédez à vos conversations, campagnes et clients."}
      </p>

      {codeNeeded && (
        <label className="mt-6 block text-sm font-medium text-zinc-700">
          Code d&apos;installation
          <input type="password" autoComplete="off" value={setupCode} onChange={(e) => setSetupCode(e.target.value)} className={input} />
          <span className="mt-1 block text-xs font-normal text-zinc-500">L&apos;ancien mot de passe d&apos;accès à l&apos;appli : il protège la création du premier compte.</span>
        </label>
      )}

      {config?.google && (
        <div className={codeNeeded ? "mt-5" : "mt-7"}>
          {setup ? (
            <button type="button" onClick={setupWithGoogle} disabled={busy || (codeNeeded && !setupCode)} className={googleClass}>
              <GoogleLogo />
              Créer mon compte avec Google
            </button>
          ) : (
            <GoogleButton next={next} />
          )}
          <Divider text={setup ? "ou avec votre e-mail" : "ou avec votre e-mail"} />
        </div>
      )}

      <div className={config?.google ? "" : "mt-6"}>
        {setup && (
          <label className="block text-sm font-medium text-zinc-700">
            Votre nom complet
            <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </label>
        )}
        <label className={`block text-sm font-medium text-zinc-700 ${setup ? "mt-4" : ""}`}>
          E-mail
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </label>
        <PasswordField value={password} onChange={setPassword} create={setup} />
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy || !email || !password || !config || (codeNeeded && !setupCode)}
        className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:bg-blue-300 disabled:shadow-none"
      >
        {busy ? "Un instant…" : setup ? "Créer mon compte" : "Se connecter"}
      </button>
      <p className="mt-5 text-center text-xs leading-relaxed text-zinc-500">
        {setup
          ? "Ensuite : connectez WhatsApp et Instagram dans Canaux, puis créez votre agent IA."
          : "Pas encore de compte ? Demandez une invitation à l'administrateur de votre espace."}
      </p>
    </form>
  );
}
