import "server-only";

import { cookies } from "next/headers";
import { db } from "./db";
import { createSession, isSecure, readSession, SESSION_COOKIE, sessionCookie } from "./session";
import { getUser, sessionVersion, type User } from "./users";

/** Compte connecté (null si pas de session valide ou compte retiré). */
export async function currentUser(): Promise<User | null> {
  const s = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s || sessionVersion(s.userId) !== s.version) return null;
  return getUser(s.userId);
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new AuthError("Connexion requise", 401);
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") throw new AuthError("Réservé aux administrateurs de l'espace.", 403);
  return u;
}

/** Réponse de connexion : pose le cookie de session du compte. */
export async function loginResponse(req: Request, user: User, body: unknown = { ok: true }) {
  rememberOrigin(req);
  const value = await createSession(user.id, sessionVersion(user.id) ?? 1);
  return Response.json(body, { headers: { "Set-Cookie": sessionCookie(value, isSecure(req)) } });
}

/** Adresse publique de l'appli (pour les liens dans les e-mails et alertes). */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const r = db.prepare(`SELECT value FROM app_settings WHERE key = 'app_origin'`).get() as { value: string } | undefined;
  return r ? JSON.parse(r.value) : "http://localhost:3000";
}

export function originOf(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

function rememberOrigin(req: Request) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    db.prepare(`INSERT INTO app_settings (key, value) VALUES ('app_origin', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(originOf(req)));
  } catch {
    /* sans importance */
  }
}

export function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) return Response.json({ error: err.message }, { status: err.status });
  return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 400 });
}
