import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { guardRestart, receiptAllowsRestart } from '../scripts/guard-dev-restart.mjs';

const SHA = 'a'.repeat(40);
const receipt = (dir: string, state = 'complete', candidate = SHA) => ({
  id: 'promote-1', state, repos: [{ repo: 'cowork', dir, candidate }],
  advances: [{ repo: 'cowork', to: candidate, status: 'done' }],
});

test('receipt match requires the exact repo, candidate, successful state and completed advance', () => {
  assert.equal(receiptAllowsRestart([receipt('/repo')], '/repo', SHA), 'promote-1');
  assert.equal(receiptAllowsRestart([receipt('/repo', 'failed')], '/repo', SHA), '');
  assert.equal(receiptAllowsRestart([receipt('/repo', 'complete', 'b'.repeat(40))], '/repo', SHA), '');
  assert.equal(receiptAllowsRestart([{ ...receipt('/repo'), advances: [] }], '/repo', SHA), '');
});

test('reviewed dev refuses without a receipt and accepts the explicit owner override', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-restart-'));
  const ledger = path.join(dir, 'ledger');
  await fs.mkdir(ledger);
  execFileSync('git', ['-C', dir, 'init', '-q', '-b', 'dev']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'test']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@test']);
  await fs.writeFile(path.join(dir, 'RONIN_REPO'), 'mode=reviewed\nworking=dev\nstable=master\n');
  execFileSync('git', ['-C', dir, 'add', 'RONIN_REPO']);
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'base']);
  assert.equal(guardRestart(dir, ledger).ok, false);
  assert.deepEqual(guardRestart(dir, ledger, '1'), { ok: true, reason: 'owner override RONIN_UNRECEIPTED_DEV=1' });
  const head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await fs.writeFile(path.join(ledger, 'one.json'), JSON.stringify(receipt(dir, 'complete', head)));
  assert.equal(guardRestart(dir, ledger).ok, true);
});
