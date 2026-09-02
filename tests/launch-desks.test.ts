/**
 * LAUNCH DESKS — a coding launch is born at a desk with every desk in its brief; every
 * other launch gets NO invented desk state (Fable 3, docs/control-surface.md §2).
 *
 * Pure: the derivation is Track 1's and is not exercised here; what is asserted is the
 * launch's own decisions — who wants a desk, what the brief says when there is one and
 * when there is not, and that the reading level rides only an actual assignment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { renderDeskBlock, resolveLaunchDesks } from '../src/launch-desks.js';
import { buildBrief, type SpawnForm } from '../src/spawn.js';
import { bootFiles } from '../src/session-boot.js';
import type { LaunchProfile } from '../src/launch-profile.js';
import type { Assignment } from '../src/desks/schema.js';

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

test('a launch that wants no desk resolves null without touching any registry', async () => {
  const a = await resolveLaunchDesks({ session: 'x', team: '', project_root: 'nowhere', agent: true, control: false });
  assert.equal(a, null);
});

test('the retired desk override is not a second Worktrees switch', async () => {
  const forced = await resolveLaunchDesks({ session: 'x', team: '', project_root: 'nowhere', agent: true, control: false, desk: 'own' });
  const refused = await resolveLaunchDesks({ session: 'x', team: '', project_root: 'nowhere', agent: true, control: true, desk: 'none' });
  assert.equal(forced, null);
  assert.equal(refused, null);
});

test('a coding launch on a repository with no RONIN_REPO resolves null — the file is the gate', async () => {
  // `nowhere` is no project_root on this box, so its arrangement is absent → no desk.
  const a = await resolveLaunchDesks({ session: 'x', team: '', project_root: 'nowhere', agent: true, control: true });
  assert.equal(a, null);
});

test('the brief carries every desk, the primary, the line, and the four words — or nothing at all', () => {
  const form: SpawnForm = { session_role: 'CutCode', prompt: 'Build it.' };
  const brief = buildBrief(profile, undefined, form, undefined, [], null, assignment);
  assert.match(brief, /Your assignment has 2 desks:/);
  assert.match(brief, /cowork\s+\/w\/cowork\/team\/comp\/fable\s+→ team\/comp\/dev\s+\(you start here\)/);
  assert.match(brief, /services\s+\/w\/services\/team\/comp\/fable\s+→ team\/comp\/dev/);
  assert.match(brief, /Work only in a desk; the desk contract is in your README\./);
  assert.doesNotMatch(brief, /BYOIN/, 'the brief states desks, not the Git contract the README already carries');

  const none = buildBrief(profile, undefined, form, undefined, [], null, null);
  assert.doesNotMatch(none, /desk/i, 'a launch with no assignment is told nothing about desks');
});

test('the desk contract is the Worktrees Routine\'s page: no Routine, no desk reading', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-launch-desks-test-'));
  const oldCache = process.env.RONIN_SESSION_BOOT_CACHE_DIR;
  const oldCatalogs = process.env.RONIN_CATALOGS_DIR;
  process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
  process.env.RONIN_CATALOGS_DIR = path.join(temp, 'catalogs');
  try {
    const without = (await bootFiles('', false, [])).map((f) => path.basename(f));
    const withRoutine = await bootFiles('', false, ['routine/ronin_worktrees/WORKTREES.md']);
    const names = withRoutine.map((f) => path.basename(f));
    assert.ok(!without.includes('WORKTREES.md'), 'no Worktrees Routine, no desk reading');
    assert.ok(names.includes('WORKTREES.md'), 'the Worktrees Routine reads its page');
    assert.deepEqual(names.filter((f) => f !== 'WORKTREES.md').sort(), without.sort(), 'the Routine adds exactly one page');
    assert.ok(!names.some((f) => f.includes('DESK_CONTRACT')), 'there is no separate desk contract');
    const contract = await readFile(withRoutine.find((f) => path.basename(f) === 'WORKTREES.md')!, 'utf8');
    assert.match(contract, /Your brief names no desk/);
    assert.match(contract, /Stop and ask the team lead when the desk is missing or contradictory/);
    assert.match(contract, /tejun-desk status --assignment/);
    assert.match(contract, /never by making a branch or worktree yourself/);
  } finally {
    if (oldCache === undefined) delete process.env.RONIN_SESSION_BOOT_CACHE_DIR; else process.env.RONIN_SESSION_BOOT_CACHE_DIR = oldCache;
    if (oldCatalogs === undefined) delete process.env.RONIN_CATALOGS_DIR; else process.env.RONIN_CATALOGS_DIR = oldCatalogs;
    await rm(temp, { recursive: true, force: true });
  }
});

test('Ronin Worktrees declares its one page, and no separate desk contract', async () => {
  const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
  const control = await readFile(path.join(repo, 'ronin_catalogs', 'routines', 'ronin_worktrees.md'), 'utf8');
  assert.match(control, /\*\*reading:\*\* routine\/ronin_worktrees\/WORKTREES\.md/);
  assert.doesNotMatch(control, /assignment\/DESK_CONTRACT\.md/);
});
