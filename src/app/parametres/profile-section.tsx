"use client";

import { useEffect, useState } from "react";

type Me = { id: number; email: string; name: string; role: "admin" | "member"; hasPassword: boolean; google: boolean; alertEmail: boolean; alertPhone: string | null };

const input = "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function Box({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-6 py-4">
        <h3 className="font-semibold">{title}</h3>
        {hint && <p className="mt-0.5 text-sm text-zinc-500">{hint}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

/** Mon compte : nom, alertes « parler à un humain », mot de passe. */
export function ProfileSection() {
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailOn, setEmailOn] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch("/api/auth/me", { cache: "no-store" }).catch(() => null);
      if (r?.ok) {
        const u = ((await r.json()) as { user: Me }).user;
        setMe(u);
        setName(u.name);
        setPhone(u.alertPhone ? `+${u.alertPhone}` : "");
      }
      const t2 = await fetch("/api/team", { cache: "no-store" }).catch(() => null);
      if (t2?.ok) setEmailOn(((await t2.json()) as { emailEnabled: boolean }).emailEnabled);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  async function save(patch: Record<string, unknown>, ok: string) {
    setMsg(null);
    const r = await fetch("/api/auth/me", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const d = (await r.json().catch(() => ({}))) as { user?: Me; error?: string };
    if (d.user) {
      setMe(d.user);
      setMsg({ ok: true, text: ok });
    } else setMsg({ ok: false, text: d.error ?? "Enregistrement impossible." });
  }

  if (!me) return <p className="text-sm text-zinc-500">{msg?.text ?? "Chargement…"}</p>;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Profil</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {me.email} · {me.role === "admin" ? "Administrateur" : "Membre"}
          {me.google ? " · connecté avec Google" : ""}
        </p>
      </div>
      {msg && <p className={`rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-blue-50 text-blue-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

      <Box title="Ton nom" hint="Affiché à ton équipe.">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
          <button onClick={() => save({ name }, "Nom enregistré.")} disabled={!name.trim() || name === me.name} className="shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-40">
            Enregistrer
          </button>
        </div>
      </Box>

      <Box title="Alertes « parler à un humain »" hint="Quand un client demande un humain (ou que l'agent passe la main), tu es prévenu avec le lien direct vers la discussion.">
        <label className="block text-sm font-medium text-zinc-700">
          Par WhatsApp, sur ce numéro
          <div className="mt-1.5 flex gap-2">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+33 6 12 34 56 78" className={input} />
            <button onClick={() => save({ alertPhone: phone }, phone.trim() ? "Alertes WhatsApp activées." : "Alertes WhatsApp désactivées.")} className="shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">
              Enregistrer
            </button>
          </div>
          <span className="mt-1 block text-xs font-normal text-zinc-500">Envoyé depuis le WhatsApp connecté à l&apos;appli. Laisse vide pour ne pas recevoir d&apos;alerte WhatsApp. Utilise un autre numéro que celui de l&apos;appli.</span>
        </label>
        <label className="mt-4 flex items-start justify-between gap-4 text-sm">
          <span>
            <span className="font-medium text-zinc-700">Par e-mail ({me.email})</span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              {emailOn ? "Un e-mail avec le dernier message du client et un bouton « Ouvrir la discussion »." : "L'envoi d'e-mails n'est pas encore configuré sur le serveur : seules les alertes WhatsApp partent pour l'instant."}
            </span>
          </span>
          <input type="checkbox" checked={me.alertEmail} onChange={(e) => save({ alertEmail: e.target.checked }, e.target.checked ? "Alertes e-mail activées." : "Alertes e-mail désactivées.")} className="mt-1 h-4 w-4 accent-blue-600" />
        </label>
        {emailOn && (
          <button
            onClick={async () => {
              setMsg(null);
              const r = await fetch("/api/auth/test-email", { method: "POST" });
              const d = (await r.json().catch(() => ({}))) as { to?: string; error?: string };
              setMsg(r.ok ? { ok: true, text: `E-mail de test envoyé à ${d.to}. Regarde ta boîte (et les spams).` } : { ok: false, text: d.error ?? "Envoi impossible." });
            }}
            className="mt-4 rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            M&apos;envoyer un e-mail de test
          </button>
        )}
      </Box>

      <Box title={me.hasPassword ? "Changer de mot de passe" : "Créer un mot de passe"} hint={me.hasPassword ? "Tes autres sessions ouvertes seront déconnectées." : "Pour pouvoir aussi te connecter sans Google."}>
        <div className="grid gap-3 sm:grid-cols-2">
          {me.hasPassword && <input type="password" autoComplete="current-password" placeholder="Mot de passe actuel" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />}
          <input type="password" autoComplete="new-password" placeholder="Nouveau mot de passe" value={next} onChange={(e) => setNext(e.target.value)} className={input} />
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">8 caractères minimum, avec au moins une lettre et un chiffre.</p>
        <button
          onClick={async () => {
            await save({ password: { current, next } }, "Mot de passe modifié.");
            setCurrent("");
            setNext("");
          }}
          disabled={!next || (me.hasPassword && !current)}
          className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Enregistrer le mot de passe
        </button>
      </Box>
    </div>
  );
}
