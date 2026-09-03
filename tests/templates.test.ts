/**
 * THE TEMPLATE CATALOG, split (TEMPLATE_LIBRARY.md): the two shipped shelves read
 * whole, a cast parses into the ruled wire rows, the mandate grammar holds the ruled
 * values, and the one write per shelf is save-as-NEW into the user store — never a
 * shadow of a shipped box. The user store is pointed at a temp dir; no live store, no
 * tmux, no socket.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const temp = await mkdtemp(path.join(tmpdir(), 'ronin-templates-'));
const previous = process.env.RONIN_CATALOGS_DIR;
process.env.RONIN_CATALOGS_DIR = temp;
const { listAgentTemplates, listTeamTemplates, parseTemplateAgents, templateMandate } =
  await import('../src/definitions.js');
const { saveAgentTemplate, saveTeamTemplate } = await import('../src/templates.js');

test('the shipped agent shelf surfaces loadouts, and no team answers', async () => {
  const rows = await listAgentTemplates();
  const assistant = rows.find((row) => row.name === 'personal_assistant');
  assert.ok(assistant, 'personal_assistant is on the shelf');
  assert.equal(assistant?.label, 'Personal Assistant');
  assert.deepEqual(assistant?.mandate, { reach: 'execute', recruit: 'nobody', output: ['open'] });
  assert.equal(assistant?.team_mode, 'new', 'the assistant is born into its own team');
  assert.deepEqual(assistant?.routines_on, ['gbrain']);
  const check = rows.find((row) => row.name === 'health_checker');
  assert.deepEqual(check?.mandate?.output, ['an artifact', 'no code']);
  // Tray order is the stated order:, so the assistant leads the shelf — and every box
  // is a PERSON (agents are people, teams are projects; the owner's rule).
  assert.equal(rows[0]?.name, 'personal_assistant');
  assert.ok(!rows.some((row) => row.name === 'staff_my_codebase'), 'the staffing project moved to the teams shelf');
});

test('the shipped team shelf surfaces casts with one marked lead each', async () => {
  const rows = await listTeamTemplates();
  const dinner = rows.find((row) => row.name === 'dinner_party');
  assert.ok(dinner, 'dinner_party is on the shelf');
  assert.equal(dinner?.objective.includes('good evening'), true);
  assert.deepEqual(dinner?.agents.map((row) => row.name),
    ['run the evening', 'menu and shopping', 'table and room', 'entertainment']);
  const lead = dinner?.agents.find((row) => row.team_lead);
  assert.equal(lead?.name, 'run the evening');
  assert.deepEqual(lead?.mandate, { reach: 'execute', recruit: 'staff agents', output: ['open'] });
  for (const cast of rows) {
    assert.equal(cast.agents.filter((row) => row.team_lead).length, 1, `${cast.name} marks one lead`);
    assert.ok(cast.agents.length >= 2, `${cast.name} is a cast, not a loadout`);
  }
  // The flagship project: the coordinator is born marked, the assessor staffs.
  const staff = rows.find((row) => row.name === 'staff_my_codebase');
  assert.ok(staff, 'staff_my_codebase is a TEAM template');
  assert.equal(staff?.agents.find((row) => row.team_lead)?.name, 'code coordinator');
  assert.deepEqual(staff?.agents.find((row) => row.name === 'codebase assessor')?.mandate?.output, ['the team']);
});

test('a cast parses from the section format, row keys never leaking top-level', () => {
  const rows = parseTemplateAgents([
    '# Box', '- **objective:** o', '', '## agents', '',
    '### one', '- **team_lead:** yes', '- **instructions:** Lead.', '- **mandate:** open · nobody · open', '',
    '### two', '- **instructions:** Work.', '- **routines_off:** gbrain', '- **routines_on:** ronin_worktrees, gbrain',
  ].join('\n'));
  assert.deepEqual(rows, [
    { name: 'one', instructions: 'Lead.', mandate: { reach: 'open', recruit: 'nobody', output: ['open'] }, team_lead: true, routines_on: [], routines_off: [] },
    { name: 'two', instructions: 'Work.', mandate: null, team_lead: false, routines_on: ['ronin_worktrees', 'gbrain'], routines_off: ['gbrain'] },
  ]);
  assert.deepEqual(parseTemplateAgents('# Box\n- **objective:** o\n'), [], 'no agents heading, no rows');
});

test('the mandate grammar admits only the ruled values', () => {
  assert.deepEqual(templateMandate('open · nobody · the team'), { reach: 'open', recruit: 'nobody', output: ['the team'] });
  assert.deepEqual(templateMandate('execute · nobody · code, no code'), { reach: 'execute', recruit: 'nobody', output: ['code', 'no code'] });
  for (const bad of ['run · nobody · code', 'execute · staff · code', 'execute · staff agents', 'execute · staff agents · loot']) {
    assert.equal(templateMandate(bad), null, bad);
  }
});

test('agent save-as-new lands on the agents shelf and reads back', async () => {
  const saved = await saveAgentTemplate({
    name: 'night_shift', label: 'Night Shift', art: '🌙', blurb: 'The quiet hours, covered.',
    kinds: ['work', 'bogus'], brief: 'Cover the quiet hours.',
    mandate: { reach: 'execute', recruit: 'nobody', output: ['open'] },
    behaviours: ['sops:accounts'], routines_off: ['ronin_worktrees'],
  });
  assert.equal(saved.origin, 'user');
  assert.equal(saved.shadowed, false);
  assert.deepEqual(saved.kinds, ['work'], 'an unknown kind is dropped, not stored');
  assert.deepEqual(saved.mandate, { reach: 'execute', recruit: 'nobody', output: ['open'] }, 'a wire-object mandate stores as the file grammar');
  const raw = await readFile(path.join(temp, 'templates', 'agents', 'night_shift.md'), 'utf8');
  assert.match(raw, /- \*\*mandate:\*\* execute · nobody · open/);
});

test('team save-as-new stores the cast as sections and reads back', async () => {
  const saved = await saveTeamTemplate({
    name: 'night_watch', label: 'Night Watch', art: '🌃', blurb: 'The quiet hours, watched.',
    kinds: ['work'], objective: 'Nothing breaks overnight.',
    agents: [
      { name: 'watch lead', instructions: 'Hold the watch.', mandate: { reach: 'execute', recruit: 'nobody', output: ['open'] }, team_lead: true },
      { name: 'runner', instructions: 'Chase what the watch flags.' },
    ],
  });
  assert.equal(saved.origin, 'user');
  assert.equal(saved.agents.length, 2);
  assert.equal(saved.agents[0].team_lead, true);
  const raw = await readFile(path.join(temp, 'templates', 'teams', 'night_watch.md'), 'utf8');
  assert.match(raw, /## agents\n\n### watch lead\n- \*\*team_lead:\*\* yes/);
});

test('a save is always new — an existing name on ITS shelf is refused; shelves are separate namespaces', async () => {
  await assert.rejects(() => saveAgentTemplate({ name: 'personal_assistant' }), /already exists/);
  await assert.rejects(() => saveTeamTemplate({ name: 'dinner_party' }), /already exists/);
  await assert.rejects(() => saveAgentTemplate({ name: 'Bad Name' }), /lowercase/);
  await assert.rejects(() => saveAgentTemplate({ name: 'half_mandate', mandate: 'execute · staff' }), /ruled values/);
  await assert.rejects(() => saveAgentTemplate({ name: 'odd_team_mode', team_mode: 'existing' }), /team_mode/);
  await assert.rejects(
    () => saveTeamTemplate({ name: 'two_leads', agents: [
      { name: 'a', instructions: 'x', team_lead: true },
      { name: 'b', instructions: 'y', team_lead: true },
    ] }),
    /at most one/,
  );
  // dinner_party is a TEAM box; the agents shelf has no such name, so this save lands.
  const twin = await saveAgentTemplate({ name: 'dinner_party', blurb: 'One cook.', brief: 'Cook it all yourself.' });
  assert.equal(twin.origin, 'user');
});

test.after(async () => {
  if (previous === undefined) delete process.env.RONIN_CATALOGS_DIR;
  else process.env.RONIN_CATALOGS_DIR = previous;
  await rm(temp, { recursive: true, force: true });
});
