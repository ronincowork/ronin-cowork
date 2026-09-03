/**
 * TEGAMI-READ — core's own reader of the letter, the one behind View Work Record on a
 * plain install. The parser was moved from michi (owner, 2026-09-02) and this floor
 * pins the behaviors the move must not lose: the fence is optional, the pointer wins,
 * a frontier gate outranks phase counting, on_tangent outranks position, and the doc
 * list only lists what exists.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-tegami-read-'));
process.env.RONIN_SESSION_DIR = temp;

const { readTegami } = await import('../src/tegami-read.js');

// No tmux session by these names exists, so sessionKey falls back to the bare name
// and the letter is read from <session store>/<name>/tegami.md.
async function writeLetter(name: string, block: string): Promise<void> {
  await fs.mkdir(path.join(temp, name), { recursive: true });
  await fs.writeFile(path.join(temp, name), '', { flag: 'a' }).catch(() => {});
  await fs.writeFile(
    path.join(temp, name, 'tegami.md'),
    `# TEGAMI — ${name}\n> prose the parser must ignore\n\n\`\`\`json\n${block}\n\`\`\`\n`,
  );
}

test('a missing letter reads as null, not an error', async () => {
  assert.equal(await readTegami('tegami-read-nobody'), null);
});

test('the seeded newborn shape parses: gate active, chip says held', async () => {
  await writeLetter('tegami-read-born', `{
    "objective": "prove the reader",
    "session_role": "CheckWork",
    "teams": [],
    "ladder": [
      { "gate": "go / no-go — read the brief, report back, wait", "status": "ACTIVE" }
    ] }`);
  const t = await readTegami('tegami-read-born');
  assert.ok(t);
  assert.equal(t.chip.text, '⛩ GATE');
  assert.equal(t.chip.gate, true);
  assert.equal(t.session_role, 'CheckWork');
});

test('the pointer wins over inference, and legs render as position not score', async () => {
  await writeLetter('tegami-read-at', `{
    "objective": "",
    "at": { "rung": 2, "leg": 2 },
    "ladder": [
      { "phase": "find it", "legs": [ { "title": "a", "status": "DONE" } ] },
      { "phase": "fix it", "legs": [
        { "title": "b", "status": "DONE" },
        { "title": "c", "status": "ACTIVE" },
        { "title": "d", "status": "PLANNED" } ] }
    ] }`);
  const t = await readTegami('tegami-read-at');
  assert.ok(t);
  assert.equal(t.chip.text, 'phase 2 · leg 2/3');
  assert.deepEqual(t.at, { rung: 2, leg: 2 });
});

test('on_tangent outranks position; on_track reads as on the ladder', async () => {
  await writeLetter('tegami-read-tangent', `{
    "ladder_state": "on_tangent",
    "ladder": [ { "phase": "p", "legs": [ { "title": "x", "status": "ACTIVE" } ] } ] }`);
  const t = await readTegami('tegami-read-tangent');
  assert.ok(t);
  assert.equal(t.ladder_state, 'on_tangent');
  assert.equal(t.chip.text, '↳ on tangent');
});

test('docs list only what exists, absolute paths only', async () => {
  const real = path.join(temp, 'a-real-doc.md');
  await fs.writeFile(real, 'x');
  await writeLetter('tegami-read-docs', `{
    "docs": ["${real}", "${path.join(temp, 'gone.md')}", "relative/path.md"],
    "ladder": [] }`);
  const t = await readTegami('tegami-read-docs');
  assert.ok(t);
  assert.deepEqual(t.docs, [real]);
  assert.equal(t.chip.text, '—', 'no ladder up reads as a dash, not an invention');
});

test('the session birth README is automatically tracked without an agent-authored docs entry', async () => {
  const name = 'tegami-read-birth';
  await writeLetter(name, '{ "docs": [], "ladder": [] }');
  const readme = path.join(temp, name, 'README.md');
  await fs.writeFile(readme, '# Read first\n');
  const t = await readTegami(name);
  assert.ok(t);
  assert.deepEqual(t.docs, [readme]);
});

test('an unfenced bare object still parses — an agent that drops the fence keeps its readout', async () => {
  await fs.mkdir(path.join(temp, 'tegami-read-bare'), { recursive: true });
  await fs.writeFile(
    path.join(temp, 'tegami-read-bare', 'tegami.md'),
    '# letter\n{ "objective": "no fence", "ladder": [ { "title": "loose leg", "status": "ACTIVE" } ] }\n',
  );
  const t = await readTegami('tegami-read-bare');
  assert.ok(t);
  assert.equal(t.objective, 'no fence');
  assert.equal(t.ladder.length, 1, 'a loose leg folds into an implicit phase');
  assert.equal(t.ladder[0].legs?.[0].title, 'loose leg');
});
