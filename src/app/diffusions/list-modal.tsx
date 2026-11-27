"use client";

import { Icon as UiIcon } from "@/app/icons";

import { useEffect, useMemo, useState } from "react";
import { CHANNEL_LABELS, RULE_FIELDS, RULE_OPS, STATUS_LABELS, type ContactList, type ListRule, type RuleField } from "@/lib/broadcast-types";

export type LiteContact = { jid: string; name: string | null; phone: string | null; tags: string[] };

const NUMERIC: RuleField[] = ["lastActivity", "score", "received"];
const newRule = (field: RuleField = "tags"): ListRule => ({ field, op: RULE_FIELDS[field].ops[0], values: [], number: NUMERIC.includes(field) ? null : null });

/** Fenêtre « Nouvelle liste de contacts » : statique (choix un par un) ou intelligente (règles). */
export function ListModal({ contacts, tags, onClose, onCreated }: { contacts: LiteContact[]; tags: string[]; onClose: () => void; onCreated: (l: ContactList) => void }) {
  const [kind, setKind] = useState<"static" | "smart">("static");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [rules, setRules] = useState<ListRule[]>([newRule()]);
  const [match, setMatch] = useState<"all" | "any">("all");
  const [preview, setPreview] = useState<{ count: number; whatsapp: number; sample: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return contacts.filter((c) => !s || `${c.name ?? ""} ${c.phone ?? ""} ${c.tags.join(" ")}`.toLowerCase().includes(s));
  }, [contacts, q]);

  const ready = (r: ListRule) => (NUMERIC.includes(r.field) ? r.number !== null : r.values.length > 0);
  const rulesKey = JSON.stringify({ rules, match });
  useEffect(() => {
    if (kind !== "smart") return;
    const t = setTimeout(async () => {
      const parsed = JSON.parse(rulesKey) as { rules: ListRule[]; match: string };
      if (!parsed.rules.some(ready)) return setPreview(null);
      const r = await fetch("/api/contact-lists/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: rulesKey }).catch(() => null);
      if (r?.ok) setPreview(await r.json());
    }, 300);
    return () => clearTimeout(t);
  }, [rulesKey, kind]);

  async function create() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/contact-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, jids: [...picked], rules, match }),
    });
    const d = (await r.json().catch(() => ({}))) as { list?: ContactList; error?: string };
    setBusy(false);
    if (d.list) onCreated(d.list);
    else setError(d.error ?? "Création impossible.");
  }

  const setRule = (i: number, patch: Partial<ListRule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const canCreate = name.trim() && (kind === "static" ? picked.size > 0 : rules.some(ready));
  const input = "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const select = "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start gap-3 border-b border-zinc-100 p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><UiIcon name="users" size={20} className="" /></span>
          <div className="flex-1">
            <p className="font-semibold">{kind === "smart" ? "Nouvelle liste intelligente" : "Nouvelle liste de contacts"}</p>
            <p className="text-sm text-zinc-500">{kind === "smart" ? "Les contacts sont ajoutés et retirés automatiquement, selon des règles." : "Regroupe des contacts pour leur envoyer une diffusion."}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div>
            <p className="text-xs font-semibold text-zinc-500">TYPE DE LISTE</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(
                [
                  ["static", "Liste statique", "Tu choisis les contacts toi-même."],
                  ["smart", "Liste intelligente", "Les contacts sont ajoutés et retirés automatiquement, selon des règles."],
                ] as const
              ).map(([k, t, d]) => (
                <button key={k} onClick={() => setKind(k)} className={`rounded-xl border p-3 text-left ${kind === k ? "border-blue-400 bg-blue-50" : "border-zinc-200 hover:border-zinc-300"}`}>
                  <p className={`text-sm font-semibold ${kind === k ? "text-blue-700" : ""}`}>{t}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{d}</p>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-zinc-500">
              NOM <span className="text-red-500">*</span>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Intéressés colliers" className={`${input} mt-1.5`} />
          </label>

          {kind === "static" ? (
            <div>
              <p className="text-xs font-semibold text-zinc-500">CONTACTS ({picked.size} SÉLECTIONNÉ{picked.size > 1 ? "S" : ""})</p>
              <p className="mt-0.5 text-xs text-zinc-500">Contacts WhatsApp uniquement (les diffusions partent de ton numéro).</p>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher des contacts…" className={`${input} mt-2`} />
              <div className="mt-2 max-h-64 divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-200">
                {shown.length > 1 && (
                  <button
                    onClick={() => setPicked(shown.every((c) => picked.has(c.jid)) ? new Set([...picked].filter((j) => !shown.some((c) => c.jid === j))) : new Set([...picked, ...shown.map((c) => c.jid)]))}
                    className="w-full px-4 py-2 text-left text-xs font-medium text-blue-700 hover:bg-zinc-50"
                  >
                    {shown.every((c) => picked.has(c.jid)) ? "Tout désélectionner" : `Tout sélectionner (${shown.length})`}
                  </button>
                )}
                {shown.map((c) => (
                  <label key={c.jid} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-zinc-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.name ?? `+${c.phone}`}</span>
                      <span className="block truncate text-xs text-zinc-500">
                        +{c.phone}
                        {c.tags.length ? ` · ${c.tags.join(", ")}` : ""}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={picked.has(c.jid)}
                      onChange={() => {
                        const n = new Set(picked);
                        if (n.has(c.jid)) n.delete(c.jid);
                        else n.add(c.jid);
                        setPicked(n);
                      }}
                      className="h-4 w-4 accent-blue-600"
                    />
                  </label>
                ))}
                {!shown.length && <p className="px-4 py-3 text-sm text-zinc-400">Aucun contact WhatsApp.</p>}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-zinc-500">RÈGLES</p>
              <p className="mt-0.5 text-xs text-zinc-500">Les contacts qui correspondent sont dans la liste, recalculée à chaque diffusion.</p>
              <div className="mt-3 flex items-center gap-3 text-sm">
                <span className="font-medium">Correspondance</span>
                <div className="flex rounded-xl bg-zinc-100 p-1">
                  {(
                    [
                      ["all", "Toutes les règles"],
                      ["any", "N'importe quelle règle"],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} onClick={() => setMatch(k)} className={`rounded-lg px-3 py-1 ${match === k ? "bg-white font-medium shadow-sm" : "text-zinc-500"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 space-y-3">
                {rules.map((r, i) => (
                  <div key={i} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
                    <div className="flex gap-2">
                      <select className={`${select} flex-1`} value={r.field} onChange={(e) => setRule(i, newRule(e.target.value as RuleField))}>
                        {Object.entries(RULE_FIELDS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                      <select className={`${select} flex-1`} value={r.op} onChange={(e) => setRule(i, { op: e.target.value as ListRule["op"] })}>
                        {RULE_FIELDS[r.field].ops.map((op) => (
                          <option key={op} value={op}>
                            {RULE_OPS[op]}
                          </option>
                        ))}
                      </select>
                      {rules.length > 1 && (
                        <button onClick={() => setRules(rules.filter((_, j) => j !== i))} aria-label="Supprimer la règle" className="px-1 text-zinc-400 hover:text-red-500">
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="mt-2">
                      {NUMERIC.includes(r.field) ? (
                        <input
                          type="number"
                          min={0}
                          value={r.number ?? ""}
                          onChange={(e) => setRule(i, { number: e.target.value === "" ? null : Number(e.target.value) })}
                          placeholder={r.field === "lastActivity" ? "Nombre de jours" : "Valeur"}
                          className={`${select} w-40`}
                        />
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {(r.field === "tags" ? tags : Object.keys(r.field === "status" ? STATUS_LABELS : CHANNEL_LABELS)).map((v) => {
                            const on = r.values.includes(v);
                            const label = r.field === "status" ? STATUS_LABELS[v] : r.field === "channel" ? CHANNEL_LABELS[v] : v;
                            return (
                              <button
                                key={v}
                                onClick={() => setRule(i, { values: on ? r.values.filter((x) => x !== v) : [...r.values, v] })}
                                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${on ? "border-blue-500 bg-blue-50 text-blue-800" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"}`}
                              >
                                {label}
                              </button>
                            );
                          })}
                          {r.field === "tags" && !tags.length && <p className="text-xs text-zinc-400">Aucun tag pour l&apos;instant.</p>}
                        </div>
                      )}
                      {!ready(r) && <p className="mt-1.5 text-xs text-red-600">Choisis une valeur pour cette règle.</p>}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setRules([...rules, newRule()])} className="mt-3 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50">
                ＋ Ajouter une règle
              </button>
              <div className="mt-3 rounded-xl border border-zinc-200 p-3 text-sm">
                {preview ? (
                  <>
                    <p>
                      <UiIcon name="sparkles" size={15} className="mr-1 inline-block align-[-3px] text-blue-600" /><strong>{preview.count}</strong> contact{preview.count > 1 ? "s" : ""} correspond{preview.count > 1 ? "ent" : ""}
                      {preview.whatsapp !== preview.count && <span className="text-zinc-500"> · {preview.whatsapp} joignable{preview.whatsapp > 1 ? "s" : ""} sur WhatsApp</span>}
                    </p>
                    {preview.sample.length > 0 && <p className="mt-0.5 truncate text-xs text-zinc-500">{preview.sample.join(", ")}…</p>}
                  </>
                ) : (
                  <p className="font-medium"><UiIcon name="sparkles" size={15} className="mr-1 inline-block align-[-3px] text-blue-600" />Termine les règles ci-dessus pour voir combien de contacts correspondent.</p>
                )}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 p-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button onClick={create} disabled={!canCreate || busy} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? "Création…" : "Créer la liste"}
          </button>
        </div>
      </div>
    </div>
  );
}
