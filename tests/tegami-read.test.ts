/**
 * TEGAMI-READ — core's reader of an Agent's work record, the one behind View Work Record.
 * The letter gives objective, mandate, repos, holds and the position; the ladder is the
 * focus item's and the docs are every held item's, read from the work item store. Pinned:
 * the fence is optional, the position wins over inference, a frontier gate outranks phase
 * counting, on_tangent outranks position, and the doc list only lists what exists.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-tegami-read-'));
// Every store under private roots, whoever runs this file: holder scans and arrival
// notices must never reach a live roster, letter or message queue.
const isolated = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-isolated-'));
process.env.RONIN_DATA_ROOT = path.join(isolated, 'data');
process.env.RONIN_USER_ROOT = path.join(isolated, 'user');
delete process.env.RONIN_SOCKET;
delete process.env.TMUX;
process.env.TMUX_TMPDIR = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-tegami-read-tmux-'));
process.env.RONIN_SESSION_DIR = temp;
process.env.RONIN_WORK_ITEMS_DIR = path.join(temp, '.work-items');

const { readTegami } = await import('../src/tegami-read.js');
const { createItem } = await import('../src/work-items.js');
type Rung = NonNullable<Parameters<typeof createItem>[0]['ladder']>[number];

// No tmux server answers here, so a session key is its bare name and the letter is read
// from <session store>/<name>/tegami.md.
async function writeLetter(name: string, block: string): Promise<void> {
  await fs.mkdir(path.join(temp, name), { recursive: true });
  await fs.writeFile(
    path.join(temp, name, 'tegami.md'),
    `# TEGAMI — ${name}\n> prose the parser must ignore\n\n\`\`\`json\n${block}\n\`\`\`\n`,
  );
}
const item = async (title: string, ladder: Rung[] = [], docs: string[] = []) => (await createItem({ title, ladder, docs }, 'test')).item.id;

test('a missing letter reads as null, not an error', async () => {
  assert.equal(await readTegami('tegami-read-nobody'), null);
});

test('holding nothing reads as no ladder and no item, not an invention', async () => {
  await writeLetter('tegami-read-empty', '{ "objective": "idle", "holds": [] }');
  const t = await readTegami('tegami-read-empty');
  assert.ok(t);
  assert.deepEqual([t.ladder, t.items, t.item, t.chip.text], [[], [], null, '—']);
});

test('the focus item gives the ladder: a gate at the frontier reads as held', async () => {
  const id = await item('born', [{ gate: 'go / no-go — read the brief, report back, wait', status: 'ACTIVE' }]);
  await writeLetter('tegami-read-born', `{ "objective": "prove the reader", "holds": ["${id}"] }`);
  const t = await readTegami('tegami-read-born');
  assert.ok(t);
  assert.equal(t.item?.id, id);
  assert.equal(t.chip.text, '⛩ GATE');
  assert.equal(t.chip.gate, true);
});

test('the position wins over inference, and legs render as position not score', async () => {
  const other = await item('other', [{ gate: 'not this one', status: 'ACTIVE' }]);
  const id = await item('fix', [
    { phase: 'find it', legs: [{ title: 'a', status: 'DONE' }] },
    { phase: 'fix it', legs: [{ title: 'b', status: 'DONE' }, { title: 'c', status: 'ACTIVE' }, { title: 'd', status: 'PLANNED' }] },
  ]);
  await writeLetter('tegami-read-at', `{ "objective": "", "holds": ["${other}", "${id}"], "at": { "item": "${id}", "rung": 2, "leg": 2 } }`);
  const t = await readTegami('tegami-read-at');
  assert.ok(t);
  assert.equal(t.item?.id, id, 'at.item picks the focus among what is held');
  assert.equal(t.chip.text, 'phase 2 · leg 2/3');
  assert.deepEqual(t.at, { item: id, rung: 2, leg: 2 });
  assert.deepEqual(t.holds, [other, id]);
});

test('on_tangent outranks position; on_track reads as on the ladder', async () => {
  const id = await item('tangent', [{ phase: 'p', legs: [{ title: 'x', status: 'ACTIVE' }] }]);
  await writeLetter('tegami-read-tangent', `{ "ladder_state": "on_tangent", "holds": ["${id}"] }`);
  const t = await readTegami('tegami-read-tangent');
  assert.ok(t);
  assert.equal(t.ladder_state, 'on_tangent');
  assert.equal(t.chip.text, '↳ on tangent');
});

test('docs are the README and every held item\'s docs, only what exists', async () => {
  const name = 'tegami-read-docs';
  const real = path.join(temp, 'a-real-doc.md');
  const second = path.join(temp, 'second.md');
  await fs.writeFile(real, 'x');
  await fs.writeFile(second, 'y');
  const one = await item('one', [], [real, path.join(temp, 'gone.md')]);
  const two = await item('two', [], [second]);
  await writeLetter(name, `{ "holds": ["${one}", "${two}"] }`);
  const readme = path.join(temp, name, 'README.md');
  await fs.writeFile(readme, '# Read first\n');
  const t = await readTegami(name);
  assert.ok(t);
  assert.deepEqual(t.docs, [readme, real, second]);
});

test('an unfenced bare object still parses — an agent that drops the fence keeps its readout', async () => {
  await fs.mkdir(path.join(temp, 'tegami-read-bare'), { recursive: true });
  await fs.writeFile(path.join(temp, 'tegami-read-bare', 'tegami.md'), '# letter\n{ "objective": "no fence" }\n');
  const t = await readTegami('tegami-read-bare');
  assert.ok(t);
  assert.equal(t.objective, 'no fence');
});
