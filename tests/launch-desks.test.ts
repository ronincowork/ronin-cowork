/**
 * LAUNCH DESKS — a coding launch is born at a desk with every desk in its brief; every
 * other launch gets NO invented desk state (Fable 3, RONIN_CONTROL_SURFACE.md §2).
 *
 * Pure: the derivation is Track 1's and is not exercised here; what is asserted is the
 * launch's own decisions — who wants a desk, what the brief says when there is one and
 * when there is not, and that the reading level rides only an actual assignment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { DESK_LIFECYCLES, renderDeskBlock, resolveLaunchDesks, wantsDesk } from '../src/launch-desks.js';
import { buildBrief, type SpawnForm } from '../src/spawn.js';
import { bootFiles } from '../src/session-boot.js';
import type { LaunchProfile } from '../src/launch-profile.js';
import type { Assignment } from '../src/desks/schema.js';

const withSwitch = async (value: string | undefined, fn: () => Promise<void> | void) => {
  const old = process.env.RONIN_DESKS;
  if (value === undefined) delete process.env.RONIN_DESKS;
  else process.env.RONIN_DESKS = value;
  try {
    await fn();
  } finally {
    if (old === undefined) delete process.env.RONIN_DESKS;
    else process.env.RONIN_DESKS = old;
  }
};

const assignment: Assignment = {
  id: 'fable@comp',
  session: 'fable',
  team: 'comp',
  project_root: 'cowork',
  primary: 'cowork',
  desks: [
    { repo: 'cowork', root: 'cowork', branch: 'team/comp/fable', worktree: '/w/cowork/team/comp/fable', line: 'team/comp/dev', mode: 'reviewed', session: 'fable', team: 'comp', assignment: 'fable@comp', state: 'open', opened_at: 't' },
    { repo: 'services', root: 'services', branch: 'team/comp/fable', worktree: '/w/services/team/comp/fable', line: 'team/comp/dev', mode: 'reviewed', session: 'fable', team: 'comp', assignment: 'fable@comp', state: 'open', opened_at: 't' },
  ],
};

const profile = { session_role: 'CutCode', label: 'cut code', posture: [], opening: '{prompt}', ack: false, agent: true } as LaunchProfile;

test('the switch off means no launch wants a desk, whatever it is', async () => {
  await withSwitch(undefined, () => {
    assert.equal(wantsDesk({ mode: 'assisted', agent: true, lifecycle: 'coding' }), false);
    assert.equal(wantsDesk({ mode: 'assisted', agent: true, lifecycle: 'coding', desk: 'own' }), false);
  });
  await withSwitch('off', () => {
    assert.equal(wantsDesk({ mode: 'assisted', agent: true, lifecycle: 'coding', desk: 'own' }), false);
  });
});

test('with the switch on, only an assisted agent launch that changes code wants a desk', async () => {
  await withSwitch('on', () => {
    for (const lifecycle of DESK_LIFECYCLES) assert.equal(wantsDesk({ mode: 'assisted', agent: true, lifecycle }), true, lifecycle);
    for (const lifecycle of ['designing', 'review', 'orchestrating', 'none', '']) {
      assert.equal(wantsDesk({ mode: 'assisted', agent: true, lifecycle }), false, `${lifecycle || 'blank'} changes no code`);
    }
    // Manual adds no wording of ours — and a desk is wording. A plain terminal has no agent to brief.
    assert.equal(wantsDesk({ mode: 'manual', agent: true, lifecycle: 'coding' }), false);
    assert.equal(wantsDesk({ mode: 'manual', agent: true, lifecycle: 'coding', desk: 'own' }), false);
    assert.equal(wantsDesk({ mode: 'assisted', agent: false, lifecycle: 'coding', desk: 'own' }), false);
    // The launch box's one control, either way.
    assert.equal(wantsDesk({ mode: 'assisted', agent: true, lifecycle: 'review', desk: 'own' }), true);
    assert.equal(wantsDesk({ mode: 'assisted', agent: true, lifecycle: 'coding', desk: 'none' }), false);
  });
});

test('a launch that wants no desk resolves null without touching any registry', async () => {
  await withSwitch(undefined, async () => {
    const a = await resolveLaunchDesks({ session: 'x', team: '', project_root: 'nowhere', mode: 'assisted', agent: true, lifecycle: 'coding' });
    assert.equal(a, null);
  });
});

test('the brief carries every desk, the primary, the line, and the four words — or nothing at all', () => {
  const form: SpawnForm = { session_role: 'CutCode', prompt: 'Build it.', mode: 'assisted' };
  const brief = buildBrief(profile, undefined, form, undefined, [], null, assignment);
  assert.match(brief, /Your assignment has 2 desks:/);
  assert.match(brief, /cowork\s+\/w\/cowork\/team\/comp\/fable\s+→ team\/comp\/dev\s+\(you start here\)/);
  assert.match(brief, /services\s+\/w\/services\/team\/comp\/fable\s+→ team\/comp\/dev/);
  assert.match(brief, /Commit preserves only that desk/);
  assert.match(brief, /`tejun-desk hand-in` publishes committed work to its team line; it is not `git push` and it runs no full BYOIN/);
  assert.match(brief, /team promotion runs full BYOIN/);

  const none = buildBrief(profile, undefined, form, undefined, [], null, null);
  assert.doesNotMatch(none, /desk/i, 'a launch with no assignment is told nothing about desks');
  // Manual: the owner's bytes, whatever was resolved.
  assert.equal(buildBrief(profile, undefined, { ...form, mode: 'manual' }, undefined, [], null, assignment), 'Build it.');
});

test('the desk contract rides the assignment level, and only that', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-launch-desks-test-'));
  const oldCache = process.env.RONIN_SESSION_BOOT_CACHE_DIR;
  const oldCatalogs = process.env.RONIN_CATALOGS_DIR;
  process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
  process.env.RONIN_CATALOGS_DIR = path.join(temp, 'catalogs');
  try {
    const without = (await bootFiles('', 'CutCode', '', false, false)).map((f) => path.basename(f));
    const withDesks = (await bootFiles('', 'CutCode', '', false, true)).map((f) => path.basename(f));
    assert.ok(!without.includes('DESK_CONTRACT.md'), 'no assignment, no desk reading');
    assert.ok(withDesks.includes('DESK_CONTRACT.md'), 'an assignment reads the desk contract');
    assert.deepEqual(withDesks.filter((f) => f !== 'DESK_CONTRACT.md').sort(), without.sort(), 'the level adds exactly one book');
  } finally {
    if (oldCache === undefined) delete process.env.RONIN_SESSION_BOOT_CACHE_DIR; else process.env.RONIN_SESSION_BOOT_CACHE_DIR = oldCache;
    if (oldCatalogs === undefined) delete process.env.RONIN_CATALOGS_DIR; else process.env.RONIN_CATALOGS_DIR = oldCatalogs;
    await rm(temp, { recursive: true, force: true });
  }
});
