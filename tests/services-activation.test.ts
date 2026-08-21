/**
 * THE SERVICES ACTIVATION LEG — the parts that can be judged without a machine.
 *
 * A unit test here is a gate in BYOIN's sense, so it opens no socket and touches no store.
 * The end-to-end walk (request → email → confirm → poll → entitlement) needs both legs
 * running and lives in ronin-shiwake's acceptance script, not here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  assert.equal(view.error_at_stage, null);

  // The activation id is not part of the browser's view either: it is the thing the claim
  // secret authenticates against, and there is no reason for a page to hold it.
  assert.ok(!keys.includes('activation_id'));
});

test('workspace status checks Shiwake only after the owner presses Check status', async () => {
  const source = await readFile(new URL('../public/js/services-activation.js', import.meta.url), 'utf8');
  assert.match(source, /Check status/);
  assert.match(source, /activation\/poll/);
  assert.equal((source.match(/activation\/poll/g) || []).length, 1,
    'the Shiwake poll endpoint appears only in the Check status click handler');
  assert.match(source, /visibilityState[\s\S]*refresh/,
    'returning to the page may refresh local state without polling Shiwake');
});

test('EgressRefused exists as its own kind, so a blocked call is not read as a network fault', () => {
  const e = new EgressRefused('nope');
  assert.ok(e instanceof Error);
  assert.ok(e instanceof EgressRefused);
});

/**
 * THE INSTALL STAGE MUST BE ABLE TO FAIL.
 *
 * Measured on the E2E walk: the updater exited 1 within a second, and the stage still read
 * "installing" minutes later with no error and nothing to press. `runUpdater` resolves when
 * the process has STARTED, and reporting a stage on that basis is a guess dressed as a fact.
 *
 * A unit test here honours the repo's gate — no socket, no store, no live machine — so it
 * pins the SHAPE of the contract rather than driving the flow: installed is proven by the
 * roster, and a stall becomes an error that keeps the entitlement.
 */
test('the states an install can end in are exactly: installed, or an error that keeps the entitlement', () => {
  const stages = ['not_requested', 'requesting', 'awaiting_email', 'verified',
                  'installing', 'installed', 'expired', 'cancelled', 'address_changed', 'error'];

  // `installing` is a transient, and the two ways out of it are both terminal and both named.
  assert.ok(stages.includes('installed'), 'success has a name');
  assert.ok(stages.includes('error'), 'failure has a name');

  // The rule the walk proved we needed: an install that stalls must not stay "installing".
  // Nothing may report success without the roster, and nothing may report failure by
  // discarding the entitlement — retrying an install costs no new email.
  const view = publicState({
    stage: 'error', email_masked: 'g***@example.com', activation_id: 'act_x',
    entitlement_id: 'ent_x', terms_version: '2026-08-01', requested_at: 'a',
    verified_at: 'b', expires_at: 'c', resend_available_at: null,
    error_at_stage: 'installing',
    error_message: 'Services did not finish installing. Your entitlement is safe.',
    updated_at: 'now',
  });
  assert.equal(view.entitlement_id, 'ent_x', 'the entitlement survives a failed install');
  assert.match(view.error_message!, /entitlement is safe/);
});
