/**
 * THE SERVICES ACTIVATION LEG — the parts that can be judged without a machine.
 *
 * A unit test here is a gate in BYOIN's sense, so it opens no socket and touches no store.
 * The end-to-end walk (request → email → confirm → poll → entitlement) needs both legs
 * running and lives in ronin-shiwake's acceptance script, not here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail, publicState } from '../src/activation/state.js';
import { EgressRefused } from '../src/activation/transport.js';

test('an address is masked for display and never shown back in full', () => {
  assert.equal(maskEmail('person@example.com'), 'p*****@example.com');
  assert.equal(maskEmail('a@b.co'), 'a**@b.co');
  assert.equal(maskEmail('nonsense'), '***');
});

test('the state the browser sees carries no secret, only an identifier', () => {
  const view = publicState({
    stage: 'verified',
    email_masked: 'p*****@example.com',
    activation_id: 'act_abc',
    entitlement_id: 'ent_abc',
    terms_version: '2026-08-01',
    requested_at: 'x', verified_at: 'y', expires_at: 'z', resend_available_at: null,
    error_at_stage: null, error_message: null, updated_at: 'now',
  });

  const keys = Object.keys(view);
  for (const forbidden of ['claim_secret', 'entitlement_token', 'email', 'token']) {
    assert.ok(!keys.includes(forbidden), `${forbidden} must never reach the browser`);
  }
  // The entitlement id identifies and cannot authorize, so it is safe to show.
  assert.equal(view.entitlement_id, 'ent_abc');
  assert.equal(view.email_masked, 'p*****@example.com');

  // The activation id is not part of the browser's view either: it is the thing the claim
  // secret authenticates against, and there is no reason for a page to hold it.
  assert.ok(!keys.includes('activation_id'));
});

test('EgressRefused exists as its own kind, so a blocked call is not read as a network fault', () => {
  const e = new EgressRefused('nope');
  assert.ok(e instanceof Error);
  assert.ok(e instanceof EgressRefused);
});
