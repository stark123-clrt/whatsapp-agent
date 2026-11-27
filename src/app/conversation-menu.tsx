"use client";

import { Icon as UiIcon } from "@/app/icons";

import { useEffect, useState } from "react";
import type { Chat } from "@/lib/db";

const enc = encodeURIComponent;

type Props = {
  chat: Chat;
  knownTags: string[];
  /** Après une modification : recharger la discussion et la liste. */
  onChanged: () => void;
  /** Fermer la discussion (après « non lu », archive, spam ou suppression). */
  onClose: () => void;
  notify: (message: string) => void;
};

type Item =
  | { kind: "action"; label: string; icon: IconName; color: string; run: () => void; danger?: boolean }
  | { kind: "soon"; label: string; icon: IconName; color: string };

export function ConversationMenu({ chat, knownTags, onChanged, onClose, notify }: Props) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<"contact" | "tags" | "agent" | "delete" | null>(null);
  const url = `/api/chats/${enc(chat.jid)}`;

  async function patch(body: object, message?: string, close = false) {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return notify("Échec de la modification.");
    if (message) notify(message);
    onChanged();
    if (close) onClose();
  }

  async function autoTag() {
    notify("L'IA lit la discussion…");
    const res = await fetch(`${url}/auto-tags`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return notify(body.error ?? "Échec de l'étiquetage.");
    notify(body.added?.length ? `Étiquettes ajoutées : ${body.added.join(", ")}` : "Aucune étiquette proposée.");
    onChanged();
  }

  async function emailTranscript() {
    const text = await fetch(`${url}/transcript?format=text`).then((r) => r.text());
    // Les liens mailto ont une longueur limitée : on garde la fin de la discussion.
    const body = text.length > 1800 ? `…\n${text.slice(-1800)}` : text;
    const subject = `Transcription de la discussion avec ${displayName(chat)}`;
    window.location.assign(`mailto:${chat.email ?? ""}?subject=${enc(subject)}&body=${enc(body)}`);
  }

  async function remove(exportFirst: boolean) {
    setModal(null);
    if (exportFirst) {
      // Copie de sauvegarde de la conversation avant de l'effacer (RGPD, archives).
      const a = document.createElement("a");
      a.href = `${url}/transcript`;
      a.download = "";
      a.click();
      await new Promise((r) => setTimeout(r, 1200));
    }
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) return notify("Échec de la suppression.");
    notify("Contact supprimé.");
    onChanged();
    onClose();
  }

  const sections: Item[][] = [
    [{ kind: "soon", label: "Tester dans le Playground", icon: "flask", color: "text-emerald-600" }],
    [
      { kind: "action", label: "Marquer comme lu", icon: "mailOpen", color: "text-sky-600", run: () => patch({ read: true }, "Marquée comme lue.") },
      { kind: "action", label: "Marquer comme non lu", icon: "mail", color: "text-sky-600", run: () => patch({ unread: true }, "Marquée comme non lue.", true) },
      {
        kind: "action",
        label: chat.dnd ? "Désactiver « Ne pas déranger »" : "Ne pas déranger",
        icon: "bellOff",
        color: "text-amber-500",
        run: () =>
          patch({ dnd: !chat.dnd }, chat.dnd ? "« Ne pas déranger » désactivé." : "Plus aucune réponse automatique pour ce contact."),
      },
    ],
    [
      { kind: "soon", label: "Assigner à un membre de l'équipe…", icon: "userPlus", color: "text-violet-500" },
      { kind: "soon", label: "Envoyer une diffusion…", icon: "megaphone", color: "text-cyan-600" },
      { kind: "soon", label: "Ajouter à l'automatisation", icon: "bolt", color: "text-emerald-600" },
      { kind: "action", label: "Assigner un agent IA…", icon: "spark", color: "text-fuchsia-500", run: () => setModal("agent") },
      { kind: "action", label: "Modifier le contact…", icon: "pencil", color: "text-blue-600", run: () => setModal("contact") },
      { kind: "action", label: "Gérer les tags…", icon: "tag", color: "text-pink-500", run: () => setModal("tags") },
      { kind: "action", label: "Étiquetage automatique par IA", icon: "spark", color: "text-amber-500", run: autoTag },
      { kind: "soon", label: "Prendre rendez-vous…", icon: "calendar", color: "text-indigo-500" },
      {
        kind: "action",
        label: "Copier le lien",
        icon: "link",
        color: "text-zinc-500",
        run: () =>
          navigator.clipboard
            .writeText(`${location.origin}/?c=${enc(chat.jid)}`)
            .then(() => notify("Lien copié."))
            .catch(() => notify("Impossible de copier le lien.")),
      },
    ],
    [
      {
        kind: "action",
        label: "Exporter la transcription",
        icon: "download",
        color: "text-teal-600",
        run: () => {
          // Téléchargement du fichier texte via un lien temporaire.
          const a = document.createElement("a");
          a.href = `${url}/transcript`;
          a.download = "";
          a.click();
        },
      },
      { kind: "action", label: "Envoyer la transcription par e-mail", icon: "mail", color: "text-teal-600", run: emailTranscript },
      {
        kind: "action",
        label: chat.archived ? "Désarchiver la discussion" : "Archiver la discussion",
        icon: "archive",
        color: "text-zinc-600",
        run: () =>
          chat.archived
            ? patch({ archived: false }, "Discussion désarchivée.")
            : patch({ archived: true }, "Discussion archivée.", true),
      },
      {
        kind: "action",
        label: chat.spam ? "Ce n'est pas un spam" : "Marquer comme spam",
        icon: "shield",
        color: "text-red-500",
        run: () =>
          chat.spam
            ? patch({ spam: false }, "Retirée des spams.")
            : patch({ spam: true }, "Marquée comme spam : l'IA ne répondra plus.", true),
      },
      { kind: "action", label: "Supprimer le contact", icon: "trash", color: "text-red-600", danger: true, run: () => setModal("delete") },
    ],
  ];

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Plus d'options"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>

        {open && (
          <>
            <button className="fixed inset-0 z-30 cursor-default" aria-label="Fermer le menu" onClick={() => setOpen(false)} />
            <div
              role="menu"
              className="absolute top-11 right-0 z-40 max-h-[75vh] w-80 overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1.5 shadow-xl"
            >
              {sections.map((items, i) => (
                <div key={i} className={i > 0 ? "mt-1.5 border-t border-zinc-100 pt-1.5" : ""}>
                  {items.map((item) => (
                    <button
                      key={item.label}
                      role="menuitem"
                      disabled={item.kind === "soon"}
                      onClick={() => {
                        if (item.kind !== "action") return;
                        setOpen(false);
                        item.run();
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                        item.kind === "soon"
                          ? "cursor-default text-zinc-400"
                          : item.kind === "action" && item.danger
                            ? "text-red-600 hover:bg-red-50"
                            : "text-zinc-800 hover:bg-zinc-50"
                      }`}
                    >
                      <span className={item.kind === "soon" ? "text-zinc-300" : item.color}>
                        <Icon name={item.icon} />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {item.kind === "soon" && <span className="text-[11px]">Bientôt</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {modal === "contact" && (
        <ContactModal
          chat={chat}
          onClose={() => setModal(null)}
          onSave={(v) => patch(v, "Contact mis à jour.").then(() => setModal(null))}
        />
      )}
      {modal === "delete" && (
        <Modal title={`Supprimer ${displayName(chat)} ?`} onClose={() => setModal(null)}>
          <p className="mt-2 text-sm text-zinc-600">
            La discussion, ses messages et ses fichiers seront <strong>effacés définitivement</strong> de l&apos;appli. Rien n&apos;est supprimé sur WhatsApp.
          </p>
          <p className="mt-2 text-sm text-zinc-600">Conseil : télécharge d&apos;abord la transcription pour garder une trace.</p>
          <div className="mt-5 flex flex-col gap-2">
            <button onClick={() => remove(true)} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
              <UiIcon name="file" size={15} className="mr-1.5 inline-block align-[-3px]" />Exporter la transcription puis supprimer
            </button>
            <button onClick={() => remove(false)} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              Supprimer sans exporter
            </button>
            <button onClick={() => setModal(null)} className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
              Annuler
            </button>
          </div>
        </Modal>
      )}
      {modal === "agent" && (
        <AgentModal
          current={chat.agentId}
          onClose={() => setModal(null)}
          onSave={(agentId) => patch({ agentId }, "Agent IA attribué.").then(() => setModal(null))}
        />
      )}
      {modal === "tags" && (
        <TagsModal
          tags={chat.tags}
          knownTags={knownTags}
          onClose={() => setModal(null)}
          onSave={(tags) => patch({ tags }, "Tags enregistrés.").then(() => setModal(null))}
        />
      )}
    </>
  );
}

function AgentModal({ current, onClose, onSave }: { current: number | null; onClose: () => void; onSave: (agentId: number | null) => void }) {
  const [agents, setAgents] = useState<{ id: number; name: string; status: string; isDefault: boolean }[] | null>(null);
  const [value, setValue] = useState(current ? String(current) : "");
  useEffect(() => {
    void fetch("/api/agents", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setAgents(b.agents));
  }, []);
  return (
    <Modal title="Assigner un agent IA" onClose={onClose}>
      <p className="mt-1 text-sm text-zinc-500">L&apos;agent choisi répondra dans cette discussion avec ses propres instructions et connaissances.</p>
      <select value={value} onChange={(e) => setValue(e.target.value)} className="mt-4 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
        <option value="">Agent par défaut (selon les points d&apos;entrée)</option>
        {agents?.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.status === "paused" ? " (en pause)" : ""}
          </option>
        ))}
      </select>
      {agents?.length === 0 && <p className="mt-2 text-sm text-amber-700">Aucun agent : crée-en un dans Studio IA → Agents IA.</p>}
      <div className="flex justify-end gap-2 pt-5">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
          Annuler
        </button>
        <button onClick={() => onSave(value ? Number(value) : null)} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
          Enregistrer
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ContactModal({
  chat,
  onClose,
  onSave,
}: {
  chat: Chat;
  onClose: () => void;
  onSave: (v: { customName: string; email: string; notes: string }) => void;
}) {
  const [customName, setName] = useState(chat.customName ?? chat.name ?? "");
  const [email, setEmail] = useState(chat.email ?? "");
  const [notes, setNotes] = useState(chat.notes ?? "");
  const field = "mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400";
  return (
    <Modal title="Modifier le contact" onClose={onClose}>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ customName, email, notes });
        }}
      >
        <label className="block text-sm text-zinc-600">
          Nom
          <input value={customName} onChange={(e) => setName(e.target.value)} className={field} autoFocus />
        </label>
        <p className="text-xs text-zinc-500">
          Nom WhatsApp : {chat.name ?? "inconnu"}{chat.phone ? ` · +${chat.phone}` : ""}
        </p>
        <label className="block text-sm text-zinc-600">
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        </label>
        <label className="block text-sm text-zinc-600">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={field} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
            Enregistrer
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function TagsModal({
  tags: initial,
  knownTags,
  onClose,
  onSave,
}: {
  tags: string[];
  knownTags: string[];
  onClose: () => void;
  onSave: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState(initial);
  const [input, setInput] = useState("");
  const add = (t: string) => {
    const tag = t.trim().toLowerCase();
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setInput("");
  };
  const suggestions = knownTags.filter((t) => !tags.includes(t) && t.includes(input.trim().toLowerCase()));
  return (
    <Modal title="Gérer les tags" onClose={onClose}>
      <div className="mt-4 flex min-h-10 flex-wrap gap-1.5">
        {tags.length === 0 && <p className="text-sm text-zinc-500">Aucun tag pour l&apos;instant.</p>}
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-full bg-pink-50 px-2.5 py-1 text-sm text-pink-700">
            {t}
            <button onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Retirer ${t}`} className="hover:text-pink-900">
              ✕
            </button>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(input);
          }
        }}
        placeholder="Nouveau tag, puis Entrée"
        className="mt-3 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
        autoFocus
      />
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.slice(0, 12).map((t) => (
            <button key={t} onClick={() => add(t)} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-200">
              + {t}
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-5">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
          Annuler
        </button>
        <button
          onClick={() => onSave(input.trim() ? [...tags, input.trim().toLowerCase()] : tags)}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Enregistrer
        </button>
      </div>
    </Modal>
  );
}

export const displayName = (c: Pick<Chat, "customName" | "name" | "phone">) =>
  c.customName ?? c.name ?? (c.phone ? `+${c.phone}` : "Inconnu");

const PATHS = {
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  mailOpen: "M3 10l9-6 9 6v9H3zM3 10l9 6 9-6",
  bellOff: "M6 8a6 6 0 0 1 9.5-4.9M18 9v4l2 3H8M10 20a2 2 0 0 0 4 0M3 3l18 18",
  userPlus: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M19 8v6M16 11h6",
  megaphone: "M4 10v4h3l7 4V6l-7 4H4zM18 9a4 4 0 0 1 0 6",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  spark: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  pencil: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  tag: "M3 12V4h8l10 10-8 8zM7.5 7.5h.01",
  calendar: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  archive: "M3 5h18v4H3zM5 9v10h14V9M10 13h4",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM12 8v5M12 16h.01",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
};
type IconName = keyof typeof PATHS;

function Icon({ name }: { name: IconName }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}
