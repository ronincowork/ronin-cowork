// RONIN_REPO is the one gate for desks; adding a project root writes it (owner, 2026-08-29).
// declareArrangement: only a git repo, only when absent, never over a declaration.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { arrangementProfile, declareArrangement, readArrangement, setArrangementProfile } from '../src/desks/arrangement.js';

async function repo(branch: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ronin-arr-'));
  execFileSync('git', ['-C', dir, 'init', '-q', '-b', branch]);
  return dir;
}

test('managed: a new git repo gets the house arrangement, reviewed dev → master', async () => {
  const dir = await repo('main');
  try {
    const text = await declareArrangement(dir, 'managed');
    assert.ok(text && text.includes('mode=reviewed') && text.includes('desks=managed'));
    const a = await readArrangement('x', dir);
    assert.equal(a.source, 'RONIN_REPO');
    assert.equal(a.mode, 'reviewed'); assert.equal(a.working, 'dev'); assert.equal(a.stable, 'master'); assert.equal(a.desks, 'managed');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('none: declared direct on the branch the checkout is on, no desks', async () => {
  const dir = await repo('trunk');
  try {
    await declareArrangement(dir, 'none');
    const a = await readArrangement('x', dir);
    assert.equal(a.mode, 'direct'); assert.equal(a.stable, 'trunk'); assert.equal(a.desks, 'none');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('never overwrites a declaration, and writes nothing outside a git repository', async () => {
  const dir = await repo('main');
  try {
    await writeFile(path.join(dir, 'RONIN_REPO'), 'mode=direct\nstable=main\ndesks=none\n');
    assert.equal(await declareArrangement(dir, 'managed'), null);
    assert.match(await readFile(path.join(dir, 'RONIN_REPO'), 'utf8'), /mode=direct/);
  } finally { await rm(dir, { recursive: true, force: true }); }
  const plain = await mkdtemp(path.join(os.tmpdir(), 'ronin-plain-'));
  try {
    assert.equal(await declareArrangement(plain, 'managed'), null);
    await assert.rejects(readFile(path.join(plain, 'RONIN_REPO')));
  } finally { await rm(plain, { recursive: true, force: true }); }
});

test('repository profile editor keeps owner branch names and unrelated keys', async () => {
  const dir = await repo('main');
  try {
    await writeFile(path.join(dir, 'RONIN_REPO'), '# owner note\nmode=reviewed\nworking=develop\nstable=release\ndesks=managed\npublish=release\n');
    const before = arrangementProfile(await readArrangement('x', dir));
    const a = await setArrangementProfile(dir, { mode: 'reviewed', working: 'integration/next', stable: 'production/v2', desks: 'none' }, before);
    assert.deepEqual(arrangementProfile(a), { mode: 'reviewed', working: 'integration/next', stable: 'production/v2', desks: 'none' });
    const text = await readFile(path.join(dir, 'RONIN_REPO'), 'utf8');
    assert.match(text, /^# owner note$/m); assert.match(text, /^publish=release$/m);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('repository profile editor removes working in direct mode and refuses stale confirmation', async () => {
  const dir = await repo('trunk');
  try {
    await writeFile(path.join(dir, 'RONIN_REPO'), 'mode=reviewed\nworking=develop\nstable=release\ndesks=managed\n');
    const stale = arrangementProfile(await readArrangement('x', dir));
    await writeFile(path.join(dir, 'RONIN_REPO'), 'mode=reviewed\nworking=other\nstable=release\ndesks=managed\n');
    await assert.rejects(setArrangementProfile(dir, { mode: 'direct', working: '', stable: 'trunk', desks: 'none' }, stale), /changed after this form was opened/);
    const current = arrangementProfile(await readArrangement('x', dir));
    const a = await setArrangementProfile(dir, { mode: 'direct', working: 'ignored', stable: 'trunk', desks: 'managed' }, current);
    assert.deepEqual(arrangementProfile(a), { mode: 'direct', working: '', stable: 'trunk', desks: 'managed' });
    assert.doesNotMatch(await readFile(path.join(dir, 'RONIN_REPO'), 'utf8'), /^working=/m);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
