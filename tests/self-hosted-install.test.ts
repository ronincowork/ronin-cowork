/**
 * SELF-HOSTED: Submit the registration form, and the Services install starts. No email
 * confirmation, no entitlement required. A fake `systemd-run` on PATH stands in for the
 * updater launch, so no real download or restart ever happens here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const box = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-self-hosted-install-'));
process.env.RONIN_USER_ROOT = path.join(box, 'user');
process.env.RONIN_DATA_ROOT = path.join(box, 'data');
process.env.RONIN_HQ_BASE = 'http://127.0.0.1:9'; // nothing listens: the anonymous hello fails fast
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

const { registerServicesActivation } = await import('../src/routes/services-activation-api.js');
const { readState, writeState } = await import('../src/activation/state.js');
const { getEntitlementToken, putEntitlementToken } = await import('../src/activation/secrets.js');
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

test('an email Submit completes registration and starts the Services install, with no entitlement', async () => {
  const before = (await launched()).length;
  const { status, body } = await call('POST /api/setup/registration', { identity_mode: 'email', email: 'any@example.com' });
  assert.equal(status, 200);
  assert.equal(body.status, 'registered');
  assert.equal(body.services_entitled, false, 'no entitlement was asked for or minted');
  assert.deepEqual(body.install, { started: true });
  const runs = await launched();
  assert.equal(runs.length, before + 1, 'the updater was launched once');
  assert.match(runs.at(-1)!, /bin\/ronin-update --services/);
  assert.match(runs.at(-1)!, /--setenv=RONIN_RUN_EXIT=/, 'the run reports its exit code');
  assert.equal((await readState()).stage, 'installing');
});

test('a second Submit while installing does not launch another install', async () => {
  const before = (await launched()).length;
  const { body } = await call('POST /api/setup/registration', { identity_mode: 'email', email: 'other@example.com' });
  assert.deepEqual(body.install, { started: false, reason: 'in_progress' });
  assert.equal((await launched()).length, before);
});

test('an anonymous Submit starts the install too', async () => {
  await reset();
  const { body } = await call('POST /api/setup/registration', { identity_mode: 'anonymous' });
  assert.equal(body.status, 'anonymous');
  assert.deepEqual(body.install, { started: true });
});

test('Install with no entitlement is not refused', async () => {
  await reset();
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

test('concurrent Submit and Install launch exactly one updater run', async () => {
  await reset();
  const before = (await launched()).length;
  const answers = await Promise.all([
    call('POST /api/setup/registration', { identity_mode: 'email', email: 'race@example.com' }),
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
