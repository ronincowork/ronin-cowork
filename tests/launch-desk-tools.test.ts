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
const listed = (ids: string[]) => ({ read_at: '2026-09-18T00:00:00Z', by: 'test', rows: ids.map((id) => ({ id, name: id })) });
const providers = { measured_at: '2026-09-18T00:00:00Z', installed: ['claude'], signed_in: ['claude'], operational: ['claude'], activated_count: 1, paths: {}, versions: {}, latest: {}, off: [], refreshed_at: '', models: { claude: listed(['claude-fable-5-1']) } };
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
  agents: { sessions: { default: { provider: 'anthropic', model: 'claude-fable-5-1' } } },
  campaigns: { home_machine: { title: 'Ronin Home', state: 'active', providers, config: { agent_defaults: {} } } },
}));
await fs.mkdir(path.join(tmp, 'shelf', 'all'), { recursive: true });
await fs.writeFile(path.join(tmp, 'shelf', 'all', 'ALL_BOOK.md'), '# ALL_BOOK.md');

const { createTeamRoster } = await import('../src/team-rosters.js');
const { saveWorkspace, workspaceLaunchFolder, roninHouse } = await import('../src/workspaces.js');
const { resolveForm } = await import('../src/spawn.js');

// The Team's Workspace holds the managed cowork repository, the ronin_lab checkout and a folder.
await saveWorkspace({
  name: 'papers_ws', campaign_id: 'home_machine', title: 'Papers', objective: 'write it up from the code', instructions: '',
  repos: [{ name: 'cowork', note: '' }, { name: 'ronin_lab', note: 'notes' }], folders: [{ path: '/srv/papers', note: 'drafts' }], launch_mode: 'configured',
});
await createTeamRoster('papers', { objective: 'write it up from the code', workspace: 'papers_ws', branch: '' }, 'home_machine');

test('a Team Agent starts in its Workspace launch folder, its brief naming the repositories and folders', async () => {
  const resolved = await resolveForm({ team: 'papers', prompt: 'Write it up.' }, new Set());
  assert.equal(resolved.workspace, 'papers_ws');
  assert.equal(resolved.dir, workspaceLaunchFolder('home_machine', 'papers_ws'), 'born in the Workspace launch folder, never a repository');
  assert.match(resolved.brief, /^## Workspace — Papers$/m);
  assert.match(resolved.brief, /^- cowork .* — worktree: `worktree-desk open cowork`$/m, 'a managed repository is opened when needed');
  assert.match(resolved.brief, /^- ronin_lab .* — shared checkout \(notes\)$/m);
  assert.match(resolved.brief, /^- \/srv\/papers — drafts$/m);
  assert.doesNotMatch(resolved.brief, /Born in|Repository approaches/);
  assert.equal(resolved.capabilities.find((row) => row.name === 'worktree-desk')?.selected, true, 'desk teaching is ready for managed work');
});

test('an Agent without a Team has no Workspace and starts in Ronin house', async () => {
  const resolved = await resolveForm({ prompt: 'Read the papers.' }, new Set());
  assert.equal(resolved.workspace, '');
  assert.equal(resolved.dir, roninHouse());
  assert.doesNotMatch(resolved.brief, /## Workspace/);
});
