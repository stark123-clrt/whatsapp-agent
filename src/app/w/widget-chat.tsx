"use client";

import { Icon as UiIcon } from "@/app/icons";

import { useEffect, useRef, useState } from "react";
import { FONTS, RADIUS, labelsFor, type ActionButton, type WidgetSettings } from "@/lib/widget-settings";

/**
 * Fenêtre de chat du widget.
 *  - mode "live" : page /w/CLÉ, vraie conversation avec l'IA (dans l'iframe du site ou en lien partagé).
 *  - mode "preview" : aperçu en direct dans les réglages (aucun appel réseau, réponses simulées).
 */

export type ChatMessage = {
  id: string;
  from: "visitor" | "agent";
  text: string;
  ts: number;
  pending?: boolean;
  failed?: boolean;
  kind?: "text" | "image" | "file"; // absent = texte
  name?: string; // nom du document
  url?: string; // lien de la photo ou du document
  file?: File; // gardé pour « Réessayer »
};

const MAX_FILE = 10 * 1024 * 1024;
const okType = (f: File) => /^image\/(jpeg|png|webp|gif)$/.test(f.type) || f.type === "application/pdf";

type Props = {
  settings: WidgetSettings;
  mode: "live" | "preview";
  widgetKey?: string;
  logoUrl?: string | null;
  vid?: string | null;
  host?: string;
  lang?: string;
  agent?: string;
  embedded?: boolean;
  previewLead?: boolean;
};

const EMOJIS = ["😀", "😊", "😂", "🥰", "😍", "🤔", "😅", "😉", "🙏", "👍", "👌", "👏", "🙌", "💪", "🔥", "✨", "🎉", "❤️", "💚", "✅", "❌", "⏰", "📍", "📞", "📅", "💬", "👋", "😢", "😮", "🤝", "🚀", "⭐"];

const SAMPLE: ChatMessage[] = [
  { id: "s1", from: "visitor", text: "Bonjour, quels sont vos horaires d'ouverture ?", ts: 0 },
  { id: "s2", from: "agent", text: "Bonjour ! 😊 Nous sommes ouverts du lundi au samedi, de 9h à 19h. Je peux vous aider pour autre chose ?", ts: 0 },
];

/** Clair ou sombre ? (pour choisir des textes lisibles sur le fond du panneau) */
function luminance(hex: string) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return 1;
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function randomId() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62]).join("");
}

/** Ajoute les messages reçus ; remplace l'envoi en cours par sa version enregistrée. */
function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]) {
  const next = [...prev];
  const ids = new Set(prev.map((m) => m.id));
  for (const m of incoming) {
    if (ids.has(m.id)) continue;
    const kind = m.kind ?? "text";
    const pending =
      m.from === "visitor" ? next.findIndex((p) => p.pending && (p.kind ?? "text") === kind && (kind !== "text" || p.text === m.text)) : -1;
    if (pending >= 0) next[pending] = m;
    else next.push(m);
  }
  return next.sort((a, b) => a.ts - b.ts);
}

const clock = () => Date.now();

const storage = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* navigation privée */
    }
  },
};

export function WidgetChat(props: Props) {
  const { settings: s, mode, widgetKey = "", host = "", embedded = false } = props;
  const live = mode === "live";
  const t = labelsFor(s.language === "auto" ? (props.lang ?? "fr") : s.language);
  const radius = RADIUS[s.corners];
  const dark = luminance(s.colors.panel) < 0.5;
  const ink = dark ? "#f4f4f5" : "#18181b";
  const muted = dark ? "#a1a1aa" : "#71717a";
  const line = dark ? "rgba(255,255,255,.09)" : "rgba(0,0,0,.07)";
  const field = dark ? "rgba(255,255,255,.06)" : "#f4f4f5";

  const [vid, setVid] = useState<string | null>(props.vid ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>(live ? [] : SAMPLE);
  const [typing, setTyping] = useState(false);
  const [intro, setIntro] = useState(live); // petite animation « écrit… » avant le message d'accueil
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [leadDone, setLeadDone] = useState(!live);
  const [jump, setJump] = useState(false);

  const lastTs = useRef(0);
  const openRef = useRef(true);
  const unread = useRef(0);
  const typingRef = useRef(false);
  const fastUntil = useRef(0);
  const atBottom = useRef(true);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const api = `/api/public/widget/${widgetKey}/messages`;
  const hasVisitorMsg = messages.some((m) => m.from === "visitor");
  const needLead = live ? s.lead.enabled && !leadDone && !hasVisitorMsg : Boolean(props.previewLead && s.lead.enabled);

  // Lien partagé (hors iframe) : identifiant du visiteur et formulaire déjà rempli, gardés dans ce navigateur.
  useEffect(() => {
    if (!live) return;
    const id = setTimeout(() => {
      if (!vid) {
        let v = storage.get(`aw_vid_${widgetKey}`);
        if (!v) {
          v = randomId();
          storage.set(`aw_vid_${widgetKey}`, v);
        }
        setVid(v);
      }
      if (storage.get(`aw_lead_${widgetKey}`)) setLeadDone(true);
    }, 0);
    const end = setTimeout(() => setIntro(false), 900);
    return () => {
      clearTimeout(id);
      clearTimeout(end);
    };
  }, [live, vid, widgetKey]);

  // Dialogue avec le script du site : ouvert / fermé, nouveaux messages non lus.
  useEffect(() => {
    if (!live || !embedded) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || e.data?.source !== "agent-widget") return;
      if (e.data.type === "visibility") {
        openRef.current = Boolean(e.data.open);
        if (openRef.current) {
          unread.current = 0;
          setTimeout(() => input.current?.focus({ preventScroll: true }), 250);
        }
      }
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ source: "agent-widget", type: "ready" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, [live, embedded]);

  // Réception des messages (plus rapide quand l'IA écrit ou juste après un envoi).
  useEffect(() => {
    if (!live || !vid || !widgetKey) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let first = true;
    const tick = async () => {
      try {
        const r = await fetch(`${api}?vid=${encodeURIComponent(vid)}&after=${lastTs.current}`, {
          headers: { "x-widget-host": host || location.hostname },
          cache: "no-store",
        });
        if (r.status === 403) {
          setBlocked(true);
          stop = true;
          return;
        }
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { messages: ChatMessage[]; typing: boolean };
        if (stop) return;
        setOffline(false);
        typingRef.current = d.typing;
        setTyping(d.typing);
        if (d.messages.length) {
          lastTs.current = Math.max(lastTs.current, ...d.messages.map((m) => m.ts));
          setMessages((prev) => mergeMessages(prev, d.messages));
          const fresh = d.messages.filter((m) => m.from === "agent").length;
          if (!first && fresh && !openRef.current) {
            unread.current += fresh;
            window.parent.postMessage({ source: "agent-widget", type: "unread", count: unread.current }, "*");
          }
        }
        first = false;
      } catch {
        if (!stop) setOffline(true);
      } finally {
        if (!stop) {
          const fast = typingRef.current || Date.now() < fastUntil.current;
          timer = setTimeout(tick, fast ? 1200 : openRef.current ? 2500 : 7000);
        }
      }
    };
    timer = setTimeout(tick, 0);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [live, vid, widgetKey, api, host]);

  // Défilement : on suit la conversation, sauf si le visiteur relit plus haut.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (atBottom.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      return;
    }
    const id = setTimeout(() => setJump(true), 0);
    return () => clearTimeout(id);
  }, [messages, typing, intro]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom.current && jump) setJump(false);
  }

  function toBottom() {
    atBottom.current = true;
    setJump(false);
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }

  async function send(raw: string) {
    const text = raw.trim().slice(0, 2000);
    if (!text || blocked) return;
    const temp: ChatMessage = { id: `tmp_${clock()}`, from: "visitor", text, ts: clock(), pending: true };
    atBottom.current = true;
    setMessages((p) => [...p, temp]);
    setDraft("");
    setEmojiOpen(false);
    setNotice(null);

    if (!live) {
      // Aperçu : réponse simulée pour sentir le rythme du widget.
      setTimeout(() => setMessages((p) => p.map((m) => (m.id === temp.id ? { ...m, pending: false } : m))), 300);
      setTimeout(() => setTyping(true), 700);
      setTimeout(() => {
        setTyping(false);
        setMessages((p) => [...p, { id: `a_${clock()}`, from: "agent", text: "Ceci est un aperçu : sur votre site, votre agent IA répondra ici avec vos informations.", ts: 0 }]);
      }, 2200);
      return;
    }

    fastUntil.current = clock() + 45_000;
    try {
      const r = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-widget-host": host || location.hostname },
        body: JSON.stringify({ vid, text, agent: props.agent || undefined }),
      });
      const d = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Envoi impossible.");
      setMessages((p) => p.map((m) => (m.id === temp.id ? { ...m, id: d.id ?? m.id, pending: false } : m)));
      if (embedded) window.parent.postMessage({ source: "agent-widget", type: "chatted" }, "*"); // le site s'en souvient
    } catch (e) {
      setMessages((p) => p.map((m) => (m.id === temp.id ? { ...m, pending: false, failed: true } : m)));
      setNotice(e instanceof Error ? e.message : "Envoi impossible.");
    }
  }

  async function sendFile(file: File) {
    if (blocked || !s.attachments) return;
    setNotice(null);
    if (!okType(file)) return setNotice(t.fileType);
    if (file.size > MAX_FILE) return setNotice(t.fileTooBig);
    const kind = file.type.startsWith("image/") ? "image" : "file";
    const temp: ChatMessage = { id: `tmp_${clock()}`, from: "visitor", text: "", ts: clock(), pending: true, kind, name: file.name, url: URL.createObjectURL(file), file };
    atBottom.current = true;
    setMessages((p) => [...p, temp]);

    if (!live) {
      // Aperçu : réponse simulée.
      setTimeout(() => setMessages((p) => p.map((m) => (m.id === temp.id ? { ...m, pending: false } : m))), 600);
      setTimeout(() => setTyping(true), 900);
      setTimeout(() => {
        setTyping(false);
        const reply = kind === "image" ? "Merci pour la photo ! (Aperçu : votre agent IA la verra et y répondra.)" : "Bien reçu, merci pour le document ! (Aperçu)";
        setMessages((p) => [...p, { id: `a_${clock()}`, from: "agent", text: reply, ts: 0 }]);
      }, 2400);
      return;
    }

    fastUntil.current = clock() + 45_000;
    try {
      const form = new FormData();
      form.append("vid", vid ?? "");
      form.append("file", file);
      const r = await fetch(`/api/public/widget/${widgetKey}/files`, { method: "POST", headers: { "x-widget-host": host || location.hostname }, body: form });
      const d = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Envoi impossible.");
      setMessages((p) => p.map((m) => (m.id === temp.id ? { ...m, id: d.id ?? m.id, pending: false, file: undefined } : m)));
      if (embedded) window.parent.postMessage({ source: "agent-widget", type: "chatted" }, "*"); // le site s'en souvient
    } catch (e) {
      setMessages((p) => p.map((m) => (m.id === temp.id ? { ...m, pending: false, failed: true } : m)));
      setNotice(e instanceof Error ? e.message : "Envoi impossible.");
    }
  }

  function retry(m: ChatMessage) {
    setMessages((p) => p.filter((x) => x.id !== m.id));
    if (m.file) void sendFile(m.file);
    else void send(m.text);
  }

  function close() {
    if (embedded) window.parent.postMessage({ source: "agent-widget", type: "close" }, "*");
  }

  const initial = (s.name || "?").trim().charAt(0).toUpperCase();
  const headerBg =
    s.theme === "mono"
      ? s.colors.brand
      : `linear-gradient(135deg, ${s.colors.brand} 0%, color-mix(in srgb, ${s.colors.brand} 72%, #000) 100%)`;
  const bodyBg =
    s.theme === "glass"
      ? `radial-gradient(120% 55% at 100% 0%, color-mix(in srgb, ${s.colors.brand} 12%, transparent), transparent 70%), ${s.colors.panel}`
      : s.theme === "bloom" || s.theme === "ember"
        ? `radial-gradient(90% 45% at 0% 100%, color-mix(in srgb, ${s.colors.brand} 9%, transparent), transparent 70%), ${s.colors.panel}`
        : s.theme === "midnight"
          ? `radial-gradient(100% 50% at 50% 0%, color-mix(in srgb, ${s.colors.brand} 16%, transparent), transparent 75%), ${s.colors.panel}`
          : s.colors.panel;

  return (
    <div
      className="aw relative flex h-full w-full flex-col overflow-hidden"
      onDragOver={(e) => {
        if (!s.attachments || needLead || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!s.attachments || needLead) return;
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void sendFile(f);
      }}
      style={{ fontFamily: FONTS[s.font], background: bodyBg, color: ink, borderRadius: embedded ? 0 : radius.panel }}
    >
      <style>{`
        .aw ::-webkit-scrollbar{width:6px}.aw ::-webkit-scrollbar-thumb{background:${line};border-radius:3px}
        @keyframes aw-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
        @keyframes aw-dot{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-4px);opacity:1}}
        @keyframes aw-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        .aw-in{animation:aw-in .32s cubic-bezier(.22,1,.36,1) both}
        .aw-up{animation:aw-up .4s cubic-bezier(.22,1,.36,1) both}
        .aw-dot{animation:aw-dot 1.2s infinite}
      `}</style>

      {dragging && (
        <div
          className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 border-2 border-dashed text-sm font-medium"
          style={{ borderRadius: radius.panel, borderColor: s.colors.brand, background: `color-mix(in srgb, ${s.colors.panel} 88%, ${s.colors.brand})`, color: ink }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
          </svg>
          {t.drop}
        </div>
      )}

      {/* En-tête */}
      <header className="relative flex shrink-0 items-center gap-3 px-4 py-3.5" style={{ background: headerBg, color: s.colors.brandText }}>
        <div className="relative shrink-0">
          <div
            className="flex h-10 w-10 items-center justify-center overflow-hidden text-base font-semibold"
            style={{ borderRadius: s.corners === "square" ? 6 : 999, background: "rgba(255,255,255,.18)" }}
          >
            {props.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initial
            )}
          </div>
          <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-emerald-400" style={{ boxShadow: `0 0 0 2px ${s.colors.brand}` }} />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-semibold">{s.name || "Notre équipe"}</p>
          <p className="truncate text-xs opacity-80">{typing ? t.typing.replace(/…$/, "") + "…" : s.subtitle}</p>
        </div>
        {s.actions.slice(0, 3).map((a) => (
          <ActionLink key={a.id} action={a} />
        ))}
        {(embedded || !live) && (
          <button onClick={close} aria-label={t.close} className="rounded-full p-1.5 opacity-80 transition hover:bg-white/15 hover:opacity-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </header>

      {offline && !blocked && (
        <div className="shrink-0 px-4 py-1.5 text-center text-[11px]" style={{ background: dark ? "#3f2a0c" : "#fffbeb", color: dark ? "#fcd34d" : "#92400e" }}>
          Connexion perdue… nouvelle tentative en cours
        </div>
      )}

      {/* Conversation */}
      <div
        ref={scroller}
        onScroll={onScroll}
        // Une photo qui finit de charger agrandit la conversation : on reste en bas.
        onLoadCapture={() => {
          if (atBottom.current) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
        }}
        className="relative min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-4">
        {blocked ? (
          <p className="mt-10 text-center text-sm" style={{ color: muted }}>
            Ce site n&apos;est pas autorisé à utiliser ce chat.
          </p>
        ) : (
          <>
            {intro && !messages.length ? (
              <TypingBubble color={s.colors.botBubble} dot={s.colors.botText} radius={radius.bubble} />
            ) : (
              s.welcome && <Bubble from="agent" text={s.welcome} s={s} radius={radius.bubble} />
            )}

            {messages.map((m, i) => {
              const next = messages[i + 1];
              const last = !next || next.from !== m.from;
              return (
                <div key={m.id} className={last ? "pb-2" : ""}>
                  <Bubble from={m.from} text={m.text} s={s} radius={radius.bubble} pending={m.pending} media={m.kind && m.kind !== "text" ? m : undefined} openLabel={t.open} />
                  {m.failed ? (
                    <button onClick={() => retry(m)} className="mt-1 ml-auto block text-[11px] font-medium text-red-500 hover:underline">
                      Non envoyé · Réessayer
                    </button>
                  ) : (
                    last &&
                    m.ts > 0 && (
                      <p className={`mt-1 text-[10px] ${m.from === "visitor" ? "text-right" : ""}`} style={{ color: muted }}>
                        {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )
                  )}
                </div>
              );
            })}

            {typing && (
              <div className="flex items-center gap-2">
                <TypingBubble color={s.colors.botBubble} dot={s.colors.botText} radius={radius.bubble} />
                {s.activityNote && (
                  <span className="aw-in text-[11px]" style={{ color: muted }}>
                    {t.thinking}
                  </span>
                )}
              </div>
            )}

            {!hasVisitorMsg && !needLead && !intro && s.starters.length > 0 && (
              <div className="flex flex-wrap justify-end gap-1.5 pt-2">
                {s.starters.filter(Boolean).map((q, i) => (
                  <button
                    key={q + i}
                    onClick={() => send(q)}
                    className="aw-up border px-3 py-1.5 text-left text-[13px] transition hover:-translate-y-px"
                    style={{
                      animationDelay: `${120 + i * 70}ms`,
                      borderRadius: radius.bubble,
                      borderColor: `color-mix(in srgb, ${s.colors.brand} 45%, transparent)`,
                      color: dark ? ink : `color-mix(in srgb, ${s.colors.brand} 70%, #000)`,
                      background: `color-mix(in srgb, ${s.colors.brand} 7%, ${s.colors.panel})`,
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {jump && (
        <button
          onClick={toBottom}
          className="aw-up absolute left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium shadow-lg"
          style={{ bottom: needLead ? 300 : 96, background: s.colors.brand, color: s.colors.brandText }}
        >
          ↓ Nouveaux messages
        </button>
      )}

      {/* Formulaire de contact, ou zone de saisie */}
      {!blocked &&
        (needLead ? (
          <LeadForm
            s={s}
            t={t}
            dark={dark}
            ink={ink}
            muted={muted}
            field={field}
            line={line}
            onSubmit={async (lead) => {
              if (!live) return;
              const r = await fetch(api, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-widget-host": host || location.hostname },
                body: JSON.stringify({ vid, lead, agent: props.agent || undefined }),
              }).catch(() => null);
              if (!r?.ok) throw new Error("Envoi impossible, réessayez.");
              storage.set(`aw_lead_${widgetKey}`, "1");
              setLeadDone(true);
              setTimeout(() => input.current?.focus(), 50);
            }}
          />
        ) : (
          <div className="shrink-0 px-3 pt-2 pb-2.5" style={{ borderTop: `1px solid ${line}` }}>
            {notice && <p className="px-1 pb-1.5 text-[11px] text-red-500">{notice}</p>}
            <div className="relative flex items-end gap-1.5 px-2 py-1.5" style={{ background: field, borderRadius: Math.max(radius.bubble, 10) }}>
              {s.emoji && (
                <button
                  onClick={() => setEmojiOpen((v) => !v)}
                  aria-label="Emoji"
                  className="shrink-0 rounded-full p-1.5 transition hover:scale-110"
                  style={{ color: muted }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
                  </svg>
                </button>
              )}
              {s.attachments && (
                <>
                  <button
                    onClick={() => picker.current?.click()}
                    aria-label={t.attach}
                    title={t.attach}
                    className="-ml-1 shrink-0 rounded-full p-1.5 transition hover:scale-110"
                    style={{ color: muted }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
                    </svg>
                  </button>
                  <input
                    ref={picker}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void sendFile(f);
                      e.target.value = "";
                    }}
                  />
                </>
              )}
              <textarea
                ref={input}
                onPaste={(e) => {
                  const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith("image/"));
                  if (f && s.attachments) {
                    e.preventDefault();
                    void sendFile(f);
                  }
                }}
                value={draft}
                rows={1}
                maxLength={2000}
                placeholder={s.placeholder}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                    e.currentTarget.style.height = "auto";
                  }
                }}
                className="max-h-[110px] min-h-[34px] flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-snug outline-none"
                style={{ color: ink }}
              />
              <button
                onClick={() => send(draft)}
                disabled={!draft.trim()}
                aria-label={t.send}
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center transition enabled:hover:scale-105 disabled:opacity-35"
                style={{ background: s.colors.brand, color: s.colors.brandText, borderRadius: radius.button === 999 ? 999 : radius.button }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>

              {emojiOpen && (
                <div
                  className="aw-up absolute bottom-full left-0 mb-2 grid w-[264px] grid-cols-8 gap-0.5 p-2 shadow-xl"
                  style={{ background: dark ? "#1c1c24" : "#fff", border: `1px solid ${line}`, borderRadius: 12 }}
                >
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        setDraft((d) => d + e);
                        input.current?.focus();
                      }}
                      className="rounded-md p-1 text-lg transition hover:scale-125"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {(s.footer.enabled && s.footer.text) || s.poweredBy ? (
              <p className="mt-2 text-center text-[10.5px]" style={{ color: muted }}>
                {s.footer.enabled && s.footer.text ? s.footer.text : null}
                {s.footer.enabled && s.footer.text && s.poweredBy ? " · " : null}
                {s.poweredBy ? <span><UiIcon name="spark" size={11} className="mr-0.5 inline-block align-[-1px]" />{t.poweredBy}</span> : null}
              </p>
            ) : null}
          </div>
        ))}
    </div>
  );
}

function Bubble({
  from,
  text,
  s,
  radius,
  pending,
  media,
  openLabel = "Ouvrir",
}: {
  from: "visitor" | "agent";
  text: string;
  s: WidgetSettings;
  radius: number;
  pending?: boolean;
  media?: ChatMessage;
  openLabel?: string;
}) {
  const mine = from === "visitor";
  const small = Math.min(radius, 5);
  const shape = mine ? `${radius}px ${radius}px ${small}px ${radius}px` : `${radius}px ${radius}px ${radius}px ${small}px`;

  // Photo : vignette cliquable.
  if (media?.kind === "image" && media.url) {
    return (
      <div className={`aw-in flex ${mine ? "justify-end" : "justify-start"}`}>
        <a href={media.url} target="_blank" rel="noopener noreferrer" className="relative block overflow-hidden" style={{ borderRadius: shape }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={media.url} alt={media.name ?? "Photo"} className="block max-h-56 max-w-[220px] object-cover transition-opacity" style={{ opacity: pending ? 0.55 : 1 }} />
          {pending && <Spinner />}
        </a>
      </div>
    );
  }

  // Document PDF : carte avec le nom du fichier.
  if (media?.kind === "file") {
    return (
      <div className={`aw-in flex ${mine ? "justify-end" : "justify-start"}`}>
        <a
          href={pending ? undefined : media.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block max-w-[82%] transition hover:brightness-105"
          style={{ background: mine ? s.colors.brand : s.colors.botBubble, color: mine ? s.colors.brandText : s.colors.botText, borderRadius: shape }}
        >
          <span className="flex items-center gap-3 px-3 py-2.5">
            <span className="relative flex h-10 w-9 shrink-0 items-center justify-center rounded-md bg-red-500 text-[10px] font-bold text-white">
              PDF
              {pending && <Spinner />}
            </span>
            <span className="min-w-0">
              <span className="block max-w-[170px] truncate text-[13.5px] font-medium">{media.name ?? "Document"}</span>
              <span className="block text-[11px] opacity-70">{pending ? "Envoi…" : `${openLabel} ↗`}</span>
            </span>
          </span>
        </a>
      </div>
    );
  }

  return (
    <div className={`aw-in flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[82%] px-3.5 py-2 text-[14px] leading-relaxed break-words whitespace-pre-wrap transition-opacity"
        style={{
          background: mine ? s.colors.brand : s.colors.botBubble,
          color: mine ? s.colors.brandText : s.colors.botText,
          borderRadius: shape,
          opacity: pending ? 0.65 : 1,
          border: s.theme === "mono" && !mine ? "1px solid rgba(0,0,0,.08)" : undefined,
        }}
      >
        <RichText text={text} />
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="absolute inset-0 flex items-center justify-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
    </span>
  );
}

/** Liens cliquables et **gras** (l'IA écrit parfois en Markdown). */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]]|\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
            {p.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}
          </a>
        ) : /^\*\*.+\*\*$/.test(p) ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : (
          p
        ),
      )}
    </>
  );
}

function TypingBubble({ color, dot, radius }: { color: string; dot: string; radius: number }) {
  return (
    <div className="aw-in inline-flex items-center gap-1 px-3.5 py-3" style={{ background: color, borderRadius: `${radius}px ${radius}px ${radius}px ${Math.min(radius, 5)}px` }}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="aw-dot h-1.5 w-1.5 rounded-full" style={{ background: dot, animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

const ACTION_ICONS: Record<ActionButton["kind"], string> = {
  call: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  email: "M4 6h16v12H4zM4 7l8 6 8-6",
  map: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
};

function ActionLink({ action }: { action: ActionButton }) {
  const v = action.value.trim();
  const href =
    action.kind === "call"
      ? `tel:${v.replace(/[^\d+]/g, "")}`
      : action.kind === "email"
        ? `mailto:${v}`
        : action.kind === "map"
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`
          : /^https?:\/\//.test(v)
            ? v
            : `https://${v}`;
  return (
    <a
      href={href}
      target={action.kind === "call" || action.kind === "email" ? "_top" : "_blank"}
      rel="noopener noreferrer"
      title={action.label}
      aria-label={action.label}
      className="rounded-full p-1.5 opacity-80 transition hover:bg-white/15 hover:opacity-100"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d={ACTION_ICONS[action.kind]} />
      </svg>
    </a>
  );
}

type Lead = { name: string; lastName?: string; email: string; phone?: string };

function LeadForm({
  s,
  t,
  dark,
  ink,
  muted,
  field,
  line,
  onSubmit,
}: {
  s: WidgetSettings;
  t: ReturnType<typeof labelsFor>;
  dark: boolean;
  ink: string;
  muted: string;
  field: string;
  line: string;
  onSubmit: (lead: Lead) => Promise<void>;
}) {
  const [lead, setLead] = useState<Lead>({ name: "", lastName: "", email: "", phone: "" });
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const radius = RADIUS[s.corners];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!lead.name.trim()) return setError(`${t.name} : ${t.required.toLowerCase()}`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email.trim())) return setError(`${t.email} invalide`);
    if (s.lead.phone && (lead.phone ?? "").replace(/\D/g, "").length < 6) return setError(`${t.phone} invalide`);
    if (s.lead.requirePrivacy && !agree) return setError(t.privacy);
    setBusy(true);
    setError(null);
    try {
      await onSubmit(lead);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full px-3 py-2 text-[13.5px] outline-none transition focus:ring-2";
  const style = { background: field, color: ink, borderRadius: Math.min(radius.bubble, 10), "--tw-ring-color": `color-mix(in srgb, ${s.colors.brand} 45%, transparent)` } as React.CSSProperties;

  return (
    <form onSubmit={submit} className="aw-up shrink-0 space-y-2 px-4 pt-3.5 pb-4" style={{ borderTop: `1px solid ${line}`, background: dark ? "rgba(0,0,0,.15)" : "rgba(255,255,255,.7)" }}>
      <div>
        <p className="text-[14px] font-semibold">{s.lead.title}</p>
        {s.lead.subtitle && <p className="mt-0.5 text-[12px] leading-snug" style={{ color: muted }}>{s.lead.subtitle}</p>}
      </div>
      <div className={s.lead.lastName ? "grid grid-cols-2 gap-2" : ""}>
        <input className={input} style={style} placeholder={`${t.name} *`} value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} autoComplete="given-name" />
        {s.lead.lastName && <input className={input} style={style} placeholder={t.lastName} value={lead.lastName} onChange={(e) => setLead({ ...lead, lastName: e.target.value })} autoComplete="family-name" />}
      </div>
      <input className={input} style={style} type="email" placeholder={`${t.email} *`} value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} autoComplete="email" />
      {s.lead.phone && <input className={input} style={style} type="tel" placeholder={`${t.phone} *`} value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} autoComplete="tel" />}
      {s.lead.requirePrivacy && (
        <label className="flex cursor-pointer items-start gap-2 text-[12px] leading-snug" style={{ color: muted }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" style={{ accentColor: s.colors.brand }} />
          <span>
            {s.lead.privacyUrl ? (
              <a href={s.lead.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {t.privacy}
              </a>
            ) : (
              t.privacy
            )}
          </span>
        </label>
      )}
      {error && <p className="text-[11.5px] text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full py-2.5 text-[14px] font-semibold transition hover:brightness-110 disabled:opacity-60"
        style={{ background: s.colors.brand, color: s.colors.brandText, borderRadius: Math.min(radius.bubble, 12) }}
      >
        {busy ? "…" : t.start}
      </button>
    </form>
  );
}
