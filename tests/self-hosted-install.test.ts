/**
 * SELF-HOSTED: Submit the registration form with an email, and Ronin HQ is asked to email a
 * Services key; nothing installs. Pasting the key keeps it and starts the install (KAN-323).
 * A fake `systemd-run` on PATH stands in for the updater launch, so no real download or
 * restart ever happens here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const box = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-self-hosted-install-'));
process.env.RONIN_USER_ROOT = path.join(box, 'user');
process.env.RONIN_DATA_ROOT = path.join(box, 'data');
process.env.RONIN_HQ_BASE = 'http://127.0.0.1:9'; // nothing listens: HQ calls fail fast
const fakeBin = path.join(box, 'bin');
const launches = path.join(box, 'launches.log');
const failFlag = path.join(box, 'fail-download');
const noLaunchFlag = path.join(box, 'fail-launch');
await fs.mkdir(fakeBin, { recursive: true });
// Records each launch. With the fail flag present it plays the updater's private-feed
// failure: the ✗ line in the run log and exit 1, exactly as the wrapper would write them.
// With the no-launch flag present, systemd-run and the broker's setsid fallback both
// refuse, so the updater never starts.
await fs.writeFile(path.join(fakeBin, 'systemd-run'), `#!/bin/sh
if [ -f "${noLaunchFlag}" ]; then echo "no user manager" >&2; exit 1; fi
echo "$@" >> "${launches}"
for a in "$@"; do case "$a" in
  --setenv=RONIN_RUN_LOG=*) log="\${a#--setenv=RONIN_RUN_LOG=}" ;;
  --setenv=RONIN_RUN_EXIT=*) ex="\${a#--setenv=RONIN_RUN_EXIT=}" ;;
esac; done
if [ -f "${failFlag}" ] && [ -n "$log" ]; then
  echo "✗ could not download release v1.7.0 (private repo? install gh, or use --file)" > "$log"
  echo 1 > "$ex"
fi
exit 0
`, { mode: 0o755 });
await fs.writeFile(path.join(fakeBin, 'setsid'), `#!/bin/sh
if [ -f "${noLaunchFlag}" ]; then echo "setsid: refused" >&2; exit 1; fi
exec /usr/bin/setsid "$@"
`, { mode: 0o755 });
process.env.PATH = `${fakeBin}:${process.env.PATH}`;

const { registerServicesActivation, servicesOnMachine } = await import('../src/routes/services-activation-api.js');
// The machine these tests mean: no Services on disk, whatever the checkout carries (a gate
// dev-syncs Services into src/services). The installed case states its own machine below.
servicesOnMachine.present = async () => false;
const { readState, writeState } = await import('../src/activation/state.js');
const { clearEntitlementToken, getEntitlementToken, putEntitlementToken } = await import('../src/activation/secrets.js');
const { storeDir } = await import('../src/resources.js');

const handlers = new Map<string, Function>();
registerServicesActivation({
  get(p: string, h: Function) { handlers.set(`GET ${p}`, h); },
  post(p: string, h: Function) { handlers.set(`POST ${p}`, h); },
  delete(p: string, h: Function) { handlers.set(`DELETE ${p}`, h); },
} as never);

async function call(route: string, body: unknown = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let status = 200;
    const res = {
      status(code: number) { status = code; return res; },
      json(payload: unknown) { resolve({ status, body: payload }); return res; },
      end() { resolve({ status, body: null }); return res; },
    };
    void handlers.get(route)!({ body }, res);
  });
}
const reset = () => writeState({ stage: 'not_requested', error_at_stage: null, error_message: null });
const launched = async () => (await fs.readFile(launches, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean);

// Let every install watch see a settled stage and stop before its store is removed.
test.after(async () => {
  await reset();
  await new Promise((r) => setTimeout(r, 5_500));
  await fs.rm(box, { recursive: true, force: true });
});

const KEY = 'k'.repeat(43);

test('an email Submit completes registration and asks Ronin HQ for a Services key; nothing installs', async () => {
  const before = (await launched()).length;
  const { status, body } = await call('POST /api/setup/registration', { identity_mode: 'email', email: 'any@example.com' });
  assert.equal(status, 200);
  assert.equal(body.status, 'registered');
  assert.equal(body.services_entitled, false, 'no key is held until the person pastes one');
  assert.equal(body.services_key.sent, false, 'HQ is unreachable here, and the answer says so');
  assert.match(body.services_key.error, /could not be reached|answered/);
  assert.equal(body.install, undefined, 'Submit never starts an install');
  assert.equal((await launched()).length, before, 'no updater launch');
  assert.notEqual((await readState()).stage, 'installing');
});

test('an anonymous Submit asks for no key and installs nothing', async () => {
  const before = (await launched()).length;
  const { body } = await call('POST /api/setup/registration', { identity_mode: 'anonymous' });
  assert.equal(body.status, 'anonymous');
  assert.equal(body.services_key, null);
  assert.equal((await launched()).length, before);
});

test('a malformed Services key is refused and nothing is kept', async () => {
  const before = (await launched()).length;
  for (const key of ['', 'short', 'k'.repeat(44), `${'k'.repeat(42)}!`]) {
    const { status, body } = await call('POST /api/setup/services-key', { key });
    assert.equal(status, 400, key);
    assert.match(body.error, /not a Ronin Services key/);
  }
  assert.equal(await getEntitlementToken(), null);
  assert.equal((await launched()).length, before);
});

test('a pasted Services key is kept exactly and starts the install once; a second paste waits', async () => {
  await reset();
  const before = (await launched()).length;
  const { status, body } = await call('POST /api/setup/services-key', { key: `  ${KEY}\n` });
  assert.equal(status, 200);
  assert.equal(await getEntitlementToken(), KEY, 'trimmed, otherwise exactly as pasted');
  assert.deepEqual(body.install, { started: true });
  assert.equal(body.registration.services_entitled, true);
  const runs = await launched();
  assert.equal(runs.length, before + 1, 'the updater was launched once');
  assert.match(runs.at(-1)!, /bin\/ronin-update --services/);
  assert.equal((await readState()).stage, 'installing');
  const again = await call('POST /api/setup/services-key', { key: KEY });
  assert.deepEqual(again.body.install, { started: false, reason: 'in_progress' });
  assert.equal((await launched()).length, before + 1);
});

test('Install with no entitlement is not refused', async () => {
  await reset();
  await clearEntitlementToken();
  assert.equal(await getEntitlementToken(), null);
  const { status, body } = await call('POST /api/services/install');
  assert.equal(status, 200);
  assert.deepEqual(body.install, { started: true });
});

test('a failed download is shown as an install error with the updater\'s reason, never as installed', async () => {
  await reset();
  await fs.writeFile(failFlag, '');
  try {
    const { body } = await call('POST /api/services/install');
    assert.deepEqual(body.install, { started: true }, 'started means launched, nothing more');
    let s = await readState();
    for (let i = 0; i < 40 && s.stage === 'installing'; i++) {
      await new Promise((r) => setTimeout(r, 250));
      s = await readState();
    }
    assert.equal(s.stage, 'error');
    assert.equal(s.error_at_stage, 'installing');
    assert.match(String(s.error_message), /did not install: could not download release v1\.7\.0/);
  } finally { await fs.rm(failFlag, { force: true }); }
});

test('a stored email-confirmation stage reads as an actionable not_requested and keeps the entitlement token', async () => {
  await putEntitlementToken('held-token');
  const file = path.join(storeDir('config'), 'services-activation.json');
  for (const stage of ['awaiting_email', 'requesting', 'verified', 'expired', 'cancelled', 'address_changed']) {
    await fs.writeFile(file, JSON.stringify({ stage, entitlement_id: 'ent_kept', activation_id: 'act_old', resend_available_at: 'x' }));
    const s = await readState();
    assert.equal(s.stage, 'not_requested', stage);
    assert.equal(s.entitlement_id, 'ent_kept', 'the entitlement identifier stays');
    assert.ok(!('activation_id' in s) && !('resend_available_at' in s), 'obsolete fields are not carried');
  }
  await fs.writeFile(file, JSON.stringify({ stage: 'error', error_at_stage: 'awaiting_email', error_message: 'HQ unavailable' }));
  assert.equal((await readState()).stage, 'not_requested', 'an error raised by the email loop is obsolete too');
  await fs.writeFile(file, JSON.stringify({ stage: 'error', error_at_stage: 'installing', error_message: 'download failed' }));
  assert.equal((await readState()).stage, 'error', 'an install error stays an install error');
  assert.equal(await getEntitlementToken(), 'held-token', 'the token file is untouched');
});

test('a concurrent key paste and Install launch exactly one updater run', async () => {
  await reset();
  const before = (await launched()).length;
  const answers = await Promise.all([
    call('POST /api/setup/services-key', { key: KEY }),
    call('POST /api/services/install'),
    call('POST /api/services/install'),
  ]);
  const installs = answers.map((a) => a.body.install);
  assert.equal(installs.filter((i) => i.started).length, 1, 'one start');
  assert.equal(installs.filter((i) => !i.started && i.reason === 'in_progress').length, 2, 'the others are told it is in progress');
  assert.equal((await launched()).length, before + 1, 'one updater launch, so one log and one exit file');
});

test('concurrent presses when the installer cannot start all get the failure, not in_progress', async () => {
  await reset();
  await fs.writeFile(noLaunchFlag, '');
  try {
    const answers = await Promise.all([
      call('POST /api/services/install'),
      call('POST /api/services/install'),
      call('POST /api/services/install'),
    ]);
    for (const a of answers) {
      assert.equal(a.status, 500, 'a waiter is told the start failed');
      assert.match(a.body.error, /the installer did not start/);
    }
    const s = await readState();
    assert.equal(s.stage, 'error');
    assert.equal(s.error_at_stage, 'installing');
  } finally { await fs.rm(noLaunchFlag, { force: true }); }
});

test('on a hosted office, or with an unreadable office record, a pasted key is refused and the office credential is left alone', async () => {
  const { officeRecordFile } = await import('../src/office-record.js');
  await fs.mkdir(path.dirname(officeRecordFile()), { recursive: true });
  const before = (await launched()).length;
  try {
    await fs.writeFile(officeRecordFile(), JSON.stringify({ office_id: 'unit', office_park: 'park', gateway_office: 'http://10.0.0.2:4912', provisioned_at: '2026-11-01T00:00:00Z' }));
    // The office's credential lies beside its record, so it is placed once the record is there.
    await putEntitlementToken('office-credential');
    const hosted = await call('POST /api/setup/services-key', { key: KEY });
    assert.equal(hosted.status, 409);
    assert.match(hosted.body.error, /hosted office/);
    await fs.writeFile(officeRecordFile(), '{broken');
    const unreadable = await call('POST /api/setup/services-key', { key: KEY });
    assert.equal(unreadable.status, 409);
    assert.match(unreadable.body.error, /does not read/);
    assert.equal(await getEntitlementToken(), 'office-credential', 'nothing was written');
    assert.equal((await launched()).length, before, 'nothing was installed');
  } finally { await fs.rm(officeRecordFile(), { force: true }); }
});

// Last: marking a Services part as loaded stays for the rest of this process.
test('with Services installed, a pasted key replaces the saved one and nothing reinstalls', async () => {
  await reset();
  const { noteService } = await import('../src/sockets.js');
  noteService('counting');
  servicesOnMachine.present = async () => true;
  const before = (await launched()).length;
  const replacement = 'r'.repeat(43);
  const { status, body } = await call('POST /api/setup/services-key', { key: replacement });
  assert.equal(status, 200);
  assert.equal(body.key_saved, true);
  assert.equal(body.install, null);
  assert.equal(await getEntitlementToken(), replacement, 'the new key is the one kept');
  assert.equal((await launched()).length, before, 'no updater launch: Services stays as installed');
});
