import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { RoutineRow } from '../src/definitions.js';
import { projectRoutineTools } from '../src/routine-tools.js';
import type { ResolvedRoutine } from '../src/routines.js';

const exec = promisify(execFile);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-routine-tools-'));
process.env.RONIN_SESSION_COMMANDS_DIR = temp;

const routine = (name: string, enabled: boolean, tools: string[]): ResolvedRoutine => ({
  name, label: name, blurb: '', origin: 'stock', shadowed: false, class: 'base',
  reading: [], sops: [], macros: [], actions: [], tools, mcp: [], requires: [],
  enabled, stated_by: 'campaign', required_by: [],
} satisfies RoutineRow & ResolvedRoutine);

test('birth PATH exposes enabled tools by name without inheriting a Ronin PATH', async () => {
  const projected = await projectRoutineTools('pathless', [
    routine('ronin_base', true, ['tejun']),
    routine('ronin_control', false, ['tejun-desk']),
  ], '/usr/bin:/bin');
  const tejun = await exec('/bin/sh', ['-c', 'command -v tejun'], { env: { PATH: projected.path } });
  assert.equal(tejun.stdout.trim(), path.join(projected.dir, 'tejun'));
  await assert.rejects(() => exec('/bin/sh', ['-c', 'command -v tejun-desk'], { env: { PATH: projected.path } }));
  assert.ok(projected.delivered.includes('shim/tmux'), 'the tmux guard is Routine floor');
});

test('missing enabled tools are visible and do not refuse projection', async () => {
  const projected = await projectRoutineTools('missing', [routine('example', true, ['not-installed'])]);
  assert.ok(projected.missing.includes('not-installed'));
});
