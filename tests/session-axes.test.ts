/**
 * THE LETTER'S AXIS AND ITS DERIVED BLOCK — the one session-authored axis, the
 * machinery-owned teams block, and the delivery that rides the axis.
 *
 * `session_role` is written by the session (`write_tegami`) and by the owner (the
 * tile), and a committed change hands that role's reading to the running session
 * exactly once. `teams` is derived — never the agent's to write — and the shipped
 * validator refuses it while regenerating it on every save (R35, 2026-08-23).
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

const { seedTegami, readSessionRole, writeSessionRole, writeTeams, tegamiPath } =
  await import('../src/tegami.js');
const { observeRoleChange, markRoleDelivered, roleDeliveryFault } = await import('../src/role-watch.js');
type Sender = import('../src/role-watch.js').Sender;
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

test('the session_role changes twice, and blank stays a reachable value', async () => {
  await seedTegami('axes_move', 'RiffOnIt');
  assert.equal(await readSessionRole('axes_move'), 'RiffOnIt');

  assert.equal(await writeSessionRole('axes_move', 'DraftPlan'), 'DraftPlan');
  assert.equal(await readSessionRole('axes_move'), 'DraftPlan');

  assert.equal(await writeSessionRole('axes_move', 'CutCode'), 'CutCode');
  assert.equal(await readSessionRole('axes_move'), 'CutCode');

  // Blank is a real value and must stay reachable: it clears the mark without
  // becoming "has no letter".
  assert.equal(await writeSessionRole('axes_move', ''), '');
  assert.equal(await readSessionRole('axes_move'), '');
});

test('the letter carries a derived teams block, and a membership change refreshes it', async () => {
  await seedTegami('axes_teams', 'CutCode', { repo: '', branch: '' }, [
    { team: 'alpha', team_role: 'development', objective: 'ship the cut' },
  ]);
  const file = tegamiPath(await sessionKey('axes_teams'));
  let block = JSON.parse((await fs.readFile(file, 'utf8')).match(/```(?:json)?\s*\n([\s\S]*?)\n```/)![1]);
  assert.deepEqual(block.teams, [{ team: 'alpha', team_role: 'development', objective: 'ship the cut' }]);

  // Membership moved: the machinery's own write re-derives (rosters absent here, so a
  // tag-only team renders with blank role and objective — membership is real anyway).
  assert.equal(await writeTeams('axes_teams', ['alpha', 'beta']), true);
  block = JSON.parse((await fs.readFile(file, 'utf8')).match(/```(?:json)?\s*\n([\s\S]*?)\n```/)![1]);
  assert.deepEqual(block.teams.map((t: { team: string }) => t.team), ['alpha', 'beta']);
  assert.equal(await readSessionRole('axes_teams'), 'CutCode', 'the axis is untouched by a teams refresh');
});

test('write_tegami refuses a block that names teams — the derived key is not the agent’s', async () => {
  const previous = { objective: 'old', session_role: 'RiffOnIt', teams: [], ladder: [] };
  const r = await validateBlock(
    { objective: 'x', teams: [{ team: 'alpha' }], session_role: 'CutCode', ladder: [] },
    previous,
  );
  assert.notEqual(r.code, 0, 'naming teams must be refused');
  assert.match(r.err + r.out, /"teams" is not yours to write/);
  assert.match(r.err + r.out, /DERIVED/);
  assert.equal(r.out.trim(), '', 'a refused save emits no block, so nothing can be written');
});

test('write_tegami refuses the retired role_family key with the R35 teaching text', async () => {
  const previous = { objective: 'old', session_role: 'RiffOnIt', ladder: [] };
  const r = await validateBlock(
    { objective: 'x', role_family: 'developer', session_role: 'CutCode', ladder: [] },
    previous,
  );
  assert.notEqual(r.code, 0);
  assert.match(r.err + r.out, /"role_family" is retired \(R35/);
  assert.equal(r.out.trim(), '');
});

test('a committed task change delivers its reading once, and a repeat scrape delivers nothing', async () => {
  // A recording sender in place of the pane. The seam is `Sender` (src/role-watch.ts):
  // everything above it is the decision to deliver, everything below it is a tmux pane,
  // and only the first half is what this test is about.
  const sent: { name: string; text: string }[] = [];
  const record: Sender = async (name, text) => void sent.push({ name, text });

  await fs.mkdir(path.join(shelf, 'role', 'CutCode'), { recursive: true });
  await fs.writeFile(path.join(shelf, 'role', 'CutCode', 'HOW_WE_CUT.md'), '# how');

  await seedTegami('axes_inject', 'RiffOnIt');
  await markRoleDelivered('axes_inject', 'RiffOnIt');

  // Nothing changed: the observer must be silent, however often it is asked.
  await observeRoleChange('axes_inject', true, record);
  await observeRoleChange('axes_inject', true, record);
  assert.equal(sent.length, 0, 'a re-scrape injects nothing');

  await writeSessionRole('axes_inject', 'CutCode');
  await observeRoleChange('axes_inject', true, record);
  assert.equal(sent.length, 1, 'exactly one message for one transition');
  assert.equal(sent[0].name, 'axes_inject');
  assert.match(sent[0].text, /session_role is now CutCode/);
  assert.match(sent[0].text, /HOW_WE_CUT\.md/, 'the new task shelf, resolved at the moment of the change');
  assert.doesNotMatch(sent[0].text, /SESSION_MACROS|SHELVES/, 'birth reading is not re-sent');
  assert.match(sent[0].text, /teams and your project_root have not changed/);
  assert.doesNotMatch(sent[0].text, /\n/, 'one line — sendText types the text then Enter');

  // And again: the same value is not a transition.
  await observeRoleChange('axes_inject', true, record);
  await observeRoleChange('axes_inject', false, record);
  assert.equal(sent.length, 1);

  // A blank task updates the record and injects nothing — there is no reading to hand over.
  await writeSessionRole('axes_inject', '');
  await observeRoleChange('axes_inject', true, record);
  assert.equal(sent.length, 1);
});

test('the OWNER-authored change goes through the same observer, and both writers deliver alike', async () => {
  const sent: string[] = [];
  const record: Sender = async (_n, text) => void sent.push(text);

  // AGENT-AUTHORED: the value lands in the letter by some other hand than the route's,
  // and the POLL is what notices — `reset: false`, exactly as `startRoleWatch` calls it.
  await seedTegami('axes_agent', 'RiffOnIt');
  await markRoleDelivered('axes_agent', 'RiffOnIt');
  await writeSessionRole('axes_agent', 'CutCode');
  await observeRoleChange('axes_agent', false, record);

  // OWNER-AUTHORED: the route writes the letter, then calls the same function.
  await seedTegami('axes_owner', 'RiffOnIt');
  await markRoleDelivered('axes_owner', 'RiffOnIt');
  await writeSessionRole('axes_owner', 'CutCode');
  await observeRoleChange('axes_owner', true, record);

  assert.equal(sent.length, 2);
  assert.equal(sent[0], sent[1], 'one path, so the two writers deliver the identical message');
});

test('a failed delivery is not recorded as delivered, and is retried', async () => {
  let attempts = 0;
  const flaky: Sender = async () => {
    attempts++;
    if (attempts < 3) throw new Error('the prompt was not accepting input');
  };

  await seedTegami('axes_fail', 'RiffOnIt');
  await markRoleDelivered('axes_fail', 'RiffOnIt');
  await writeSessionRole('axes_fail', 'CutCode');

  await observeRoleChange('axes_fail', false, flaky);
  assert.equal(attempts, 1);
  let fault = await roleDeliveryFault('axes_fail');
  assert.ok(fault, 'a failure is visible rather than swallowed');
  assert.equal(fault!.task, 'CutCode');
  assert.match(fault!.error!, /not accepting input/);

  // The poll retries it, because the record does not claim it landed.
  await observeRoleChange('axes_fail', false, flaky);
  assert.equal(attempts, 2);
  await observeRoleChange('axes_fail', false, flaky);
  assert.equal(attempts, 3);
  assert.equal(await roleDeliveryFault('axes_fail'), null, 'a delivery that lands clears the fault');

  // And having landed, it is not sent again.
  await observeRoleChange('axes_fail', false, flaky);
  assert.equal(attempts, 3);
});

test('automatic retries stop at the cap, and re-posting the task starts them again', async () => {
  let attempts = 0;
  const dead: Sender = async () => {
    attempts++;
    throw new Error('👤 owner-only');
  };

  await seedTegami('axes_capped', 'RiffOnIt');
  await markRoleDelivered('axes_capped', 'RiffOnIt');
  await writeSessionRole('axes_capped', 'CutCode');

  // The poll passes `reset: false` — that is what makes the cap a cap.
  for (let i = 0; i < 8; i++) await observeRoleChange('axes_capped', false, dead);
  assert.equal(attempts, 3, 'a dial the owner deliberately closed is not hammered forever');
  assert.ok(await roleDeliveryFault('axes_capped'), 'and it stays visible');

  // The owner re-posting the same task is an explicit ask, and clears the count.
  await observeRoleChange('axes_capped', true, dead);
  assert.equal(attempts, 4);
});

test('a send that outlasts the poll tick is not joined by the ticks that start meanwhile', async () => {
  // team_page, 2026-08-25: one DraftPlan→CutCode change, FIVE notices typed. The send
  // into a busy pane took longer than the 3s tick, the record was written only after
  // it, and every tick that started in between read the old task and sent again.
  const sent: string[] = [];
  let release: () => void = () => {};
  const slow: Sender = async (_n, text) => {
    sent.push(text);
    await new Promise<void>((r) => (release = r));
  };

  await seedTegami('axes_overlap', 'DraftPlan');
  await markRoleDelivered('axes_overlap', 'DraftPlan');
  await writeSessionRole('axes_overlap', 'CutCode');

  const first = observeRoleChange('axes_overlap', false, slow);
  while (sent.length === 0) await new Promise((r) => setTimeout(r, 5)); // the first is now typing
  // Three more ticks, and the owner's POST, all while the first is still in the pane.
  await Promise.all([
    observeRoleChange('axes_overlap', false, slow),
    observeRoleChange('axes_overlap', false, slow),
    observeRoleChange('axes_overlap', true, slow),
  ]);
  assert.equal(sent.length, 1, 'the record is claimed before typing, so nobody else types');
  release();
  await first;
  assert.equal(await roleDeliveryFault('axes_overlap'), null);

  // Saving the letter again with the same task — a ladder update — is not a change.
  await writeSessionRole('axes_overlap', 'CutCode');
  await observeRoleChange('axes_overlap', false, slow);
  assert.equal(sent.length, 1);
});

test('first sight of a session is a baseline, never a transition', async () => {
  const sent: string[] = [];
  const record: Sender = async (_n, text) => void sent.push(text);
  // No `markRoleDelivered`: this is a session already running when the observer first
  // looked, which is what every session is the first time cowork restarts.
  await seedTegami('axes_first', 'CutCode');
  await observeRoleChange('axes_first', false, record);
  assert.equal(sent.length, 0, 'an observer cannot observe a change it was not present for');
  // From then on it behaves normally.
  await writeSessionRole('axes_first', 'CheckWork');
  await observeRoleChange('axes_first', false, record);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /session_role is now CheckWork/);
});
