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
 * `POST /api/launch`, and everything downstream of it — the tags, the letter,
 * the counting — is the route's single body of code. So parity is proven where the two
 * callers could possibly diverge: hand it equivalent specs and the RESOLVED launch and
 * the READING LIST must be identical, field for field. A second launch path would have to
 * reproduce this table to pass, which is the point.
 *
 * No tmux, no socket: every store is redirected per the env contract in src/resources.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-parity-test-'));
const listed = (slugs: string[]) => ({ fetched_at: '2026-09-18T00:00:00Z', etag: 'test', client_version: 'test', models: slugs.map((slug, priority) => ({ slug, display_name: slug, description: '', visibility: 'list', priority })) });
const providers = { measured_at: '2026-09-18T00:00:00Z', installed: ['claude', 'codex'], signed_in: ['claude', 'codex'], operational: ['claude', 'codex'], activated_count: 2, paths: {}, versions: {}, latest: {}, model_lists: {
  claude: listed(['opus', 'fable', 'sonnet', 'haiku']),
  codex: listed(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5']),
} };
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
// explicit pick — no role axis biases the model, so a launch that names
// nothing must land here for both callers alike.
await fs.mkdir(path.join(temp, 'config'), { recursive: true });
await fs.writeFile(
  path.join(temp, 'config', 'machine_settings.json'),
  JSON.stringify({
    agents: { sessions: { default: { provider: 'anthropic', model: 'fable' } } },
    campaigns: {
      home_machine: {
        title: 'Ronin Home',
        state: 'active',
        providers,
        config: { installations: { gbrain: false }, defaults: {} },
      },
      gbrain_connected: {
        title: 'Gbrain connected',
        state: 'archived',
        providers,
        config: { installations: { gbrain: true }, defaults: { behaviours: ['gbrain'] } },
      },
    },
  }),
);
process.env.RONIN_LEDGER_DIR = path.join(temp, 'ledger');

// A book on each core level, so the reading list has something to be identical ABOUT.
for (const [level, name, book] of [
  ['all', '', 'ALL_BOOK.md'],
  ['root', 'alpha', 'ROOT_BOOK.md'],
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
  [
    '# scratchteam', '', '- **objective:** prove the parity', '- **project_root:** beta',
    '- **agent_defaults:** {"provider":"","model":"","reach":"discuss","recruit":"nobody","output":"ideas","launch_mode":"configured","gbrain_mode":"disconnected"}',
    '- **state:** active', '',
  ].join('\n'),
);

const { resolveForm } = await import('../src/spawn.js');
const { mikaLaunchBody } = await import('../src/routes/launch.js');
type SpawnForm = import('../src/spawn.js').SpawnForm;

/** What the ＋ New form posts: the axes, the picks, and the owner's words. */
const commonsForm = (over: Partial<SpawnForm> = {}): SpawnForm => ({
  campaign_id: 'home_machine',
  project_root: 'alpha',
  prompt: 'Work out the shape of the thing.',
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
  project_root: r.project_root,
  dir: r.dir,
  cmd: r.cmd,
  agent: r.agent,
  capExempt: r.capExempt,
  gbrain_mode: r.gbrain_mode,
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

test('birth brief includes wipeboard guidance for every Team without a follow-up message', async () => {
  const agent = await resolveForm(commonsForm({ tags: ['crew', 'other_crew', 'crew'] }), new Set());
  assert.match(agent.brief, /Team membership: crew, other_crew\. Run: edges wipeboard/);
  assert.equal(agent.brief.match(/Membership follows the team/g)?.length, 1);
});

test('equivalent specs from Commons and forkit resolve to the same launch', async () => {
  const fromCommons = await resolveForm(commonsForm(), new Set());
  const fromForkit = await resolveForm(forkitForm({ prompt: commonsForm().prompt }), new Set());
  assert.deepEqual(mechanism(fromForkit), mechanism(fromCommons));
});

test('session_type is the only birth-path key', async () => {
  const cowork = await resolveForm(commonsForm({ session_type: 'cowork_agent' }), new Set());
  assert.equal(cowork.session_type, 'cowork_agent');
  assert.equal(cowork.agent, true);
  assert.ok(cowork.brief, 'a cowork Agent receives the Ronin birth brief');
  assert.ok(cowork.birth_reading.length, 'a cowork Agent receives the boot shelf');

  const terminal = await resolveForm(commonsForm({ session_type: 'terminal' }), new Set());
  assert.equal(terminal.session_type, 'terminal');
  assert.equal(terminal.agent, false);
  assert.equal(terminal.brief, '');
  assert.deepEqual(terminal.birth_reading, []);
  assert.equal(terminal.assignment, null);
});

test('bare_metal_agent resolves a real CLI without Ronin birth machinery', async () => {
  const bare = await resolveForm(commonsForm({
    session_type: 'bare_metal_agent',
    name: 'bare-proof',
    provider: 'anthropic',
    team: 'scratchteam',
  }), new Set());
  assert.equal(bare.session_type, 'bare_metal_agent');
  assert.equal(bare.agent, true);
  assert.ok(bare.cmd, 'the provider CLI is resolved');
  assert.doesNotMatch(bare.cmd, /dangerously/, 'bare metal uses Native unless Dangerously is explicitly selected');
  assert.equal(bare.cmd, 'claude', 'no model selection is the Agent CLI’s Native command');
  assert.equal(bare.launch_mode, 'configured');
  assert.ok(bare.launchAgent, 'the launched provider is stamped');
  assert.equal(bare.brief, '', 'Ronin composes no brief');
  assert.deepEqual(bare.birth_reading, [], 'Ronin reads no boot shelf');
  assert.deepEqual(bare.behaviours, [], 'Campaign and Team behaviour defaults never reach bare metal');
  assert.equal(bare.assignment, null, 'Ronin opens no managed repository desk');
  assert.deepEqual(bare.tags, ['scratchteam'], 'Team is only an addressing tag');
  assert.equal(bare.team_objective, '', 'the Team roster does not resolve into the launch');
});

test('an unavailable gbrain changes teaching without changing the provider command', async () => {
  const cowork = await resolveForm(commonsForm({
    session_type: 'cowork_agent',
    name: 'gbrain-off-proof',
    provider: 'openai',
    model: 'gpt-5.6-terra',
  }), new Set());
  const gbrain = cowork.installations.find((installation) => installation.name === 'gbrain');

  assert.equal(gbrain?.enabled, false, 'the receipt source says the gbrain installation is off');
  assert.equal(cowork.cmd, 'codex --model gpt-5.6-terra');
  assert.ok(!cowork.behaviours.some((behaviour) => behaviour.book === 'gbrain'),
    'no gbrain behaviour is delivered while its installation is off');
});

test('a selected gbrain changes teaching without changing the provider command', async () => {
  const cowork = await resolveForm(commonsForm({
    session_type: 'cowork_agent',
    campaign_id: 'gbrain_connected',
    name: 'gbrain-on-proof',
    provider: 'openai',
    model: 'gpt-5.6-terra',
  }), new Set());
  const gbrain = cowork.installations.find((installation) => installation.name === 'gbrain');

  assert.equal(gbrain?.enabled, true, 'the receipt source says the gbrain installation is on');
  assert.equal(cowork.cmd, 'codex --model gpt-5.6-terra');
  assert.ok(cowork.behaviours.some((behaviour) => behaviour.book === 'gbrain'),
    'the selected gbrain behaviour is delivered');
});

test('and to the same role-free reading list — all + root, compiled once', async () => {
  const fromCommons = await resolveForm(commonsForm(), new Set());
  const fromForkit = await resolveForm(forkitForm({ prompt: commonsForm().prompt }), new Set());

  const books = reading(fromCommons.brief);
  // The levels a fork used to get NONE of.
  for (const book of ['ALL_BOOK.md', 'ROOT_BOOK.md']) {
    assert.ok(books.includes(book), `the Build Brief must carry ${book}`);
  }
  const forkBooks = reading(fromForkit.brief);
  for (const book of ['ALL_BOOK.md', 'ROOT_BOOK.md']) {
    assert.ok(forkBooks.includes(book), `the forked Build Brief must carry ${book}`);
  }
  assert.deepEqual(fromCommons.birth_reading.map((file) => path.basename(file)).sort(), books);
  assert.deepEqual(fromForkit.birth_reading.map((file) => path.basename(file)).sort(), forkBooks);
});

test('resolved birth readings include the startup shelves and explicit seeds', async () => {
  const seed = path.join(temp, 'OWNER_SEED.md');
  const assisted = await resolveForm(commonsForm({ seed: [seed] }), new Set());
  assert.ok(assisted.birth_reading.includes(seed));
  assert.deepEqual(reading(assisted.brief), assisted.birth_reading.map((file) => path.basename(file)).sort());

});

test("forkit's own inputs change its words and nothing about the mechanism", async () => {
  const plain = await resolveForm(commonsForm(), new Set());
  const forked = await resolveForm(
    forkitForm({ prompt: 'Read wip/handoffs/TOPIC.md. Then report back, in your own words.' }),
    new Set(),
  );
  // The handoff prompt and the team are INPUTS. They must reach the brief and the tags…
  assert.match(forked.brief, /wip\/handoffs\/TOPIC\.md/);
  assert.match(forked.brief, /^Team: scratchteam$/m);
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
  const pick = 'claude --model haiku';
  const c2 = await resolveForm(commonsForm({ cmd: pick }), new Set());
  const f2 = await resolveForm(forkitForm({ cmd: pick }), new Set());
  assert.ok(c2.cmd.startsWith(pick), `explicit pick must lead the cmd, got "${c2.cmd}"`);
  assert.equal(f2.cmd, c2.cmd, 'and both callers get the identical resolved command');
});


test('launch_mode selects the Agent document’s Native or Dangerously command', async () => {
  const configured = await resolveForm(commonsForm({
    provider: 'anthropic', model: 'opus', launch_mode: 'configured',
  }), new Set());
  assert.equal(configured.cmd, 'claude --model opus');
  assert.equal(configured.launch_mode, 'configured');
  assert.deepEqual(configured.stated_by.launch_mode, [{ layer: 'launch', source: 'launch request' }]);

  const dangerous = await resolveForm(commonsForm({
    provider: 'anthropic', model: 'opus', launch_mode: 'live_dangerously',
  }), new Set());
  assert.equal(dangerous.cmd, 'claude --model opus --dangerously-skip-permissions');
  assert.equal(dangerous.launch_mode, 'live_dangerously');

  const bareDangerous = await resolveForm(commonsForm({
    session_type: 'bare_metal_agent', provider: 'openai', model: 'gpt-5.6-terra', launch_mode: 'live_dangerously',
  }), new Set());
  assert.match(bareDangerous.cmd, /--dangerously-bypass-approvals-and-sandbox/);

  await assert.rejects(
    () => resolveForm(commonsForm({ cmd: 'custom-agent', launch_mode: 'live_dangerously' }), new Set()),
    /declares no Dangerously command/,
  );
});


test('mandate defaults are complete, Team seeds them, and the explicit launch wins', async () => {
  const stock = await resolveForm(commonsForm(), new Set());
  assert.deepEqual(stock.mandate, { reach: 'plan', recruit: 'propose agents', output: ['open'] });

  const seeded = await resolveForm(forkitForm(), new Set());
  assert.deepEqual(seeded.mandate, { reach: 'discuss', recruit: 'nobody', output: ['ideas'] });

  const explicit = await resolveForm(forkitForm({
    mandate: { reach: 'execute', recruit: 'staff agents', output: 'the team' },
  }), new Set());
  assert.deepEqual(explicit.mandate, { reach: 'execute', recruit: 'staff agents', output: ['the team'] });
  assert.deepEqual(explicit.stated_by.mandate, [{ layer: 'launch', source: 'launch request' }]);
});

test('a ronin launch is legal, and so is a launch onto a tag-only team', async () => {
  // No team at all — a ronin — is an ordinary launch.
  const ronin = await resolveForm(commonsForm(), new Set());
  assert.equal(ronin.team, '');
  // A team the durable half has never heard of is an ordinary team (owner, 2026-08-26):
  // the session is born tagged onto it, told it is tag-only, and inherits no roster.
  const tagOnly = await resolveForm(commonsForm({ team: 'ghosts' }), new Set());
  assert.equal(tagOnly.team, 'ghosts');
  assert.ok(tagOnly.tags.includes('ghosts'), 'born tagged onto it');
  assert.match(tagOnly.brief, /tag-only team/);
  // The name is still the tag, so it obeys the tag's spelling.
  await assert.rejects(() => resolveForm(commonsForm({ team: 'Ghosts!' }), new Set()), /team name/);
});

test('stated_by carries the settled launch, Team, and Campaign layers', async () => {
  const explicit = await resolveForm(commonsForm({
    name: 'attribution-proof',
    project_root: 'beta',
    cmd: 'claude --model haiku',
  }), new Set());
  for (const key of ['name', 'project_root', 'cmd']) {
    assert.deepEqual(explicit.stated_by[key], [{ layer: 'launch', source: 'launch request' }], key);
  }

  const inherited = await resolveForm(forkitForm({ project_root: undefined }), new Set());
  assert.equal(inherited.stated_by.project_root[0]?.layer, 'team_roster');
  assert.match(inherited.stated_by.project_root[0]?.source ?? '', /team_rosters\/scratchteam\.md$/);

  const campaign = await resolveForm(commonsForm(), new Set());
});


test('server resolution returns profile and durable Team context without browser reconstruction', async () => {
  const resolved = await resolveForm(forkitForm(), new Set());
  assert.equal(resolved.launch_mode, 'configured');
  assert.equal(resolved.team_objective, 'prove the parity');
  assert.equal(resolved.team_branch, '');
  assert.equal(resolved.team_wipeboard, 'scratchteam');
  assert.equal(resolved.team_state, 'active');
  assert.equal(resolved.stated_by.team_objective[0]?.layer, 'team_roster');
});

test('the birth prompt states only constrained mandate axes and a real Team Lead designation', async () => {
  const constrained = await resolveForm(commonsForm({
    team: 'scratchteam',
    team_lead: true,
    mandate: { reach: 'discuss', recruit: 'open', output: ['ideas', 'no code'] },
  }), new Set());
  assert.match(constrained.brief, /Designation: Team Lead/);
  assert.match(constrained.brief, /Reach: discuss/);
  assert.doesNotMatch(constrained.brief, /Recruit:/);
  assert.match(constrained.brief, /Output: ideas, no code/);

  const open = await resolveForm(commonsForm({
    mandate: { reach: 'open', recruit: 'open', output: ['open'] },
  }), new Set());
  assert.doesNotMatch(open.brief, /Designation:|Reach:|Recruit:|Output:/);
});

test('the birth prompt carries mandate choices inherited from the Team', async () => {
  const inherited = await resolveForm(forkitForm(), new Set());
  assert.match(inherited.brief, /Reach: discuss/);
  assert.match(inherited.brief, /Recruit: nobody/);
  assert.match(inherited.brief, /Output: ideas/);
});

test('an ordinary assisted launch starts an agent with the full brief', async () => {
  // THE RELEASE-BLOCKER SHAPE, asserted end to end at the mechanism: what an ordinary
  // Commons click resolves to must be an AGENT launch, on nonblank axes, carrying the
  // compiled reading list. A launch that quietly resolved agentless, or lost an axis on
  // the way through, would be born a bare shell with a blank letter — which is a valid
  // launch for `OpenShell` and the tile picker, and a bug for anything else.
  const r = await resolveForm(commonsForm(), new Set());
  assert.equal(r.agent, true, 'an ordinary launch starts a CLI');
  assert.ok(r.cmd, 'and has a command to start');
  assert.ok(r.launchAgent, 'and stamps which CLI it started');
  assert.ok(r.project_root, 'a session is always born somewhere');
  assert.match(r.brief, /Read first:/, 'the Build Brief carries its reading list');
  assert.ok(reading(r.brief).length >= 3, 'the levels, not a bare prompt');
});

test('team_lead is explicit and applies its conditional Behavior at birth', async () => {
  const lead = await resolveForm(commonsForm({ team: 'builders', team_lead: true }), new Set());
  const leadReading = lead.birth_reading.find((file) => file.endsWith('/conditional/team-lead.md'))!;
  assert.ok(leadReading, 'the fact-selected Behavior is part of the birth reading');
  assert.match(await fs.readFile(leadReading, 'utf8'), /immediate reading\s+assignment/);
  const ordinary = await resolveForm(commonsForm({ team: 'builders', team_lead: false }), new Set());
  assert.ok(!ordinary.birth_reading.some((file) => file.endsWith('/conditional/team-lead.md')));
});

test('Mika house mechanics resolve explicitly', async () => {
  const mika = await resolveForm({
    house_seat: 'mika',
    name: 'mika_agent',
    prompt: 'Help me with Ronin.',
  }, new Set());
  assert.equal(mika.name, 'mika_agent');
  assert.match(mika.dir, /\/mika$/);
  assert.equal(mika.project_root, 'mika_home');
  assert.equal(mika.capExempt, true);
  assert.equal(mika.contributions.every((contribution) => !contribution.enabled), true);
  assert.equal(mika.ack, false);
  assert.equal(mika.opening, '{prompt}', 'nothing is typed at her beyond the request itself');
  // The launch prefixes "You are the Mika Assist." — with the posture that is the whole typed intro: two sentences.
  assert.match(mika.brief, /^You are the Mika Assist\. You explain and operate Ronin only[^.]*\.\n/);
  assert.equal((mika.brief.split('\n')[0].match(/\. /g) || []).length, 1, 'two sentences typed; the rules live in her README');
  assert.match(mika.brief, /You are the Mika Assist/);
  assert.ok(!mika.birth_reading.some((file) => file.includes('MikaAssist')));
  assert.equal(mika.stated_by.capExempt[0]?.layer, 'house');
  const door = mikaLaunchBody({});
  assert.deepEqual(door.mandate, { reach: 'discuss', recruit: 'nobody', output: ['ideas'] }, 'she discusses, recruits nobody, hands back ideas');
});

test('a name alone resolves the ordinary Cowork Agent birth', async () => {
  // Last because resolving the initial Campaign legitimately exercises its one-time
  // compatibility write; earlier parity cases intentionally measure the pre-write fixture.
  const born = await resolveForm({ name: 'name_only' });
  assert.equal(born.session_type, 'cowork_agent');
  assert.equal(born.name, 'name_only');
  assert.equal(born.project_root, 'alpha', 'the existing top-active-root chain answers placement');
  assert.ok(born.installations.length > 0, 'the receipt source carries every installation');
  assert.ok(!born.installations.some((installation) => installation.name === 'cowork_agent'), 'the Cowork Agent is not an installation switch');
  assert.deepEqual(born.mandate, { reach: 'plan', recruit: 'propose agents', output: ['open'] });
});

test('kind and behaviours resolve at birth, with unusable books reported as undelivered', async () => {
  const born = await resolveForm(commonsForm({
    kind: 'coding',
    behaviours: ['mandates', 'write_it_down', 'ways:not_there'],
  }), new Set());
  assert.equal(born.kind, 'coding');
  assert.deepEqual(born.behaviours.map((row) => row.book), ['mandates', 'cowork-agent', 'user-intro', 'checkout', 'write_it_down']);
  assert.ok(born.birth_reading.some((file) => file.endsWith('/behaviours/floor/mandates.md')), 'the floor folder is applied');
  assert.ok(born.birth_reading.some((file) => file.endsWith('/behaviours/floor/cowork-agent.md')), 'every Cowork Agent receives its floor guidance');
  assert.ok(born.birth_reading.some((file) => file.endsWith('/behaviours/floor/user-intro.md')), 'the stock-empty user introduction has a stable floor coordinate');
  assert.ok(born.birth_reading.some((file) => file.endsWith('/behaviours/selected/write_it_down.md')));
  assert.deepEqual(born.ignored, []);
  assert.deepEqual(born.undelivered, ['ways:not_there']);
  assert.equal(born.stated_by.kind[0]?.layer, 'launch');
  assert.equal(born.stated_by.behaviours[0]?.layer, 'launch');
});

test('a selected template names unchanged preset values without reapplying edited ones', async () => {
  const preset = await resolveForm(commonsForm({
    template: 'office_manager',
    prompt: 'Be my office manager — handle the daily grind: inbox, calendar, paperwork.',
    mandate: { reach: 'execute', recruit: 'nobody', output: 'open' },
    behaviours: ['write_it_down'],
  }), new Set());
  assert.deepEqual(preset.stated_by.template, [{ layer: 'template', source: 'office_manager' }]);
  assert.equal(preset.stated_by.brief[0]?.layer, 'template');
  assert.deepEqual(preset.stated_by.mandate, [{ layer: 'template', source: 'office_manager' }]);
  assert.deepEqual(preset.stated_by.behaviours, [{ layer: 'template', source: 'office_manager' }]);

  const edited = await resolveForm(commonsForm({
    template: 'office_manager',
    prompt: 'Handle only the calendar.',
    mandate: { reach: 'plan', recruit: 'nobody', output: 'an artifact' },
    behaviours: [],
  }), new Set());
  assert.equal(edited.stated_by.brief[0]?.layer, 'launch');
  assert.deepEqual(edited.stated_by.mandate, [{ layer: 'launch', source: 'launch request' }]);
  assert.deepEqual(edited.stated_by.behaviours, [{ layer: 'launch', source: 'launch request' }]);

  const missing = await resolveForm(commonsForm({ template: 'not_there' }), new Set());
  assert.deepEqual(missing.ignored, ['template[not_there]']);
  assert.equal(missing.stated_by.template[0]?.layer, 'system');
});
