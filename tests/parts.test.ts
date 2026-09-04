/**
 * The parts rule: a Services part on disk runs only while the Routine that claims it is
 * on for the Campaign; an unclaimed part always runs. Off is "as if not installed".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverParts, partClaims, partsToLoad } from '../src/parts.js';
import { listRoutines } from '../src/resource-adapters.js';

const routines = [
  { name: 'ronin_services', parts: ['counting', 'koe', 'koshi', 'koshi_weights', 'michi', 'rireki'] },
  { name: 'gbrain', parts: [] },
];
const onDisk = ['counting', 'gbrain', 'koe', 'koshi', 'koshi_weights', 'machine', 'michi', 'rireki'].map((name) => ({ name }));

test('Services off parks every part the Routine claims; unclaimed parts still load', () => {
  const plan = partsToLoad(onDisk, routines, { ronin_base: true, ronin_services: false });
  assert.deepEqual(plan.load.map((p) => p.name), ['gbrain', 'machine']);
  assert.deepEqual(plan.parked, ['counting', 'koe', 'koshi', 'koshi_weights', 'michi', 'rireki'].map((name) => ({ name, routine: 'ronin_services' })));
});

test('Services on loads everything on disk', () => {
  const plan = partsToLoad(onDisk, routines, { ronin_services: true });
  assert.deepEqual(plan.load.map((p) => p.name), onDisk.map((p) => p.name));
  assert.deepEqual(plan.parked, []);
});

test('an absent or malformed switch map reads as off — the recorder never runs by accident', () => {
  for (const switches of [undefined, null, {}, [], 'on', { ronin_services: 'yes' }]) {
    const plan = partsToLoad(onDisk, routines, switches);
    assert.equal(plan.load.some((p) => p.name === 'rireki'), false, `switches=${JSON.stringify(switches)}`);
  }
});

test('the stock Ronin Services Routine claims the recorder', async () => {
  const claims = partClaims(await listRoutines());
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
