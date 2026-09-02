import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverSafe, draftAtPrompt, parsePrompt, type PaneIO } from '../src/send.js';

/* A TALL DRAFT IS STILL A DRAFT. Measured 2026-09-02: a tell long enough to wrap a dozen
 * rows was typed into a Codex tile, read as "not visible" (its prompt row sat above the
 * fifteen-row window), and left at the prompt without Enter — where every retry then
 * refused it, forever. The policy below is exercised against a fake pane so the whole
 * decision runs without tmux. */

const FOOTER = ['────────────────────────', '  ctx 26% · Fable', '  auto mode on', '  Update installed', '  new task? /clear', '  /rc'];
const MESSAGE = 'from @worktree_audit: ' + 'the audit is on the team line and the floor repair is with it; '.repeat(14) + 'three notes follow.';

/** A pane painting `draft` at the prompt, wrapped at 80 columns with continuation indent. */
function screen(draft: string | null, above: string[] = ['assistant finished']): string {
  const rows = [...above];
  if (draft === null) rows.push('\x1b[39m❯ \x1b[2mTry another task\x1b[0m');
  else {
    const chunks = draft.match(/.{1,78}/g) ?? [];
    rows.push(`❯ ${chunks[0]}`, ...chunks.slice(1).map((c) => `  ${c}`));
  }
  return [...rows, ...FOOTER, '', '', ''].join('\n');
}

test('a wrapped draft taller than the prompt window is still recognised as this message', () => {
  const tall = screen(MESSAGE);
  assert.ok(tall.split('\n').length > 15, 'the fixture is taller than the scan window');
  assert.equal(parsePrompt(tall).found, false, 'the prompt-row read cannot see it — that is the blind spot');
  assert.equal(draftAtPrompt(tall, MESSAGE), true);
  assert.equal(draftAtPrompt(screen(null), MESSAGE), false, 'an empty prompt holds no draft');
  assert.equal(draftAtPrompt(screen('someone else is typing here'), MESSAGE), false);
});

test('a submitted copy in the transcript is not a draft at the prompt', () => {
  const echoed = screen(null, ['> ' + MESSAGE, 'assistant: noted']);
  assert.equal(draftAtPrompt(echoed, MESSAGE), false);
  assert.equal(draftAtPrompt(`❯ 1. Yes, proceed\n  2. No\n${MESSAGE}`, MESSAGE), false, 'a dialog is never a draft');
});

function fakePane(reads: string[]): PaneIO & { typed: string[]; enters: number } {
  const io = {
    typed: [] as string[], enters: 0,
    read: async () => reads.length > 1 ? reads.shift()! : reads[0]!,
    type: async (t: string) => { io.typed.push(t); },
    enter: async () => { io.enters += 1; },
    wait: async () => {},
  };
  return io;
}

test('a tall draft gets its Enter instead of being left at the prompt', async () => {
  const io = fakePane([screen(null), screen(MESSAGE), screen(null)]);
  const r = await deliverSafe('tile', MESSAGE, undefined, io);
  assert.equal(r.delivered, true, r.reason);
  assert.deepEqual(io.typed, [MESSAGE]);
  assert.equal(io.enters, 1);
});

test('a stranded copy of this message is submitted, never typed again and never refused', async () => {
  const io = fakePane([screen(MESSAGE), screen(null)]);
  const r = await deliverSafe('tile', MESSAGE, undefined, io);
  assert.equal(r.delivered, true, r.reason);
  assert.deepEqual(io.typed, [], 'no second copy');
  assert.equal(io.enters, 1);
});

test('text the pane never showed is retained without an Enter', async () => {
  const io = fakePane([screen(null), screen(null)]);
  const r = await deliverSafe('tile', MESSAGE, undefined, io);
  assert.equal(r.delivered, false);
  assert.equal(r.submitted, false);
  assert.match(r.reason, /did not become visible/);
  assert.equal(io.enters, 0);
});

test("somebody else's draft is left alone", async () => {
  const io = fakePane([screen('my own words, mid-thought')]);
  const r = await deliverSafe('tile', MESSAGE, undefined, io);
  assert.equal(r.delivered, false);
  assert.match(r.reason, /unsubmitted text is already at the prompt/);
  assert.deepEqual(io.typed, []);
  assert.equal(io.enters, 0);
});

test('a draft that survives Enter is retried and then honestly retained', async () => {
  const io = fakePane([screen(null), screen(MESSAGE)]);
  const r = await deliverSafe('tile', MESSAGE, undefined, io);
  assert.equal(r.delivered, false);
  assert.equal(r.submitted, true);
  assert.match(r.reason, /remains at the prompt/);
  assert.equal(io.enters, 4, 'one Enter plus three retries');
});
