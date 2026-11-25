"use client";

import { useEffect, useRef, useState } from "react";

const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤩", "🙂", "😉", "😅",
  "🤔", "😴", "😢", "😭", "😡", "😱", "🥳", "🤗", "🙏", "👍", "👎", "👌",
  "👏", "🙌", "💪", "🤝", "✌️", "👋", "❤️", "🧡", "💛", "💚", "💙", "💜",
  "🔥", "✨", "⭐", "🎉", "🎁", "✅", "❌", "⚠️", "📅", "⏰", "📍", "📞",
  "💬", "📷", "🎵", "💰", "🛒", "🚀", "☀️", "🌙", "☕", "🍕", "🏠", "🚗",
];

type Props = {
  text: string;
  setText: (t: string) => void;
  busy: boolean;
  drafting: boolean;
  onSendText: () => void;
  onSendFile: (file: File, caption: string, voice: boolean) => Promise<boolean>;
  onDraft: () => void;
  reply: { who: string; text: string; cancel: () => void } | null; // message cité
};

export function Composer({ text, setText, busy, drafting, onSendText, onSendFile, onDraft, reply }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const recorder = useVoiceRecorder();

  function insertEmoji(e: string) {
    const el = textarea.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + e + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + e.length, start + e.length);
    });
  }

  async function send() {
    if (file) {
      // Le texte saisi sert de légende au fichier.
      if (await onSendFile(file, text, false)) {
        setFile(null);
        setText("");
      }
    } else if (text.trim()) {
      onSendText();
    }
  }

  async function stopAndSend() {
    const voice = await recorder.stop();
    if (voice) await onSendFile(voice, "", true);
  }

  // Pendant l'enregistrement, la zone de saisie devient une barre d'enregistrement.
  if (recorder.state !== "idle") {
    return (
      <div className="flex h-12 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        <span className="flex-1 text-sm tabular-nums text-zinc-700">
          {recorder.state === "starting" ? "Autorise le micro…" : `Enregistrement ${formatDuration(recorder.seconds)}`}
        </span>
        <IconButton label="Annuler l'enregistrement" onClick={recorder.cancel}>
          <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />
        </IconButton>
        <button
          onClick={stopAndSend}
          disabled={recorder.state !== "recording"}
          aria-label="Envoyer le vocal"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
        >
          <SendIcon />
        </button>
      </div>
    );
  }

  const canSend = Boolean(file || text.trim());

  return (
    <div>
      {recorder.error && <p className="mb-2 text-sm text-red-600">{recorder.error}</p>}
      {reply && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-green-600 bg-zinc-50 px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-green-700">Réponse à {reply.who}</p>
            <p className="truncate text-zinc-600">{reply.text}</p>
          </div>
          <button onClick={reply.cancel} className="text-zinc-500 hover:text-zinc-900" aria-label="Annuler la réponse">
            ✕
          </button>
        </div>
      )}
      {file && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
          <span className="truncate">📎 {file.name}</span>
          <span className="shrink-0 text-zinc-400">{formatSize(file.size)}</span>
          <span className="flex-1 text-xs text-zinc-500">Le texte saisi servira de légende.</span>
          <button onClick={() => setFile(null)} className="text-zinc-500 hover:text-zinc-900" aria-label="Retirer le fichier">
            ✕
          </button>
        </div>
      )}

      <div className="relative flex items-end gap-1.5">
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <IconButton label="Joindre un fichier" onClick={() => fileInput.current?.click()}>
          <path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7l-7.8 7.8a1.7 1.7 0 0 1-2.3-2.3l7-7" />
        </IconButton>
        <IconButton label="Emojis" onClick={() => setEmojiOpen((o) => !o)}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
        </IconButton>

        {emojiOpen && (
          <>
            <button className="fixed inset-0 z-10 cursor-default" aria-label="Fermer" onClick={() => setEmojiOpen(false)} />
            <div className="absolute bottom-12 left-0 z-20 grid w-80 grid-cols-10 gap-0.5 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => insertEmoji(e)}
                  className="flex h-7 w-7 items-center justify-center rounded text-lg hover:bg-zinc-100"
                >
                  {e}
                </button>
              ))}
            </div>
          </>
        )}

        <textarea
          ref={textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={Math.min(6, Math.max(1, text.split("\n").length))}
          placeholder={file ? "Ajouter une légende…" : "Écris un message…"}
          className="min-h-10 flex-1 resize-none rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
        />
        <button
          onClick={onDraft}
          disabled={busy}
          className="h-10 rounded-xl border border-zinc-300 px-3 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {drafting ? "L'IA écrit…" : "Générer une réponse"}
        </button>
        {canSend ? (
          <button
            onClick={send}
            disabled={busy}
            aria-label="Envoyer"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            <SendIcon />
          </button>
        ) : (
          <button
            onClick={recorder.start}
            disabled={busy}
            aria-label="Enregistrer un vocal"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-zinc-400">
        Entrée pour envoyer, Maj+Entrée pour aller à la ligne. Répondre à la main met l&apos;IA en pause ici.
      </p>
    </div>
  );
}

/** Enregistre un vocal avec le micro du navigateur. */
function useVoiceRecorder() {
  const [state, setState] = useState<"idle" | "starting" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const media = useRef<{ rec: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null>(null);

  useEffect(() => {
    if (state !== "recording") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  // Coupe le micro si on quitte la discussion pendant un enregistrement.
  useEffect(() => () => media.current?.stream.getTracks().forEach((t) => t.stop()), []);

  async function start() {
    setError(null);
    setSeconds(0);
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start();
      media.current = { rec, chunks, stream };
      setState("recording");
    } catch {
      setError("Impossible d'accéder au micro. Autorise-le dans le navigateur.");
      setState("idle");
    }
  }

  function finish(): Promise<Blob | null> {
    const m = media.current;
    media.current = null;
    setState("idle");
    if (!m) return Promise.resolve(null);
    return new Promise((resolve) => {
      m.rec.onstop = () => {
        m.stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(m.chunks, { type: m.rec.mimeType }));
      };
      m.rec.stop();
    });
  }

  async function stop(): Promise<File | null> {
    const blob = await finish();
    if (!blob?.size) return null;
    const ext = blob.type.includes("ogg") ? "ogg" : "webm";
    return new File([blob], `vocal.${ext}`, { type: blob.type });
  }

  return { state, seconds, error, start, stop, cancel: () => void finish() };
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3.4 20.4l17.4-7.5a1 1 0 0 0 0-1.8L3.4 3.6a1 1 0 0 0-1.4 1.1L4 11l9 1-9 1-2 6.3a1 1 0 0 0 1.4 1.1z" />
    </svg>
  );
}

const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const formatSize = (b: number) =>
  b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`;
