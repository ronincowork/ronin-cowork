import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from 'node:crypto';
import { readCredential, writeCredential } from './credential-store.js';
import { config } from './machine-settings.js';
import type { AuthRecord } from './auth.js';

export interface PasskeyCredential {
  id: string; // base64url — the credential ID the browser echoes back
  publicKey: string; // base64 — SPKI DER, straight from getPublicKey()
  alg: number; // COSE alg: -7 ES256, -257 RS256, -8 EdDSA
  rpId: string;
  counter: number;
  label: string;
  createdAt: string;
}

export interface PasskeyStore {
  credentials: PasskeyCredential[];
  recovery?: Omit<AuthRecord, 'secret'> & { expiresAt: number };
}

const b64url = (b: Buffer): string => b.toString('base64url');
const fromB64url = (s: string): Buffer => Buffer.from(s, 'base64url');

export function rpIdFromHost(host: string | undefined): { rpId: string } | { why: string } {
  const override = process.env.RONIN_RP_ID?.trim();
  if (override) return { rpId: override.toLowerCase() };
  if (!host) return { why: 'no Host header — cannot tell which name this box was reached by' };
  let name: string;
  try {
    name = new URL(`http://${host}`).hostname.toLowerCase(); // strips the port, unwraps [::1]
  } catch {
    return { why: `unparseable Host header (${host})` };
  }
  if (name === 'localhost') return { rpId: name }; // a secure context by fiat, and a legal RP ID
  if (/^[0-9.]+$/.test(name) || name.includes(':') || /^\[.*\]$/.test(name)) {
    return { why: `reached by IP address (${name}). Passkeys need a domain name — use the tailnet HTTPS URL.` };
  }
  if (!name.includes('.')) return { why: `Host "${name}" is not a domain name` };
  return { rpId: name };
}

let secureUrlCache: { v: string | undefined } | null = null;
export function secureUrl(): string | undefined {
  if (secureUrlCache) return secureUrlCache.v;
  let v: string | undefined;
  try {
    const out = execFileSync('tailscale', ['serve', 'status', '--json'], { encoding: 'utf8', timeout: 3000 });
    const web = JSON.parse(out)?.Web as Record<string, { Handlers?: Record<string, { Proxy?: string }> }> | undefined;
    for (const [hostPort, entry] of Object.entries(web ?? {})) {
      if (Object.values(entry?.Handlers ?? {}).some((h) => h?.Proxy?.endsWith(`:${config.port}`))) {
        v = `https://${hostPort.replace(/:443$/, '')}`;
        break;
      }
    }
  } catch {
  }
  secureUrlCache = { v };
  return v;
}

const challenges = new Map<string, number>();
export function newChallenge(now = Date.now()): string {
  for (const [c, exp] of challenges) if (exp <= now) challenges.delete(c);
  const c = b64url(randomBytes(32));
  challenges.set(c, now + 120_000);
  return c;
}
export function takeChallenge(c: string | undefined, now = Date.now()): boolean {
  if (!c) return false;
  const exp = challenges.get(c);
  if (exp === undefined) return false;
  challenges.delete(c);
  return exp > now;
}

export interface Assertion {
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
}

function checkClientData(
  raw: Buffer,
  want: { type: string; rpId: string },
): { ok: true; challenge: string } | { ok: false; why: string } {
  let d: { type?: unknown; challenge?: unknown; origin?: unknown };
  try {
    d = JSON.parse(raw.toString('utf8')) as typeof d;
  } catch {
    return { ok: false, why: 'clientDataJSON is not JSON' };
  }
  if (d.type !== want.type) return { ok: false, why: `wrong ceremony type (${String(d.type)})` };
  if (typeof d.challenge !== 'string') return { ok: false, why: 'no challenge in clientData' };
  if (typeof d.origin !== 'string') return { ok: false, why: 'no origin in clientData' };
  let o: URL;
  try {
    o = new URL(d.origin);
  } catch {
    return { ok: false, why: 'unparseable origin' };
  }
  const h = o.hostname.toLowerCase();
  if (h !== want.rpId && !h.endsWith(`.${want.rpId}`)) return { ok: false, why: `origin ${h} is not ${want.rpId}` };
  if (o.protocol !== 'https:' && h !== 'localhost') return { ok: false, why: 'origin is not https' };
  return { ok: true, challenge: d.challenge };
}

function verifySignature(alg: number, spki: Buffer, data: Buffer, sig: Buffer): boolean {
  try {
    const key = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    if (alg === -8) return cryptoVerify(null, data, key, sig); // Ed25519 hashes internally
    if (alg === -7 || alg === -257) return cryptoVerify('sha256', data, key, sig);
    return false; // an alg we never offered; refusing beats guessing a digest
  } catch {
    return false;
  }
}

export function verifyAssertion(
  cred: PasskeyCredential,
  a: Assertion,
  expect: { rpId: string; challengeSpent: (c: string) => boolean },
): { ok: true; counter: number } | { ok: false; why: string } {
  const clientDataRaw = fromB64url(a.clientDataJSON);
  const cd = checkClientData(clientDataRaw, { type: 'webauthn.get', rpId: expect.rpId });
  if (!cd.ok) return cd;
  if (!expect.challengeSpent(cd.challenge)) return { ok: false, why: 'challenge unknown, expired or already used' };

  const authData = fromB64url(a.authenticatorData);
  if (authData.length < 37) return { ok: false, why: 'authenticatorData too short' };
  const wantRp = createHash('sha256').update(expect.rpId).digest();
  if (!authData.subarray(0, 32).equals(wantRp)) return { ok: false, why: 'RP ID hash mismatch' };
  const flags = authData[32]!;
  if (!(flags & 0x01)) return { ok: false, why: 'no user presence' };
  if (!(flags & 0x04)) return { ok: false, why: 'no user verification (Touch ID / Face ID did not run)' };
  const counter = authData.readUInt32BE(33);
  if (cred.counter > 0 && counter > 0 && counter <= cred.counter) {
    return { ok: false, why: 'authenticator counter went backwards — possible cloned key' };
  }

  const signed = Buffer.concat([authData, createHash('sha256').update(clientDataRaw).digest()]);
  if (!verifySignature(cred.alg, Buffer.from(cred.publicKey, 'base64'), signed, fromB64url(a.signature))) {
    return { ok: false, why: 'signature did not verify' };
  }
  return { ok: true, counter };
}

export function verifyRegistration(
  clientDataJSON: string,
  expect: { rpId: string; challengeSpent: (c: string) => boolean },
): { ok: true } | { ok: false; why: string } {
  const cd = checkClientData(fromB64url(clientDataJSON), { type: 'webauthn.create', rpId: expect.rpId });
  if (!cd.ok) return cd;
  if (!expect.challengeSpent(cd.challenge)) return { ok: false, why: 'challenge unknown, expired or already used' };
  return { ok: true };
}

export const readPasskeys = (): Promise<PasskeyStore> =>
  readCredential<PasskeyStore>('passkeys', { credentials: [] });

async function editPasskeys(mutate: (s: PasskeyStore) => void): Promise<PasskeyStore> {
  const s = await readPasskeys();
  s.credentials ??= [];
  mutate(s);
  await writeCredential('passkeys', s.credentials.length || s.recovery ? s : null);
  return s;
}

export const addCredential = (c: PasskeyCredential): Promise<PasskeyStore> =>
  editPasskeys((s) => {
    s.credentials = s.credentials.filter((x) => x.id !== c.id); // re-registering a device replaces it
    s.credentials.push(c);
  });

export const removeCredential = (id: string): Promise<PasskeyStore> =>
  editPasskeys((s) => {
    s.credentials = s.credentials.filter((x) => x.id !== id);
  });

export const bumpCounter = (id: string, counter: number): Promise<PasskeyStore> =>
  editPasskeys((s) => {
    const c = s.credentials.find((x) => x.id === id);
    if (c) c.counter = counter;
  });

export const canonicalCode = (s: string): string =>
  s
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/[^0-9A-Z]/g, '');

export const setRecovery = (rec: PasskeyStore['recovery'] | undefined): Promise<PasskeyStore> =>
  editPasskeys((s) => {
    s.recovery = rec;
  });
