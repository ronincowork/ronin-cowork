/**
 * ONE LAUNCH MECHANISM, TWO CALLERS — the owner's architectural invariant, 2026-08-22.
 *
 * Commons' ＋ New form and the agent-invoked `forkit` macro are two callers of exactly one
 * launch mechanism. Both submit the same session_launch_spec and traverse the same
 * validation, project-root defaulting, role/task/model cascade, Build Brief compilation,
 * tmux birth, agent start and recording hooks.
 *
 * Forkit may add only fork-specific INPUTS and aftercare: the handoff document, team
 * inheritance, and the understanding-gate prompt. It may not implement session creation,
 * model resolution, reading compilation or CLI startup itself — and it used to implement
 * all four, with `tmux new-session` + `run-command claude` + `wait-ready`, which is how a
 * fork arrived with no letter, no role and no Build Brief at all.
 *
 * WHAT IS ASSERTED. `resolveForm` is the mechanism: every caller reaches it through
 * `POST /api/launch`, and everything downstream of it — the dial, the tags, the letter,
 * the counting — is the route's single body of code. So parity is proven where the two
 * callers could possibly diverge: hand it equivalent specs and the RESOLVED launch and
 * the READING LIST must be identical, field for field. A second launch path would have to
 * reproduce this table to pass, which is the point.
 *
 * No tmux, no socket: every store is redirected per the env contract in src/stores.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-parity-test-'));
const catalogs = path.join(temp, 'catalogs');
await fs.mkdir(catalogs, { recursive: true });
// The owner's own root list. `dir` is the temp root itself so nothing reaches a real
// checkout, and a SECOND root exists so "the top active one" is a real choice rather
// than the only answer.
await fs.writeFile(
  path.join(catalogs, 'PROJECT_ROOTS.md'),
  [
    '# PROJECT_ROOTS — yours',
    '',
    '## alpha',
    `- **dir:** ${temp}`,
    '- **remit:** the first root, and therefore the default',
    '',
    '## beta',
    `- **dir:** ${temp}`,
    '- **remit:** the second, chosen only when named',
    '',
  ].join('\n'),
);
process.env.RONIN_CATALOGS_DIR = catalogs;
process.env.RONIN_SESSION_BOOT_DIR = path.join(temp, 'shelf');
process.env.RONIN_SESSION_BOOT_CACHE_DIR = path.join(temp, 'generated');
process.env.RONIN_CONFIG_DIR = path.join(temp, 'config');
process.env.RONIN_LEDGER_DIR = path.join(temp, 'ledger');

// A book on each level, so the reading list has something to be identical ABOUT.
for (const [level, name, book] of [
  ['all', '', 'ALL_BOOK.md'],
  ['root', 'alpha', 'ROOT_BOOK.md'],
  ['role', 'developer', 'ROLE_BOOK.md'],
  ['task', 'DraftPlan', 'TASK_BOOK.md'],
] as const) {
  const dir = path.join(temp, 'shelf', level, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, book), `# ${book}`);
}

const { resolveForm } = await import('../src/spawn.js');
type SpawnForm = import('../src/spawn.js').SpawnForm;

/** What the ＋ New form posts: the axes, the picks, and the owner's words. */
const commonsForm = (over: Partial<SpawnForm> = {}): SpawnForm => ({
  job_role: 'developer',
  session_task: 'DraftPlan',
  project_root: 'alpha',
  prompt: 'Work out the shape of the thing.',
  mode: 'assisted',
  ...over,
});

/**
 * What `forkit` posts. The SAME body plus its own inputs — a handoff prompt and a team
 * tag — and nothing else. If this ever needs a field the form does not have, that is a
 * second launch implementation growing, and this test is where it shows up.
 */
const forkitForm = (over: Partial<SpawnForm> = {}): SpawnForm =>
  commonsForm({ tags: ['scratchteam'], ...over });

/** Everything the mechanism decides. A caller may pick these; it may never compute them. */
const mechanism = (r: Awaited<ReturnType<typeof resolveForm>>) => ({
  job_role: r.job_role,
  session_task: r.session_task,
  project_root: r.project_root,
  dir: r.dir,
  cmd: r.cmd,
  dial: r.dial,
  lifecycle: r.lifecycle,
  agent: r.agent,
  capExempt: r.capExempt,
  mcp: r.mcp,
  launchAgent: r.launchAgent,
});

/**
 * The compiled reading list, by filename — the Build Brief's `Read first:` line.
 *
 * The sentence ends at a period followed by whitespace, NOT at the first period: every
 * entry is a path ending `.md`, so `[^.]+` stopped inside the first filename and the list
 * read as one truncated book.
 */
const reading = (brief: string): string[] =>
  (brief.match(/Read first: ([\s\S]*?)\.(?:\s|$)/)?.[1] ?? '')
    .split(', ')
    .map((f) => path.basename(f.trim()))
    .filter(Boolean)
    .sort();

test('equivalent specs from Commons and forkit resolve to the same launch', async () => {
  const fromCommons = await resolveForm(commonsForm(), new Set());
  const fromForkit = await resolveForm(forkitForm({ prompt: commonsForm().prompt }), new Set());
  assert.deepEqual(mechanism(fromForkit), mechanism(fromCommons));
});

test('and to the same reading list — all + root + role + task, compiled once', async () => {
  const fromCommons = await resolveForm(commonsForm(), new Set());
  const fromForkit = await resolveForm(forkitForm({ prompt: commonsForm().prompt }), new Set());

  const books = reading(fromCommons.brief);
  // The four levels a fork used to get NONE of.
  for (const book of ['ALL_BOOK.md', 'ROOT_BOOK.md', 'ROLE_BOOK.md', 'TASK_BOOK.md']) {
    assert.ok(books.includes(book), `the Build Brief must carry ${book}`);
  }
  assert.deepEqual(reading(fromForkit.brief), books);
});

test("forkit's own inputs change its words and nothing about the mechanism", async () => {
  const plain = await resolveForm(commonsForm(), new Set());
  const forked = await resolveForm(
    forkitForm({ prompt: 'Read wip/handoffs/TOPIC.md. Then report back, in your own words.' }),
    new Set(),
  );
  // The handoff prompt and the team are INPUTS. They must reach the brief and the tags…
  assert.match(forked.brief, /wip\/handoffs\/TOPIC\.md/);
  assert.deepEqual(forked.tags, ['scratchteam']);
  assert.deepEqual(plain.tags, []);
  // …and must not move a single thing the mechanism decides.
  assert.deepEqual(mechanism(forked), mechanism(plain));
  assert.deepEqual(reading(forked.brief), reading(plain.brief));
});

test('project_root defaulting is the mechanism\'s, for both callers alike', async () => {
  // Omit it and the TOP ACTIVE root is selected — the same rule the ＋ New picker shows.
  // A fork that resolved its own directory would be the divergence this forbids.
  const commons = await resolveForm(commonsForm({ project_root: undefined }), new Set());
  const forkit = await resolveForm(forkitForm({ project_root: undefined }), new Set());
  assert.equal(commons.project_root, 'alpha');
  assert.equal(forkit.project_root, 'alpha');
  assert.deepEqual(mechanism(forkit), mechanism(commons));
});

test('the model cascade is the mechanism\'s: blank inherits, explicit wins, identically', async () => {
  // BLANK — the resolved `model:` bias of the task answers, for both callers.
  const commons = await resolveForm(commonsForm({ cmd: undefined }), new Set());
  const forkit = await resolveForm(forkitForm({ cmd: undefined }), new Set());
  assert.equal(forkit.cmd, commons.cmd);
  assert.match(commons.cmd, /opus/, 'DraftPlan biases opus, and the bias is now read');

  // EXPLICIT — the owner named one, and it beats every layer. Same input, same answer.
  // The resolved cmd may carry the provider's own MCP-off flags on the end, because this
  // launch resolves the brain off; that is the mechanism's business and rides both alike.
  const pick = 'claude --model haiku';
  const c2 = await resolveForm(commonsForm({ cmd: pick }), new Set());
  const f2 = await resolveForm(forkitForm({ cmd: pick }), new Set());
  assert.ok(c2.cmd.startsWith(pick), `explicit pick must lead the cmd, got "${c2.cmd}"`);
  assert.equal(f2.cmd, c2.cmd, 'and both callers get the identical resolved command');
});

test('a blank role stays legal for both, and omits only its own reading', async () => {
  // The general blank-session model is preserved: it is only an agent-launching FORK that
  // must resolve its axes deliberately, and that is the macro's rule rather than a
  // refusal in the mechanism.
  const blank = await resolveForm(commonsForm({ job_role: '' }), new Set());
  assert.equal(blank.job_role, '');
  const books = reading(blank.brief);
  assert.ok(!books.includes('ROLE_BOOK.md'), 'no role, no role reading');
  assert.ok(books.includes('TASK_BOOK.md') && books.includes('ROOT_BOOK.md'), 'and nothing else is lost');
});

test('a stock task board keeps a stated order, and OpenShell is never in the middle of it', async () => {
  // REGRESSION, 2026-08-22. The combined catalog had FILE order; a directory has none, so
  // `order:` is the replacement — and it shipped unpopulated, which sorted the board
  // alphabetically and moved `open shell` from the end into the middle of the loose tail.
  // The one button that hands you a bare shell landing where a habitual click goes is how
  // "New session dumps me to a shell" happens without a single line of launch code being
  // wrong. Order is a launch fact, not decoration.
  const { listSessionTasks } = await import('../src/definitions.js');
  const tasks = await listSessionTasks();
  const names = tasks.map((t) => t.name);
  assert.deepEqual(names, [
    'RiffOnIt', 'DraftPlan', 'CutCode', 'ChaseBug', 'CheckWork', 'OddJob', 'Atarashi', 'OpenShell',
  ]);
  assert.equal(names[names.length - 1], 'OpenShell', 'the agentless one sits last, away from the rest');
});

test('every stock definition states its order, so no board is sorted by accident', async () => {
  const { readDefinitions } = await import('../src/definitions.js');
  for (const kind of ['job_roles', 'session_tasks'] as const) {
    for (const d of await readDefinitions(kind)) {
      if (d.origin !== 'stock') continue; // the owner's own may take the unordered tail
      assert.ok(d.has('order'), `${kind}/${d.name}.md ships without \`order:\` — the board would sort itself`);
      assert.ok(Number.isFinite(Number(d.get('order'))), `${kind}/${d.name}.md has a non-numeric order`);
    }
  }
});

test('an ordinary assisted launch starts an agent with both axes and the full brief', async () => {
  // THE RELEASE-BLOCKER SHAPE, asserted end to end at the mechanism: what an ordinary
  // Commons click resolves to must be an AGENT launch, on nonblank axes, carrying the
  // compiled reading list. A launch that quietly resolved agentless, or lost an axis on
  // the way through, would be born a bare shell with a blank letter — which is a valid
  // launch for `OpenShell` and the tile picker, and a bug for anything else.
  const r = await resolveForm(commonsForm(), new Set());
  assert.equal(r.agent, true, 'an ordinary launch starts a CLI');
  assert.ok(r.cmd, 'and has a command to start');
  assert.ok(r.launchAgent, 'and stamps which CLI it started');
  assert.equal(r.job_role, 'developer');
  assert.equal(r.session_task, 'DraftPlan');
  assert.ok(r.project_root, 'a session is always born somewhere');
  assert.match(r.brief, /Read first:/, 'the Build Brief carries its reading list');
  assert.ok(reading(r.brief).length >= 4, 'all four levels, not a bare prompt');
});
