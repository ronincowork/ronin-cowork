/**
 * PASSKEY — WebAuthn for the owner's Mac and iPhone, beside the password, never instead.
 *
 * src/auth.ts said passkeys were "a dependency and ceremony this file should not
 * half-do." This is the ceremony, in its own file, and it turned out NOT to need the
 * dependency. Both halves of that sentence deserve their reasons recorded.
 *
 * WHY THIS CAN EXIST AT ALL (2026-08-17). WebAuthn is gated on a Secure Context: the
 * browser hides `navigator.credentials` on plain HTTP, and an IP address is not a legal
 * Relying Party ID even if it did. The habit of browsing the box by its bare tailnet IP
 * over HTTP therefore CANNOT run a passkey, and no amount of server code changes that.
 * What makes this buildable is the command setup.sh has printed as step 2 since the
 * beginning:
 *
 *     tailscale serve --bg --https=8443 http://<tailnet-ip>:<port>
 *
 * which terminates a real Let's Encrypt certificate on the box's MagicDNS name. That
 * name — not the IP — is the secure origin and the RP ID. So passkeys work on the
 * `https://<magicdns>:8443` address and are *correctly* invisible on the IP one. The
 * login page says which of the two you are on rather than failing silently, because
 * "the button did nothing" is the worst version of this.
 *
 * WHY NO WEBAUTHN LIBRARY. The only part of WebAuthn that genuinely wants a CBOR parser
 * is the REGISTRATION attestation object. The browser will hand us the same public key
 * already decoded — `response.getPublicKey()` returns SPKI DER, `getPublicKeyAlgorithm()`
 * returns the COSE alg — so registration needs no CBOR and LOGIN never did: an assertion
 * is raw bytes, a JSON blob and a signature. What we give up is attestation, which says
 * *which brand of authenticator* this is. Nobody verifies that for consumer passkeys
 * (SimpleWebAuthn defaults it off too), and for a one-owner box the question is
 * meaningless. Registration also trusts the browser's claimed public key — but
 * registration happens INSIDE an already-authenticated session, so anyone who could lie
 * there could equally register a genuine key of their own. Nothing is lost, and the
 * dependency list stays the deliberate length it is.
 *
 * THE VERIFICATION BELOW IS NOT RELAXED. Login checks challenge, type, origin, RP ID
 * hash, user-presence, user-verification, the clone counter, and the signature. That is
 * the part an attacker touches, and it is done in full.
 *
 * SESSIONS ARE NOT REINVENTED. A passkey login ends by minting the exact same
 * `<expiry>.<hmac>` cookie src/auth.ts already mints, signed by the same secret stored
 * beside the scrypt record. That is why a password record is REQUIRED before a passkey
 * can be registered: the secret lives there, and rotating the password still revokes
 * every session at once, passkey-issued ones included. One revocation story, not two.
 */
import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from 'node:crypto';
import { readSection, updatePasskeysSection } from './user-config.js';
import { config } from './machine-settings.js';
import type { AuthRecord } from './auth.js';

/* ------------------------------------------------------------------ the shapes */

/** One registered authenticator. `rpId` is recorded because a credential is BOUND to
 *  the domain it was made under — reaching the box by another name must say so, not
 *  quietly offer a key the browser will never find. */
export interface PasskeyCredential {
  id: string; // base64url — the credential ID the browser echoes back
  publicKey: string; // base64 — SPKI DER, straight from getPublicKey()
  alg: number; // COSE alg: -7 ES256, -257 RS256, -8 EdDSA
  rpId: string;
  counter: number;
  label: string;
  createdAt: string;
}

/** The `passkeys` section of ronin.json. Deliberately NOT nested inside `auth`:
 *  `setPassword` replaces that whole section, and a password change must not silently
 *  delete the owner's registered devices. */
export interface PasskeyStore {
  credentials: PasskeyCredential[];
  /** A one-shot code minted by `bin/ronin-recovery`. Same scrypt record shape as the
   *  password (no signing secret — sessions are still signed by auth's). */
  recovery?: Omit<AuthRecord, 'secret'> & { expiresAt: number };
}

const b64url = (b: Buffer): string => b.toString('base64url');
const fromB64url = (s: string): Buffer => Buffer.from(s, 'base64url');

/* --------------------------------------------------------------- the RP identity */

/**
 * The Relying Party ID for this request, or a REASON it cannot have one.
 *
 * The RP ID must be a registrable domain that the page's origin belongs to. We take it
 * from the request's own Host header so one build serves every install — this box's
 * MagicDNS name, somebody else's tailnet, a Caddy in front — with no per-machine
 * constant to forget to change. `RONIN_RP_ID` overrides it for the proxy that rewrites
 * Host, which is the one case Host cannot answer for itself.
 *
 * An IP address is rejected on purpose and with a sentence, because it is the shape the
 * owner actually types and "invalid domain" from a browser console is not a fix anyone
 * can act on.
 */
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
  // Bracketless IPv6 arrives from URL() as-is; both families are caught by "no letters".
  if (/^[0-9.]+$/.test(name) || name.includes(':') || /^\[.*\]$/.test(name)) {
    return { why: `reached by IP address (${name}). Passkeys need a domain name — use the tailnet HTTPS URL.` };
  }
  if (!name.includes('.')) return { why: `Host "${name}" is not a domain name` };
  return { rpId: name };
}

/**
 * The HTTPS URL this box is really reachable on, if `tailscale serve` is fronting us.
 *
 * WHY BOTHER. The predictable failure of this whole feature is the owner standing on the
 * plain-HTTP tailnet-IP address where passkeys cannot exist, and the useless version of
 * that moment is a login page saying "passkeys unavailable". `tailscale serve status`
 * already knows the answer exactly — it names the host:port it terminates TLS on — so
 * the page can name the working address and be RIGHT, rather than us hardcoding a port
 * and hoping. Nothing is guessed and nothing is assumed.
 *
 * Only a handler proxying to OUR port counts: a box serving something else on 8443 must
 * not have that URL advertised as the way to reach Ronin.
 *
 * Resolved ONCE and then remembered, same bargain as src/ws/origin.ts: it shells out, a
 * login is not the place to pay that per hit, and changing `tailscale serve` is a
 * restart. LAZY rather than at module load, though, and that is check-tests' rule
 * talking: a unit test imports this file for the pure verifier and must not wake a
 * subprocess to do it. Nothing calls this until a login page actually asks.
 */
let secureUrlCache: { v: string | undefined } | null = null;
export function secureUrl(): string | undefined {
  if (secureUrlCache) return secureUrlCache.v;
  let v: string | undefined;
  try {
    const out = execFileSync('tailscale', ['serve', 'status', '--json'], { encoding: 'utf8', timeout: 3000 });
    const web = JSON.parse(out)?.Web as Record<string, { Handlers?: Record<string, { Proxy?: string }> }> | undefined;
    for (const [hostPort, entry] of Object.entries(web ?? {})) {
      if (Object.values(entry?.Handlers ?? {}).some((h) => h?.Proxy?.endsWith(`:${config.port}`))) {
        // `serve` keys every entry host:port, so the ordinary 443 case arrives as
        // `name:443` — a port a URL never needs to carry and that reads, to anyone
        // shown it, as one more thing to get right. Dropped; every other port stays.
        v = `https://${hostPort.replace(/:443$/, '')}`;
        break;
      }
    }
  } catch {
    /* no tailscale, no serve, or the shape changed — the page simply omits the hint */
  }
  secureUrlCache = { v };
  return v;
}

/* ------------------------------------------------------------- the challenge jar */

/**
 * Challenges: 32 random bytes, single-use, two minutes.
 *
 * In memory and therefore lost on restart, exactly like the login rate limiter above it
 * in src/auth.ts, and for the same reason: the cost of a lost challenge is one retry of
 * a ceremony the owner is standing in front of, while persisting it would buy nothing.
 * The Map is swept on write so an unfinished login cannot leave a crumb behind forever.
 */
const challenges = new Map<string, number>();
export function newChallenge(now = Date.now()): string {
  for (const [c, exp] of challenges) if (exp <= now) challenges.delete(c);
  const c = b64url(randomBytes(32));
  challenges.set(c, now + 120_000);
  return c;
}
/** Spend a challenge. Returns false if it was never issued, already used, or stale —
 *  the single-use property is what stops a captured assertion being replayed. */
export function takeChallenge(c: string | undefined, now = Date.now()): boolean {
  if (!c) return false;
  const exp = challenges.get(c);
  if (exp === undefined) return false;
  challenges.delete(c);
  return exp > now;
}

/* ------------------------------------------------------- the pure verifying half */

/** What the browser collected. All fields base64url, as the client encoded them. */
export interface Assertion {
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
}

/** `clientDataJSON` is the browser's own account of what it was asked to do. Checking it
 *  is what ties a signature to THIS site and THIS login rather than any other. */
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
  // The origin must BE the RP ID (or a subdomain of it), and must be a secure context —
  // the same two conditions the browser enforced before signing. We re-check because a
  // browser is not the only thing that can POST to this route.
  const h = o.hostname.toLowerCase();
  if (h !== want.rpId && !h.endsWith(`.${want.rpId}`)) return { ok: false, why: `origin ${h} is not ${want.rpId}` };
  if (o.protocol !== 'https:' && h !== 'localhost') return { ok: false, why: 'origin is not https' };
  return { ok: true, challenge: d.challenge };
}

/** COSE alg → how node verifies it. ES256 signatures arrive DER-encoded, which is
 *  node's default `dsaEncoding`, so the mapping is only about the digest. */
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

/**
 * The whole login check, pure: credential + assertion in, verdict out, no clock or file
 * touched beyond the `now` you pass. tests/ can hold this with no live machine, which is
 * the same bargain src/auth.ts struck for scrypt.
 *
 * `counter` is the anti-clone signal: an authenticator that increments must never
 * repeat. Syncing passkeys (iCloud Keychain, the exact thing the owner's Mac and iPhone
 * use) legitimately report 0 forever, so a 0 counter means "this authenticator does not
 * play that game" and is not evidence of anything. A NON-zero counter that fails to
 * advance is, and is refused.
 */
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
  // Bytes 0..31 are SHA-256(rpId): the authenticator's own statement of which site it
  // signed for, which a hostile page cannot forge because it never gets the key.
  const wantRp = createHash('sha256').update(expect.rpId).digest();
  if (!authData.subarray(0, 32).equals(wantRp)) return { ok: false, why: 'RP ID hash mismatch' };
  const flags = authData[32]!;
  if (!(flags & 0x01)) return { ok: false, why: 'no user presence' };
  // UV is required because we ASK for it (userVerification: 'required'); on the owner's
  // devices that is Touch ID or Face ID, which is the entire point of choosing a passkey
  // over a password. Accepting an unverified assertion would quietly downgrade that.
  if (!(flags & 0x04)) return { ok: false, why: 'no user verification (Touch ID / Face ID did not run)' };
  const counter = authData.readUInt32BE(33);
  if (cred.counter > 0 && counter > 0 && counter <= cred.counter) {
    return { ok: false, why: 'authenticator counter went backwards — possible cloned key' };
  }

  // The signed message is exactly authenticatorData || SHA-256(clientDataJSON).
  const signed = Buffer.concat([authData, createHash('sha256').update(clientDataRaw).digest()]);
  if (!verifySignature(cred.alg, Buffer.from(cred.publicKey, 'base64'), signed, fromB64url(a.signature))) {
    return { ok: false, why: 'signature did not verify' };
  }
  return { ok: true, counter };
}

/** Registration's half of the same check. The key itself is taken on trust (see the
 *  header); what is verified is that this ceremony answered OUR challenge on OUR origin,
 *  so a registration cannot be replayed in from somewhere else. */
export function verifyRegistration(
  clientDataJSON: string,
  expect: { rpId: string; challengeSpent: (c: string) => boolean },
): { ok: true } | { ok: false; why: string } {
  const cd = checkClientData(fromB64url(clientDataJSON), { type: 'webauthn.create', rpId: expect.rpId });
  if (!cd.ok) return cd;
  if (!expect.challengeSpent(cd.challenge)) return { ok: false, why: 'challenge unknown, expired or already used' };
  return { ok: true };
}

/* ------------------------------------------------------ the store, off ronin.json */

export const readPasskeys = (): Promise<PasskeyStore> =>
  readSection<PasskeyStore>('passkeys', { credentials: [] });

/** Read, mutate, write — one funnel, so no caller can drop the recovery code while
 *  saving a credential (or the reverse). Same lesson user-config's updateConfig records. */
async function editPasskeys(mutate: (s: PasskeyStore) => void): Promise<PasskeyStore> {
  const s = await readPasskeys();
  s.credentials ??= [];
  mutate(s);
  await updatePasskeysSection(s.credentials.length || s.recovery ? (s as unknown as Record<string, unknown>) : null);
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

/** Bank the new counter after a good login. Best-effort by design: a failed WRITE must
 *  not fail a login that already verified, or a full disk locks the owner out. */
export const bumpCounter = (id: string, counter: number): Promise<PasskeyStore> =>
  editPasskeys((s) => {
    const c = s.credentials.find((x) => x.id === id);
    if (c) c.counter = counter;
  });

/**
 * The ONE spelling of a recovery code, used by the minter and the verifier alike.
 *
 * A code that is typed by a human off a terminal and into a phone must not fail over
 * presentation. The grouping dashes are decoration, case is not information, and
 * Crockford's substitutions are here because the alphabet deliberately omits I, L, O
 * and U — so anyone typing the letter O for a zero, or I/l for a one, meant the digit
 * and there is no ambiguity in honouring that. Hashing the canonical form is what makes
 * all of this free: the stored record never sees the cosmetic version.
 *
 * Both callers MUST go through here. If the minter canonicalises differently from the
 * verifier, every code fails and the failure looks like bad crypto.
 */
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
