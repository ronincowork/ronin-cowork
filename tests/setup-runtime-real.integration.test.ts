import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';

const box = await mkdtemp(path.join(os.tmpdir(), 'ronin-setup-runtime-real-'));
process.env.TMUX = '';
process.env.TMUX_TMPDIR = path.join(box, 'tmux');
process.env.RONIN_USER_ROOT = path.join(box, 'ronin');
process.env.RONIN_CATALOGS_DIR = path.join(box, 'ronin', 'catalogs');
await mkdir(process.env.TMUX_TMPDIR, { recursive: true, mode: 0o700 });

const runtime = await import('../src/setup-runtime.js');
const { measureProviders } = await import('../src/provider-summary.js');
const tmux = await import('../src/tmux.js');

const available = [{
  id: 'claude', label: 'Claude Code', get: 'install claude', parked: '',
  cmd: 'claude', installed: true, path: '/bin/claude',
}];
const session = 'provider_setup_claude';

test('a real isolated tmux setup session is the attachment and Done/Close have distinct effects', async () => {
  await tmux.createSession(session, box, { agent: false, argv: ['/bin/sh', '-c', 'while :; do sleep 60; done'] });
  const open = await runtime.setupRuntimeAnswer({}, await measureProviders({}, { availability: available, signedIn: async () => false }));
  assert.deepEqual(open.providers[0]?.attachment, {
    type: 'session', key: session, team: 'provider_setup', temporary: true,
  });

  const recorded: Array<[string, string]> = [];
  const done = await runtime.completeProviderLogin('claude', undefined, () => '2026-09-05T15:00:00.000Z', async (provider, at) => recorded.push([provider, at]));
  assert.equal(done.activated_at, '2026-09-05T15:00:00.000Z');
  assert.deepEqual(recorded, [['claude', '2026-09-05T15:00:00.000Z']]);
  assert.equal(await tmux.sessionExists(session), false);

  await tmux.createSession(session, box, { agent: false, argv: ['/bin/sh', '-c', 'while :; do sleep 60; done'] });
  const closed = await runtime.closeProviderLogin('claude');
  assert.deepEqual(closed, { session, closed: true });
  assert.equal(await tmux.sessionExists(session), false);
  assert.equal(recorded.length, 1, 'Close did not record another activation');
});

test.after(async () => {
  await tmux.killSession(session);
  await rm(box, { recursive: true, force: true });
});
