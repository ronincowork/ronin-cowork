/**
 * JOB CLASSES — the side manifest that shelves the ＋ New board (src/catalog.ts).
 *
 * The property under test is the layering ruling (owner, 2026-08-21): membership lives
 * in its OWN file in the catalogs store — never written into the shipped SESSION_JOBS.md,
 * never a shadow of a stock entry — so an upgrade cannot clobber a shelf and a shelf
 * cannot pin a house job to a stale entry. Plus the saveLaunch discipline it inherits:
 * a manifest that would not read back whole is never written.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readJobClasses, writeJobClasses } from '../src/catalog.js';

let root = '';
before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'ronin-job-classes-'));
  process.env.RONIN_USER_ROOT = root; // rootDir() reads this per call (src/stores.ts)
});
after(async () => {
  delete process.env.RONIN_USER_ROOT;
  await rm(root, { recursive: true, force: true });
});

test('a fresh store answers the two shipped shelves, memberships and all', async () => {
  const fresh = await readJobClasses();
  assert.deepEqual(fresh.map((c) => c.name), ['developer', 'assistant']);
  assert.ok(fresh[0].jobs.includes('CutCode'));
  assert.ok(fresh[1].jobs.includes('PersonalAssistant'));
  // Neither craft: OddJob and OpenShell sit flat under the shelves, on neither.
  assert.ok(!fresh.flatMap((c) => c.jobs).includes('OddJob'));
});

test('the manifest round-trips whole: order, multi-membership, and the empty shelf', async () => {
  const classes = [
    { name: 'coding', jobs: ['CutCode', 'ChaseBug'] },
    { name: 'personal', jobs: ['PersonalAssistant', 'Trainer'] },
    { name: 'health', jobs: ['Trainer'] }, // one job, two shelves — a class is a shelf, not a type
    { name: 'empty-shelf', jobs: [] }, // waiting for members; survives, unlike a derived group
  ];
  await writeJobClasses(classes);
  assert.deepEqual(await readJobClasses(), classes);
});

test('it writes ONE file, the manifest, and never touches the job catalog', async () => {
  const files = await readdir(path.join(root, 'catalogs'));
  assert.deepEqual(files, ['JOB_CLASSES.md']);
});

test('the file is the house entry format a person can hand-edit', async () => {
  const raw = await readFile(path.join(root, 'catalogs', 'JOB_CLASSES.md'), 'utf8');
  assert.match(raw, /^## coding$/m);
  assert.match(raw, /^- \*\*jobs:\*\* CutCode, ChaseBug$/m);
  assert.match(raw, /^## empty-shelf$/m); // an empty shelf is a heading with no jobs line
  assert.match(raw, /Ronin made this file/); // the header explains itself to the next reader
});

test('refusals are loud and nothing half-writes', async () => {
  const good = await readJobClasses();
  await assert.rejects(() => writeJobClasses([{ name: 'Has Spaces', jobs: [] }]), /not a class name/);
  await assert.rejects(
    () => writeJobClasses([{ name: 'twice', jobs: [] }, { name: 'twice', jobs: [] }]),
    /appears twice/,
  );
  await assert.rejects(() => writeJobClasses([{ name: 'ok', jobs: ['bad name!'] }]), /not a job name/);
  assert.deepEqual(await readJobClasses(), good); // every refusal left the manifest as it was
});

test('a job the catalog no longer knows stays in the manifest — a stock job may come back', async () => {
  await writeJobClasses([{ name: 'keeps', jobs: ['SomeRetiredJob'] }]);
  assert.deepEqual(await readJobClasses(), [{ name: 'keeps', jobs: ['SomeRetiredJob'] }]);
});

test('deleting every shelf is a saved decision, never papered over with the defaults', async () => {
  await writeJobClasses([]);
  assert.deepEqual(await readJobClasses(), []); // the file exists and says none
});
