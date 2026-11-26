"use client";

import { useState } from "react";
import type { Pipeline, Stage, StageKind } from "@/lib/deals-types";
import { Toggle } from "../agents/[id]/ui";
import { Tags } from "./deal-modal";
import { ICONS, Icon, Modal, StageIcon, field, label } from "./shared";

type Row = { key: string; id?: number; name: string; color: string; kind: StageKind; triggerTags: string[]; defaultValue: number; idleDays: number; idleTarget: string | null; open?: boolean };

const COLORS = ["#8b5cf6", "#3b82f6", "#06b6d4", "#f59e0b", "#ec4899", "#64748b", "#10b981", "#ef4444"];

let counter = 0;
const fresh = (name: string, kind: StageKind, color: string): Row => ({ key: `n${++counter}`, name, color, kind, triggerTags: [], defaultValue: 0, idleDays: 0, idleTarget: null });

/** « Étapes » (modifier le pipeline affiché) et « Nouveau pipeline ». */
export function StagesModal({
  pipeline,
  stages,
  onClose,
  onSaved,
}: {
  pipeline: Pipeline | null; // null = nouveau pipeline
  stages: Stage[];
  onClose: () => void;
  onSaved: (pipelineId?: number) => void;
}) {
  const [name, setName] = useState(pipeline?.name ?? "");
  const [sync, setSync] = useState(pipeline?.syncTags ?? false);
  const [rows, setRows] = useState<Row[]>(() =>
    pipeline
      ? stages.map((s) => ({ key: `s${s.id}`, id: s.id, name: s.name, color: s.color, kind: s.kind, triggerTags: s.triggerTags, defaultValue: s.defaultValue, idleDays: s.idleDays, idleTarget: s.idleTarget ? `s${s.idleTarget}` : null }))
      : [fresh("Lead", "open", "#8b5cf6"), fresh("Qualifié", "open", "#3b82f6"), fresh("Gagné", "won", "#10b981"), fresh("Perdu", "lost", "#ef4444")],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = (key: string, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const group = (kind: StageKind) => rows.filter((r) => r.kind === kind);

  function move(key: string, dir: -1 | 1) {
    setRows((r) => {
      const open = r.filter((x) => x.kind === "open");
      const i = open.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= open.length) return r;
      [open[i], open[j]] = [open[j], open[i]];
      return [...open, ...r.filter((x) => x.kind !== "open")];
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const ordered = [...group("open"), ...group("won"), ...group("lost")];
    const index = new Map(ordered.map((r, i) => [r.key, i]));
    const payload = ordered.map((r) => {
      const target = r.idleTarget ? ordered.find((x) => x.key === r.idleTarget) : null;
      return {
        id: r.id,
        name: r.name,
        color: r.color,
        kind: r.kind,
        triggerTags: r.triggerTags,
        defaultValue: r.defaultValue,
        idleDays: r.idleDays,
        // Étape existante : son id. Étape nouvelle : sa place dans la liste, en négatif.
        idleTarget: target ? (target.id ?? -(index.get(target.key)! + 1)) : null,
      };
    });
    const r = await fetch(pipeline ? `/api/pipelines/${pipeline.id}` : "/api/pipelines", {
      method: pipeline ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "Nouveau pipeline", syncTags: sync, stages: payload }),
    });
    const d = (await r.json().catch(() => ({}))) as { error?: string; pipeline?: Pipeline };
    setBusy(false);
    if (!r.ok) return setError(d.error ?? "Enregistrement impossible.");
    onSaved(d.pipeline?.id ?? pipeline?.id);
  }

  async function removePipeline() {
    if (!pipeline) return;
    setBusy(true);
    const r = await fetch(`/api/pipelines/${pipeline.id}`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) onSaved();
  }

  const section = (kind: StageKind, title: string, color: string, hint: string) => (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color }} title={hint}>
          {title} <span className="ml-1 text-xs font-normal text-zinc-400">{hint}</span>
        </p>
        {kind === "open" && group("open").length + 2 < 20 && (
          <button
            onClick={() => setRows((r) => [...r.filter((x) => x.kind === "open"), fresh("Nouvelle étape", "open", COLORS[group("open").length % 6]), ...r.filter((x) => x.kind !== "open")])}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Icon d={ICONS.plus} size={15} /> Ajouter
          </button>
        )}
      </div>
      <div className="space-y-2">
        {group(kind).map((r, i, arr) => (
          <div key={r.key} className="rounded-xl border border-zinc-200 bg-white">
            <div className="flex items-center gap-2 px-3 py-2">
              <label className="relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-zinc-100" title="Couleur">
                <StageIcon kind={r.kind} color={r.color} size={17} />
                <input type="color" value={r.color} onChange={(e) => update(r.key, { color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
              <input
                value={r.name}
                maxLength={80}
                onChange={(e) => update(r.key, { name: e.target.value })}
                className="min-w-0 flex-1 rounded-lg px-2 py-1 text-sm font-semibold tracking-wide uppercase outline-none focus:bg-zinc-50"
              />
              {kind === "open" && (
                <>
                  <button disabled={i === 0} onClick={() => move(r.key, -1)} aria-label="Monter" className="rounded p-1 text-zinc-400 hover:text-zinc-800 disabled:opacity-25">
                    <Icon d={ICONS.up} size={15} />
                  </button>
                  <button disabled={i === arr.length - 1} onClick={() => move(r.key, 1)} aria-label="Descendre" className="rounded p-1 text-zinc-400 hover:text-zinc-800 disabled:opacity-25">
                    <Icon d={ICONS.down} size={15} />
                  </button>
                </>
              )}
              <button onClick={() => update(r.key, { open: !r.open })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase hover:bg-zinc-50 hover:text-zinc-700">
                Avancé <Icon d={r.open ? ICONS.up : ICONS.down} size={13} />
              </button>
              {kind === "open" && arr.length > 1 && (
                <button onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} aria-label="Supprimer l'étape" className="rounded p-1 text-zinc-300 hover:text-red-600">
                  <Icon d={ICONS.trash} size={15} />
                </button>
              )}
            </div>
            {r.open && (
              <div className="space-y-3 border-t border-zinc-100 bg-zinc-50/60 px-4 py-3">
                <div>
                  <span className={label}>Étiquettes déclencheuses</span>
                  <Tags values={r.triggerTags} onChange={(v) => update(r.key, { triggerTags: v.slice(0, 10) })} placeholder="Ex. : devis-demandé" />
                  <p className="mt-1 text-xs text-zinc-500">Quand un contact reçoit l&apos;une de ces étiquettes (par l&apos;IA ou à la main), son opportunité est créée dans cette étape.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className={label}>Valeur par défaut (€)</span>
                    <input className={field} inputMode="numeric" value={r.defaultValue || ""} placeholder="0" onChange={(e) => update(r.key, { defaultValue: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
                  </div>
                  <div>
                    <span className={label}>Sans activité depuis</span>
                    <div className="flex items-center gap-2">
                      <input className={`${field} w-20`} inputMode="numeric" value={r.idleDays || ""} placeholder="—" onChange={(e) => update(r.key, { idleDays: Math.min(365, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
                      <span className="text-sm text-zinc-500">jours</span>
                    </div>
                  </div>
                </div>
                <div>
                  <span className={label}>… alors déplacer vers</span>
                  <select className={field} value={r.idleTarget ?? ""} onChange={(e) => update(r.key, { idleTarget: e.target.value || null })}>
                    <option value="">Ne rien faire</option>
                    {rows
                      .filter((x) => x.key !== r.key)
                      .map((x) => (
                        <option key={x.key} value={x.key}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Modal
      wide
      title={pipeline ? `Modifier le pipeline : ${pipeline.name}` : "Nouveau pipeline"}
      onClose={onClose}
      footer={
        <>
          {pipeline && !pipeline.isMain &&
            (confirmDelete ? (
              <span className="mr-auto flex items-center gap-2 text-sm">
                Supprimer ce pipeline et ses opportunités ?
                <button onClick={removePipeline} disabled={busy} className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700">
                  Oui, supprimer
                </button>
                <button onClick={() => setConfirmDelete(false)} className="rounded-lg px-2 py-1.5 text-zinc-500 hover:bg-zinc-100">
                  Non
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="mr-auto rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:bg-red-50 hover:text-red-600">
                Supprimer le pipeline
              </button>
            ))}
          {error && <span className="mr-2 max-w-sm text-sm text-red-600">{error}</span>}
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button onClick={save} disabled={busy} className="rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:bg-green-300">
            {busy ? "Enregistrement…" : "Appliquer les modifications"}
          </button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <div className="space-y-5">
          <div>
            <span className={label}>Nom du pipeline</span>
            <input autoFocus={!pipeline} className={field} value={name} maxLength={60} placeholder="Nouveau pipeline" onChange={(e) => setName(e.target.value)} />
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
              {pipeline?.isMain ? "Ton pipeline principal. Il peut être renommé mais pas supprimé." : "Par exemple : Ventes, Avis clients, Partenariats."}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-4">
            <div className="flex gap-1.5">
              <StageIcon kind="open" color="#3b82f6" size={20} />
              <StageIcon kind="won" color="#10b981" size={20} />
              <StageIcon kind="lost" color="#ef4444" size={20} />
            </div>
            <p className="mt-2 text-sm font-semibold text-zinc-800">Comment ça marche</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Les étapes ouvertes sont ton parcours de vente. Une opportunité finit dans « Gagné » ou « Perdu ». Clique sur l&apos;icône d&apos;une étape pour changer sa couleur.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {section("open", "Ouvert", "#18181b", "en cours")}
          {section("won", "Gagné", "#059669", "vente conclue")}
          {section("lost", "Perdu", "#dc2626", "abandonnée")}

          <div className="rounded-xl border border-zinc-200 p-4">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-semibold">Synchroniser les étiquettes des contacts avec les étapes</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  Déplacer une opportunité pose l&apos;étiquette de sa nouvelle étape sur le contact et retire celles des autres étapes. Poser une étiquette d&apos;étape déplace l&apos;opportunité, même en arrière.
                </p>
              </div>
              <Toggle checked={sync} onChange={setSync} label="Synchroniser les étiquettes" />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
