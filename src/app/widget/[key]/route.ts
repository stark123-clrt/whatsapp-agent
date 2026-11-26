import type { NextRequest } from "next/server";
import { getWidgetByKey } from "@/lib/widget";
import { LAUNCHER_ICONS, RADIUS } from "@/lib/widget-settings";

/**
 * Script à coller sur un site : <script src="https://…/widget/CLÉ" defer></script>
 * Il affiche le bouton de lancement, la bulle proactive et ouvre le chat (iframe isolée du site).
 */

/** Adresse publique de l'appli (derrière Coolify/Traefik, l'adresse interne n'est pas la bonne). */
function publicOrigin(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest, ctx: RouteContext<"/widget/[key]">) {
  const key = (await ctx.params).key.replace(/\.js$/, "");
  const widget = getWidgetByKey(key);
  if (!widget) {
    return new Response("/* Widget introuvable */", { status: 404, headers: { "Content-Type": "application/javascript; charset=utf-8" } });
  }
  const s = widget.settings;
  const config = {
    key,
    origin: publicOrigin(req),
    brand: s.colors.brand,
    brandText: s.colors.brandText,
    position: s.position,
    offsetX: s.offsetX,
    offsetY: s.offsetY,
    icon: LAUNCHER_ICONS[s.launcherIcon],
    radius: RADIUS[s.corners],
    sound: s.sound,
    proactive: s.proactive,
    newVisitorsOnly: s.newVisitorsOnly,
    include: s.includePaths,
    exclude: s.excludePaths,
    allowed: s.allowedDomains,
    name: s.name,
    logo: s.logo ? `${publicOrigin(req)}/api/public/widget/${key}/logo` : null,
  };
  return new Response(`(${loader.toString()})(${JSON.stringify(config)});`, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=120",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

type LoaderConfig = {
  key: string;
  origin: string;
  brand: string;
  brandText: string;
  position: "bottom-right" | "bottom-left";
  offsetX: number;
  offsetY: number;
  icon: string;
  radius: { panel: number; bubble: number; button: number };
  sound: boolean;
  proactive: { enabled: boolean; message: string; accept: string; refuse: string; delay: number };
  newVisitorsOnly: boolean;
  include: string[];
  exclude: string[];
  allowed: string[];
  name: string;
  logo: string | null;
};

/* Ce code s'exécute sur le site du client (pas dans l'appli) : JavaScript simple, sans dépendance. */
function loader(c: LoaderConfig) {
  const w = window as unknown as Record<string, unknown>;
  if (w.__agentWidget) return;
  w.__agentWidget = true;

  const script = document.currentScript as HTMLScriptElement | null;
  const agent = script?.getAttribute("data-agent") ?? "";
  const path = location.pathname;
  if (c.include.length && !c.include.some((p) => path.includes(p))) return;
  if (c.exclude.some((p) => path.includes(p))) return;

  const store = {
    get: (k: string) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k: string, v: string) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* navigation privée : on continue sans mémoire */
      }
    },
  };
  const chattedKey = `aw_chatted_${c.key}`;
  if (c.newVisitorsOnly && store.get(chattedKey)) return;
  let vid = store.get(`aw_vid_${c.key}`);
  if (!vid) {
    const a = new Uint8Array(18);
    crypto.getRandomValues(a);
    vid = Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62]).join("");
    store.set(`aw_vid_${c.key}`, vid);
  }

  const side = c.position === "bottom-left" ? "left" : "right";
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;z-index:2147483000;bottom:0;" + side + ":0;width:0;height:0;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
  <style>
    :host{all:initial}
    *{box-sizing:border-box;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    .btn{position:fixed;${side}:${c.offsetX}px;bottom:${c.offsetY}px;width:60px;height:60px;border-radius:${c.radius.button}px;border:0;cursor:pointer;
      background:${c.brand};color:${c.brandText};display:flex;align-items:center;justify-content:center;
      box-shadow:0 10px 30px -8px rgba(0,0,0,.35),0 4px 10px rgba(0,0,0,.12);transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .2s}
    .btn:hover{transform:scale(1.07)}
    .btn svg{width:28px;height:28px;transition:transform .3s,opacity .2s}
    .btn .x{position:absolute;opacity:0;transform:rotate(-90deg) scale(.6)}
    .open .btn .ico{opacity:0;transform:rotate(90deg) scale(.6)}
    .open .btn .x{opacity:1;transform:none}
    .pulse::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:0 0 0 0 ${c.brand};animation:p 2s infinite}
    @keyframes p{0%{box-shadow:0 0 0 0 ${c.brand}99}70%{box-shadow:0 0 0 16px ${c.brand}00}100%{box-shadow:0 0 0 0 ${c.brand}00}}
    .badge{position:absolute;top:-4px;${side === "right" ? "right" : "left"}:-4px;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#ef4444;color:#fff;
      font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center;border:2px solid #fff}
    .panel{position:fixed;${side}:${c.offsetX}px;bottom:${c.offsetY + 72}px;width:380px;height:min(620px,calc(100vh - ${c.offsetY + 96}px));
      border-radius:${c.radius.panel}px;overflow:hidden;box-shadow:0 24px 60px -12px rgba(0,0,0,.35);background:#fff;
      opacity:0;transform:translateY(16px) scale(.96);transform-origin:bottom ${side};pointer-events:none;transition:opacity .22s ease,transform .3s cubic-bezier(.34,1.56,.64,1)}
    .open .panel{opacity:1;transform:none;pointer-events:auto}
    .panel iframe{width:100%;height:100%;border:0;display:block}
    .nudge{position:fixed;${side}:${c.offsetX}px;bottom:${c.offsetY + 76}px;max-width:300px;background:#fff;color:#1f2937;border-radius:${Math.min(c.radius.panel, 16)}px;
      padding:14px 16px 12px;box-shadow:0 16px 40px -10px rgba(0,0,0,.3);font-size:14px;line-height:1.45;opacity:0;transform:translateY(10px);
      transition:opacity .3s,transform .4s cubic-bezier(.34,1.56,.64,1);pointer-events:none}
    .nudge.show{opacity:1;transform:none;pointer-events:auto}
    .nudge .who{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;margin-bottom:6px}
    .nudge .av{width:26px;height:26px;border-radius:50%;background:${c.brand};color:${c.brandText};display:flex;align-items:center;justify-content:center;font-size:12px;overflow:hidden}
    .nudge .av img{width:100%;height:100%;object-fit:cover}
    .nudge .row{display:flex;gap:8px;margin-top:10px}
    .nudge button{border:0;border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer}
    .nudge .yes{background:${c.brand};color:${c.brandText}}
    .nudge .no{background:#f3f4f6;color:#4b5563}
    @media (max-width:480px){
      .panel{${side}:0;bottom:0;width:100vw;height:100dvh;border-radius:0}
      .open .btn{display:none}
    }
  </style>
  <div class="wrap">
    <div class="panel" role="dialog" aria-label="${c.name.replace(/"/g, "")}"></div>
    <div class="nudge" role="status"></div>
    <button class="btn" aria-label="Ouvrir le chat">
      <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${c.icon}"/></svg>
      <svg class="x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      <span class="badge"></span>
    </button>
  </div>`;
  document.body.appendChild(host);

  const wrap = root.querySelector(".wrap") as HTMLElement;
  const btn = root.querySelector(".btn") as HTMLButtonElement;
  const panel = root.querySelector(".panel") as HTMLElement;
  const badge = root.querySelector(".badge") as HTMLElement;
  const nudge = root.querySelector(".nudge") as HTMLElement;
  let frame: HTMLIFrameElement | null = null;
  let isOpen = false;

  const send = (msg: Record<string, unknown>) => frame?.contentWindow?.postMessage({ source: "agent-widget", ...msg }, c.origin);

  function ensureFrame() {
    if (frame) return;
    frame = document.createElement("iframe");
    frame.title = c.name;
    frame.allow = "clipboard-write";
    const q = new URLSearchParams({ vid: vid!, host: location.hostname, lang: navigator.language || "fr", page: location.href.slice(0, 300) });
    if (agent) q.set("agent", agent);
    frame.src = `${c.origin}/w/${c.key}?${q.toString()}`;
    panel.appendChild(frame);
  }

  function setOpen(v: boolean) {
    isOpen = v;
    wrap.classList.toggle("open", v);
    btn.setAttribute("aria-label", v ? "Fermer le chat" : "Ouvrir le chat");
    btn.classList.remove("pulse");
    hideNudge();
    if (v) {
      ensureFrame();
      badge.style.display = "none";
      store.set(chattedKey, "1");
    }
    send({ type: "visibility", open: v });
  }

  btn.addEventListener("click", () => setOpen(!isOpen));

  function hideNudge() {
    nudge.classList.remove("show");
  }

  // Petit son discret (pas de fichier à charger).
  function ding() {
    if (!c.sound) return;
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.36);
    } catch {
      /* pas de son disponible */
    }
  }

  window.addEventListener("message", (e) => {
    if (e.origin !== c.origin || !e.data || e.data.source !== "agent-widget") return;
    if (e.data.type === "ready") send({ type: "visibility", open: isOpen });
    if (e.data.type === "close") setOpen(false);
    if (e.data.type === "unread" && !isOpen && e.data.count > 0) {
      badge.textContent = String(Math.min(99, e.data.count));
      badge.style.display = "flex";
      ding();
    }
  });

  // Visiteur qui a déjà discuté : on prépare le chat en arrière-plan pour signaler les nouvelles réponses.
  if (store.get(chattedKey)) ensureFrame();

  // Bulle proactive : une seule fois par visite tant que le visiteur ne l'a pas refusée.
  const dismissedKey = `aw_nudge_${c.key}`;
  if (c.proactive.enabled && !store.get(dismissedKey) && !store.get(chattedKey)) {
    setTimeout(() => {
      if (isOpen) return;
      const initial = (c.name || "?").trim().charAt(0).toUpperCase();
      nudge.innerHTML = `<div class="who"><span class="av">${c.logo ? `<img src="${c.logo}" alt="">` : initial}</span></div><div class="msg"></div>
        <div class="row"><button class="yes"></button><button class="no"></button></div>`;
      (nudge.querySelector(".who") as HTMLElement).append(document.createTextNode(c.name));
      (nudge.querySelector(".msg") as HTMLElement).textContent = c.proactive.message;
      (nudge.querySelector(".yes") as HTMLElement).textContent = c.proactive.accept;
      (nudge.querySelector(".no") as HTMLElement).textContent = c.proactive.refuse;
      (nudge.querySelector(".yes") as HTMLElement).onclick = () => setOpen(true);
      (nudge.querySelector(".no") as HTMLElement).onclick = () => {
        hideNudge();
        store.set(dismissedKey, "1");
      };
      nudge.classList.add("show");
      btn.classList.add("pulse");
    }, Math.max(0, c.proactive.delay) * 1000);
  }
}
