/**
 * Sessions : cookie signé (HMAC-SHA256) qui contient le compte connecté et la « version » de sa session.
 * Changer de mot de passe ou retirer quelqu'un de l'équipe invalide ses sessions (vérifié par le proxy).
 * Si ADMIN_PASSWORD n'est pas défini (développement sur ton PC) et qu'aucun compte n'existe, l'appli reste ouverte.
 */

export const SESSION_COOKIE = "session";
export const SESSION_DAYS = 30;

// En production, la connexion est TOUJOURS exigée.
export const authEnabled = () => Boolean(process.env.ADMIN_PASSWORD) || process.env.NODE_ENV === "production";

const secret = () => process.env.AUTH_SECRET || `${process.env.ADMIN_PASSWORD ?? ""}::agent-whatsapp`;

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Buffer.from(sig).toString("base64url");
}

/** Comparaison en temps constant (évite de deviner une valeur à partir du temps de réponse). */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function createSession(userId: number, version: number): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const data = `${userId}.${version}.${exp}`;
  return `${data}.${await hmac(data)}`;
}

/** Compte et version de session si le cookie est valide (signature et date), sinon null. */
export async function readSession(value: string | undefined): Promise<{ userId: number; version: number } | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null; // anciennes sessions (mot de passe unique) : reconnexion demandée
  const [uid, ver, exp, sig] = parts;
  if (Number(exp) < Date.now()) return null;
  if (!safeEqual(sig, await hmac(`${uid}.${ver}.${exp}`))) return null;
  return { userId: Number(uid), version: Number(ver) };
}

export function sessionCookie(value: string, secure: boolean, maxAgeDays = SESSION_DAYS) {
  return [`${SESSION_COOKIE}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeDays * 86_400}`, secure ? "Secure" : ""].filter(Boolean).join("; ");
}

export const isSecure = (req: Request) => new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
