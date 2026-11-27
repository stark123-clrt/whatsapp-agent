import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "./db";

/**
 * Comptes de l'espace de travail (une seule entreprise, plusieurs personnes) :
 * - le premier compte est créé avec le mot de passe d'installation (ADMIN_PASSWORD) et devient administrateur ;
 * - les suivants rejoignent l'espace par invitation (lien), avec le rôle choisi par un administrateur ;
 * - connexion par e-mail + mot de passe, ou avec Google si c'est configuré ;
 * - chaque session est liée au compte : retirer quelqu'un de l'équipe coupe son accès tout de suite.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT,
    google_sub TEXT UNIQUE,
    avatar TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    session_version INTEGER NOT NULL DEFAULT 1,
    alert_email INTEGER NOT NULL DEFAULT 1,
    alert_phone TEXT,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS invites (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE,
    role TEXT NOT NULL DEFAULT 'member',
    invited_by INTEGER,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );
`);

export type Role = "admin" | "member";
export type User = {
  id: number;
  email: string;
  name: string;
  avatar: string | null;
  role: Role;
  hasPassword: boolean;
  google: boolean;
  alertEmail: boolean;
  alertPhone: string | null;
  createdAt: number;
  lastLoginAt: number | null;
};

type Row = {
  id: number;
  email: string;
  name: string;
  password_hash: string | null;
  google_sub: string | null;
  avatar: string | null;
  role: Role;
  session_version: number;
  alert_email: number;
  alert_phone: string | null;
  created_at: number;
  last_login_at: number | null;
};

const toUser = (r: Row): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  avatar: r.avatar,
  role: r.role === "admin" ? "admin" : "member",
  hasPassword: Boolean(r.password_hash),
  google: Boolean(r.google_sub),
  alertEmail: Boolean(r.alert_email),
  alertPhone: r.alert_phone,
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
});

const row = (id: number) => db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as Row | undefined;
const rowByEmail = (email: string) => db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.trim()) as Row | undefined;

export const userCount = () => (db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
export const getUser = (id: number) => {
  const r = row(id);
  return r ? toUser(r) : null;
};
export const listUsers = () => (db.prepare(`SELECT * FROM users ORDER BY role = 'admin' DESC, created_at`).all() as Row[]).map(toUser);
export const sessionVersion = (id: number) => row(id)?.session_version ?? null;

// ---------- Mots de passe ----------

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function checkPassword(pw: string, stored: string | null): Promise<boolean> {
  const [algo, salt, hash] = (stored ?? "").split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(pw, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Le mot de passe doit faire au moins 8 caractères.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Le mot de passe doit contenir au moins une lettre et un chiffre.";
  return null;
}

const cleanEmail = (e: string) => e.trim().toLowerCase();
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ---------- Création, connexion ----------

/** Premier compte de l'espace : protégé par le mot de passe d'installation (ADMIN_PASSWORD). */
export async function createFirstAdmin(input: { email: string; name: string; password: string; setupCode: string }): Promise<User> {
  if (userCount() > 0) throw new Error("L'espace a déjà un administrateur : connecte-toi, ou demande une invitation.");
  if (!setupCodeOk(input.setupCode)) throw new Error("Code d'installation incorrect.");
  return createUser({ email: input.email, name: input.name, password: input.password, role: "admin" });
}

async function createUser(input: { email: string; name: string; password?: string; role: Role; googleSub?: string; avatar?: string | null }): Promise<User> {
  const email = cleanEmail(input.email);
  if (!emailOk(email)) throw new Error("Adresse e-mail invalide.");
  if (rowByEmail(email)) throw new Error("Un compte existe déjà avec cette adresse.");
  const name = input.name.trim().slice(0, 80) || email.split("@")[0];
  let hash: string | null = null;
  if (input.password !== undefined) {
    const problem = passwordProblem(input.password);
    if (problem) throw new Error(problem);
    hash = await hashPassword(input.password);
  }
  const r = db
    .prepare(`INSERT INTO users (email, name, password_hash, google_sub, avatar, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(email, name, hash, input.googleSub ?? null, input.avatar ?? null, input.role, Date.now());
  return getUser(Number(r.lastInsertRowid))!;
}

export async function loginWithPassword(email: string, password: string): Promise<User | null> {
  const r = rowByEmail(cleanEmail(email));
  if (!r || !(await checkPassword(password, r.password_hash))) return null;
  db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(Date.now(), r.id);
  return toUser(r);
}

/** Code d'installation valide ? (sert au premier compte, par e-mail ou par Google). */
export function setupCodeOk(code: string) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  return !expected || code === expected;
}

/** Premier compte de l'espace créé avec Google (le code d'installation a été vérifié avant d'aller chez Google). */
export async function createFirstAdminGoogle(p: { sub: string; email: string; name: string; picture: string | null }): Promise<User> {
  if (userCount() > 0) throw new Error("L'espace a déjà un administrateur : connecte-toi avec ton compte.");
  return createUser({ email: p.email, name: p.name, role: "admin", googleSub: p.sub, avatar: p.picture });
}

/** Connexion Google : compte existant (même adresse), ou invitation en attente pour cette adresse. */
export async function loginWithGoogle(p: { sub: string; email: string; name: string; picture: string | null }): Promise<User> {
  const email = cleanEmail(p.email);
  const bySub = db.prepare(`SELECT * FROM users WHERE google_sub = ?`).get(p.sub) as Row | undefined;
  const existing = bySub ?? rowByEmail(email);
  if (existing) {
    db.prepare(`UPDATE users SET google_sub = ?, avatar = COALESCE(avatar, ?), last_login_at = ? WHERE id = ?`).run(p.sub, p.picture, Date.now(), existing.id);
    return getUser(existing.id)!;
  }
  const invite = db.prepare(`SELECT * FROM invites WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1`).get(email, Date.now()) as InviteRow | undefined;
  if (!invite) throw new Error("Aucun compte pour cette adresse Google. Demande une invitation à l'administrateur de l'espace.");
  const user = await createUser({ email, name: p.name, role: invite.role, googleSub: p.sub, avatar: p.picture });
  db.prepare(`UPDATE invites SET used_at = ? WHERE token = ?`).run(Date.now(), invite.token);
  return user;
}

// ---------- Invitations ----------

type InviteRow = { token: string; email: string; role: Role; invited_by: number | null; created_at: number; expires_at: number; used_at: number | null };
export type Invite = { token: string; email: string; role: Role; createdAt: number; expiresAt: number };

export function createInvite(email: string, role: Role, by: number): Invite {
  const e = cleanEmail(email);
  if (!emailOk(e)) throw new Error("Adresse e-mail invalide.");
  if (rowByEmail(e)) throw new Error("Cette personne a déjà un compte.");
  const token = randomBytes(24).toString("base64url");
  const now = Date.now();
  db.prepare(`DELETE FROM invites WHERE email = ? AND used_at IS NULL`).run(e);
  db.prepare(`INSERT INTO invites (token, email, role, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`).run(token, e, role, by, now, now + 7 * 86_400_000);
  return { token, email: e, role, createdAt: now, expiresAt: now + 7 * 86_400_000 };
}

export function pendingInvites(): Invite[] {
  return (db.prepare(`SELECT * FROM invites WHERE used_at IS NULL AND expires_at > ? ORDER BY created_at DESC`).all(Date.now()) as InviteRow[]).map((r) => ({
    token: r.token,
    email: r.email,
    role: r.role,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}

export function getInvite(token: string): Invite | null {
  const r = db.prepare(`SELECT * FROM invites WHERE token = ? AND used_at IS NULL AND expires_at > ?`).get(token, Date.now()) as InviteRow | undefined;
  return r ? { token: r.token, email: r.email, role: r.role, createdAt: r.created_at, expiresAt: r.expires_at } : null;
}

export const revokeInvite = (token: string) => db.prepare(`DELETE FROM invites WHERE token = ?`).run(token);

export async function acceptInvite(token: string, input: { name: string; password: string }): Promise<User> {
  const inv = getInvite(token);
  if (!inv) throw new Error("Invitation expirée ou déjà utilisée.");
  const user = await createUser({ email: inv.email, name: input.name, password: input.password, role: inv.role });
  db.prepare(`UPDATE invites SET used_at = ? WHERE token = ?`).run(Date.now(), token);
  return user;
}

// ---------- Profil, équipe ----------

export async function updateProfile(id: number, p: { name?: string; alertEmail?: boolean; alertPhone?: string | null; password?: { current?: string; next: string } }): Promise<User> {
  const r = row(id);
  if (!r) throw new Error("Compte introuvable.");
  if (p.name !== undefined) db.prepare(`UPDATE users SET name = ? WHERE id = ?`).run(p.name.trim().slice(0, 80) || r.name, id);
  if (p.alertEmail !== undefined) db.prepare(`UPDATE users SET alert_email = ? WHERE id = ?`).run(p.alertEmail ? 1 : 0, id);
  if (p.alertPhone !== undefined) {
    const digits = (p.alertPhone ?? "").replace(/\D/g, "");
    db.prepare(`UPDATE users SET alert_phone = ? WHERE id = ?`).run(digits.length >= 8 ? digits : null, id);
  }
  if (p.password) {
    if (r.password_hash && !(await checkPassword(p.password.current ?? "", r.password_hash))) throw new Error("Mot de passe actuel incorrect.");
    const problem = passwordProblem(p.password.next);
    if (problem) throw new Error(problem);
    // Nouveau mot de passe : les autres sessions ouvertes sont déconnectées.
    db.prepare(`UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?`).run(await hashPassword(p.password.next), id);
  }
  return getUser(id)!;
}

const adminCount = () => (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).get() as { n: number }).n;

export function setRole(id: number, role: Role) {
  const r = row(id);
  if (!r) throw new Error("Compte introuvable.");
  if (r.role === "admin" && role !== "admin" && adminCount() <= 1) throw new Error("Il faut au moins un administrateur dans l'espace.");
  db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, id);
}

/** Retire quelqu'un de l'équipe : son accès est coupé immédiatement (ses messages restent dans les discussions). */
export function removeUser(id: number) {
  const r = row(id);
  if (!r) return;
  if (r.role === "admin" && adminCount() <= 1) throw new Error("Impossible de retirer le dernier administrateur.");
  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
}

export const alertRecipients = () => listUsers().filter((u) => u.alertEmail || u.alertPhone);
