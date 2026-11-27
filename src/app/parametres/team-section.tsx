"use client";

import { useCallback, useEffect, useState } from "react";

type Role = "admin" | "member";
type U = { id: number; email: string; name: string; avatar: string | null; role: Role; google: boolean; lastLoginAt: number | null };
type Invite = { token: string; email: string; role: Role; expiresAt: number };
type Data = { me: U; users: U[]; invites: Invite[]; emailEnabled: boolean; appUrl: string };

const ROLE: Record<Role, string> = { admin: "Administrateur", member: "Membre" };
const fmt = (ts: number | null) => (ts ? new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "jamais");

/** Équipe : membres de l'espace, rôles et invitations (gestion réservée aux administrateurs). */
export function TeamSection() {
  const [d, setD] = useState<Data | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [link, setLink] = useState<{ url: string; emailed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/team", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setD(await r.json());
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function call(method: string, url: string, body?: unknown) {
    setError(null);
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const res = (await r.json().catch(() => ({}))) as { error?: string; link?: string; emailed?: boolean };
    if (!r.ok) setError(res.error ?? "Action impossible.");
    await load();
    return r.ok ? res : null;
  }

  async function invite() {
    const res = await call("POST", "/api/team", { email, role });
    if (res?.link) {
      setLink({ url: res.link, emailed: Boolean(res.emailed) });
      setEmail("");
    }
  }

  if (!d) return <p className="text-sm text-zinc-500">Chargement…</p>;
  const admin = d.me.role === "admin";
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Équipe</h2>
        <p className="mt-1 text-sm text-zinc-500">Les personnes qui ont accès à l&apos;espace. Tout le monde voit les mêmes discussions, contacts et agents.</p>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      {admin && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Inviter quelqu&apos;un</h3>
          <p className="mt-0.5 text-sm text-zinc-500">
            {d.emailEnabled ? "La personne reçoit un e-mail avec un lien pour créer son compte." : "Tu obtiens un lien à envoyer à la personne (WhatsApp, e-mail…). Il est valable 7 jours."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="adresse@exemple.com"
              className="min-w-64 flex-1 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500"
            />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm">
              <option value="member">Membre</option>
              <option value="admin">Administrateur</option>
            </select>
            <button onClick={invite} disabled={!email.includes("@")} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              Inviter
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">Membre : utilise l&apos;appli. Administrateur : peut en plus inviter, changer les rôles et retirer des personnes.</p>
          {link && (
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
              <p className="font-medium text-blue-900">{link.emailed ? "Invitation envoyée par e-mail. Le lien, au cas où :" : "Invitation créée : envoie ce lien à la personne."}</p>
              <div className="mt-2 flex gap-2">
                <input readOnly value={link.url} className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-1.5 font-mono text-xs" onFocus={(e) => e.target.select()} />
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(link.url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white"
                >
                  {copied ? "Copié" : "Copier"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-100 text-xs font-semibold tracking-wide text-zinc-500">
            <tr>
              <th className="px-5 py-3">MEMBRE</th>
              <th className="px-3 py-3">RÔLE</th>
              <th className="px-3 py-3">DERNIÈRE CONNEXION</th>
              {admin && <th className="px-5 py-3 text-right">ACTIONS</th>}
            </tr>
          </thead>
          <tbody>
            {d.users.map((u) => (
              <tr key={u.id} className="border-t border-zinc-100">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    {u.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatar} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">{u.name.charAt(0).toUpperCase()}</span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {u.name} {u.id === d.me.id && <span className="text-xs font-normal text-zinc-400">(toi)</span>}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {u.email}
                        {u.google ? " · Google" : ""}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  {admin && u.id !== d.me.id ? (
                    <select value={u.role} onChange={(e) => call("PUT", "/api/team", { userId: u.id, role: e.target.value })} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm">
                      <option value="member">Membre</option>
                      <option value="admin">Administrateur</option>
                    </select>
                  ) : (
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${u.role === "admin" ? "bg-blue-50 text-blue-700" : "bg-zinc-100 text-zinc-600"}`}>{ROLE[u.role]}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-zinc-500">{fmt(u.lastLoginAt)}</td>
                {admin && (
                  <td className="px-5 py-3 text-right">
                    {u.id !== d.me.id && (
                      <button
                        onClick={() => confirm(`Retirer ${u.name} de l'équipe ? Son accès sera coupé immédiatement (ses messages restent dans les discussions).`) && call("DELETE", `/api/team?user=${u.id}`)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Retirer
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {admin &&
              d.invites.map((i) => (
                <tr key={i.token} className="border-t border-zinc-100 bg-zinc-50/50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-zinc-600">{i.email}</p>
                    <p className="text-xs text-zinc-400">Invitation en attente · expire le {fmt(i.expiresAt)}</p>
                  </td>
                  <td className="px-3 py-3 text-zinc-500">{ROLE[i.role]}</td>
                  <td className="px-3 py-3 text-zinc-400">—</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(`${d.appUrl}/invitation/${i.token}`);
                        setLink({ url: `${d.appUrl}/invitation/${i.token}`, emailed: false });
                      }}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                    >
                      Copier le lien
                    </button>
                    <button onClick={() => call("DELETE", `/api/team?invite=${encodeURIComponent(i.token)}`)} className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                      Annuler
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
