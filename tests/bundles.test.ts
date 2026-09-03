/**
 * TEMPLATE BUNDLES (src/bundles.ts): the document is held to its shape, a plan says what an
 * install would do and why, an install lands only in the owner's stores and is idempotent,
 * a tool never replaces one of Ronin's, and a pack carries back out exactly what the
 * owner's copies hold. Every user store is pointed at a temp root; no live store, no
 * tmux, no socket, no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(tmpdir(), 'ronin-bundles-'));
process.env.RONIN_USER_ROOT = path.join(root, 'user');
process.env.RONIN_DATA_ROOT = path.join(root, 'data');
const { installBundle, packBundle, parseBundle, parseLibraryIndex, planInstall, libraryCard, bundleHolds, BUNDLE_FORMAT, LIBRARY_FORMAT } =
  await import('../src/bundles.js');
const { listTeamTemplates, listRoutines } = await import('../src/resource-adapters.js');
const { resolveBehaviourBooks } = await import('../src/behaviours.js');
const { STOCK_DIR } = await import('../src/resources.js');
const { storeDir } = await import('../src/resources.js');

const TEAM = `# Weekly Review
- **label:** Weekly Review
- **art:** 🗓
- **blurb:** A week looked back on, and the next one shaped.
- **kinds:** work
- **objective:** Review the week and shape the next.
- **behaviours:** sops:weekly_review
- **routines_on:** weekly_review

## agents

### review lead
- **team_lead:** yes
- **instructions:** Run the review.
- **mandate:** execute · nobody · an artifact
`;
const SOP = '# weekly_review — how this house reviews a week\n\nLook back, then forward.\n';
const ROUTINE = `# Weekly Review
- **label:** Weekly Review
- **blurb:** The review macro and its book.
- **reading:** —
- **sops:** weekly_review
- **macros:** review
- **actions:** —
- **tools:** tejun-review
- **mcp:** —
- **requires:** ronin_base
- **bundles:** —
- **order:** 90
`;
const MACRO = `## review
- **class:** session_macro.workflow
- **label:** +review:
- **blurb:** Look back over the week and shape the next one.

Owner-invoked. Read the week's work records, then write the review.`;
const TOOL = '#!/usr/bin/env bash\necho REVIEWED\n';
const TOOL_ROW = '| `tejun-review` | report-outcome | `tejun-review` → `REVIEWED`. |';

const bundle = () => parseBundle({
  format: BUNDLE_FORMAT,
  name: 'weekly_review',
  label: 'Weekly Review',
  art: '🗓',
  blurb: 'A week looked back on.',
  kinds: ['work', 'nonsense'],
  version: '2026-09-03',
  files: [
    { store: 'catalogs', path: 'templates/teams/weekly_review.md', text: TEAM },
    { store: 'catalogs', path: 'routines/weekly_review.md', text: ROUTINE },
    { store: 'sops', path: 'weekly_review.md', text: SOP },
    { store: 'tools', path: 'tejun-review', text: TOOL },
  ],
  entries: [
    { catalog: 'MACROS.md', name: 'review', text: MACRO },
    { catalog: 'TOOLS.md', name: 'tejun-review', text: TOOL_ROW },
  ],
});

test('a bundle is held to its shape', () => {
  assert.throws(() => parseBundle({ format: 'x' }), /not ronin-bundle\/1/);
  assert.throws(() => parseBundle({ format: BUNDLE_FORMAT, name: 'Bad Name', files: [] }), /lowercase/);
  assert.throws(() => parseBundle({ format: BUNDLE_FORMAT, name: 'x', files: [{ store: 'sops', path: '../etc/passwd.md', text: '' }] }), /inside its store/);
  assert.throws(() => parseBundle({ format: BUNDLE_FORMAT, name: 'x', files: [{ store: 'catalogs', path: 'PROJECT_ROOTS.md', text: '' }] }), /catalog file sits on/);
  assert.throws(() => parseBundle({ format: BUNDLE_FORMAT, name: 'x', files: [{ store: 'tools', path: 'tmux', text: '' }] }), /never supplies a guard/);
  assert.throws(() => parseBundle({ format: BUNDLE_FORMAT, name: 'x', files: [{ store: 'sops', path: 'a.md', text: 'x' }], entries: [{ catalog: 'MACROS.md', name: 'a', text: '## b\n' }] }), /own `## name` heading/);
  assert.throws(() => parseBundle({ format: BUNDLE_FORMAT, name: 'x', files: [] }), /holds nothing/);
  const b = bundle();
  assert.deepEqual(b.kinds, ['work'], 'an unruled kind is dropped, not fatal');
  assert.equal(b.files.find((f) => f.store === 'tools')?.executable, true);
  assert.deepEqual(bundleHolds(b), { teams: 1, routines: 1, sops: 1, tools: 2, macros: 1 });
});

test('the plan says what an install would do, and a tool never replaces one of Ronin\'s', async () => {
  const stockTeam = await readFile(path.join(STOCK_DIR, 'templates/teams/staff_my_codebase.md'), 'utf8');
  const b = parseBundle({
    format: BUNDLE_FORMAT,
    name: 'probe',
    files: [
      { store: 'catalogs', path: 'templates/teams/staff_my_codebase.md', text: stockTeam },
      { store: 'catalogs', path: 'templates/teams/dinner_party.md', text: '# Dinner Party\n- **label:** Mine\n' },
      { store: 'sops', path: 'brand_new.md', text: '# new\n' },
      { store: 'tools', path: 'tejun-send', text: '#!/bin/sh\n' },
    ],
    entries: [
      { catalog: 'MACROS.md', name: 'forkit', text: '## forkit\n- **label:** mine\n' },
      { catalog: 'TOOLS.md', name: 'tejun', text: '| `tejun` | compile-macro | mine |' },
    ],
  });
  const plan = await planInstall(b);
  const verdict = (p: string) => plan.find((i) => i.path === p)?.verdict;
  assert.equal(verdict('templates/teams/staff_my_codebase.md'), 'same-as-shipped');
  assert.equal(verdict('templates/teams/dinner_party.md'), 'shadows-shipped');
  assert.equal(verdict('brand_new.md'), 'new');
  assert.equal(verdict('tejun-send'), 'refused');
  assert.equal(verdict('forkit'), 'shadows-shipped');
  assert.equal(verdict('tejun'), 'refused');
  const receipt = await installBundle(b);
  assert.deepEqual(receipt.refused.map((i) => i.path).sort(), ['tejun', 'tejun-send']);
  assert.deepEqual(receipt.skipped.map((i) => i.path), ['templates/teams/staff_my_codebase.md']);
  assert.deepEqual(receipt.written.map((i) => i.path).sort(), ['brand_new.md', 'forkit', 'templates/teams/dinner_party.md']);
  await rm(storeDir('catalogs'), { recursive: true, force: true });
  await rm(storeDir('sops'), { recursive: true, force: true });
});

test('an install lands in the owner\'s stores, reads back, and is idempotent', async () => {
  const first = await installBundle(bundle());
  assert.equal(first.refused.length, 0);
  assert.equal(first.written.length, 6);
  const team = (await listTeamTemplates()).find((row) => row.name === 'weekly_review');
  assert.equal(team?.origin, 'user');
  assert.equal(team?.agents[0]?.team_lead, true);
  assert.deepEqual(team?.routines_on, ['weekly_review']);
  const books = await resolveBehaviourBooks(team?.behaviours ?? []);
  assert.equal(books.delivered[0]?.file, path.join(storeDir('sops'), 'weekly_review.md'));
  const routine = (await listRoutines()).find((r) => r.name === 'weekly_review');
  assert.deepEqual(routine?.tools, ['tejun-review']);
  const tool = await stat(path.join(storeDir('tools'), 'tejun-review'));
  assert.ok(tool.mode & 0o100, 'a bundled tool is executable');
  const macros = await readFile(path.join(storeDir('catalogs'), 'MACROS.md'), 'utf8');
  assert.match(macros, /^## review$/m);
  assert.match(macros, /Ronin made this file/, 'the user copy opens with the seeded header');
  const tools = await readFile(path.join(storeDir('catalogs'), 'TOOLS.md'), 'utf8');
  assert.match(tools, /^\| Tool \| Implements \(action\) \| Usage \|$/m);
  assert.match(tools, /^\| `tejun-review` \|/m);

  const again = await installBundle(bundle());
  assert.equal(again.written.length, 0);
  assert.equal(again.skipped.length, 6);
  assert.ok(again.skipped.every((i) => i.verdict === 'same-as-yours'));

  // The owner edits their copy; the bundle does not write over it unless told to.
  await writeFile(path.join(storeDir('sops'), 'weekly_review.md'), '# mine now\n');
  const kept = await installBundle(bundle());
  assert.equal(kept.skipped.find((i) => i.path === 'weekly_review.md')?.verdict, 'replaces-yours');
  assert.equal(await readFile(path.join(storeDir('sops'), 'weekly_review.md'), 'utf8'), '# mine now\n');
  const replaced = await installBundle(bundle(), { replace: true });
  assert.equal(replaced.written.find((i) => i.path === 'weekly_review.md')?.verdict, 'replaces-yours');
  assert.equal(await readFile(path.join(storeDir('sops'), 'weekly_review.md'), 'utf8'), SOP);

  // An entry of the owner's is replaced in place, not appended twice.
  const edited = { ...bundle(), entries: [{ catalog: 'MACROS.md' as const, name: 'review', text: MACRO.replace('Look back', 'Look BACK') }] };
  await installBundle(edited, { replace: true });
  const merged = await readFile(path.join(storeDir('catalogs'), 'MACROS.md'), 'utf8');
  assert.equal(merged.match(/^## review$/mg)?.length, 1);
  assert.match(merged, /Look BACK/);
});

test('a pack carries back out what the owner\'s copies hold, and reads as a bundle', async () => {
  await mkdir(storeDir('ways'), { recursive: true });
  await writeFile(path.join(storeDir('ways'), 'my_way.md'), '# My way\n- **kinds:** work\n\nMine.\n');
  const packed = await packBundle({ team: 'weekly_review', ways: ['my_way'], version: '2026-09-03' });
  const paths = packed.files.map((f) => `${f.store}:${f.path}`).sort();
  assert.deepEqual(paths, [
    'catalogs:routines/weekly_review.md',
    'catalogs:templates/teams/weekly_review.md',
    'sops:weekly_review.md',
    'tools:tejun-review',
    'ways:my_way.md',
  ]);
  assert.deepEqual(packed.entries.map((e) => `${e.catalog}:${e.name}`).sort(), ['MACROS.md:review', 'TOOLS.md:tejun-review']);
  assert.equal(packed.entries.find((e) => e.catalog === 'TOOLS.md')?.text, TOOL_ROW);
  assert.equal(packed.label, 'Weekly Review');
  await assert.rejects(packBundle({ team: 'no_such_team' }), /not a team template/);

  // A shipped template packs its own file; the stock books it names stay named, not copied.
  const shipped = await packBundle({ team: 'staff_my_codebase' });
  assert.deepEqual(shipped.files.map((f) => f.path), ['templates/teams/staff_my_codebase.md']);

  const text = JSON.stringify(packed);
  const card = libraryCard(packed, text, 'bundles/weekly_review.json');
  assert.equal(card.sha256.length, 64);
  assert.deepEqual(card.holds, { teams: 1, routines: 1, sops: 1, tools: 2, ways: 1, macros: 1 });
  const index = parseLibraryIndex({ format: LIBRARY_FORMAT, bundles: [card, { name: 'evil', url: 'https://elsewhere.example/x.json' }, { name: 'up', url: '../x.json' }] });
  assert.deepEqual(index.bundles.map((c) => c.name), ['weekly_review'], 'a card pointing off the library is dropped');
  assert.throws(() => parseLibraryIndex({ format: 'nope' }), /not ronin-library\/1/);
});

test.after(async () => {
  delete process.env.RONIN_USER_ROOT;
  delete process.env.RONIN_DATA_ROOT;
  await rm(root, { recursive: true, force: true });
});
