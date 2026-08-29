// RONIN_REPO is the one gate for desks; adding a project root writes it (owner, 2026-08-29).
// declareArrangement: only a git repo, only when absent, never over a declaration.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { declareArrangement, readArrangement, setDesks } from '../src/desks/arrangement.js';

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

test('setDesks: the editor checkbox flips one project — off keeps the record, on makes a direct repo reviewed, absent is written fresh', async () => {
  const dir = await repo('main');
  try {
    await writeFile(path.join(dir, 'RONIN_REPO'), '# kept comment\nmode=reviewed\nworking=dev\nstable=master\ndesks=managed\npublish=dev,master\n');
    let a = await setDesks(dir, 'none');
    assert.equal(a.desks, 'none'); assert.equal(a.mode, 'reviewed'); assert.equal(a.working, 'dev');
    const text = await readFile(path.join(dir, 'RONIN_REPO'), 'utf8');
    assert.match(text, /^# kept comment$/m); assert.match(text, /^publish=dev,master$/m); assert.equal((text.match(/^desks=/gm) || []).length, 1);
    a = await setDesks(dir, 'managed');
    assert.equal(a.desks, 'managed');
  } finally { await rm(dir, { recursive: true, force: true }); }

  const direct = await repo('main');
  try {
    await writeFile(path.join(direct, 'RONIN_REPO'), 'mode=direct\nstable=main\ndesks=none\n');
    const a = await setDesks(direct, 'managed');
    assert.equal(a.mode, 'reviewed'); assert.equal(a.working, 'dev'); assert.equal(a.stable, 'master'); assert.equal(a.desks, 'managed');
  } finally { await rm(direct, { recursive: true, force: true }); }

  const fresh = await repo('main');
  try {
    const a = await setDesks(fresh, 'managed');
    assert.equal(a.source, 'RONIN_REPO'); assert.equal(a.desks, 'managed');
  } finally { await rm(fresh, { recursive: true, force: true }); }

  const plain = await mkdtemp(path.join(os.tmpdir(), 'ronin-plain-'));
  try { await assert.rejects(setDesks(plain, 'managed'), /not a git repository/); } finally { await rm(plain, { recursive: true, force: true }); }
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
