import { NextResponse, type NextRequest } from "next/server";
import { authEnabled, readSession, SESSION_COOKIE } from "./lib/session";
import { sessionVersion } from "./lib/users";

/**
 * Protège toute l'appli : sans session valide d'un compte de l'équipe, les pages renvoient vers /login
 * et les API répondent 401. Un compte retiré ou dont le mot de passe a changé perd l'accès aussitôt.
 */
// Publics : connexion, invitation, widget de site web (script, iframe, API visiteurs), logo, santé.
const PUBLIC = [
  /^\/login$/,
  /^\/invitation\//,
  /^\/brand\//,
  /^\/(icon|apple-icon)\.png$/,
  /^\/api\/auth\//,
  /^\/api\/health$/,
  /^\/widget\//,
  /^\/w\//,
  /^\/api\/public\//,
];

export async function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  const s = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (s && sessionVersion(s.userId) === s.version) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Tout sauf les fichiers statiques de Next.js et l'icône.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
