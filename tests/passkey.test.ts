/**
 * The pure half of src/passkey.ts, held to its contract with no live machine and no
 * browser: RP IDs are derived or refused, challenges are single-use, recovery codes
 * canonicalise, and — the part that actually matters — a forged or replayed assertion
 * does not verify.
 *
 * A REAL P-256 KEY DOES THE SIGNING HERE. The temptation with WebAuthn is to test the
 * plumbing with a stub verifier, which passes forever and proves nothing; the whole
 * point of this file is that the signature check is genuine, so these tests build an
 * authenticatorData/clientDataJSON pair exactly as a browser would and sign it with
 * node's own ECDSA. That means a mistake in the byte layout — the RP ID hash offset,
 * the flags byte, the concat order, the digest — fails the test rather than shipping.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createHash, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import {
  canonicalCode,
  newChallenge,
  rpIdFromHost,
  takeChallenge,
  verifyAssertion,
  verifyRegistration,
  type PasskeyCredential,
} from '../src/passkey.js';

const RP = 'box.example.ts.net';
const ORIGIN = `https://${RP}:8443`;
const b64u = (b: Buffer): string => b.toString('base64url');

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const SPKI = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;

/** Build authenticatorData the way an authenticator does: rpIdHash | flags | counter. */
function authData(rpId: string, flags: number, counter: number): Buffer {
  const b = Buffer.alloc(37);
  createHash('sha256').update(rpId).digest().copy(b, 0);
  b[32] = flags;
  b.writeUInt32BE(counter, 33);
  return b;
}

/** Everything a browser would POST back for a login, signed for real. */
function assertion(opts: { challenge: string; rpId?: string; origin?: string; flags?: number; counter?: number; type?: string }) {
  const clientData = Buffer.from(
    JSON.stringify({ type: opts.type ?? 'webauthn.get', challenge: opts.challenge, origin: opts.origin ?? ORIGIN }),
  );
  const ad = authData(opts.rpId ?? RP, opts.flags ?? 0x05, opts.counter ?? 0);
  const signed = Buffer.concat([ad, createHash('sha256').update(clientData).digest()]);
  return {
    clientDataJSON: b64u(clientData),
    authenticatorData: b64u(ad),
    signature: b64u(cryptoSign('sha256', signed, privateKey)),
  };
}

const CRED: PasskeyCredential = {
  id: 'cred-1',
  publicKey: SPKI.toString('base64'),
  alg: -7,
  rpId: RP,
  counter: 0,
  label: 'test key',
  createdAt: '2026-08-17T00:00:00.000Z',
};

/** A challenge checker that accepts exactly one value, once — the real jar's contract
 *  without the real jar's clock. */
const oneShot = (want: string) => {
  let spent = false;
  return (c: string) => {
    if (spent || c !== want) return false;
    spent = true;
    return true;
  };
};

/* ------------------------------------------------------------------ the RP ID */

test('an RP ID comes off a domain Host and never off an IP', () => {
  assert.deepEqual(rpIdFromHost('box.example.ts.net:8443'), { rpId: 'box.example.ts.net' });
  assert.deepEqual(rpIdFromHost('BOX.example.TS.net'), { rpId: 'box.example.ts.net' });
  assert.deepEqual(rpIdFromHost('localhost:3006'), { rpId: 'localhost' });
  // The shape the owner actually types, and the one that must fail with a sentence.
  assert.ok('why' in rpIdFromHost('100.101.235.17:3006'));
  assert.ok('why' in rpIdFromHost('[fd7a:115c::1]:3006'));
  assert.ok('why' in rpIdFromHost(undefined));
});

/* -------------------------------------------------------------- the challenge jar */

test('a challenge works once and then never again', () => {
  const c = newChallenge();
  assert.equal(takeChallenge(c), true);
  assert.equal(takeChallenge(c), false); // replay
  assert.equal(takeChallenge('never-issued'), false);
  assert.equal(takeChallenge(undefined), false);
});

test('a challenge does not survive its two minutes', () => {
  const t = Date.now();
  const c = newChallenge(t);
  assert.equal(takeChallenge(c, t + 121_000), false);
});

/* ------------------------------------------------------------------ the assertion */

test('a genuine assertion verifies', () => {
  const c = 'chal-ok';
  const r = verifyAssertion(CRED, assertion({ challenge: c }), { rpId: RP, challengeSpent: oneShot(c) });
  assert.equal(r.ok, true);
});

test('a tampered signature does not verify', () => {
  const c = 'chal-tamper';
  const a = assertion({ challenge: c });
  const bad = Buffer.from(a.signature, 'base64url');
  bad[bad.length - 1] ^= 0xff;
  const r = verifyAssertion(CRED, { ...a, signature: b64u(bad) }, { rpId: RP, challengeSpent: oneShot(c) });
  assert.equal(r.ok, false);
});

test('an assertion for another site does not verify', () => {
  // Both halves of the lie: the authenticator signed for evil.example, and the page
  // says so too. Neither the RP ID hash nor the origin check may let this through.
  const c = 'chal-elsewhere';
  const a = assertion({ challenge: c, rpId: 'evil.example', origin: 'https://evil.example' });
  const r = verifyAssertion(CRED, a, { rpId: RP, challengeSpent: oneShot(c) });
  assert.equal(r.ok, false);
});

test('an assertion whose origin is not the RP does not verify', () => {
  const c = 'chal-origin';
  const a = assertion({ challenge: c, origin: 'https://phish.example' });
  const r = verifyAssertion(CRED, a, { rpId: RP, challengeSpent: oneShot(c) });
  assert.equal(r.ok, false);
});

test('a plain-http origin does not verify', () => {
  const c = 'chal-http';
  const a = assertion({ challenge: c, origin: `http://${RP}:3006` });
  const r = verifyAssertion(CRED, a, { rpId: RP, challengeSpent: oneShot(c) });
  assert.equal(r.ok, false);
});

test('a replayed assertion does not verify (the challenge is spent)', () => {
  const c = 'chal-replay';
  const spent = oneShot(c);
  const a = assertion({ challenge: c });
  assert.equal(verifyAssertion(CRED, a, { rpId: RP, challengeSpent: spent }).ok, true);
  assert.equal(verifyAssertion(CRED, a, { rpId: RP, challengeSpent: spent }).ok, false);
});

test('user presence and user verification are both required', () => {
  const c1 = 'chal-up';
  assert.equal(
    verifyAssertion(CRED, assertion({ challenge: c1, flags: 0x00 }), { rpId: RP, challengeSpent: oneShot(c1) }).ok,
    false,
  );
  const c2 = 'chal-uv';
  // UP set, UV clear — Touch ID did not run, so this is refused on purpose.
  assert.equal(
    verifyAssertion(CRED, assertion({ challenge: c2, flags: 0x01 }), { rpId: RP, challengeSpent: oneShot(c2) }).ok,
    false,
  );
});

test('a registration ceremony is not accepted as a login', () => {
  const c = 'chal-type';
  const a = assertion({ challenge: c, type: 'webauthn.create' });
  assert.equal(verifyAssertion(CRED, a, { rpId: RP, challengeSpent: oneShot(c) }).ok, false);
});

test('a counter that goes backwards is refused, and a zero counter is not evidence', () => {
  const stored: PasskeyCredential = { ...CRED, counter: 9 };
  const c1 = 'chal-clone';
  assert.equal(
    verifyAssertion(stored, assertion({ challenge: c1, counter: 5 }), { rpId: RP, challengeSpent: oneShot(c1) }).ok,
    false,
  );
  const c2 = 'chal-forward';
  const good = verifyAssertion(stored, assertion({ challenge: c2, counter: 10 }), {
    rpId: RP,
    challengeSpent: oneShot(c2),
  });
  assert.equal(good.ok, true);
  assert.equal(good.ok && good.counter, 10);
  // A syncing passkey (iCloud Keychain) reports 0 forever — that must stay loginable.
  const c3 = 'chal-zero';
  assert.equal(
    verifyAssertion(stored, assertion({ challenge: c3, counter: 0 }), { rpId: RP, challengeSpent: oneShot(c3) }).ok,
    true,
  );
});

test('a registration verifies its own ceremony and refuses a login one', () => {
  const c1 = 'reg-ok';
  const good = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: c1, origin: ORIGIN }));
  assert.equal(verifyRegistration(b64u(good), { rpId: RP, challengeSpent: oneShot(c1) }).ok, true);
  const c2 = 'reg-bad';
  const wrong = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: c2, origin: ORIGIN }));
  assert.equal(verifyRegistration(b64u(wrong), { rpId: RP, challengeSpent: oneShot(c2) }).ok, false);
});

/* -------------------------------------------------------------- the recovery code */

test('a recovery code forgives presentation but not content', () => {
  // Dashes, case and the omitted-letter substitutions are all cosmetic; the canonical
  // form is what gets hashed, so all four of these are the same code.
  const canon = canonicalCode('ABCDE-FGHJK-MNPQR-STVWX');
  assert.equal(canonicalCode('abcde-fghjk-mnpqr-stvwx'), canon);
  assert.equal(canonicalCode('ABCDEFGHJKMNPQRSTVWX'), canon);
  assert.equal(canonicalCode('  ABCDE FGHJK MNPQR STVWX '), canon);
  // O/I/L are not in the alphabet, so a typed O means 0 and a typed I or L means 1.
  assert.equal(canonicalCode('O1I'), '011');
  assert.notEqual(canonicalCode('ABCDE-FGHJK-MNPQR-STVWY'), canon);
});
