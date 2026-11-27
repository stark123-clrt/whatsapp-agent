"use client";

import { Icon as UiIcon } from "@/app/icons";

import { useState } from "react";
import type { Message } from "@/lib/db";

const enc = encodeURIComponent;
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

type Props = {
  m: Message;
  quoted: Message | null; // message cité, s'il est chargé
  contactName: string;
  onReply: (m: Message) => void;
  onChanged: () => void;
  notify: (message: string) => void;
};

export function Bubble({ m, quoted, contactName, onReply, onChanged, notify }: Props) {
  const mine = m.sender !== "contact";
  const media = m.mediaFile ? `/api/media/${enc(m.id)}` : null;
  const [menu, setMenu] = useState(false);

  async function call(url: string, init: RequestInit, ok?: string) {
    setMenu(false);
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return notify(body.error ?? "Échec.");
    if (ok) notify(ok);
    onChanged();
    return body;
  }

  const react = (emoji: string) =>
    call(`/api/messages/${enc(m.id)}/react`, {
      method: "POST",
      body: JSON.stringify({ emoji: m.myReaction === emoji ? "" : emoji }),
    });

  async function remove() {
    const ok = window.confirm(
      mine
        ? "Supprimer ce message pour tout le monde ?\nIl disparaîtra aussi chez le contact sur WhatsApp."
        : "Supprimer ce message de l'appli ?\nIl restera visible chez le contact (WhatsApp ne permet pas plus).",
    );
    if (!ok) return setMenu(false);
    await call(`/api/messages/${enc(m.id)}`, { method: "DELETE" }, "Message supprimé.");
  }

  const reactions = [m.theirReaction, m.myReaction].filter(Boolean) as string[];
  const time = new Date(m.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`group flex ${mine ? "justify-end" : "justify-start"} ${reactions.length ? "mb-3" : ""}`}>
      <div className={`relative max-w-[75%] ${mine ? "order-2" : ""}`}>
        <div className={`rounded-xl px-3 py-2 text-sm shadow-sm ${mine ? "bg-[#D9FDD3]" : "bg-white"}`}>
          {mine && (
            <p className={`mb-0.5 text-xs font-medium ${m.sender === "ai" ? "text-blue-700" : "text-zinc-500"}`}>
              {m.sender === "ai"
                ? `IA${m.agentName ? ` · ${m.agentName}` : ""}${m.agentDeleted ? " (agent supprimé)" : ""}`
                : "Vous"}
            </p>
          )}

          {m.deleted ? (
            <p className="text-zinc-500 italic"><UiIcon name="ban" size={14} className="mr-1 inline-block align-[-3px]" />Ce message a été supprimé</p>
          ) : (
            <>
              {m.replyTo && (
                <div className={`mb-1.5 rounded-lg border-l-4 border-blue-600 px-2 py-1 text-xs ${mine ? "bg-black/5" : "bg-zinc-100"}`}>
                  <p className="font-medium text-blue-700">
                    {quoted ? (quoted.sender === "contact" ? contactName : quoted.sender === "ai" ? "IA" : "Vous") : "Message"}
                  </p>
                  <p className="line-clamp-2 text-zinc-600">{quoted ? preview(quoted) : "Message plus ancien"}</p>
                </div>
              )}

              {m.type === "image" && media && (
                <a href={media} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- fichier servi par l'API */}
                  <img src={media} alt="Photo" className="mb-1 max-h-72 rounded-lg" />
                </a>
              )}
              {m.type === "video" && (
                <div className="mb-1">
                  {media && (
                    /* eslint-disable-next-line @next/next/no-img-element -- fichier servi par l'API */
                    <img src={media} alt="Aperçu de la vidéo" className="max-h-60 rounded-lg" />
                  )}
                  <span className="mt-1 block text-xs text-zinc-500">Vidéo (aperçu seulement)</span>
                </div>
              )}
              {m.type === "audio" && (
                <div className="mb-1">
                  {media && <audio controls src={media} className="h-9 max-w-64" />}
                  {m.sender === "contact" && (
                    <p className="mt-1 text-xs text-zinc-500 italic">
                      {m.text ? `Transcription : ${m.text}` : "Message vocal (non transcrit)"}
                    </p>
                  )}
                </div>
              )}
              {m.type === "document" && (
                <a
                  href={media ?? undefined}
                  download={m.text ?? undefined}
                  className="mb-1 flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 hover:bg-black/10"
                >
                  <UiIcon name="file" size={18} className="shrink-0 text-zinc-500" />
                  <span className="truncate font-medium">{m.text ?? "Document"}</span>
                </a>
              )}
              {m.type !== "audio" && m.type !== "document" && m.text && (
                <p className="break-words whitespace-pre-wrap">{m.text}</p>
              )}
            </>
          )}

          <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-zinc-400">
            {m.starred && <span title="Important">★</span>}
            {time}
            {mine && !m.deleted && <Ticks status={m.status ?? 0} />}
          </p>
        </div>

        {reactions.length > 0 && (
          <span
            className={`absolute -bottom-3 flex gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-sm shadow ring-1 ring-zinc-200 ${
              mine ? "right-2" : "left-2"
            }`}
          >
            {reactions.map((r, i) => (
              <span key={i}>{r}</span>
            ))}
          </span>
        )}

        {/* Bouton du menu, visible au survol */}
        {!m.deleted && (
          <button
            onClick={() => setMenu((o) => !o)}
            aria-label="Options du message"
            className={`absolute top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-zinc-500 shadow ring-1 ring-zinc-200 hover:text-zinc-900 ${
              menu ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
            } ${mine ? "-left-9" : "-right-9"}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}

        {menu && (
          <>
            <button className="fixed inset-0 z-30 cursor-default" aria-label="Fermer" onClick={() => setMenu(false)} />
            <div
              role="menu"
              className={`absolute top-9 z-40 w-60 rounded-xl border border-zinc-200 bg-white py-1.5 shadow-xl ${
                mine ? "right-full mr-2" : "left-full ml-2"
              }`}
            >
              <div className="flex justify-between border-b border-zinc-100 px-3 pb-1.5">
                {REACTIONS.map((e) => (
                  <button
                    key={e}
                    onClick={() => react(e)}
                    aria-label={`Réagir ${e}`}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xl hover:bg-zinc-100 ${
                      m.myReaction === e ? "bg-blue-50 ring-1 ring-blue-600/40" : ""
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <MenuItem
                label="Répondre"
                onClick={() => {
                  setMenu(false);
                  onReply(m);
                }}
                path="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-1"
              />
              {m.text && (
                <MenuItem
                  label="Copier le texte"
                  onClick={() => {
                    setMenu(false);
                    navigator.clipboard.writeText(m.text ?? "").then(
                      () => notify("Texte copié."),
                      () => notify("Impossible de copier."),
                    );
                  }}
                  path="M8 8h11v12H8zM5 16V4h11"
                />
              )}
              <MenuItem
                label={m.starred ? "Retirer des importants" : "Marquer comme important"}
                onClick={() =>
                  call(`/api/messages/${enc(m.id)}`, { method: "PATCH", body: JSON.stringify({ starred: !m.starred }) })
                }
                path="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"
              />
              <MenuItem label="Supprimer le message" danger onClick={remove} path="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Coches façon WhatsApp : ✓ envoyé, ✓✓ distribué, ✓✓ vert lu. */
function Ticks({ status }: { status: number }) {
  if (status <= 1) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="En cours d'envoi">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  const read = status >= 4;
  const label = read ? "Lu" : status === 3 ? "Distribué" : "Envoyé";
  return (
    <svg
      width="18"
      height="12"
      viewBox="0 0 18 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={read ? "text-blue-600" : "text-zinc-400"}
      aria-label={label}
    >
      <title>{label}</title>
      {status === 2 ? <path d="M3 6.5l3 3 7-7" /> : <path d="M1 6.5l3 3 7-7M7.5 8.5l1 1 7-7" />}
    </svg>
  );
}

function MenuItem({ label, onClick, path, danger }: { label: string; onClick: () => void; path: string; danger?: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
        danger ? "text-red-600 hover:bg-red-50" : "text-zinc-800 hover:bg-zinc-50"
      }`}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={danger ? "" : "text-zinc-500"} aria-hidden>
        <path d={path} />
      </svg>
      {label}
    </button>
  );
}

export function preview(m: Message) {
  if (m.deleted) return "Message supprimé";
  if (m.type === "image") return m.text ? `Photo · ${m.text}` : "Photo";
  if (m.type === "audio") return "Message vocal";
  if (m.type === "video") return m.text ? `Vidéo · ${m.text}` : "Vidéo";
  if (m.type === "document") return m.text || "Document";
  return m.text ?? "";
}
