import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureTmuxServer } from '../src/host-guard.js';

test('an explicit private tmux socket can never manage the production server unit', async () => {
  const calls: Array<[string, string[]]> = [];
  await ensureTmuxServer(
    { TMUX_TMPDIR: '/tmp/isolated-ronin-rig' },
    async (file, args) => { calls.push([file, args]); },
  );
  assert.deepEqual(calls, [], 'private socket ownership must stop before tmux or systemd');
});
