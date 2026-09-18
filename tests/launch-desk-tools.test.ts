/**
 * BOTH REPOSITORY APPROACHES AND THE DESK TOOL ARE UNIVERSAL TEACHING. An Agent born in a checkout
 * (a repository of documents) whose Team has ticked a managed repository is assigned a desk
 * there, and its brief says "Get, update, and hand in through worktree-desk". The command
 * capability is taught to every Cowork Agent so a later managed assignment needs no loadout
 * change. The shipped `worktree-desk` executable is likewise always callable.
 * Real git in a temp dir, every store redirected; no tmux, no socket.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.BIND ??= '127.0.0.1';
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-launch-desk-tools-'));
process.env.RONIN_CATALOGS_DIR = path.join(tmp, 'catalogs');
process.env.RONIN_DESKS_DIR = path.join(tmp, 'desks');
process.env.RONIN_WORKTREES_DIR = path.join(tmp, 'worktrees');
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(tmp, 'rosters');
process.env.RONIN_SESSION_BOOT_DIR = path.join(tmp, 'shelf');
process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(tmp, 'generated');
process.env.RONIN_CONFIG_DIR = path.join(tmp, 'config');
process.env.RONIN_LEDGER_DIR = path.join(tmp, 'ledger');

const sh = (dir: string, args: string[]) =>
  execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

async function makeRepo(name: string, roninRepo: string | null): Promise<string> {
  const dir = path.join(tmp, name);
  await fs.mkdir(dir, { recursive: true });
  sh(dir, ['init', '-q', '-b', 'master']);
  sh(dir, ['config', 'user.email', 'test@example.invalid']);
  sh(dir, ['config', 'user.name', 'test']);
  await fs.writeFile(path.join(dir, 'README.md'), `# ${name}\n`);
  if (roninRepo !== null) await fs.writeFile(path.join(dir, 'RONIN_REPO'), roninRepo);
  sh(dir, ['add', '-A']);
  sh(dir, ['commit', '-q', '-m', 'first']);
  sh(dir, ['branch', 'dev']);
  sh(dir, ['checkout', '-q', 'dev']);
  return dir;
}

// A managed repository (worktree root) and a checkout of documents with no arrangement.
const cowork = await makeRepo('cowork', 'mode=reviewed\nworking=dev\nstable=master\ndesks=managed\n');
const roninLab = await makeRepo('ronin_lab', null);

await fs.mkdir(process.env.RONIN_CATALOGS_DIR!, { recursive: true });
await fs.writeFile(path.join(process.env.RONIN_CATALOGS_DIR!, 'PROJECT_ROOTS.md'), [
  '# roots', '',
  '## cowork', `- **dir:** ${cowork}`, '- **remit:** the code', '',
  '## ronin_lab', `- **dir:** ${roninLab}`, '- **remit:** the papers', '',
].join('\n'));
await fs.mkdir(path.join(tmp, 'config'), { recursive: true });
await fs.writeFile(path.join(tmp, 'config', 'machine_settings.json'), JSON.stringify({
  agents: { sessions: { default: { provider: 'anthropic', model: 'fable' } } },
  campaigns: { home_machine: { title: 'Ronin Home', state: 'active', config: { agent_defaults: {} } } },
}));
await fs.mkdir(path.join(tmp, 'shelf', 'all'), { recursive: true });
await fs.writeFile(path.join(tmp, 'shelf', 'all', 'ALL_BOOK.md'), '# ALL_BOOK.md');

const { createTeamRoster } = await import('../src/team-rosters.js');
const { resolveForm } = await import('../src/spawn.js');

// The Team works in cowork; its papers, and this Agent's birth root, are the ronin_lab checkout.
await createTeamRoster('papers', { objective: 'write it up from the code', project_root: 'ronin_lab', repos: ['cowork'], branch: '' });

test('an Agent born in a checkout with a managed desk is projected the desk kit', async () => {
  const resolved = await resolveForm({ project_root: 'ronin_lab', team: 'papers', prompt: 'Write it up.' }, new Set());
  assert.equal(resolved.project_root, 'ronin_lab', 'born in the checkout');
  assert.deepEqual(resolved.assignment?.desks.map((desk) => desk.repo), ['cowork'], 'assigned one desk in the managed repository');
  assert.ok(resolved.work_locations.some((row) => row.repo === 'cowork' && row.mode === 'managed'), 'the desk is a managed location');
  assert.match(resolved.brief, /hand in through worktree-desk/, 'the brief tells the Agent to use the desk tool');
  assert.equal(resolved.capabilities.find((row) => row.name === 'worktree-desk')?.selected, true, 'managed work selects desk teaching');
  assert.ok(resolved.capability_tools.includes('worktree-desk'), `the Cowork desk tool is projected: ${JSON.stringify(resolved.capability_tools)}`);
  assert.equal(resolved.capability_tools.filter((tool) => tool === 'worktree-desk').length, 1, 'one executable carries the whole desk kit');
});

test('an Agent born in a checkout with no desk still receives universal desk teaching and its tool', async () => {
  const resolved = await resolveForm({ project_root: 'ronin_lab', prompt: 'Read the papers.' }, new Set());
  assert.equal(resolved.assignment, null);
  assert.equal(resolved.capabilities.find((row) => row.name === 'worktree-desk')?.selected, true, 'desk teaching is ready for later managed work');
  assert.ok(resolved.capability_tools.includes('worktree-desk'), 'work context does not withhold an installed Cowork tool');
});
