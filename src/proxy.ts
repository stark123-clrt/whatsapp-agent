import { NextResponse, type NextRequest } from "next/server";
import { authEnabled, SESSION_COOKIE, verifySession } from "./lib/session";

/**
 * Protège toute l'appli : sans session valide, les pages renvoient vers /login
 * et les API répondent 401. Seules la page de connexion et le test de santé sont publics.
 */
// Widget de site web : script, page du chat (iframe) et API visiteurs sont publics.
const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/api\/health$/, /^\/widget\//, /^\/w\//, /^\/api\/public\//];

export async function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (await verifySession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

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
