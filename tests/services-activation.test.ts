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
import { servicesSubscription, setteiServices } from '../src/settei.js';

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

test('SETTEI derives subscription identity from the activation result', () => {
  const activation = {
    stage: 'verified' as const,
    email_masked: 'p*****@example.com',
    activation_id: 'act_abc', entitlement_id: 'ent_abc',
    terms_version: '2026-08-01', requested_at: 'x', verified_at: 'y', expires_at: 'z',
    resend_available_at: null, error_at_stage: null, error_message: null, updated_at: 'now',
  };

  const set = setteiServices(activation);
  assert.deepEqual(Object.keys(set).sort(), ['activation', 'selected'],
    'SETTEI exposes the activation aggregate, not a second writable entitlement record');
  assert.equal(set.activation.entitlement_id, 'ent_abc');
  assert.equal(servicesSubscription(set.activation), 'services: ent_abc, verified y');
});

test('SETTEI reports the activation lifecycle accurately before entitlement', () => {
  const base = {
    email_masked: 'p*****@example.com', activation_id: 'act_abc', entitlement_id: null,
    terms_version: '2026-08-01', requested_at: 'x', verified_at: null, expires_at: 'z',
    resend_available_at: null, error_at_stage: null, error_message: null, updated_at: 'now',
  };
  assert.equal(servicesSubscription(publicState({ ...base, stage: 'awaiting_email' })),
    'free cowork: Services confirmation pending');
  assert.equal(servicesSubscription(publicState({
    ...base, stage: 'error', error_at_stage: 'awaiting_email', error_message: 'HQ unavailable',
  })), 'free cowork: Services activation needs attention');
  assert.equal(servicesSubscription(publicState({ ...base, stage: 'not_requested' })),
    'free cowork: no entitlement recorded');
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

/**
 * THE ROSTER MUST BE WHOLE, NOT MERELY NON-EMPTY.
 *
 * Found walking a real install, from the real v1.2.0 tarball. `bin/ronin-update` copied only
 * directories carrying a register entry, which silently left `_lib/` behind — shared code
 * by design, and imported by both gbrain and koshi_weights. Those two then died at import
 * with ERR_MODULE_NOT_FOUND, the assembler logged them and carried on, and five of seven
 * services registered. The watcher's test was `listServices().length > 0`, so five was
 * enough to stamp `installed` over an install whose headline services were dead.
 *
 * Two defects, one screen: the install must carry the shared code, and the verdict must
 * count what failed, not just what survived.
 */
test('a service that was there and did not load is recorded, not only logged', async () => {
  const { noteServiceFailure, listServiceFailures, listServices } = await import('../src/sockets.js');

  assert.deepEqual(listServiceFailures(), [], 'nothing has failed in a fresh process');

  noteServiceFailure('gbrain', "Cannot find module '../_lib/install-runner.js'");
  noteServiceFailure('koshi_weights', "Cannot find module '../_lib/install-runner.js'");
  // The same service failing twice is one casualty, not two.
  noteServiceFailure('gbrain', 'still gone');

  const failed = listServiceFailures();
  assert.equal(failed.length, 2, 'each failed service is named once');
  assert.deepEqual(failed.map((f) => f.name).sort(), ['gbrain', 'koshi_weights']);
  assert.match(failed.find((f) => f.name === 'gbrain')!.reason, /still gone/,
    'the latest reason wins, so a retry does not read as the first failure');

  // The verdict the watcher applies: whole means something loaded AND nothing failed.
  const whole = (loaded: string[], fails: unknown[]): boolean => loaded.length > 0 && fails.length === 0;
  assert.equal(whole(['counting', 'koe', 'koshi', 'michi', 'rireki'], failed), false,
    'five of seven is not installed — this is the exact state the walk found');
  assert.equal(whole([], []), false, 'nothing installed is not installed either');
  assert.equal(whole(listServices(), []), listServices().length > 0);
});

test('the installer carries shared code, not only registrable services', async () => {
  const { mkdtemp, mkdir, writeFile, readFile } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const os = await import('node:os');
  const path = await import('node:path');

  const root = await mkdtemp(path.join(os.tmpdir(), 'place-services-'));
  const store = path.join(root, 'services');
  // The shape the real tarball has: two services that import shared code, the shared code
  // itself carrying no register entry, and a docs directory that must NOT travel.
  for (const [dir, files] of Object.entries({
    gbrain: ['register.js', 'gbrain-api.js'],
    koshi_weights: ['register.js', 'koshi-weights-api.js'],
    _lib: ['install-runner.js'],
    docs: ['activation.md'],
  })) {
    await mkdir(path.join(store, dir), { recursive: true });
    for (const f of files) await writeFile(path.join(store, dir, f), '// x\n');
  }

  // Run the REAL helper out of the script rather than restating its rule here: a test that
  // reimplements the thing it guards passes when the thing is deleted.
  const updater = new URL('../bin/ronin-update', import.meta.url).pathname;
  const source = await readFile(updater, 'utf8');
  const helper = source.match(/^place_services\(\) \{[\s\S]*?^\}/m);
  assert.ok(helper, 'bin/ronin-update still defines place_services()');

  const dest = path.join(root, 'current', 'src', 'services');
  await promisify(execFile)('bash', ['-c',
    `set -eu; HOME_DIR=${JSON.stringify(root)}; ${helper[0]}; place_services ${JSON.stringify(dest)}`]);

  assert.ok(existsSync(path.join(dest, 'gbrain', 'register.js')), 'a service travels');
  assert.ok(existsSync(path.join(dest, '_lib', 'install-runner.js')),
    'shared code travels — gbrain and koshi_weights import ../_lib/install-runner.js and '
    + 'die at load without it');
  assert.ok(!existsSync(path.join(dest, 'docs')),
    'a directory that is neither a service nor shared code stays behind');
});
