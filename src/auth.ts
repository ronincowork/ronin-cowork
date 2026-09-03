import { createHmac, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { credentialMtime, readCredential, readCredentialSync, writeCredential } from './credential-store.js';

const scryptAsync = (pw: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(pw, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );

export interface AuthRecord {
  salt: string; // base64
  hash: string; // base64
  N: number;
  r: number;
  p: number;
  keylen: number;
  secret: string; // base64 — signs session tokens; rotated on every password change
}

const PARAMS = { N: 1 << 15, r: 8, p: 1, keylen: 32 } as const;

export async function makeRecord(password: string): Promise<AuthRecord> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, PARAMS.keylen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: 128 * PARAMS.N * PARAMS.r * 2,
  });
  return {
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
    ...PARAMS,
    secret: randomBytes(32).toString('base64'),
  };
}

export async function verifyRecord(rec: Omit<AuthRecord, 'secret'>, password: string): Promise<boolean> {
  try {
    const hash = await scryptAsync(password, Buffer.from(rec.salt, 'base64'), rec.keylen, {
      N: rec.N,
      r: rec.r,
      p: rec.p,
      maxmem: 128 * rec.N * rec.r * 2,
    });
    const want = Buffer.from(rec.hash, 'base64');
    return hash.length === want.length && timingSafeEqual(hash, want);
  } catch {
    return false;
  }
}

const sign = (secret: string, exp: number): string =>
  createHmac('sha256', Buffer.from(secret, 'base64')).update(String(exp)).digest('base64url');

export function makeToken(secret: string, ttlMs: number, now = Date.now()): string {
  const exp = now + ttlMs;
  return `${exp}.${sign(secret, exp)}`;
}

export function checkToken(secret: string, token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp <= now) return false;
  const got = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(secret, exp));
  return got.length === want.length && timingSafeEqual(got, want);
}

export const COOKIE = 'ronin_session';
export function cookieToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let cached: { rec: AuthRecord | null; mtime: number } | null = null;
export function authRecord(): AuthRecord | null {
  let mtime = 0;
  try {
    mtime = credentialMtime('auth');
  } catch {
  }
  if (cached && cached.mtime === mtime) return cached.rec;
  let rec: AuthRecord | null = null;
  try {
    const a = readCredentialSync<Partial<AuthRecord> | null>('auth', null) ?? undefined;
    if (a && typeof a.salt === 'string' && typeof a.hash === 'string' && typeof a.secret === 'string') {
      rec = a as AuthRecord;
    }
  } catch {
    rec = null;
  }
  cached = { rec, mtime };
  return rec;
}

export const passwordAuthEnabled = (): boolean => authRecord() !== null;

export async function setPassword(password: string): Promise<void> {
  const rec = await makeRecord(password);
  await writeCredential('auth', rec);
  cached = null;
}

export async function clearPassword(): Promise<void> {
  await writeCredential('auth', null);
  cached = null;
}

export async function authStatus(): Promise<{ set: boolean }> {
  const a = await readCredential<Record<string, unknown>>('auth', {});
  return { set: typeof a.hash === 'string' };
}

const failures = new Map<string, { n: number; resetAt: number }>();
export function loginAllowed(addr: string, now = Date.now()): boolean {
  const f = failures.get(addr);
  if (!f || now > f.resetAt) return true;
  return f.n < 5;
}
export function loginFailed(addr: string, now = Date.now()): void {
  const f = failures.get(addr);
  if (!f || now > f.resetAt) failures.set(addr, { n: 1, resetAt: now + 60_000 });
  else f.n += 1;
}
export function loginSucceeded(addr: string): void {
  failures.delete(addr);
}
