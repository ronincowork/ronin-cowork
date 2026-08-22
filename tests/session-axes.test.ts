/**
 * THE LETTER'S TWO AXES — one fixed, one moving, and the delivery that rides the moving one.
 *
 * `job_role` is seeded at birth and never written again; `session_task` is written by the
 * session (`write_tegami`) and by the owner (the tile), and a committed change hands that
 * task's reading to the running session exactly once.
 *
 * The store root is redirected per the env contract in src/stores.ts so this test never
 * touches a real session.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-axes-test-'));
const shelf = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-axes-shelf-'));
process.env.RONIN_SESSION_DIR = root;
process.env.RONIN_SESSION_BOOT_DIR = shelf;

const { seedTegami, readJobRole, readSessionTask, writeSessionTask, tegamiPath } =
  await import('../src/tegami.js');
const { observeTaskChange, markTaskDelivered, taskDeliveryFault } = await import('../src/task-watch.js');
type Sender = import('../src/task-watch.js').Sender;
const { sessionKey } = await import('../src/session-dir.js');

const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

/**
 * `write_tegami`'s OWN block validator, run directly.
 *
 * The tool proper resolves which session it is running in from tmux, and a unit test may
 * never shell tmux (scripts/check-tests.mjs). But the part under test here — which keys a
 * block may carry, and what is carried through from the previous block — is one
 * self-contained `python3 -c` stage inside it, taking the new block on stdin and the
 * previous one as a file. So the SHIPPED source is extracted and run: not a copy of the
 * rule, and not a rewrite of it, but the very lines the tool executes.
 */
async function validateBlock(block: unknown, previous: unknown): Promise<{ out: string; err: string; code: number }> {
  const tool = await fs.readFile(path.join(REPO, 'ronin_bin', 'write_tegami'), 'utf8');
  const m = tool.match(/BLOCK=\$\(printf '%s' "\$BODY" \| python3 -c '\n([\s\S]*?)\n' "\$PREVF"\)/);
  assert.ok(m, "write_tegami's block validator could not be found — the extraction below is out of date");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-axes-val-'));
  const prevFile = path.join(dir, 'prev.json');
  await fs.writeFile(prevFile, JSON.stringify(previous));
  return await new Promise((resolve) => {
    const child = spawn('python3', ['-c', m![1].replaceAll("'\\''", "'"), prevFile]);
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => resolve({ out, err, code: code ?? 0 }));
    child.stdin.end(JSON.stringify(block));
  });
}

test('the task changes twice and the role stays byte-for-byte fixed', async () => {
  await seedTegami('axes_move', 'developer', 'RiffOnIt');

  assert.equal(await readJobRole('axes_move'), 'developer');
  assert.equal(await readSessionTask('axes_move'), 'RiffOnIt');

  assert.equal(await writeSessionTask('axes_move', 'DraftPlan'), 'DraftPlan');
  assert.equal(await readSessionTask('axes_move'), 'DraftPlan');
  assert.equal(await readJobRole('axes_move'), 'developer', 'a task change must not touch the role');

  assert.equal(await writeSessionTask('axes_move', 'CutCode'), 'CutCode');
  assert.equal(await readSessionTask('axes_move'), 'CutCode');
  assert.equal(await readJobRole('axes_move'), 'developer');

  // Blank is a real value and must stay reachable: it clears the mark without clearing
  // the role, and without becoming "has no letter".
  assert.equal(await writeSessionTask('axes_move', ''), '');
  assert.equal(await readSessionTask('axes_move'), '');
  assert.equal(await readJobRole('axes_move'), 'developer');
});

test('a letter seeded outside a launch carries a blank role rather than an invented one', async () => {
  await seedTegami('axes_noborn', '', 'OddJob');
  assert.equal(await readJobRole('axes_noborn'), '');
  // And the owner's hand on the task still cannot mint a role.
  await writeSessionTask('axes_noborn', 'CheckWork');
  assert.equal(await readJobRole('axes_noborn'), '');
});

test('write_tegami carries job_role through a whole-block save, byte for byte', async () => {
  const previous = { objective: 'old', job_role: 'quarterback', session_task: 'RiffOnIt', ladder: [] };
  const saved = await validateBlock({ objective: 'coordinate the cut', session_task: 'CheckWork', ladder: [] }, previous);
  assert.equal(saved.code, 0, saved.err);
  const body = JSON.parse(saved.out);
  assert.equal(body.job_role, 'quarterback', 'a save that never mentions the role must not blank it');
  assert.equal(body.session_task, 'CheckWork', 'and the task it DID name moves');
  assert.equal(body.objective, 'coordinate the cut');
});

test('write_tegami refuses a block that names job_role at all', async () => {
  const previous = { objective: 'old', job_role: 'quarterback', session_task: 'RiffOnIt', ladder: [] };
  // Even naming the value it already holds is refused: the rule is that the key is not
  // the session's to write, not that the value must not differ. A tool that accepted a
  // matching value would be teaching agents to send it.
  for (const role of ['developer', 'quarterback']) {
    const r = await validateBlock({ objective: 'x', job_role: role, session_task: 'CutCode', ladder: [] }, previous);
    assert.notEqual(r.code, 0, `naming job_role: ${role} must be refused`);
    assert.match(r.err + r.out, /"job_role" is fixed for the life of this session/);
    assert.match(r.err + r.out, /a new session, not a new value/);
    assert.equal(r.out.trim(), '', 'a refused save emits no block, so nothing can be written');
  }
});

test('a committed task change delivers its reading once, and a repeat scrape delivers nothing', async () => {
  // A recording sender in place of the pane. The seam is `Sender` (src/task-watch.ts):
  // everything above it is the decision to deliver, everything below it is a tmux pane,
  // and only the first half is what this test is about.
  const sent: { name: string; text: string }[] = [];
  const record: Sender = async (name, text) => void sent.push({ name, text });

  await fs.mkdir(path.join(shelf, 'task', 'CutCode'), { recursive: true });
  await fs.writeFile(path.join(shelf, 'task', 'CutCode', 'HOW_WE_CUT.md'), '# how');

  await seedTegami('axes_inject', 'developer', 'RiffOnIt');
  await markTaskDelivered('axes_inject', 'RiffOnIt');

  // Nothing changed: the observer must be silent, however often it is asked.
  await observeTaskChange('axes_inject', true, record);
  await observeTaskChange('axes_inject', true, record);
  assert.equal(sent.length, 0, 'a re-scrape injects nothing');

  await writeSessionTask('axes_inject', 'CutCode');
  await observeTaskChange('axes_inject', true, record);
  assert.equal(sent.length, 1, 'exactly one message for one transition');
  assert.equal(sent[0].name, 'axes_inject');
  assert.match(sent[0].text, /session_task is now CutCode/);
  assert.match(sent[0].text, /HOW_WE_CUT\.md/, 'the new task shelf, resolved at the moment of the change');
  assert.doesNotMatch(sent[0].text, /SESSION_MACROS|SHELVES/, 'birth reading is not re-sent');
  assert.match(sent[0].text, /job_role and your project_root have not changed/);
  assert.doesNotMatch(sent[0].text, /\n/, 'one line — sendText types the text then Enter');

  // And again: the same value is not a transition.
  await observeTaskChange('axes_inject', true, record);
  await observeTaskChange('axes_inject', false, record);
  assert.equal(sent.length, 1);

  // A blank task updates the record and injects nothing — there is no reading to hand over.
  await writeSessionTask('axes_inject', '');
  await observeTaskChange('axes_inject', true, record);
  assert.equal(sent.length, 1);
});

test('the OWNER-authored change goes through the same observer, and both writers deliver alike', async () => {
  const sent: string[] = [];
  const record: Sender = async (_n, text) => void sent.push(text);

  // AGENT-AUTHORED: the value lands in the letter by some other hand than the route's,
  // and the POLL is what notices — `reset: false`, exactly as `startTaskWatch` calls it.
  await seedTegami('axes_agent', 'developer', 'RiffOnIt');
  await markTaskDelivered('axes_agent', 'RiffOnIt');
  await writeSessionTask('axes_agent', 'CutCode');
  await observeTaskChange('axes_agent', false, record);

  // OWNER-AUTHORED: the route writes the letter, then calls the same function.
  await seedTegami('axes_owner', 'developer', 'RiffOnIt');
  await markTaskDelivered('axes_owner', 'RiffOnIt');
  await writeSessionTask('axes_owner', 'CutCode');
  await observeTaskChange('axes_owner', true, record);

  assert.equal(sent.length, 2);
  assert.equal(sent[0], sent[1], 'one path, so the two writers deliver the identical message');
});

test('a failed delivery is not recorded as delivered, and is retried', async () => {
  let attempts = 0;
  const flaky: Sender = async () => {
    attempts++;
    if (attempts < 3) throw new Error('the prompt was not accepting input');
  };

  await seedTegami('axes_fail', 'developer', 'RiffOnIt');
  await markTaskDelivered('axes_fail', 'RiffOnIt');
  await writeSessionTask('axes_fail', 'CutCode');

  await observeTaskChange('axes_fail', false, flaky);
  assert.equal(attempts, 1);
  let fault = await taskDeliveryFault('axes_fail');
  assert.ok(fault, 'a failure is visible rather than swallowed');
  assert.equal(fault!.task, 'CutCode');
  assert.match(fault!.error!, /not accepting input/);

  // The poll retries it, because the record does not claim it landed.
  await observeTaskChange('axes_fail', false, flaky);
  assert.equal(attempts, 2);
  await observeTaskChange('axes_fail', false, flaky);
  assert.equal(attempts, 3);
  assert.equal(await taskDeliveryFault('axes_fail'), null, 'a delivery that lands clears the fault');

  // And having landed, it is not sent again.
  await observeTaskChange('axes_fail', false, flaky);
  assert.equal(attempts, 3);
});

test('automatic retries stop at the cap, and re-posting the task starts them again', async () => {
  let attempts = 0;
  const dead: Sender = async () => {
    attempts++;
    throw new Error('👤 owner-only');
  };

  await seedTegami('axes_capped', 'developer', 'RiffOnIt');
  await markTaskDelivered('axes_capped', 'RiffOnIt');
  await writeSessionTask('axes_capped', 'CutCode');

  // The poll passes `reset: false` — that is what makes the cap a cap.
  for (let i = 0; i < 8; i++) await observeTaskChange('axes_capped', false, dead);
  assert.equal(attempts, 3, 'a dial the owner deliberately closed is not hammered forever');
  assert.ok(await taskDeliveryFault('axes_capped'), 'and it stays visible');

  // The owner re-posting the same task is an explicit ask, and clears the count.
  await observeTaskChange('axes_capped', true, dead);
  assert.equal(attempts, 4);
});

test('first sight of a session is a baseline, never a transition', async () => {
  const sent: string[] = [];
  const record: Sender = async (_n, text) => void sent.push(text);
  // No `markTaskDelivered`: this is a session already running when the observer first
  // looked, which is what every session is the first time cowork restarts.
  await seedTegami('axes_first', 'developer', 'CutCode');
  await observeTaskChange('axes_first', false, record);
  assert.equal(sent.length, 0, 'an observer cannot observe a change it was not present for');
  // From then on it behaves normally.
  await writeSessionTask('axes_first', 'CheckWork');
  await observeTaskChange('axes_first', false, record);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /session_task is now CheckWork/);
});
