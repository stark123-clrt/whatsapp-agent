"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHANNELS } from "@/lib/channels";
import type { Channel, Chat, Message } from "@/lib/db";
import { Avatar } from "./avatar";
import { Composer } from "./composer";
import { Bubble, preview as messagePreview } from "./message-bubble";
import { ConversationMenu, displayName } from "./conversation-menu";
import { DetailsPanel, type Details } from "./details-panel";

type ChatItem = Chat & { aiInactive: string | null; aiTyping: boolean };
type Filter = "all" | "unread" | "paused" | "archived" | "spam" | Channel;
type ChatDetail = Details & { messages: Message[]; aiTyping: boolean };

const LIST_POLL_MS = 3000;
const CHAT_POLL_MS = 2000;

const enc = encodeURIComponent;

/** Rafraîchit des données toutes les `ms` millisecondes. */
function usePolling<T>(url: string | null, ms: number) {
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(async () => {
    if (!url) return;
    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, [url]);
  useEffect(() => {
    const first = setTimeout(reload, 0);
    const id = setInterval(reload, ms);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [reload, ms]);
  return { data: url ? data : null, reload };
}

export function Inbox() {
  const [selected, setSelectedState] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const setSelected = useCallback((jid: string | null) => {
    setSelectedState(jid);
    const url = new URL(window.location.href);
    if (jid) url.searchParams.set("c", jid);
    else url.searchParams.delete("c");
    window.history.replaceState(null, "", url);
  }, []);

  // Ouvre la discussion indiquée dans l'adresse (lien copié).
  useEffect(() => {
    const t = setTimeout(() => setSelectedState(new URLSearchParams(window.location.search).get("c")), 0);
    return () => clearTimeout(t);
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast((t) => (t === message ? null : t)), 3500);
  }, []);
  const [filter, setFilter] = useState<Filter>("all");
  const list = usePolling<{ chats: ChatItem[]; whatsapp: string }>("/api/chats", LIST_POLL_MS);

  const chats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data?.chats ?? []).filter((c) => {
      // Les archives et les spams n'apparaissent que dans leur filtre.
      if (filter === "spam") return c.spam;
      if (c.spam) return false;
      if (filter === "archived") return c.archived;
      if (c.archived) return false;
      if (filter === "unread" && c.unread === 0) return false;
      if (filter === "paused" && !c.aiPaused) return false;
      if (filter in CHANNELS && c.channel !== filter) return false;
      const haystack = `${c.customName ?? ""} ${c.name ?? ""} ${c.phone ?? ""} ${c.email ?? ""} ${c.tags.join(" ")} ${c.lastText ?? ""}`;
      return !q || haystack.toLowerCase().includes(q);
    });
  }, [list.data, search, filter]);

  const all = list.data?.chats ?? [];
  const inbox = all.filter((c) => !c.archived && !c.spam);
  const totalUnread = inbox.reduce((n, c) => n + c.unread, 0);
  const archivedCount = all.filter((c) => c.archived && !c.spam).length;
  const spamCount = all.filter((c) => c.spam).length;

  // Filtres par canal : seulement ceux qui ont des discussions.
  const channels = [...new Set((list.data?.chats ?? []).map((c) => c.channel))];
  const filters: { id: Filter; label: string; count?: number }[] = [
    { id: "all", label: "Toutes", count: inbox.length },
    { id: "unread", label: "Non lues", count: inbox.filter((c) => c.unread > 0).length },
    { id: "paused", label: "IA en pause" },
    ...(channels.length > 1 ? channels.map((ch) => ({ id: ch, label: CHANNELS[ch].label })) : []),
    ...(archivedCount ? [{ id: "archived" as const, label: "Archivées", count: archivedCount }] : []),
    ...(spamCount ? [{ id: "spam" as const, label: "Spam", count: spamCount }] : []),
  ];

  return (
    <div className="flex h-full min-h-0">
      {/* Liste des discussions */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 p-4">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            Discussions
            {totalUnread > 0 && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-green-600 px-2 text-xs font-medium text-white">
                {totalUnread}
              </span>
            )}
          </h1>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="mt-3 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:bg-white"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  filter === f.id ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {f.label}
                {f.count ? <span className="ml-1 opacity-70">{f.count}</span> : null}
              </button>
            ))}
          </div>
        </div>
        {list.data && list.data.whatsapp !== "open" && (
          <Link
            href="/canaux"
            className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 hover:underline"
          >
            WhatsApp n&apos;est pas connecté. Connecter →
          </Link>
        )}
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {list.data && chats.length === 0 && (
            <li className="p-6 text-sm text-zinc-500">
              {search ? "Aucun résultat." : "Aucune discussion pour l'instant. Elles apparaîtront ici dès le premier message reçu."}
            </li>
          )}
          {chats.map((c) => (
            <li key={c.jid}>
              <button
                onClick={() => setSelected(c.jid)}
                className={`flex w-full gap-3 border-b border-zinc-100 px-4 py-3 text-left ${
                  selected === c.jid ? "bg-zinc-100" : "hover:bg-zinc-50"
                }`}
              >
                <Avatar jid={c.jid} name={displayName(c)} phone={c.phone} channel={c.channel} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${c.unread ? "font-semibold" : "font-medium"}`}>
                      {displayName(c)}
                    </span>
                    <span className={`shrink-0 text-xs ${c.unread ? "font-medium text-green-700" : "text-zinc-400"}`}>
                      {formatListTime(c.lastAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    {c.aiTyping ? (
                      <span className="truncate text-sm font-medium text-green-700">L&apos;IA écrit…</span>
                    ) : (
                      <span className={`truncate text-sm ${c.unread ? "font-medium text-zinc-900" : "text-zinc-500"}`}>
                        {c.lastSender && c.lastSender !== "contact" && (
                          <span className="text-zinc-400">{c.lastSender === "ai" ? "IA : " : "Vous : "}</span>
                        )}
                        {preview(c.lastType, c.lastText)}
                      </span>
                    )}
                    {c.unread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-green-600 px-1.5 text-xs font-medium text-white">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  {(c.aiPaused || c.dnd || c.tags.length > 0) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.dnd ? (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">Ne pas déranger</span>
                      ) : (
                        c.aiPaused && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">IA en pause</span>
                        )
                      )}
                      {c.tags.slice(0, 2).map((t) => (
                        <span key={t} className="rounded bg-pink-50 px-1.5 py-0.5 text-xs text-pink-700">
                          {t}
                        </span>
                      ))}
                      {c.tags.length > 2 && <span className="text-xs text-zinc-400">+{c.tags.length - 2}</span>}
                    </div>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {selected ? (
        <Conversation
          key={selected}
          jid={selected}
          onChange={list.reload}
          onClose={() => setSelected(null)}
          notify={notify}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
          Choisis une discussion à gauche.
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function Conversation({
  jid,
  onChange,
  onClose,
  notify,
}: {
  jid: string;
  onChange: () => void;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { data, reload } = usePolling<ChatDetail>(`/api/chats/${enc(jid)}`, CHAT_POLL_MS);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showDetails, setShowDetailsState] = useState(false);
  // Le panneau de détails reste ouvert d'une discussion à l'autre si on l'a ouvert.
  useEffect(() => {
    const t = setTimeout(() => setShowDetailsState(localStorage.getItem("showDetails") === "1"), 0);
    return () => clearTimeout(t);
  }, []);
  const setShowDetails = (v: boolean) => {
    setShowDetailsState(v);
    localStorage.setItem("showDetails", v ? "1" : "0");
  };
  const [busy, setBusy] = useState<"send" | "draft" | "toggle" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = data?.messages.at(-1)?.id;
  const unread = data?.chat.unread ?? 0;

  // Premier message non lu au moment d'ouvrir la discussion (pour la ligne « X messages non lus »).
  const [firstUnread, setFirstUnread] = useState<{ id: string; count: number } | null | undefined>(undefined);
  if (data && firstUnread === undefined) {
    const msg = unread > 0 ? data.messages.at(-unread) : undefined;
    setFirstUnread(msg ? { id: msg.id, count: unread } : null);
  }

  // Les messages affichés sont considérés comme lus.
  useEffect(() => {
    if (unread === 0) return;
    void fetch(`/api/chats/${enc(jid)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    }).then(onChange);
  }, [jid, unread, lastId, onChange]);

  // Défiler vers le dernier message quand il en arrive un nouveau (ou quand l'IA écrit).
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lastId, data?.aiTyping]);

  async function call(kind: "send" | "draft" | "toggle", url: string, init: RequestInit) {
    setBusy(kind);
    setError(null);
    try {
      const json = typeof init.body === "string";
      const res = await fetch(url, { ...init, headers: json ? { "Content-Type": "application/json" } : undefined });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Erreur");
      await reload();
      onChange();
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  const setPaused = (aiPaused: boolean) =>
    call("toggle", `/api/chats/${enc(jid)}`, { method: "PATCH", body: JSON.stringify({ aiPaused }) });

  async function send() {
    if (!text.trim()) return;
    const ok = await call("send", `/api/chats/${enc(jid)}/messages`, {
      method: "POST",
      body: JSON.stringify({ text, replyTo: replyTo?.id ?? null }),
    });
    if (ok) {
      setText("");
      setReplyTo(null);
    }
  }

  async function sendFile(file: File, caption: string, voice: boolean) {
    const form = new FormData();
    form.append("file", file);
    form.append("caption", caption);
    if (voice) form.append("voice", "1");
    return Boolean(await call("send", `/api/chats/${enc(jid)}/files`, { method: "POST", body: form }));
  }

  async function draft() {
    const body = await call("draft", `/api/chats/${enc(jid)}/draft`, { method: "POST" });
    if (body?.text) setText(body.text);
  }

  if (!data) return <div className="flex-1" />;
  const { chat, messages, aiInactive, aiTyping, knownTags } = data;
  const otherReason = aiInactive && !chat.aiPaused ? aiInactive : null;
  const byId = new Map(messages.map((x) => [x.id, x]));
  const changed = () => {
    void reload();
    onChange();
  };

  return (
    <>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-5 py-3">
          <Avatar jid={chat.jid} name={displayName(chat)} phone={chat.phone} channel={chat.channel} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{displayName(chat)}</p>
            {aiTyping ? (
              <p className="text-xs font-medium text-green-700">L&apos;IA écrit…</p>
            ) : (
              <p className="text-xs text-zinc-500">
                {CHANNELS[chat.channel].label}
                {chat.phone ? ` · +${chat.phone}` : ""}
              </p>
            )}
          </div>
          {chat.archived && <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">Archivée</span>}
          {chat.spam && <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">Spam</span>}
          <div className="flex items-center gap-2 text-sm text-zinc-700">
            <span>{chat.aiPaused ? "IA en pause" : "IA active"}</span>
            <button
              role="switch"
              aria-checked={!chat.aiPaused}
              aria-label="IA active sur cette discussion"
              disabled={busy === "toggle"}
              onClick={() => setPaused(!chat.aiPaused)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                chat.aiPaused ? "bg-zinc-300" : "bg-green-600"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  chat.aiPaused ? "left-0.5" : "left-5.5"
                }`}
              />
            </button>
          </div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            aria-label={showDetails ? "Masquer les détails" : "Afficher les détails"}
            title={showDetails ? "Masquer les détails" : "Afficher les détails"}
            aria-pressed={showDetails}
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              showDetails ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </svg>
          </button>
          <ConversationMenu chat={chat} knownTags={knownTags} onChanged={changed} onClose={onClose} notify={notify} />
        </header>

        {chat.aiPaused && (
          <div className="flex items-center justify-between gap-4 border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-900">
            <span>L&apos;IA est en pause sur cette discussion : c&apos;est toi qui réponds.</span>
            <button onClick={() => setPaused(false)} className="shrink-0 font-medium underline">
              Réactiver l&apos;IA
            </button>
          </div>
        )}
        {otherReason && (
          <div className="border-b border-zinc-200 bg-zinc-100 px-5 py-2 text-sm text-zinc-600">
            L&apos;IA ne répondra pas ici : {otherReason.toLowerCase()}.
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 px-5 py-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {messages.map((m, i) => (
              <div key={m.id}>
                {(i === 0 || !sameDay(messages[i - 1].ts, m.ts)) && (
                  <p className="my-3 text-center text-xs text-zinc-400">{formatDay(m.ts)}</p>
                )}
                {firstUnread?.id === m.id && (
                  <div className="my-3 flex items-center gap-3">
                    <span className="h-px flex-1 bg-green-600/40" />
                    <span className="rounded-full bg-green-600 px-3 py-0.5 text-xs font-medium text-white">
                      {firstUnread.count} message{firstUnread.count > 1 ? "s" : ""} non lu
                      {firstUnread.count > 1 ? "s" : ""}
                    </span>
                    <span className="h-px flex-1 bg-green-600/40" />
                  </div>
                )}
                <Bubble
                  m={m}
                  quoted={m.replyTo ? (byId.get(m.replyTo) ?? null) : null}
                  contactName={displayName(chat)}
                  onReply={setReplyTo}
                  onChanged={changed}
                  notify={notify}
                />
              </div>
            ))}
            {aiTyping && (
              <div className="flex justify-end">
                <div className="rounded-xl bg-[#D9FDD3] px-3 py-2 text-sm font-medium text-green-700 shadow-sm">
                  L&apos;IA écrit…
                </div>
              </div>
            )}
            <div ref={bottom} />
          </div>
        </div>

        {chat.draft && (
          <div className="border-t border-green-200 bg-green-50 px-5 py-3">
            <p className="text-xs font-semibold text-green-800">✍️ Brouillon proposé par l&apos;IA</p>
            <p className="mt-1 text-sm whitespace-pre-wrap text-zinc-800">{chat.draft}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={async () => {
                  const draftText = chat.draft ?? "";
                  await call("send", `/api/chats/${enc(jid)}/messages`, { method: "POST", body: JSON.stringify({ text: draftText }) });
                  await call("toggle", `/api/chats/${enc(jid)}`, { method: "PATCH", body: JSON.stringify({ draft: null, aiPaused: false }) });
                }}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
              >
                Envoyer
              </button>
              <button
                onClick={() => {
                  setText(chat.draft ?? "");
                  void call("toggle", `/api/chats/${enc(jid)}`, { method: "PATCH", body: JSON.stringify({ draft: null }) });
                }}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
              >
                Modifier
              </button>
              <button
                onClick={() => void call("toggle", `/api/chats/${enc(jid)}`, { method: "PATCH", body: JSON.stringify({ draft: null }) })}
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-white"
              >
                Ignorer
              </button>
            </div>
          </div>
        )}

        <footer className="border-t border-zinc-200 bg-white p-3">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <Composer
            text={text}
            setText={setText}
            busy={busy !== null}
            drafting={busy === "draft"}
            onSendText={send}
            onSendFile={sendFile}
            onDraft={draft}
            reply={
              replyTo
                ? {
                    who: replyTo.sender === "contact" ? displayName(chat) : replyTo.sender === "ai" ? "IA" : "Vous",
                    text: messagePreview(replyTo),
                    cancel: () => setReplyTo(null),
                  }
                : null
            }
          />
        </footer>
      </section>

      {/* Fiche contact */}
      {showDetails && (
        <DetailsPanel data={data} onChanged={changed} onHide={() => setShowDetails(false)} notify={notify} />
      )}
    </>
  );
}





function preview(type: Message["type"] | null, text: string | null) {
  if (type === "image") return `📷 ${text || "Photo"}`;
  if (type === "audio") return "🎤 Message vocal";
  if (type === "video") return `🎬 ${text || "Vidéo"}`;
  if (type === "document") return `📄 ${text || "Document"}`;
  return text || "";
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

function formatDay(ts: number) {
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (sameDay(ts, today.getTime())) return "Aujourd'hui";
  if (sameDay(ts, yesterday.getTime())) return "Hier";
  return new Date(ts).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function formatListTime(ts: number) {
  return sameDay(ts, Date.now())
    ? new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}
