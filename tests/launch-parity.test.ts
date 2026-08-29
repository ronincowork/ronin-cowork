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
// The owner's own session default, because since 2026-08-29 it is the ONLY thing under an
// explicit pick — no session_role biases the model any more, so a launch that names
// nothing must land here for both callers alike.
await fs.mkdir(path.join(temp, 'config'), { recursive: true });
await fs.writeFile(
  path.join(temp, 'config', 'ronin.json'),
  JSON.stringify({ agents: { sessions: { default: { provider: 'anthropic', model: 'fable' } } } }),
);
process.env.RONIN_LEDGER_DIR = path.join(temp, 'ledger');

// A book on each level, so the reading list has something to be identical ABOUT.
for (const [level, name, book] of [
  ['all', '', 'ALL_BOOK.md'],
  ['root', 'alpha', 'ROOT_BOOK.md'],
  ['role', 'DraftPlan', 'ROLE_BOOK.md'],
  ['team_role', 'development', 'TEAM_BOOK.md'],
] as const) {
  const dir = path.join(temp, 'shelf', level, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, book), `# ${book}`);
}

// A team roster, so the team layer has context to contribute.
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(temp, 'team_rosters');
await fs.mkdir(path.join(temp, 'team_rosters'), { recursive: true });
await fs.writeFile(
  path.join(temp, 'team_rosters', 'scratchteam.md'),
  ['# scratchteam', '', '- **team_role:** development', '- **objective:** prove the parity', '- **project_root:** beta', '- **state:** active', ''].join('\n'),
);

const { resolveForm } = await import('../src/spawn.js');
type SpawnForm = import('../src/spawn.js').SpawnForm;

/** What the ＋ New form posts: the axes, the picks, and the owner's words. */
const commonsForm = (over: Partial<SpawnForm> = {}): SpawnForm => ({
  session_role: 'DraftPlan',
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
  commonsForm({ team: 'scratchteam', ...over });

/** Everything the mechanism decides. A caller may pick these; it may never compute them. */
const mechanism = (r: Awaited<ReturnType<typeof resolveForm>>) => ({
  session_role: r.session_role,
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

test('and to the same reading list — all + root + role, compiled once', async () => {
  const fromCommons = await resolveForm(commonsForm(), new Set());
  const fromForkit = await resolveForm(forkitForm({ prompt: commonsForm().prompt }), new Set());

  const books = reading(fromCommons.brief);
  // The levels a fork used to get NONE of.
  for (const book of ['ALL_BOOK.md', 'ROOT_BOOK.md', 'ROLE_BOOK.md']) {
    assert.ok(books.includes(book), `the Build Brief must carry ${book}`);
  }
  // The team layer is forkit's own INPUT (team inheritance), so its team_role reading
  // arrives on top of the shared list — additive, and the only difference.
  const forkBooks = reading(fromForkit.brief);
  for (const book of [...books, 'TEAM_BOOK.md']) {
    assert.ok(forkBooks.includes(book), `the forked Build Brief must carry ${book}`);
  }
  assert.deepEqual(fromCommons.birth_reading.map((file) => path.basename(file)).sort(), books);
  assert.deepEqual(fromForkit.birth_reading.map((file) => path.basename(file)).sort(), forkBooks);
});

test('resolved birth readings include explicit seeds, while manual mode reads nothing at birth', async () => {
  const seed = path.join(temp, 'OWNER_SEED.md');
  const assisted = await resolveForm(commonsForm({ seed: [seed] }), new Set());
  assert.ok(assisted.birth_reading.includes(seed));
  assert.deepEqual(reading(assisted.brief), assisted.birth_reading.map((file) => path.basename(file)).sort());

  const manual = await resolveForm(commonsForm({ mode: 'manual', seed: [seed] }), new Set());
  assert.deepEqual(manual.birth_reading, []);
  assert.equal(manual.brief, commonsForm().prompt);
});

test("forkit's own inputs change its words and nothing about the mechanism", async () => {
  const plain = await resolveForm(commonsForm(), new Set());
  const forked = await resolveForm(
    forkitForm({ prompt: 'Read wip/handoffs/TOPIC.md. Then report back, in your own words.' }),
    new Set(),
  );
  // The handoff prompt and the team are INPUTS. They must reach the brief and the tags…
  assert.match(forked.brief, /wip\/handoffs\/TOPIC\.md/);
  assert.match(forked.brief, /born onto team "scratchteam"/);
  assert.match(forked.brief, /prove the parity/, "the roster's objective rides the brief");
  assert.deepEqual(forked.tags, ['scratchteam']);
  assert.deepEqual(plain.tags, []);
  // …and must not move a single thing the mechanism decides except the team itself.
  assert.deepEqual({ ...mechanism(forked) }, { ...mechanism(plain) });
});

test('project_root defaulting is the mechanism\'s — top active root, or the TEAM\'s', async () => {
  // Omit it and the TOP ACTIVE root is selected — the same rule the ＋ New picker shows.
  const commons = await resolveForm(commonsForm({ project_root: undefined }), new Set());
  assert.equal(commons.project_root, 'alpha');
  // A TEAM launch inherits the roster's root instead: the team is the context.
  const forkit = await resolveForm(forkitForm({ project_root: undefined }), new Set());
  assert.equal(forkit.project_root, 'beta', "the roster's project_root seeds the launch");
  // And an explicit pick still beats it — a default, never a constraint.
  const explicit = await resolveForm(forkitForm({ project_root: 'alpha' }), new Set());
  assert.equal(explicit.project_root, 'alpha');
});

test('the model cascade is the mechanism\'s: blank inherits, explicit wins, identically', async () => {
  // BLANK — the OWNER'S session default answers, for both callers. It used to be the
  // task's `model:` bias; that field and its resolution path were removed on 2026-08-29,
  // so a definition can no longer put itself between the owner and their own default.
  const commons = await resolveForm(commonsForm({ cmd: undefined }), new Set());
  const forkit = await resolveForm(forkitForm({ cmd: undefined }), new Set());
  assert.equal(forkit.cmd, commons.cmd);
  assert.match(commons.cmd, /fable/, 'the configured session default answers, not the role');

  // EXPLICIT — the owner named one, and it beats every layer. Same input, same answer.
  // The resolved cmd may carry the provider's own MCP-off flags on the end, because this
  // launch resolves the brain off; that is the mechanism's business and rides both alike.
  const pick = 'claude --model haiku';
  const c2 = await resolveForm(commonsForm({ cmd: pick }), new Set());
  const f2 = await resolveForm(forkitForm({ cmd: pick }), new Set());
  assert.ok(c2.cmd.startsWith(pick), `explicit pick must lead the cmd, got "${c2.cmd}"`);
  assert.equal(f2.cmd, c2.cmd, 'and both callers get the identical resolved command');
});

test('a ronin launch is legal, and so is a launch onto a tag-only team', async () => {
  // No team at all — a ronin — reads no team_role level and is an ordinary launch.
  const ronin = await resolveForm(commonsForm(), new Set());
  assert.equal(ronin.team, '');
  assert.ok(!reading(ronin.brief).includes('TEAM_BOOK.md'), 'no team, no team_role reading');
  // A team the durable half has never heard of is an ordinary team (owner, 2026-08-26):
  // the session is born tagged onto it, told it is tag-only, and inherits no roster.
  const tagOnly = await resolveForm(commonsForm({ team: 'ghosts' }), new Set());
  assert.equal(tagOnly.team, 'ghosts');
  assert.ok(tagOnly.tags.includes('ghosts'), 'born tagged onto it');
  assert.equal(tagOnly.team_role, '', 'no roster, no team_role');
  assert.match(tagOnly.brief, /tag-only team/);
  // The name is still the tag, so it obeys the tag's spelling.
  await assert.rejects(() => resolveForm(commonsForm({ team: 'Ghosts!' }), new Set()), /team name/);
});

test('stated_by is resolved on the server across explicit, Team, role, and system layers', async () => {
  const explicit = await resolveForm(commonsForm({
    name: 'attribution-proof',
    project_root: 'beta',
    cmd: 'claude --model haiku',
    mcp: true,
    mode: 'manual',
  }), new Set());
  for (const key of ['name', 'project_root', 'cmd', 'mcp', 'mode', 'session_role']) {
    assert.deepEqual(explicit.stated_by[key], [{ layer: 'explicit_launch', source: 'launch request' }], key);
  }
  assert.equal(explicit.stated_by.lifecycle[0]?.layer, 'session_role');
  assert.match(explicit.stated_by.lifecycle[0]?.source ?? '', /session_roles\/DraftPlan\.md$/);

  const inherited = await resolveForm(forkitForm({ project_root: undefined }), new Set());
  assert.equal(inherited.stated_by.project_root[0]?.layer, 'team_roster');
  assert.match(inherited.stated_by.project_root[0]?.source ?? '', /team_rosters\/scratchteam\.md$/);
  assert.equal(inherited.stated_by.team_role[0]?.layer, 'team_roster');

  const system = await resolveForm(commonsForm({ session_role: '' }), new Set());
  assert.deepEqual(system.stated_by.dial, [{ layer: 'system', source: 'src/launch-profile.ts' }]);
});

test('server resolution returns profile and durable Team context without browser reconstruction', async () => {
  const resolved = await resolveForm(forkitForm(), new Set());
  assert.equal(resolved.permissions, 'default');
  assert.equal(resolved.team_objective, 'prove the parity');
  assert.deepEqual(resolved.team_repos, []);
  assert.equal(resolved.team_branch, '');
  assert.equal(resolved.team_wipeboard, 'scratchteam');
  assert.equal(resolved.team_state, 'active');
  assert.equal(resolved.stated_by.team_objective[0]?.layer, 'team_roster');
});

test('a stock task board keeps a stated order, and OpenShell is never in the middle of it', async () => {
  // REGRESSION, 2026-08-22. The combined catalog had FILE order; a directory has none, so
  // `order:` is the replacement — and it shipped unpopulated, which sorted the board
  // alphabetically and moved `open shell` from the end into the middle of the loose tail.
  // The one button that hands you a bare shell landing where a habitual click goes is how
  // "New session dumps me to a shell" happens without a single line of launch code being
  // wrong. Order is a launch fact, not decoration.
  const { listSessionRoles } = await import('../src/definitions.js');
  const tasks = await listSessionRoles();
  const names = tasks.map((t) => t.name);
  assert.deepEqual(names, [
    'RiffOnIt', 'DraftPlan', 'CutCode', 'ChaseBug', 'CheckWork', 'QuarterBack',
    'OddJob', 'Atarashi', 'PersonalAssistant', 'OpenShell', 'MikaAssist',
  ]);
  // OpenShell sits in the `extra` family and near the end — what matters is that it is
  // not among the buttons that start work, which is where alphabetical order had put it.
  assert.ok(names.indexOf('OpenShell') > names.indexOf('CheckWork'));
});

test('every stock definition states its order, so no board is sorted by accident', async () => {
  const { readDefinitions } = await import('../src/definitions.js');
  for (const kind of ['role_families', 'session_roles'] as const) {
    for (const d of await readDefinitions(kind)) {
      if (d.origin !== 'stock') continue; // the owner's own may take the unordered tail
      assert.ok(d.has('order'), `${kind}/${d.name}.md ships without \`order:\` — the board would sort itself`);
      assert.ok(Number.isFinite(Number(d.get('order'))), `${kind}/${d.name}.md has a non-numeric order`);
    }
  }
});

test('an ordinary assisted launch starts an agent with its axis and the full brief', async () => {
  // THE RELEASE-BLOCKER SHAPE, asserted end to end at the mechanism: what an ordinary
  // Commons click resolves to must be an AGENT launch, on nonblank axes, carrying the
  // compiled reading list. A launch that quietly resolved agentless, or lost an axis on
  // the way through, would be born a bare shell with a blank letter — which is a valid
  // launch for `OpenShell` and the tile picker, and a bug for anything else.
  const r = await resolveForm(commonsForm(), new Set());
  assert.equal(r.agent, true, 'an ordinary launch starts a CLI');
  assert.ok(r.cmd, 'and has a command to start');
  assert.ok(r.launchAgent, 'and stamps which CLI it started');
  assert.equal(r.session_role, 'DraftPlan');
  assert.ok(r.project_root, 'a session is always born somewhere');
  assert.match(r.brief, /Read first:/, 'the Build Brief carries its reading list');
  assert.ok(reading(r.brief).length >= 3, 'the levels, not a bare prompt');
});

test('QuarterBack is a session_role, pinned as the developer family\'s default lead', async () => {
  // R33: coordinating is work a session moves into and out of. R35 adds the pin: the
  // developer family suggests QuarterBack first when a team is built from its shelf —
  // a default, never the team_lead designation, which is the owner's hand on a live
  // session and may land on the secretary instead.
  const { listSessionRoles, listRoleFamilies } = await import('../src/definitions.js');
  const tasks = await listSessionRoles();
  const roles = await listRoleFamilies();

  assert.ok(tasks.some((t) => t.name === 'QuarterBack'), 'QuarterBack is a session_role');
  assert.ok(!roles.some((r) => r.name === 'quarterback'), 'and not a family');

  const developer = roles.find((r) => r.name === 'developer');
  assert.ok(developer, 'developer is the shelf it sits on');
  assert.equal(developer!.default_lead_role, 'QuarterBack');
  assert.equal(developer!.session_roles[0], 'QuarterBack', 'the pin presents it first');

  const qb = await resolveForm(commonsForm({ session_role: 'QuarterBack' }), new Set());
  assert.equal(qb.session_role, 'QuarterBack');
  assert.equal(qb.dial, 'read', 'a coordinator watches: the definition states its own dial');
  assert.equal(qb.lifecycle, 'orchestrating');
  // A default_lead_role launch carries the team-building SOP — route 1 of its delivery.
  assert.match(qb.brief, /teams\.md/, 'the lead reading rides the brief');
});
