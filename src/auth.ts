/**
 * AUTH — the owner's login, beside the tailnet, never instead of it.
 *
 * The standing posture is unchanged: Ronin binds to the tailnet and the tailnet is the
 * wall (src/config.ts assertBindIsSafe). This adds the owner-shaped door for the cases
 * the wall does not cover — a proxy in front, a shared box, a browser that should not
 * hold Basic credentials forever:
 *
 *   password   set with `bin/ronin-passwd`, stored in ronin.json as an scrypt record.
 *              Nothing here invents a user table: one install, one owner, one password.
 *   session    an HttpOnly cookie carrying `<expiry>.<hmac>` signed by a secret that
 *              lives beside the scrypt record. STATELESS on purpose: the operator
 *              restarts on every update, and a session store in memory would log the
 *              owner's phone out each time. Rotating the password rotates the secret,
 *              which revokes every session at once — that is the revocation story,
 *              and for one owner it is the right size.
 *   Basic      stays exactly as it was (GRID_USER/GRID_PASS), for scripts and tools;
 *              a request may satisfy either.
 *
 *   passkey    LANDED 2026-08-17, in src/passkey.ts — the ceremony got its own file, as
 *              this comment always intended, and needed no dependency after all (see
 *              that header for why). It reuses the cookie/session half below UNCHANGED:
 *              a passkey login ends by calling `makeToken` with this same secret, so
 *              rotating the password still revokes everything at once. Registering a
 *              passkey therefore REQUIRES a password record — the secret lives here.
 *
 * The crypto pieces are PURE (record in, verdict out) so tests/auth.test.ts holds them
 * with no live machine; only the two exported *Config functions touch ronin.json.
 */
import { createHmac, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { configPath, readSection, updateAuthSection } from './user-config.js';

// promisify(scrypt)'s type drops the options overload, and the options carry the cost
// parameters — hand-rolled so N/r/p actually reach the KDF.
const scryptAsync = (pw: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(pw, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );

/** The shape ronin.json's `auth` section holds. Params are stored so they can be
 *  raised later without invalidating existing records. */
export interface AuthRecord {
  salt: string; // base64
  hash: string; // base64
  N: number;
  r: number;
  p: number;
  keylen: number;
  secret: string; // base64 — signs session tokens; rotated on every password change
}

/** OWASP-current scrypt cost for interactive login (~50ms on this class of box). */
const PARAMS = { N: 1 << 15, r: 8, p: 1, keylen: 32 } as const;

/* ------------------------------------------------------------------ pure half */

/** Make a fresh record (new salt, new signing secret) from a password. */
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

/** Does this password match this record? Constant-time on the comparison.
 *
 *  Takes `Omit<AuthRecord, 'secret'>` rather than the whole record because verification
 *  genuinely never reads the signing secret — and src/passkey.ts's recovery code is
 *  exactly this scrypt record WITHOUT one (sessions stay signed by the password's
 *  secret, so there is only ever one). Widening the parameter says that in the type
 *  instead of forcing a fake secret through just to satisfy it. */
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

/** A session token: `<expiry-ms>.<hmac(secret, expiry)>`. */
export function makeToken(secret: string, ttlMs: number, now = Date.now()): string {
  const exp = now + ttlMs;
  return `${exp}.${sign(secret, exp)}`;
}

/** Is this token validly signed and unexpired? */
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

/** The one cookie. Parse it out of a raw Cookie header without a dependency. */
export const COOKIE = 'ronin_session';
export function cookieToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Sessions live this long; a login refreshes the clock. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/* ------------------------------------------------- the record, off ronin.json */

/**
 * Read the auth section, cached by the file's mtime: the request path asks on every
 * hit and a stat is the price this can afford, while `ronin-passwd` on a RUNNING
 * operator still applies without a restart.
 */
let cached: { rec: AuthRecord | null; mtime: number } | null = null;
export function authRecord(): AuthRecord | null {
  let mtime = 0;
  try {
    mtime = statSync(configPath()).mtimeMs;
  } catch {
    /* no config file — no password set */
  }
  if (cached && cached.mtime === mtime) return cached.rec;
  let rec: AuthRecord | null = null;
  try {
    const doc = JSON.parse(readFileSync(configPath(), 'utf8')) as Record<string, unknown>;
    const a = doc?.auth as Partial<AuthRecord> | undefined;
    if (a && typeof a.salt === 'string' && typeof a.hash === 'string' && typeof a.secret === 'string') {
      rec = a as AuthRecord;
    }
  } catch {
    rec = null;
  }
  cached = { rec, mtime };
  return rec;
}

/** Is password login configured on this install? */
export const passwordAuthEnabled = (): boolean => authRecord() !== null;

/** Set (or change) the password — `bin/ronin-passwd`'s work. Rotating the secret is
 *  what logs every existing session out, which is what changing a password means. */
export async function setPassword(password: string): Promise<void> {
  const rec = await makeRecord(password);
  await updateAuthSection(rec as unknown as Record<string, unknown>);
  cached = null;
}

/** Remove password login (back to tailnet/Basic only). */
export async function clearPassword(): Promise<void> {
  await updateAuthSection(null);
  cached = null;
}

/** Report for `ronin-passwd` status: set or not, without touching the hash. */
export async function authStatus(): Promise<{ set: boolean }> {
  const a = await readSection<Record<string, unknown>>('auth', {});
  return { set: typeof a.hash === 'string' };
}

/* -------------------------------------------------------------- rate limiting */

/**
 * Login attempts are the one place Ronin faces a guessing game, so they are the one
 * place with a limiter: 5 failures a minute per address, then a minute in the corner.
 * In memory — a restart forgives, which is fine, because the scrypt cost is the real
 * wall and this only keeps the log readable.
 */
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
