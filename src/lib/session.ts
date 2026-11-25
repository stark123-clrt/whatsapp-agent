/**
 * Session administrateur : cookie signé (HMAC-SHA256), sans base de données.
 * Fonctionne partout (proxy et routes) grâce à Web Crypto.
 * Si ADMIN_PASSWORD n'est pas défini (développement sur ton PC), l'appli reste ouverte.
 */

export const SESSION_COOKIE = "session";
export const SESSION_DAYS = 30;

export const authEnabled = () => Boolean(process.env.ADMIN_PASSWORD);

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

export async function createSession(): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  return `${exp}.${await hmac(String(exp))}`;
}

export async function verifySession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(exp));
}
