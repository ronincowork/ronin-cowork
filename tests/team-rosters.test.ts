/**
 * THE TEAM ROSTER — the durable half of a team, and the facts it must never hold.
 *
 * A roster carries the team's kind, objective, kit and launch defaults, and exists
 * independent of any live session (a zero-member team is the League's ordinary row).
 * Members and leads are NEVER stored in it — each session defines whose team it is on —
 * and the store refuses nothing else so loudly as it refuses that (R35, 2026-08-23).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Project } from '../src/projects.js';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-rosters-test-'));
process.env.RONIN_TEAM_ROSTERS_DIR = temp;

const {
  createTeamRoster,
  deleteTeamRoster,
  listTeamRosters,
  readTeamRoster,
  writeTeamRoster,
} = await import('../src/team-rosters.js');
const { assignTeamProject, issueTeamProjectId, moveTeamProject, returnTeamProject, writeTeamIdea } = await import('../src/team-projects.js');
test('create → read → list: a zero-member team is a real, openable record', async () => {
  const r = await createTeamRoster('alpha', {
    kind: 'coding',
    objective: 'ship the teams cut',
    project_root: 'ronin-cowork',
    branch: 'dev',
    behaviours: { selected: ['mandates'], required: ['mandates'] },
    agent_defaults: {
      provider: 'anthropic', model: 'opus', reach: 'execute', recruit: 'nobody',
      output: 'code', launch_mode: 'configured',
    },
  });
  assert.equal(r.kind, 'coding');
  assert.equal(r.title, 'Alpha');
  assert.equal(r.wipeboard, 'alpha', 'the board defaults to the team’s own token');
  assert.equal(r.state, 'active');
  assert.deepEqual(r.projects, []);
  assert.equal(r.next_project_id, 1);

  const back = await readTeamRoster('alpha');
  assert.deepEqual(back, r);
  assert.equal((await listTeamRosters()).length, 1, 'listed with zero live members');
});

test('ideas live in the roster and its monotonic id issuer is the only id source', async () => {
  const first = await writeTeamIdea('alpha', undefined, { title: 'Board read', objective: 'Return one JSON board.' });
  assert.equal(first.project.id, 'alpha/1');
  assert.equal(first.project.stage, 'IDEAS');
  assert.equal(first.project.exit, 'lead');
  assert.equal(first.project.status, 'yellow');
  const edited = await writeTeamIdea('alpha', '1', { status: 'green', exit: 'user' });
  assert.equal(edited.created, false);
  assert.equal(edited.project.status, 'green');
  const second = await writeTeamIdea('alpha', undefined, { title: 'Thin verbs', objective: 'Keep names replaceable.' });
  assert.equal(second.project.id, 'alpha/2');
  const roster = await readTeamRoster('alpha');
  assert.equal(roster?.next_project_id, 3);
  assert.deepEqual(roster?.projects.map((p) => p.id), ['alpha/1', 'alpha/2']);
});

test('a roster holder moves among Inbox, Backlog and Done without changing project state', async () => {
  const before = (await readTeamRoster('alpha'))!.projects[1]!;
  assert.deepEqual((await moveTeamProject('alpha', before.id, 'backlog')).project, before);
  assert.deepEqual((await readTeamRoster('alpha'))!.backlog_projects, [before]);
  assert.deepEqual((await moveTeamProject('alpha', before.id, 'done')).project, before);
  assert.deepEqual((await moveTeamProject('alpha', before.id, 'inbox')).project, before);
});

test('an Agent project reserves its id without creating a roster idea', async () => {
  const id = await issueTeamProjectId('alpha');
  assert.equal(id, 'alpha/3');
  const concurrent = await Promise.all([issueTeamProjectId('alpha'), issueTeamProjectId('alpha')]);
  assert.deepEqual(concurrent, ['alpha/4', 'alpha/5'], 'concurrent issuers cannot observe the same counter');
  const roster = await readTeamRoster('alpha');
  assert.equal(roster?.next_project_id, 6);
  assert.equal(roster?.projects.some((project) => project.id === id), false);
});

test('assign and return move one whole project across the roster boundary', async () => {
  const held: Project[] = [];
  const firstProject = (await readTeamRoster('alpha'))!.projects[0];
  const move = async (input: { direction: 'place'; session: string; project: Project } | { direction: 'return'; session: string; projectId: string }) => {
    if (input.direction === 'place') {
      held.push(input.project);
      return { project: input.project, projectsRemaining: held.length };
    }
    const at = held.findIndex((project) => project.id === input.projectId);
    assert.notEqual(at, -1);
    const [project] = held.splice(at, 1);
    return { project, projectsRemaining: held.length };
  };
  const assigned = await assignTeamProject('alpha', '1', 'worker', move);
  assert.deepEqual(held, [assigned]);
  assert.equal(assigned.stage, 'IDEAS', 'assignment does not mutate authored stage');
  assert.equal((await readTeamRoster('alpha'))?.projects.some((p) => p.id === assigned.id), false);
  const returned = await returnTeamProject('alpha', '1', 'worker', 'inbox', move);
  assert.equal(returned.projectsRemaining, 0);
  assert.equal(returned.project.stage, assigned.stage, 'return preserves authored stage');
  assert.equal(returned.project.exit, assigned.exit);
  assert.equal(returned.project.status, assigned.status);
  assert.equal((await readTeamRoster('alpha'))?.projects.some((p) => p.id === assigned.id), true);
});

test('concurrent assignments cannot restore a Project removed by the other assignment', async () => {
  const one = await writeTeamIdea('alpha', undefined, { title: 'Parallel one', objective: 'Move once.' });
  const two = await writeTeamIdea('alpha', undefined, { title: 'Parallel two', objective: 'Move once too.' });
  const held = new Map<string, Project>();
  const move = async (input: { direction: 'place'; session: string; project: Project } | { direction: 'return'; session: string; projectId: string }) => {
    if (input.direction === 'place') {
      held.set(input.project.id, input.project);
      return { project: input.project, projectsRemaining: held.size };
    }
    const project = held.get(input.projectId)!;
    held.delete(input.projectId);
    return { project, projectsRemaining: held.size };
  };
  await Promise.all([
    assignTeamProject('alpha', one.project.id, 'one', move),
    assignTeamProject('alpha', two.project.id, 'two', move),
  ]);
  const roster = await readTeamRoster('alpha');
  assert.equal(roster?.projects.some((project) => project.id === one.project.id || project.id === two.project.id), false);
  assert.deepEqual([...held.keys()].sort(), [one.project.id, two.project.id].sort());
});

test('the settled nested shapes round-trip, and an edit touches only what it states', async () => {
  const r = await writeTeamRoster('alpha', { title: 'Alpha Platform' });
  assert.equal(r.title, 'Alpha Platform');
  assert.equal(r.objective, 'ship the teams cut', 'unstated fields survive');
  assert.deepEqual(r.behaviours, { selected: [], required: [] });
  assert.deepEqual(r.agent_defaults, {
    provider: 'anthropic', model: 'opus', reach: 'execute', recruit: 'nobody',
    output: ['code'], launch_mode: 'configured',
  });
});

test('a blank field is written as "—" and reads back as the blank it stands for', async () => {
  // The quirk of 2026-08-26: a roster created with blanks rendered them as "—", and the
  // next edit read those marks back as VALUES — a project_root named "—", refused at
  // launch. The mark is a rendering; the store must never return it as a fact.
  await createTeamRoster('bare', { objective: 'only this' });
  const withBranches = await createTeamRoster('checkouts', { repos: ['cowork', 'koe'], branches: { koe: 'main', ignored: '' } });
  assert.deepEqual((await readTeamRoster('checkouts'))?.branches, { koe: 'main' }, 'per-repo branches round-trip; blanks drop');
  const r = await writeTeamRoster('bare', { branch: 'dev' });
  assert.equal(r.project_root, '', 'an untouched blank stays blank after an edit');
  assert.equal(r.kind, 'open');
  assert.deepEqual(r.behaviours, { selected: [], required: [] });
  assert.equal(r.branch, 'dev');
  const cleared = await writeTeamRoster('bare', { objective: '' });
  assert.equal(cleared.objective, '', 'clearing a field is blank on read-back, not "—"');
  await deleteTeamRoster('bare');
});

test('an old behaviour shape reads with no elective behaviours and is not rewritten', async () => {
  const file = path.join(temp, 'home_machine', 'old_shape.md');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const raw = '# old_shape\n- **title:** Old Shape\n- **behaviours:** {"books":[],"required":false}\n';
  await fs.writeFile(file, raw, 'utf8');
  const roster = await readTeamRoster('old_shape', 'home_machine');
  assert.deepEqual(roster?.behaviours, { selected: [], required: [] });
  assert.equal(await fs.readFile(file, 'utf8'), raw, 'reading the old shape does not migrate it');
});

test('a settled roster honours an explicit empty behaviour list', async () => {
  const roster = await createTeamRoster('explicit_empty', {
    behaviours: { selected: [], required: [] },
  }, 'home_machine');
  assert.deepEqual(roster.behaviours, { selected: [], required: [] });
  assert.deepEqual((await readTeamRoster('explicit_empty', 'home_machine'))?.behaviours, { selected: [], required: [] });
});

test('creating over an existing roster is refused — editing is a different intent', async () => {
  await assert.rejects(() => createTeamRoster('alpha', {}), /already has a roster/);
});

test('dissolve deletes the roster and only the roster', async () => {
  await deleteTeamRoster('alpha');
  assert.equal(await readTeamRoster('alpha'), null);
  await deleteTeamRoster('alpha'); // idempotent for an already-empty/tag-only Team
});

test('exact deletion removes a stale uppercase roster file from its Campaign store', async () => {
  const campaign = path.join(temp, 'home_machine');
  await fs.mkdir(campaign, { recursive: true });
  const stale = path.join(campaign, 'RONIN_HELPERS.md');
  await fs.writeFile(stale, 'title = Ronin Helpers\nobjective = stale\n', 'utf8');
  await deleteTeamRoster('RONIN_HELPERS');
  await assert.rejects(fs.lstat(stale), { code: 'ENOENT' });
});
