/**
 * The pure half of src/auth.ts, held to its contract with no live machine:
 * scrypt records verify and refuse, session tokens sign/expire/tamper correctly,
 * the cookie parser finds the one cookie, and the limiter forgives on schedule.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  checkToken,
  cookieToken,
  loginAllowed,
  loginFailed,
  loginSucceeded,
  makeRecord,
  makeToken,
  verifyRecord,
} from '../src/auth.js';

test('a record verifies its own password and refuses another', async () => {
  const rec = await makeRecord('correct horse battery');
  assert.equal(await verifyRecord(rec, 'correct horse battery'), true);
  assert.equal(await verifyRecord(rec, 'correct horse batterz'), false);
  assert.equal(await verifyRecord(rec, ''), false);
});

test('two records for one password share nothing (fresh salt, fresh secret)', async () => {
  const a = await makeRecord('same-password');
  const b = await makeRecord('same-password');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.notEqual(a.secret, b.secret);
});

test('a token round-trips, expires, and refuses tampering and foreign secrets', async () => {
  const rec = await makeRecord('pw');
  const now = 1_700_000_000_000;
  const token = makeToken(rec.secret, 1000, now);
  assert.equal(checkToken(rec.secret, token, now + 999), true);
  assert.equal(checkToken(rec.secret, token, now + 1000), false, 'expiry is exact');
  assert.equal(checkToken(rec.secret, token + 'x', now), false, 'signature tamper');
  const [exp, sig] = token.split('.');
  assert.equal(checkToken(rec.secret, `${Number(exp) + 5}.${sig}`, now), false, 'expiry tamper');
  const other = await makeRecord('pw');
  assert.equal(checkToken(other.secret, token, now), false, 'rotated secret revokes');
  assert.equal(checkToken(rec.secret, undefined, now), false);
  assert.equal(checkToken(rec.secret, 'garbage', now), false);
});

test('cookieToken finds ronin_session among other cookies, or answers undefined', () => {
  assert.equal(cookieToken('a=1; ronin_session=x.y; b=2'), 'x.y');
  assert.equal(cookieToken('ronin_session=x%2Ey'), 'x.y');
  assert.equal(cookieToken('other=1'), undefined);
  assert.equal(cookieToken(undefined), undefined);
});

test('the limiter allows five failures a minute, then forgives', () => {
  const addr = 'test-addr';
  const t0 = 1_700_000_000_000;
  loginSucceeded(addr); // clean slate
  for (let i = 0; i < 5; i++) {
    assert.equal(loginAllowed(addr, t0), true);
    loginFailed(addr, t0);
  }
  assert.equal(loginAllowed(addr, t0), false, 'sixth attempt inside the minute is refused');
  assert.equal(loginAllowed(addr, t0 + 61_000), true, 'the minute passes and the door reopens');
  loginSucceeded(addr);
});
