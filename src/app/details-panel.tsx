"use client";

import { Icon as UiIcon, type IconName } from "@/app/icons";

import Link from "next/link";
import { useState } from "react";
import { CHANNELS } from "@/lib/channels";
import { countryOf } from "@/lib/country";
import type { Chat, ChatFile, ChatStats, Task } from "@/lib/db";
import { Avatar } from "./avatar";
import { ContactModal, displayName, TagsModal } from "./conversation-menu";

export type Details = {
  chat: Chat;
  stats: ChatStats;
  aiInactive: string | null;
  agent?: { id: number; name: string; status: "active" | "paused"; assigned: boolean } | null;
  agents?: { id: number; name: string; status: "active" | "paused" }[];
  knownTags: string[];
  files: ChatFile[];
  tasks: Task[];
  activity: { firstContact: number | null; firstAi: number | null; firstHuman: number | null };
};

const enc = encodeURIComponent;
const day = (ts: number) => new Date(ts).toLocaleDateString("fr-FR");

/** Panneau de droite « Afficher les détails » : fiche contact, stats, tâches, résumé, préférences… */
export function DetailsPanel({
  data,
  onChanged,
  onHide,
  notify,
}: {
  data: Details;
  onChanged: () => void;
  onHide: () => void;
  notify: (message: string) => void;
}) {
  const { chat, stats, aiInactive, knownTags, files, tasks, activity, agent, agents = [] } = data;
  const [modal, setModal] = useState<"contact" | "tags" | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const url = `/api/chats/${enc(chat.jid)}`;
  const country = countryOf(chat.phone);

  async function patch(body: object, message?: string) {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return notify("Échec de la modification.");
    if (message) notify(message);
    onChanged();
  }

  async function summarize() {
    setSummarizing(true);
    const res = await fetch(`${url}/summary`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setSummarizing(false);
    if (!res.ok) return notify(body.error ?? "Échec du résumé.");
    onChanged();
  }

  const agentStatus = chat.aiPaused
    ? { label: "En pause", className: "text-amber-600" }
    : aiInactive
      ? { label: "Inactif", className: "text-zinc-500" }
      : { label: "Actif", className: "text-blue-700" };

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-zinc-200 bg-white">
      <div className="flex justify-end px-3 pt-3">
        <button
          onClick={onHide}
          aria-label="Masquer les détails"
          title="Masquer les détails"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l6 6-6 6M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* En-tête */}
      <div className="flex flex-col items-center px-5 text-center">
        <Avatar jid={chat.jid} name={displayName(chat)} phone={chat.phone} channel={chat.channel} size="lg" />
        <p className="mt-3 font-semibold">{displayName(chat)}</p>
        {country && (
          <p className="mt-0.5 text-sm text-zinc-500">
            <span className="mr-1 text-xs font-medium text-zinc-400">{country.code}</span>
            {country.name}
          </p>
        )}
        <div className="mt-4 grid w-full grid-cols-2 gap-2">
          <QuickButton
            label="E-mail"
            onClick={() => (chat.email ? window.open(`mailto:${chat.email}`) : setModal("contact"))}
          >
            <path d="M3 6h18v12H3zM3 7l9 6 9-6" />
          </QuickButton>
          <QuickButton label="Réserver" soon>
            <path d="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4" />
          </QuickButton>
        </div>
      </div>

      <Section title="Contact" action={{ label: "Modifier", run: () => setModal("contact") }}>
        <dl className="space-y-2 text-sm">
          <Row label="Canal" value={CHANNELS[chat.channel].label} />
          <Row label="Téléphone" value={chat.phone ? `+${chat.phone}` : "—"} />
          <Row label="E-mail" value={chat.email ?? "—"} />
          <Row label="Pays" value={country?.code ?? "—"} />
          <Row label="Créé le" value={day(chat.createdAt)} />
        </dl>
      </Section>

      <Section title="Statistiques d'activité">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Total" value={stats.total} />
          <Stat label="Reçus" value={stats.received} />
          <Stat label="Envoyés" value={stats.sent} />
          <Stat label="Réponses IA" value={stats.ai} />
          <Stat label="Humain" value={stats.human} />
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
          <div>
            <p className="text-xs text-zinc-500">Compteur de messages IA</p>
            <p className="text-lg font-semibold">{stats.aiSinceReset}</p>
          </div>
          <button
            onClick={() => patch({ resetAiCounter: true }, "Compteur remis à zéro.")}
            className="rounded-lg border border-blue-600/40 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
          >
            Réinitialiser
          </button>
        </div>
      </Section>

      <Section title="Agent">
        <div className="rounded-lg bg-zinc-50 px-3 py-2.5 text-sm">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${chat.aiPaused ? "bg-amber-500" : aiInactive ? "bg-zinc-400" : "bg-blue-600"}`} />
            <span className="min-w-0 flex-1 truncate font-medium">{agent?.name ?? "Aucun agent"}</span>
            <span className={`text-xs font-medium uppercase ${agentStatus.className}`}>{agentStatus.label}</span>
          </div>
          <select
            value={chat.agentId ?? ""}
            onChange={(e) =>
              patch(
                { agentId: e.target.value ? Number(e.target.value) : null },
                e.target.value ? "Agent attribué à cette discussion." : "La discussion suit l'agent de son canal.",
              )
            }
            className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-zinc-400"
            aria-label="Agent de cette discussion"
          >
            <option value="">Agent du canal{!chat.agentId ? ` (${agent?.name ?? "aucun"})` : ""}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.status === "paused" ? " (en pause)" : ""}
              </option>
            ))}
          </select>
        </div>
        {aiInactive && !chat.aiPaused && <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{aiInactive}.</p>}
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs font-medium">
          {agent && (
            <Link href={`/agents/${agent.id}`} className="text-blue-700 hover:underline">
              Ouvrir l&apos;agent →
            </Link>
          )}
          <Link href="/agents" className="text-blue-700 hover:underline">
            Qui répond sur chaque canal →
          </Link>
        </div>
      </Section>

      <Section title="Étiquettes" action={{ label: "Gérer", run: () => setModal("tags") }}>
        <div className="flex flex-wrap items-center gap-1.5">
          {chat.tags.length === 0 && <Empty>Aucune étiquette pour le moment</Empty>}
          {chat.tags.map((t) => (
            <span key={t} className="rounded-full bg-pink-50 px-2.5 py-0.5 text-xs text-pink-700">
              {t}
            </span>
          ))}
          <button
            onClick={() => setModal("tags")}
            className="rounded-full border border-dashed border-zinc-300 px-2.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-50"
          >
            + Ajouter
          </button>
        </div>
      </Section>

      <Section title="Opportunité" soonAction="Ajouter une opportunité">
        <Empty>Aucune opportunité liée</Empty>
      </Section>

      <TasksSection jid={chat.jid} tasks={tasks} onChanged={onChanged} />

      <Section title="Suivi">
        <Empty>Aucun suivi programmé</Empty>
      </Section>

      <Section title="Automatisations">
        <Empty>Pas encore dans une automatisation.</Empty>
      </Section>

      <Section
        title="Résumés"
        action={{ label: summarizing ? "L'IA résume…" : chat.summary ? "Mettre à jour" : "Générer", run: summarize }}
      >
        {chat.summary ? (
          <>
            <p className="text-sm whitespace-pre-wrap text-zinc-700">{chat.summary}</p>
            {chat.summaryAt && <p className="mt-1 text-xs text-zinc-400">Résumé du {day(chat.summaryAt)}</p>}
          </>
        ) : (
          <Empty>Aucun résumé pour le moment. Clique sur « Générer » pour que l&apos;IA en rédige un.</Empty>
        )}
      </Section>

      <Section title="Recherche" soonAction="Rechercher maintenant">
        <Empty>Aucune recherche pour le moment.</Empty>
      </Section>

      <Section title="Fichiers">
        {files.length === 0 ? (
          <Empty>Aucun fichier partagé dans cette discussion pour le moment.</Empty>
        ) : (
          <ul className="space-y-1">
            {files.map((f) => (
              <li key={f.id}>
                <a
                  href={`/api/media/${enc(f.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50"
                >
                  <UiIcon name={({ image: "camera", audio: "music", video: "film", document: "file" } as Record<string, IconName>)[f.type] ?? "clip"} size={16} className="shrink-0 text-zinc-400" />
                  <span className="flex-1 truncate">
                    {f.type === "document" ? f.text : { image: "Photo", audio: "Message vocal", video: "Vidéo", text: "Fichier" }[f.type]}
                  </span>
                  <span className="text-xs text-zinc-400">{day(f.ts)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <NotesSection chat={chat} onSave={(notes) => patch({ notes }, "Notes enregistrées.")} />

      <Section title="Activité">
        <ul className="space-y-2.5 text-sm">
          {activity.firstContact && <Event label={`Premier message via ${CHANNELS[chat.channel].label}`} ts={activity.firstContact} />}
          {activity.firstAi && <Event label="Première réponse de l'IA" ts={activity.firstAi} />}
          {activity.firstHuman && <Event label="Première réponse de ta part" ts={activity.firstHuman} />}
          {!activity.firstContact && !activity.firstAi && !activity.firstHuman && <Empty>Aucune activité.</Empty>}
        </ul>
      </Section>

      <div className="border-t border-zinc-100 px-5 py-4">
        <p className="text-xs font-semibold tracking-wide text-zinc-500">PRÉFÉRENCES</p>
        <div className="mt-3 space-y-3">
          <Toggle
            label="Réponses du bot"
            checked={!chat.aiPaused}
            onChange={(v) => patch({ aiPaused: !v }, v ? "L'IA répond à nouveau." : "IA en pause sur cette discussion.")}
          />
          <Toggle label="Suivis" hint="Relances automatiques (bientôt)" checked={chat.followups} onChange={(v) => patch({ followups: v })} />
          <Toggle label="Ne pas déranger" checked={chat.dnd} onChange={(v) => patch({ dnd: v })} />
          <Toggle
            label="Contact de test"
            hint="L'IA répond toujours à ce contact"
            checked={chat.testContact}
            onChange={(v) => patch({ testContact: v }, v ? "Contact de test : l'IA lui répondra." : "Ce n'est plus un contact de test.")}
          />
        </div>
      </div>

      {modal === "contact" && (
        <ContactModal chat={chat} onClose={() => setModal(null)} onSave={(v) => patch(v, "Contact mis à jour.").then(() => setModal(null))} />
      )}
      {modal === "tags" && (
        <TagsModal
          tags={chat.tags}
          knownTags={knownTags}
          onClose={() => setModal(null)}
          onSave={(tags) => patch({ tags }, "Étiquettes enregistrées.").then(() => setModal(null))}
        />
      )}
    </aside>
  );
}

function TasksSection({ jid, tasks, onChanged }: { jid: string; tasks: Task[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");

  async function add() {
    if (!text.trim()) return setAdding(false);
    await fetch(`/api/chats/${enc(jid)}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setText("");
    setAdding(false);
    onChanged();
  }

  async function toggle(t: Task) {
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    });
    onChanged();
  }

  async function remove(t: Task) {
    await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <Section title="Tâches" action={{ label: "Ajouter une tâche", run: () => setAdding(true) }}>
      {adding && (
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
            if (e.key === "Escape") setAdding(false);
          }}
          onBlur={add}
          placeholder="Ex : rappeler demain à 10 h"
          className="mb-2 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
        />
      )}
      {tasks.length === 0 && !adding && <Empty>Aucune tâche.</Empty>}
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className="group flex items-start gap-2 text-sm">
            <input type="checkbox" checked={t.done} onChange={() => toggle(t)} className="mt-0.5 accent-blue-600" />
            <span className={`flex-1 ${t.done ? "text-zinc-400 line-through" : "text-zinc-800"}`}>{t.text}</span>
            <button
              onClick={() => remove(t)}
              aria-label="Supprimer la tâche"
              className="text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-red-600"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function NotesSection({ chat, onSave }: { chat: Chat; onSave: (notes: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(chat.notes ?? "");
  return (
    <Section
      title="Notes"
      action={{
        label: editing ? "Enregistrer" : "Modifier",
        run: () => {
          if (editing) void onSave(notes).then(() => setEditing(false));
          else {
            setNotes(chat.notes ?? "");
            setEditing(true);
          }
        },
      }}
    >
      {editing ? (
        <textarea
          autoFocus
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
        />
      ) : chat.notes ? (
        <p className="text-sm whitespace-pre-wrap text-zinc-700">{chat.notes}</p>
      ) : (
        <Empty>Aucune note pour le moment.</Empty>
      )}
    </Section>
  );
}

function Section({
  title,
  action,
  soonAction,
  children,
}: {
  title: string;
  action?: { label: string; run: () => void };
  soonAction?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-t border-zinc-100 px-5 py-4 first-of-type:mt-5">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          {title}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={open ? "" : "-rotate-90"} aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {action && (
          <button onClick={action.run} className="text-xs font-medium text-blue-700 hover:underline">
            {action.label}
          </button>
        )}
        {soonAction && <span className="text-xs text-zinc-300" title="Bientôt">{soonAction}</span>}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

function QuickButton({
  label,
  soon,
  onClick,
  children,
}: {
  label: string;
  soon?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={soon}
      title={soon ? "Bientôt" : label}
      className="flex flex-col items-center gap-1 rounded-xl border border-zinc-200 py-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-default disabled:text-zinc-400 disabled:hover:bg-white"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={soon ? "" : "text-blue-600"} aria-hidden>
        {children}
      </svg>
      {label}
    </button>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm text-zinc-800">{label}</p>
        {hint && <p className="text-xs text-zinc-400">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-zinc-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-5.5" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="truncate text-right">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-2 py-2 text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}

function Event({ label, ts }: { label: string; ts: number }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
      <div>
        <p className="text-zinc-800">{label}</p>
        <p className="text-xs text-zinc-400">{day(ts)}</p>
      </div>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-400 italic">{children}</p>;
}
