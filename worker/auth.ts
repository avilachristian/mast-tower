import type { Context, Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AdminSessionUser, AdminUserRow, Env } from './types';

export const SESSION_COOKIE_NAME = 'mast_admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PBKDF2_ITERATIONS = 100_000;
const MAX_FAILED_LOGIN_ATTEMPTS = 8;
export const MAX_FAILED_IP_ATTEMPTS = 24;
const LOCKOUT_MS = 15 * 60 * 1000;

const seededDbs = new WeakSet<object>();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0) return new Uint8Array(new ArrayBuffer(0));
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  );
  return toHex(new Uint8Array(digest));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(derived))}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 10_000 || iterations > 500_000) {
    return false;
  }
  const salt = fromHex(parts[2]);
  const expected = fromHex(parts[3]);
  if (salt.length === 0 || expected.length === 0) return false;

  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    expected.length * 8
  );
  return timingSafeEqualBytes(new Uint8Array(derived), expected);
}

/**
 * Provisions the initial admin account on first login if admin_users is empty
 * and ADMIN_USERNAME + ADMIN_PASSWORD secrets are configured on the Worker.
 */
export async function ensureSeededAdminUser(env: Env): Promise<void> {
  const dbKey = env.DB as unknown as object;
  if (seededDbs.has(dbKey)) return;

  const username = env.ADMIN_USERNAME?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  if (!username || !password) return;

  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM admin_users'
  ).first<{ cnt: number }>();

  if ((countRow?.cnt ?? 0) > 0) {
    seededDbs.add(dbKey);
    return;
  }

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  const id = `adm-${crypto.randomUUID()}`;
  const displayName = env.ADMIN_DISPLAY_NAME?.trim() || 'Project Admin';

  await env.DB.prepare(
    `INSERT OR IGNORE INTO admin_users (id, username, display_name, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, username, displayName, passwordHash, now, now)
    .run();

  seededDbs.add(dbKey);
}

export async function checkLoginRateLimit(
  env: Env,
  ipKey: string
): Promise<{ allowed: true } | { allowed: false; retryAfterSec: number }> {
  const row = await env.DB.prepare(
    'SELECT attempts, locked_until FROM login_attempts WHERE ip_key = ?'
  )
    .bind(ipKey)
    .first<{ attempts: number; locked_until: string | null }>();

  if (!row?.locked_until) return { allowed: true };
  const lockedMs = Date.parse(row.locked_until);
  if (!Number.isFinite(lockedMs) || lockedMs <= Date.now()) {
    await env.DB.prepare('DELETE FROM login_attempts WHERE ip_key = ?')
      .bind(ipKey)
      .run();
    return { allowed: true };
  }
  return {
    allowed: false,
    retryAfterSec: Math.max(1, Math.ceil((lockedMs - Date.now()) / 1000)),
  };
}

export async function recordFailedLoginAttempt(
  env: Env,
  ipKey: string,
  maxAttempts = MAX_FAILED_LOGIN_ATTEMPTS
): Promise<void> {
  const lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();

  await env.DB.prepare(
    `INSERT INTO login_attempts (ip_key, attempts, locked_until)
     VALUES (?, 1, CASE WHEN 1 >= ? THEN ? ELSE NULL END)
     ON CONFLICT(ip_key) DO UPDATE SET
       attempts = attempts + 1,
       locked_until = CASE WHEN attempts + 1 >= ? THEN ? ELSE locked_until END`
  )
    .bind(ipKey, maxAttempts, lockedUntil, maxAttempts, lockedUntil)
    .run();
}

export async function clearLoginAttempts(env: Env, ipKey: string): Promise<void> {
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip_key = ?')
    .bind(ipKey)
    .run();
}

export async function createAdminSession(
  env: Env,
  userId: string
): Promise<{ token: string; expiresAt: string }> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toBase64Url(tokenBytes);
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?')
    .bind(now)
    .run();

  await env.DB.prepare(
    `INSERT INTO admin_sessions (token_hash, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(tokenHash, userId, expiresAt, now)
    .run();

  return { token, expiresAt };
}

type WorkerContext = Context<{
  Bindings: Env;
  Variables: { adminUser?: AdminSessionUser };
}>;

export async function getSessionUserFromRequest(
  c: WorkerContext
): Promise<AdminSessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, s.expires_at
     FROM admin_sessions s
     JOIN admin_users u ON u.id = s.user_id
     WHERE s.token_hash = ?`
  )
    .bind(tokenHash)
    .first<{
      id: string;
      username: string;
      display_name: string;
      expires_at: string;
    }>();

  if (!row) return null;
  if (row.expires_at <= now) {
    await c.env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?')
      .bind(tokenHash)
      .run();
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
  };
}

export function setSessionCookie(c: WorkerContext, token: string): void {
  const isHttps = new URL(c.req.url).protocol === 'https:';
  setCookie(c, SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isHttps,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function destroySessionFromRequest(
  c: WorkerContext
): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?')
      .bind(tokenHash)
      .run();
  }
  const isHttps = new URL(c.req.url).protocol === 'https:';
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isHttps,
  });
}

export async function authenticateAdminCredentials(
  env: Env,
  usernameRaw: string,
  password: string
): Promise<AdminSessionUser | null> {
  await ensureSeededAdminUser(env);
  const username = usernameRaw.trim().toLowerCase();
  if (!username || !password) return null;

  const user = await env.DB.prepare(
    'SELECT id, username, display_name, password_hash, created_at, updated_at FROM admin_users WHERE LOWER(username) = ?'
  )
    .bind(username)
    .first<AdminUserRow>();

  if (!user) return null;
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
  };
}

export async function requireAdmin(
  c: Context<{ Bindings: Env; Variables: { adminUser?: AdminSessionUser } }>,
  next: Next
) {
  const user = await getSessionUserFromRequest(c);
  if (!user) {
    return c.json(
      {
        error: 'Authentication required. Please sign in to the Admin portal.',
        code: 'UNAUTHORIZED',
      },
      401
    );
  }
  c.set('adminUser', user);
  await next();
}
