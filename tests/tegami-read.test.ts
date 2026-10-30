/**
 * TEGAMI-READ — core's reader of an Agent's work record, the one behind View Work Record.
 * The letter gives objective, mandate, repos and holds; the items held (with their status)
 * and their attachments are read from the work item store. Pinned: the fence is optional, the chip
 * is the held items with their status, and the doc list only lists
 * what exists. There is no ladder: Jira has none.
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
const { createItem, flagItem } = await import('../src/work-items.js');

// No tmux server answers here, so a session key is its bare name and the letter is read
// from <session store>/<name>/tegami.md.
async function writeLetter(name: string, block: string): Promise<void> {
  await fs.mkdir(path.join(temp, name), { recursive: true });
  await fs.writeFile(
    path.join(temp, name, 'tegami.md'),
    `# TEGAMI — ${name}\n> prose the parser must ignore\n\n\`\`\`json\n${block}\n\`\`\`\n`,
  );
}
const item = async (title: string, docs: string[] = []) => (await createItem({ title, attachments: docs }, 'test')).item.id;

test('a missing letter reads as null, not an error', async () => {
  assert.equal(await readTegami('tegami-read-nobody'), null);
});

test('holding nothing reads as no items, not an invention', async () => {
  await writeLetter('tegami-read-empty', '{ "objective": "idle", "holds": [] }');
  const t = await readTegami('tegami-read-empty');
  assert.ok(t);
  assert.deepEqual([t.items, t.chip.text, 'ladder' in t], [[], '—', false]);
});

test('the chip is the items held with their status; a flagged one marks it', async () => {
  const ids = [await item('a'), await item('b'), await item('c'), await item('d')];
  await flagItem(ids[1]!, true, undefined, 'test');
  await writeLetter('tegami-read-held', `{ "objective": "", "holds": ${JSON.stringify(ids)}, "at": { "item": "${ids[0]}", "rung": 2 } }`);
  const t = await readTegami('tegami-read-held');
  assert.ok(t);
  assert.equal(t.chip.text, `${ids[0]} To Do · ⚑ ${ids[1]} To Do · ${ids[2]} To Do · +1`);
  assert.equal(t.chip.gate, true);
  assert.deepEqual(t.holds, ids, 'an old "at" in the letter reads as nothing');
});

test('docs are every held item\'s attachments, only what exists', async () => {
  const name = 'tegami-read-docs';
  const real = path.join(temp, 'a-real-doc.md');
  const second = path.join(temp, 'second.md');
  await fs.writeFile(real, 'x');
  await fs.writeFile(second, 'y');
  const one = await item('one', [real, path.join(temp, 'gone.md')]);
  const two = await item('two', [second]);
  await writeLetter(name, `{ "holds": ["${one}", "${two}"] }`);
  await fs.writeFile(path.join(temp, name, 'AGENT_BIRTH_BRIEF.md'), '# Read first\n'); // the brief is not a Doc
  const t = await readTegami(name);
  assert.ok(t);
  assert.deepEqual(t.docs, [real, second]);
});

test('an unfenced bare object still parses — an agent that drops the fence keeps its readout', async () => {
  await fs.mkdir(path.join(temp, 'tegami-read-bare'), { recursive: true });
  await fs.writeFile(path.join(temp, 'tegami-read-bare', 'tegami.md'), '# letter\n{ "objective": "no fence" }\n');
  const t = await readTegami('tegami-read-bare');
  assert.ok(t);
  assert.equal(t.objective, 'no fence');
});
