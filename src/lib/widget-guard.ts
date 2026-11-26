import type { NextRequest } from "next/server";
import { getWidgetByKey } from "./widget";
import { domainAllowed } from "./widget-settings";

/** Contrôles communs des API publiques du widget : widget existant, site autorisé, anti-spam. */

const g = globalThis as typeof globalThis & { __widgetRate?: Map<string, number[]> };
const rate: Map<string, number[]> = (g.__widgetRate ??= new Map<string, number[]>());

/** true si la limite (par minute) est dépassée. */
export function limited(key: string, max: number) {
  const now = Date.now();
  const list = (rate.get(key) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  rate.set(key, list);
  return list.length > max;
}

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function widgetFor(req: NextRequest, key: string) {
  const widget = getWidgetByKey(key);
  if (!widget) return { error: Response.json({ error: "Widget introuvable" }, { status: 404 }) } as const;
  const host = req.headers.get("x-widget-host") ?? "";
  // Le lien partagé (/w/CLÉ ouvert directement) est servi par l'appli elle-même : toujours autorisé.
  const own = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0];
  if (host !== own && !domainAllowed(host, widget.settings.allowedDomains)) {
    return { error: Response.json({ error: "Ce site n'est pas autorisé à utiliser ce widget." }, { status: 403 }) } as const;
  }
  return { widget } as const;
}
