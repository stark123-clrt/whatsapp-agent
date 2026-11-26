"use client";

import { useCallback, useEffect, useState } from "react";
import type { InstagramState } from "@/lib/instagram";
import { InstagramGrowth } from "./instagram-growth";
import { InstagramRhythm } from "./instagram-rhythm";

type State = InstagramState & { disabled?: boolean };

/** Carte « Instagram (personnel) » : connexion du compte avec identifiant et mot de passe. */
export function InstagramCard() {
  const [s, setS] = useState<State | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/instagram/status", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setS(await r.json());
  }, []);

  const busy = s?.status === "starting" || s?.status === "logging_in" || s?.status === "two_factor" || s?.status === "challenge";
  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, busy || open ? 2500 : 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load, busy, open]);

  async function disconnect() {
    if (!window.confirm("Déconnecter ce compte Instagram ?\nL'IA ne répondra plus aux messages Instagram. Les discussions déjà reçues restent dans Discussions.")) return;
    await fetch("/api/instagram/logout", { method: "POST" });
    void load();
  }

  const connected = s?.status === "connected";

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-6 px-6 py-5">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            Instagram (personnel) <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">BÊTA</span>
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            Connecte ton compte Instagram avec son identifiant : l&apos;IA répond aux messages privés, y compris les demandes de message.
          </p>
        </div>
        {!connected && !s?.disabled && (
          <button onClick={() => setOpen(true)} className="shrink-0 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50">
            Connecter
          </button>
        )}
      </div>
      <div className="border-t border-zinc-100 px-6 py-5">
        {connected && s ? (
          <>
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-400 via-pink-500 to-violet-600 text-lg text-white">
              {s.picture ? (
                // eslint-disable-next-line @next/next/no-img-element -- photo de profil Instagram
                <img src={s.picture} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                (s.username ?? "?").charAt(0).toUpperCase()
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold">
                {s.fullName || `@${s.username}`}
                <span className="rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">● CONNECTÉ</span>
              </p>
              <p className="text-sm text-zinc-500">
                @{s.username}
                {s.followers !== null && ` · ${s.followers.toLocaleString("fr-FR")} abonnés`} · messages relevés toutes les 45 s environ
              </p>
            </div>
            <button onClick={disconnect} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
              Déconnecter
            </button>
          </div>
          <InstagramRhythm />
          <InstagramGrowth />
          </>
        ) : (
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-xl">📸</span>
            <div>
              <p className="flex items-center gap-2 font-semibold">
                Instagram
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-500">● {busy ? "CONNEXION…" : "NON CONNECTÉ"}</span>
              </p>
              <p className="text-sm text-zinc-500">
                {s?.disabled ? "Instagram est désactivé sur ce serveur." : s?.error ? <span className="text-amber-700">⚠️ {s.error}</span> : "Pas encore connecté."}
              </p>
            </div>
          </div>
        )}
      </div>
      {open && <ConnectInstagram state={s} onClose={() => setOpen(false)} onChanged={load} />}
    </section>
  );
}

function ConnectInstagram({ state, onClose, onChanged }: { state: State | null; onClose: () => void; onChanged: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [method, setMethod] = useState<"password" | "session">("password");
  const [sessionid, setSessionid] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = state?.status;

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const body = method === "session" ? { sessionid } : { username, password };
    const r = await fetch("/api/instagram/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setSending(false);
    setPassword(""); // on ne garde ni le mot de passe ni la session dans la page
    setSessionid("");
    if (!r.ok) return setError(d.error ?? "Connexion impossible.");
    onChanged();
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const r = await fetch("/api/instagram/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setSending(false);
    setCode("");
    if (!r.ok) return setError(d.error ?? "Code refusé.");
    onChanged();
  }

  const input = "mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-zinc-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-center text-lg font-semibold">Connecter Instagram (personnel)</h3>

        {status === "connected" ? (
          <div className="mt-6 text-center">
            <p className="font-medium text-green-700">✅ Connecté : @{state?.username}</p>
            <p className="mt-2 text-sm text-zinc-500">Les messages privés arrivent dans Discussions. Choisis l&apos;agent d&apos;Instagram dans Agents IA → Qui répond.</p>
            <button onClick={onClose} className="mt-5 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white">
              Fermer
            </button>
          </div>
        ) : status === "two_factor" || status === "challenge" ? (
          <form onSubmit={sendCode} className="mt-5">
            <p className="text-sm text-zinc-600">
              {status === "two_factor"
                ? "Ton compte est protégé par la double authentification : saisis le code de ton application d'authentification ou reçu par SMS."
                : "Instagram veut vérifier que c'est bien toi : saisis le code qu'il vient d'envoyer par e-mail ou par SMS."}
            </p>
            <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456" className={`${input} text-center font-mono text-2xl tracking-[0.3em]`} />
            <button disabled={sending || code.replace(/\D/g, "").length < 4} className="mt-4 w-full rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white disabled:bg-zinc-300">
              {sending ? "Vérification…" : "Valider le code"}
            </button>
          </form>
        ) : status === "logging_in" || status === "starting" ? (
          <div className="mt-8 flex flex-col items-center gap-3 pb-2 text-sm text-zinc-500">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-pink-500" />
            Connexion à Instagram… (jusqu&apos;à une minute)
          </div>
        ) : (
          <form onSubmit={login} className="mt-5 space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
              ⚠️ Connexion <strong>non officielle</strong> : Instagram peut limiter un compte trop automatisé. Commence avec un <strong>compte de test</strong>, et laisse l&apos;IA répondre seulement aux personnes qui t&apos;écrivent.
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 text-sm">
              {(
                [
                  ["password", "Identifiant"],
                  ["session", "Session du navigateur"],
                ] as const
              ).map(([id, text]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMethod(id)}
                  className={`rounded-lg py-1.5 ${method === id ? "bg-white font-semibold shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
                >
                  {text}
                </button>
              ))}
            </div>
            {method === "password" ? (
              <>
            <label className="block text-sm font-medium text-zinc-700">
              Nom d&apos;utilisateur ou e-mail Instagram
              <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ton_compte ou ton@email.com" autoComplete="off" className={input} />
            </label>
            <label className="block text-sm font-medium text-zinc-700">
              Mot de passe
              <span className="relative block">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  className={`${input} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute top-1/2 right-2 mt-0.75 -translate-y-1/2 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {showPassword ? (
                      <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3.2 4.3M6.6 6.6C4.3 8 2.7 10.2 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 4.5-1.1" />
                    ) : (
                      <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                    )}
                  </svg>
                </button>
              </span>
            </label>
              </>
            ) : (
              <div className="space-y-3">
                <ol className="list-decimal space-y-1 rounded-xl bg-zinc-50 py-3 pr-3 pl-8 text-xs leading-relaxed text-zinc-600">
                  <li>
                    Sur un ordinateur, ouvre <strong>instagram.com</strong> dans Chrome et connecte-toi au compte.
                  </li>
                  <li>
                    Appuie sur <strong>F12</strong> → onglet <strong>Application</strong> → <strong>Cookies</strong> → <strong>https://www.instagram.com</strong>.
                  </li>
                  <li>
                    Clique sur la ligne <strong>sessionid</strong> et copie sa <strong>valeur</strong> (une longue suite de chiffres et de lettres).
                  </li>
                  <li>Colle-la ci-dessous. Ne te déconnecte pas d&apos;instagram.com ensuite : ça couperait aussi la session ici.</li>
                </ol>
                <label className="block text-sm font-medium text-zinc-700">
                  Valeur « sessionid »
                  <input value={sessionid} onChange={(e) => setSessionid(e.target.value)} autoComplete="off" spellCheck={false} placeholder="123456789%3AAbCdEf…" className={`${input} font-mono text-xs`} />
                </label>
              </div>
            )}
            <p className="text-xs text-zinc-500">
              🔒 {method === "password" ? "Le mot de passe sert uniquement à la connexion et n'est jamais enregistré" : "La session n'est jamais affichée ni partagée"} : seule la session Instagram est conservée, sur ton serveur.
            </p>
            {(error || state?.error) && <p className="text-sm text-red-600">{error ?? state?.error}</p>}
            <button disabled={sending || (method === "password" ? !username.trim() || !password : sessionid.trim().length < 20)} className="w-full rounded-xl bg-gradient-to-r from-amber-500 via-pink-500 to-violet-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {sending ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        )}

        {status !== "connected" && (
          <div className="mt-4 text-center">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
