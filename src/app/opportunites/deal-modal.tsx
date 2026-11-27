"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { Deal, DealPriority, Stage } from "@/lib/deals-types";
import { Avatar } from "../avatar";
import { ICONS, Icon, Modal, PRIORITY, StageIcon, contactName, field, label, type ContactLite } from "./shared";

type Form = {
  title: string;
  company: string;
  value: string;
  stageId: number;
  priority: DealPriority;
  jid: string | null;
  owner: string | null;
  probability: number;
  closeDate: string;
  source: string;
  tags: string[];
  description: string;
  notes: string;
};

/** Fenêtre « Nouvelle opportunité » / modification d'une opportunité. */
export function DealModal({
  deal,
  stages,
  contacts,
  defaultStageId,
  onClose,
  onSaved,
  onCreateStage,
}: {
  deal: Deal | null;
  stages: Stage[]; // étapes du pipeline affiché
  contacts: ContactLite[];
  defaultStageId: number;
  onClose: () => void;
  onSaved: () => void;
  onCreateStage: (name: string) => Promise<number | null>;
}) {
  const [f, setF] = useState<Form>(() => ({
    title: deal?.title ?? "",
    company: deal?.company ?? "",
    value: deal ? String(deal.value) : "",
    stageId: deal?.stageId ?? defaultStageId,
    priority: deal?.priority ?? "none",
    jid: deal?.jid ?? null,
    owner: deal?.owner ?? null,
    probability: deal?.probability ?? 50,
    closeDate: deal?.closeDate ?? "",
    source: deal?.source ?? "",
    tags: deal?.tags ?? [],
    description: deal?.description ?? "",
    notes: deal?.notes ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newStage, setNewStage] = useState<string | null>(null);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const stage = stages.find((s) => s.id === f.stageId);

  async function save() {
    if (!f.title.trim()) return setError("Le titre est obligatoire.");
    setBusy(true);
    setError(null);
    const body = { ...f, value: Number(f.value) || 0, closeDate: f.closeDate || null };
    const r = await fetch(deal ? `/api/deals/${deal.id}` : "/api/deals", {
      method: deal ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r.ok) return setError(d.error ?? "Enregistrement impossible.");
    onSaved();
  }

  async function remove() {
    if (!deal) return;
    setBusy(true);
    await fetch(`/api/deals/${deal.id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <Modal
      title={deal ? "Modifier l'opportunité" : "Nouvelle opportunité"}
      subtitle={deal ? `Créée le ${new Date(deal.createdAt).toLocaleDateString("fr-FR")}` : "Ajoutez une opportunité à votre pipeline"}
      onClose={onClose}
      footer={
        <>
          {deal &&
            (confirmDelete ? (
              <span className="mr-auto flex items-center gap-2 text-sm">
                Supprimer définitivement ?
                <button onClick={remove} disabled={busy} className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700">
                  Oui, supprimer
                </button>
                <button onClick={() => setConfirmDelete(false)} className="rounded-lg px-2 py-1.5 text-zinc-500 hover:bg-zinc-100">
                  Non
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="mr-auto flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:bg-red-50 hover:text-red-600">
                <Icon d={ICONS.trash} size={15} /> Supprimer
              </button>
            ))}
          {error && <span className="mr-2 text-sm text-red-600">{error}</span>}
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button onClick={save} disabled={busy} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-300">
            {busy ? "Enregistrement…" : deal ? "Enregistrer" : "Créer une opportunité"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <span className={label}>
            Titre <span className="text-red-500">*</span>
          </span>
          <input autoFocus className={field} value={f.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} placeholder="Acme — contrat annuel" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className={label}>Entreprise</span>
            <input className={field} value={f.company} onChange={(e) => set({ company: e.target.value })} placeholder="Acme SAS" />
          </div>
          <div>
            <span className={label}>Valeur (€)</span>
            <input className={field} inputMode="numeric" value={f.value} onChange={(e) => set({ value: e.target.value.replace(/[^\d]/g, "") })} placeholder="0" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className={label}>Étape</span>
            {newStage === null ? (
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">{stage && <StageIcon kind={stage.kind} color={stage.color} />}</span>
                <select
                  className={`${field} pl-9`}
                  value={f.stageId}
                  onChange={(e) => {
                    if (e.target.value === "new") setNewStage("");
                    else set({ stageId: Number(e.target.value) });
                  }}
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="new">+ Créer une nouvelle étape…</option>
                </select>
              </div>
            ) : (
              <div className="flex gap-2">
                <input autoFocus className={field} value={newStage} placeholder="Nom de l'étape" onChange={(e) => setNewStage(e.target.value)} />
                <button
                  type="button"
                  disabled={!newStage.trim()}
                  onClick={async () => {
                    const id = await onCreateStage(newStage.trim());
                    if (id) set({ stageId: id });
                    setNewStage(null);
                  }}
                  className="shrink-0 rounded-xl bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-40"
                >
                  Créer
                </button>
                <button type="button" onClick={() => setNewStage(null)} className="shrink-0 rounded-xl px-2 text-zinc-400 hover:text-zinc-700">
                  ✕
                </button>
              </div>
            )}
          </div>
          <div>
            <span className={label}>Priorité</span>
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-zinc-100 p-1">
              {(Object.keys(PRIORITY) as DealPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set({ priority: p })}
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs transition ${f.priority === p ? "bg-white font-semibold shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
                >
                  {p !== "none" && <span className="h-2 w-2 rounded-full" style={{ background: PRIORITY[p].color }} />}
                  {PRIORITY[p].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="pt-1 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">Enregistrements liés</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className={label}>Contact</span>
            <ContactPicker contacts={contacts} value={f.jid} onChange={(jid) => set({ jid })} />
          </div>
          <div>
            <span className={label}>Responsable</span>
            <select className={field} value={f.owner ?? ""} onChange={(e) => set({ owner: e.target.value || null })}>
              <option value="">Non assigné</option>
              <option value="moi">Moi</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className={label}>Probabilité ({f.probability} %)</span>
            <input type="range" min={0} max={100} step={5} value={f.probability} onChange={(e) => set({ probability: Number(e.target.value) })} className="mt-2 w-full accent-blue-600" />
            <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
              <span>Peu probable</span>
              <span>Quasi sûr</span>
            </div>
          </div>
          <div>
            <span className={label}>Date de clôture</span>
            <input type="date" className={field} value={f.closeDate} onChange={(e) => set({ closeDate: e.target.value })} />
          </div>
        </div>

        <div>
          <span className={label}>Source</span>
          <input className={field} value={f.source} onChange={(e) => set({ source: e.target.value })} placeholder="Entrant, recommandation, site web…" />
        </div>
        <div>
          <span className={label}>Étiquettes</span>
          <Tags values={f.tags} onChange={(tags) => set({ tags })} />
        </div>
        <div>
          <span className={label}>Description</span>
          <textarea className={`${field} resize-y`} rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Courte description affichée sur l'opportunité" />
        </div>
        <div>
          <span className={label}>Notes</span>
          <textarea className={`${field} resize-y`} rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Notes internes" />
        </div>
      </div>
    </Modal>
  );
}

function ContactPicker({ contacts, value, onChange }: { contacts: ContactLite[]; value: string | null; onChange: (jid: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const current = contacts.find((c) => c.jid === value);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return contacts.filter((c) => !s || (c.name ?? "").toLowerCase().includes(s) || (digits.length > 2 && (c.phone ?? "").includes(digits))).slice(0, 40);
  }, [contacts, q]);

  return (
    <div ref={box} className="relative" onBlur={(e) => !box.current?.contains(e.relatedTarget as Node | null) && setOpen(false)}>
      <button type="button" onClick={() => setOpen(!open)} className={`${field} flex items-center gap-2 text-left`}>
        {current ? (
          <>
            <span className="truncate font-medium">{contactName(current)}</span>
            <span
              role="button"
              tabIndex={0}
              aria-label="Retirer le contact"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="ml-auto text-zinc-400 hover:text-zinc-700"
            >
              ✕
            </span>
          </>
        ) : (
          <span className="text-zinc-400">Lier un contact</span>
        )}
      </button>
      {open && (
        <div className="absolute top-full right-0 left-0 z-10 mt-1.5 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
          <div className="border-b border-zinc-100 p-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un contact…" className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {shown.map((c) => (
              <button
                key={c.jid}
                type="button"
                onClick={() => {
                  onChange(c.jid);
                  setOpen(false);
                  setQ("");
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${c.jid === value ? "bg-blue-50" : ""}`}
              >
                <span className="scale-75">
                  <Avatar jid={c.jid} name={c.name} phone={c.phone} channel={c.channel} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{contactName(c)}</span>
                  {c.phone && c.name && <span className="block text-xs text-zinc-400">+{c.phone}</span>}
                </span>
              </button>
            ))}
            {!shown.length && <p className="px-3 py-3 text-sm text-zinc-400">Aucun contact trouvé</p>}
          </div>
        </div>
      )}
      {current && (
        <Link href={`/?c=${encodeURIComponent(current.jid)}`} className="mt-1 inline-block text-xs font-medium text-blue-700 hover:underline">
          Ouvrir la discussion →
        </Link>
      )}
    </div>
  );
}

export function Tags({ values, onChange, placeholder = "+ Ajouter des étiquettes" }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim().replace(/,$/, "");
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2 py-1.5 focus-within:border-blue-500">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 py-0.5 pr-1 pl-2 text-xs font-medium text-blue-700">
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Retirer ${v}`} className="px-1 text-blue-300 hover:text-red-600">
            ✕
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
          if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={add}
        placeholder={values.length ? "" : placeholder}
        className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
      />
    </div>
  );
}
