// Parking an office (KAN-502): what the park carries beside the stores, ronin-export's
// --keep-links/--also, and ronin-rehydrate's refusals. Every root is a temp dir; nothing
// here starts Ronin or touches tmux. The whole round trip is proved on a rig (docs/operating/park.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function rig() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-park-'));
  const env = { ...process.env, HOME: home, RONIN_USER_ROOT: path.join(home, 'ronin'), RONIN_DATA_ROOT: path.join(home, '.ronin') };
  for (const k of Object.keys(env)) if (/^RONIN_.*_DIR$/.test(k)) delete env[k];
  return { home, env };
}

test('a park carries the Workspace Folders and each Agent\'s conversation and sign-in, not what a store holds', async () => {
  const { home, env } = await rig();
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    const user = env.RONIN_USER_ROOT!, data = env.RONIN_DATA_ROOT!;
    const lab = path.join(user, 'ronin_lab'), repo = path.join(home, 'code', 'app'), inner = path.join(repo, 'pkg');
    for (const d of [lab, inner, path.join(user, 'catalogs')]) await fs.mkdir(d, { recursive: true });
    await fs.writeFile(path.join(user, 'catalogs', 'PROJECT_ROOTS.md'), [
      `## home\n- **dir:** ${home}\n`, `## ronin_lab\n- **dir:** ${lab}\n`,
      `## app\n- **dir:** ${repo}\n`, `## pkg\n- **dir:** ${inner}\n`, `## gone\n- **dir:** ${path.join(home, 'nowhere')}\n`,
    ].join('\n'));
    const key = 'parked-1';
    const journal = path.join(home, '.claude', 'projects', '-x', 'uuid-1.jsonl');
    await fs.mkdir(path.join(path.dirname(journal), 'uuid-1'), { recursive: true });
    await fs.writeFile(journal, JSON.stringify({ sessionId: 'uuid-1', timestamp: '2026-11-14T00:00:00Z' }) + '\n');
    await fs.writeFile(path.join(home, '.claude', '.credentials.json'), '{}');
    await fs.writeFile(path.join(home, '.claude.json'), '{}');
    await fs.mkdir(path.join(data, 'sessions', key), { recursive: true });
    await fs.writeFile(path.join(data, 'sessions', key, 'launch-identity.json'), JSON.stringify({
      key, cli: 'claude', strategy: 'minted', providerSession: 'uuid-1', env: {},
      journal: { format: 'message-blocks', root: path.join(home, '.claude', 'projects'), pattern: '{session_id}.jsonl', idPath: 'sessionId', childPath: 'isSidechain' },
    }));
    const { parkCarry } = await import(`../src/machine-park.js?park=${Date.now()}`);
    const carry = await parkCarry([{ key, agent: 'claude' }]);
    // home holds Ronin's roots, so it is not carried whole; pkg rides inside app; gone is not there.
    assert.deepEqual(carry.folders, [repo, lab].sort());
    assert.deepEqual(carry.files, [
      path.join(home, '.claude.json'), path.join(home, '.claude', '.credentials.json'),
      path.join(path.dirname(journal), 'uuid-1'), journal,
    ].sort());
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    await fs.rm(home, { recursive: true, force: true });
  }
});

test('ronin-export --keep-links keeps a link inside a store a link, carries --also paths, and restores from a directory', async () => {
  const { home, env } = await rig();
  try {
    const worktree = path.join(env.RONIN_USER_ROOT!, 'worktrees', 'repo', 'desk');
    await fs.mkdir(worktree, { recursive: true });
    await fs.writeFile(path.join(worktree, 'wip.txt'), 'desk work');
    await fs.symlink('/nonexistent/node_modules', path.join(worktree, 'node_modules'));
    const folder = path.join(home, 'app.x'), near = path.join(home, 'app.xy');
    await fs.mkdir(folder); await fs.mkdir(near);
    await fs.writeFile(path.join(folder, 'f'), 'f'); await fs.writeFile(path.join(near, 'g'), 'g');
    const out = path.join(home, 'out.tar.gz');
    const made = spawnSync(path.join(ROOT, 'bin', 'ronin-export'),
      ['--keep-links', '--out', out, '--also', `folders${folder}=${folder}`], { env, encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr);
    const listing = spawnSync('tar', ['-tvzf', out], { encoding: 'utf8' }).stdout;
    assert.match(listing, /RONIN-EXPORT\/stores\/worktrees\/repo\/desk\/node_modules -> \/nonexistent\/node_modules/);
    assert.match(listing, new RegExp(`folders${folder.replace(/[.]/g, '\\.')}/f`));
    assert.doesNotMatch(listing, /app\.xy/); // a name sharing the prefix is not swept in
    const unpacked = path.join(home, 'unpacked');
    await fs.mkdir(unpacked);
    spawnSync('tar', ['-C', unpacked, '-xzf', out]);
    const fresh = { ...env, RONIN_USER_ROOT: path.join(home, 'fresh') };
    const restored = spawnSync(path.join(ROOT, 'bin', 'ronin-export'), ['--restore', unpacked], { env: fresh, encoding: 'utf8' });
    assert.equal(restored.status, 0, restored.stderr);
    const desk = path.join(home, 'fresh', 'worktrees', 'repo', 'desk');
    assert.equal(await fs.readlink(path.join(desk, 'node_modules')), '/nonexistent/node_modules');
    assert.equal(await fs.readFile(path.join(desk, 'wip.txt'), 'utf8'), 'desk work');
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

async function rehydrateRefusal(manifest: Record<string, unknown>): Promise<{ state: string; error: string }> {
  const { home, env } = await rig();
  try {
    const stage = path.join(home, 'stage');
    await fs.mkdir(stage);
    await fs.writeFile(path.join(stage, 'manifest.json'), JSON.stringify(manifest));
    const file = path.join(home, 'office.tar.gz');
    spawnSync('tar', ['-C', stage, '-czf', file, 'manifest.json']);
    const run = spawnSync(path.join(ROOT, 'bin', 'ronin-rehydrate'), [file, '--foreground'], { env, encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.doesNotMatch(run.stdout, /stopping Ronin/); // refused before anything was touched
    return JSON.parse(await fs.readFile(`${file}.status.json`, 'utf8'));
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}

test('ronin-rehydrate refuses a newer format, and says why in the status file', async () => {
  const status = await rehydrateRefusal({ format: 2, release: 'v1.0.0', agents: [] });
  assert.equal(status.state, 'failed');
  assert.match(status.error, /format 2, from a newer Ronin/);
});

test('ronin-rehydrate refuses a file from a newer release than this install', async () => {
  const status = await rehydrateRefusal({ format: 1, release: 'v99.0.0', agents: [] });
  assert.equal(status.state, 'failed');
  assert.match(status.error, /made by v99\.0\.0 .* an older release/);
});
