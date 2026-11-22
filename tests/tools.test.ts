/**
 * An Agent's tools reach Ronin: each `ronin_bin` command run the way a pane runs it, over
 * the operator socket it was told at birth, as the session it runs in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { bootRonin, until } from './helpers/ronin.js';

const ronin = await bootRonin('tools');
test.after(() => ronin.stop());

await ronin.api('/api/launch', { body: { name: 'worker', provider: 'anthropic', prompt: 'Work.' } });
await ronin.api('/api/launch', { body: { session_type: 'terminal', name: 'mate' } });
const pane = await ronin.tmux.run('display-message', '-p', '-t', '=worker:', '#{pane_id}');
// Inside the worker's pane: the env a pane has, so the tool knows who is calling.
const asWorker = { TMUX_PANE: pane };
const item = async (...args: string[]) => {
  const r = await ronin.tool('item', [...args], { env: asWorker });
  assert.equal(r.status, 0, `item ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
const read = async (id: string) => JSON.parse(await item('read', id, '--json'));

test('ronin-url names the operator socket the session was told', async () => {
  const r = await ronin.tool('ronin-url', []);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), ronin.socket);
});

test('a tool with no Ronin listening says so and fails', async () => {
  const r = await ronin.tool('item', ['read', 'w1'], { env: { RONIN_SOCKET: path.join(ronin.scratch, 'nobody.sock') } });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no Ronin|not running/);
});

test('item: create lands on the caller; start, comment, hand in; the trail names the caller', async () => {
  const created = await item('create', '--title', 'Fix the till', '--objective', 'The till adds up.');
  const id = /created (\S+)/.exec(created)?.[1];
  assert.ok(id, created);
  assert.deepEqual((await read(id)).held_by, ['agent:worker']);

  await item('transition', id, 'In Progress');
  await item('comment', id, 'Found it.');
  await item('transition', id, 'In Review', '--note', 'Try a sale.');
  const now = await read(id);
  assert.equal(now.status, 'In Review', JSON.stringify(now));
  assert.ok(now.comments.some((c: { text: string }) => c.text === 'Found it.'));
  assert.ok(now.trail.length >= 4);
  assert.ok(now.trail.slice(1).every((t: { by: string }) => t.by === 'worker'), JSON.stringify(now.trail));

  const listed = await ronin.api(`/api/work-items/${id}`);
  assert.equal(listed.body.item.status, 'In Review', 'the board reads what the tool wrote');
});

test('item: an unknown id or status is refused', async () => {
  for (const args of [['read', 'w999'], ['transition', 'w1', 'Sideways']]) {
    const r = await ronin.tool('item', args, { env: asWorker });
    assert.notEqual(r.status, 0, args.join(' '));
  }
});

test('work-record: objective and documents written by the Agent read back', async () => {
  const doc = path.join(ronin.scratch, 'PLAN.md');
  await fs.writeFile(doc, '# Plan\n');
  for (const args of [['update_record', '--objective', 'Ship the till.'], ['add_doc', doc]]) {
    const r = await ronin.tool('work-record', args, { env: asWorker });
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
  }
  const r = await ronin.tool('work-record', ['read', '--json'], { env: asWorker });
  assert.equal(r.status, 0, r.stderr);
  const text = r.stdout;
  assert.match(text, /Ship the till\./);
  assert.ok(text.includes(doc));
});

test('notify_me: the caller is told once when the marked Agent\'s turn ends', async () => {
  const matePane = await ronin.tmux.run('display-message', '-p', '-t', '=mate:', '#{pane_id}');
  const r = await ronin.tool('notify_me', ['worker'], { env: { TMUX_PANE: matePane } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^MARKED worker/);
  const hook = (event: string) => ronin.api(`/api/asking?pane=${encodeURIComponent(pane)}`, { body: { hook_event_name: event }, headers: { 'content-type': 'text/plain' } });
  await hook('UserPromptSubmit');
  await hook('Stop');
  const line = 'worker finished its turn: waiting for you';
  await until(async () => (await ronin.tmux.run('capture-pane', '-p', '-t', '=mate:')).includes(line), 'the turn-end line in the pane');
  // The mark is gone: the next turn tells nobody. A Tell sent after it arrives after it.
  await hook('UserPromptSubmit');
  await hook('Stop');
  await ronin.tool('edges', ['send', 'mate', 'after-the-second-turn'], { env: asWorker });
  const screen = await until(async () => {
    const text = await ronin.tmux.run('capture-pane', '-p', '-S', '-200', '-t', '=mate:');
    return text.includes('after-the-second-turn') && text;
  }, 'the Tell after the second turn');
  assert.equal(screen.split(line).length - 1, 1);
});

test('edges send puts a message into another session\'s pane', async () => {
  const r = await ronin.tool('edges', ['send', 'mate', 'echo', 'delivered-by-edges'], { env: asWorker });
  assert.equal(r.status, 0, r.stderr);
  await until(async () => (await ronin.tmux.run('capture-pane', '-p', '-t', '=mate:')).includes('delivered-by-edges'), 'the message in the pane');
});
