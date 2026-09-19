/**
 * The parts rule: a Services part on disk runs only while the installation that claims it is
 * on for the Campaign; an unclaimed part always runs. Off is "as if not installed".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverParts, partClaims, partsToLoad } from '../src/parts.js';
import { listInstallations } from '../src/resource-adapters.js';

const installations = [
  { name: 'ronin_services', parts: ['counting', 'kanban', 'koe', 'koshi', 'koshi_weights', 'michi', 'rireki'] },
  { name: 'gbrain', parts: [] },
];
const onDisk = ['counting', 'gbrain', 'kanban', 'koe', 'koshi', 'koshi_weights', 'machine', 'michi', 'rireki'].map((name) => ({ name }));

test('Services off parks every part the installation claims; unclaimed parts still load', () => {
  const plan = partsToLoad(onDisk, installations, { ronin_services: false }, { task_manager: true, voice_hotwords: true, terminal_transcript: true });
  assert.deepEqual(plan.load.map((p) => p.name), ['gbrain', 'machine']);
  assert.deepEqual(plan.parked, ['counting', 'kanban', 'koe', 'koshi', 'koshi_weights', 'michi', 'rireki'].map((name) => ({ name, installation: 'ronin_services', reason: 'master_off' })));
});

test('Services on loads only selected claimed parts and never their siblings', () => {
  const plan = partsToLoad(onDisk, installations, { ronin_services: true }, { task_manager: true });
  assert.deepEqual(plan.load.map((p) => p.name), ['gbrain', 'kanban', 'machine', 'michi']);
  assert.deepEqual(plan.parked.map(({ name, reason }) => ({ name, reason })),
    ['counting', 'koe', 'koshi', 'koshi_weights', 'rireki'].map((name) => ({ name, reason: 'component_off' })));
  assert.deepEqual(plan.capabilities.find(({ name }) => name === 'task_manager'), {
    name: 'task_manager', parts: ['michi', 'kanban'],
  });
});

test('PARKED.md parks a part with its reason regardless of the installation switch', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'parts-parked-'));
  await mkdir(path.join(dir, 'rireki'));
  await writeFile(path.join(dir, 'rireki', 'register.ts'), '');
  await writeFile(path.join(dir, 'rireki', 'PARKED.md'), 'RIREKI is off in this beta: not ready, to be refactored\n\nDetails.\n');
  const parts = discoverParts(dir);
  assert.equal(parts[0].parked, 'RIREKI is off in this beta: not ready, to be refactored');
  const plan = partsToLoad(parts, installations, { ronin_services: true }, { terminal_transcript: true });
  assert.deepEqual(plan.load, []);
  assert.deepEqual(plan.parked, [{ name: 'rireki', reason: 'RIREKI is off in this beta: not ready, to be refactored' }]);
});

test('an absent or malformed switch map reads as off — the recorder never runs by accident', () => {
  for (const switches of [undefined, null, {}, [], 'on', { ronin_services: 'yes' }]) {
    const plan = partsToLoad(onDisk, installations, switches, { terminal_transcript: true });
    assert.equal(plan.load.some((p) => p.name === 'rireki'), false, `switches=${JSON.stringify(switches)}`);
  }
});

test('an explicit-empty capability map keeps transcript and voice parts off', () => {
  const plan = partsToLoad(onDisk, installations, { ronin_services: true }, {});
  assert.equal(plan.load.some((part) => part.name === 'rireki'), false);
  assert.equal(plan.load.some((part) => part.name === 'koe'), false);
});

test('the stock Ronin Services installation claims the recorder', async () => {
  const claims = partClaims(await listInstallations());
  assert.equal(claims.get('kanban'), 'ronin_services');
  assert.equal(claims.get('rireki'), 'ronin_services');
  assert.equal(claims.get('koshi'), 'ronin_services');
  assert.equal(claims.get('machine'), undefined, 'the Host part is unclaimed and always loads');
});

test('discoverParts lists directories with a register entry, and nothing else', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'parts-'));
  await mkdir(path.join(dir, 'rireki')); await writeFile(path.join(dir, 'rireki', 'register.ts'), '');
  await mkdir(path.join(dir, 'notes')); await writeFile(path.join(dir, 'notes', 'README.md'), '');
  await writeFile(path.join(dir, 'stray.ts'), '');
  assert.deepEqual(discoverParts(dir).map((p) => p.name), ['rireki']);
  assert.deepEqual(discoverParts(path.join(dir, 'missing')), []);
});

 test('Stats requires a claimed installation and explicit capability opt-in', () => {
  for (const selected of [{}, { usage_stats: false }, { usage_stats: true }]) {
    assert.equal(partsToLoad([{ name: 'counting' }], [], {}, selected).load.length, 0);
  }
  assert.equal(partsToLoad([{ name: 'counting' }], installations, { ronin_services: true }, { usage_stats: true }).load.length, 1);
});

test('an installation switch governs the part it claims, and a part no capability maps needs no component', () => {
  const parts = [{ name: 'gbrain' }, { name: 'counting' }, { name: 'machine' }];
  // gbrain is its own installation and belongs to no Ronin Services capability; machine is
  // claimed by nothing at all.
  const catalog = [{ name: 'gbrain', parts: ['gbrain'] }, { name: 'ronin_services', parts: ['counting'] }];
  const on = partsToLoad(parts, catalog, { gbrain: true, ronin_services: true }, { usage_stats: true });
  assert.deepEqual(on.load.map((p) => p.name), ['gbrain', 'counting', 'machine']);

  const off = partsToLoad(parts, catalog, { gbrain: false, ronin_services: true }, { usage_stats: true });
  // Switched off means not running. Claiming the part is what connects the switch to it:
  // an unclaimed part always loads, so gbrain's switch governed nothing until it did.
  assert.deepEqual(off.load.map((p) => p.name), ['counting', 'machine']);
  assert.deepEqual(off.parked, [{ name: 'gbrain', installation: 'gbrain', reason: 'master_off' }]);
});

test('the gbrain installation claims the part it switches', async () => {
  const catalog = await readFile(new URL('../ronin_catalogs/installations/gbrain.md', import.meta.url), 'utf8');
  assert.match(catalog, /^- \*\*parts:\*\* gbrain$/m);
});
