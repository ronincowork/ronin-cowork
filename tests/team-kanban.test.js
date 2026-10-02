import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { definedTargets, holderOf, kanbanAvailability, KANBAN_NOT_INSTALLED, moveMessage, projectsForScope, taskManagerScope, waitingOn } from '../public/js/team-kanban.js';

// An item as the team reading serves it: the holder is the list it was found on.
const project = (values = {}) => ({
  id: 'w7', title: 'Kanban tab', objective: 'Render it.', holder: 'agent:tab_cut', team: 'virtual',
  stage: 'REVIEW', exit: 'user', status: 'green', trail: [], ...values,
});
const NOW = new Date('2026-09-13T13:02:00.000Z');
const moduleSource = readFileSync(new URL('../public/js/team-kanban.js', import.meta.url), 'utf8');
const workspaceCss = readFileSync(new URL('../public/css/team-workspace.css', import.meta.url), 'utf8');

test('availability is the Task Manager capability, desired and running', () => {
  assert.deepEqual(kanbanAvailability({ services: { capabilities: { desired: { task_manager: true }, running: ['task_manager'] } } }), { available: true, message: '' });
  assert.deepEqual(kanbanAvailability({ services: { capabilities: { desired: { task_manager: false }, running: ['task_manager'] } } }), { available: false, message: 'Unavailable.' });
  assert.deepEqual(kanbanAvailability({ services: { capabilities: { desired: { task_manager: true }, running: [] } } }), { available: false, message: 'Unavailable.' });
  assert.deepEqual(kanbanAvailability({}), { available: false, message: 'Unavailable.' });
});

test('the holder is read off the list the item was found on', () => {
  assert.equal(holderOf(project(), 'lead_one'), 'tab_cut');
  assert.equal(holderOf(project({ holder: 'team:virtual' }), 'lead_one'), 'lead_one', 'a Team-held item is worked by its lead');
  assert.equal(holderOf(project({ holder: '' }), 'lead_one'), '');
});

test('a green forward drop tells the holder the defined move, naming the verb that makes it', () => {
  const move = moveMessage(project(), 'LAND', 'kanban_revive', NOW);
  assert.equal(move.target, 'tab_cut');
  assert.match(move.text, /^from @kanban \(the Team Task Manager, moved by the user at 2026-09-13T13:02Z\):/);
  assert.match(move.text, /MOVE w7 "Kanban tab" from Review \(green, exit: user\) to Land/);
  assert.match(move.text, /next: worktree-desk hand-in <repo> --project w7/);
  assert.match(moveMessage(project({ stage: 'BUILD' }), 'REVIEW', 'kanban_revive', NOW).text, /next: work-record project advance w7 --to REVIEW/);
  assert.match(moveMessage(project({ stage: 'PLAN' }), 'BUILD', 'kanban_revive', NOW).text, /next: work-record project advance w7 --to BUILD/);
});

test('Team-held and lead moves resolve to the lead; non-green drops remain requests', () => {
  assert.equal(moveMessage(project({ holder: 'team:virtual', stage: 'IDEA', exit: 'lead' }), 'PLAN', 'kanban_revive', NOW).target, 'kanban_revive');
  assert.match(moveMessage(project({ holder: 'team:virtual', stage: 'IDEA' }), 'PLAN', 'kanban_revive', NOW).text, /team project assign w7 <session>/);
  const blocked = moveMessage(project({ status: 'red' }), 'LAND', 'kanban_revive', NOW);
  assert.equal(blocked.target, 'tab_cut');
  assert.match(blocked.text, /a request to move on, not an approval; the card is blocked/);
  const returned = moveMessage(project({ stage: 'PLAN', status: 'yellow' }), 'IDEA', 'kanban_revive', NOW);
  assert.equal(returned.target, 'kanban_revive');
  const promoted = moveMessage(project({ stage: 'LAND', exit: 'lead' }), 'DONE', 'kanban_revive', NOW);
  assert.equal(promoted.target, 'kanban_revive');
  assert.match(promoted.text, /bin\/ronin-promote virtual/);
});

test('dragging marks only destinations with a defined meaning', () => {
  assert.deepEqual([...definedTargets({ stage: 'IDEA', status: 'green' })], ['PLAN']);
  assert.deepEqual([...definedTargets({ stage: 'PLAN', status: 'green' })], ['BUILD', 'IDEA']);
  assert.deepEqual([...definedTargets({ stage: 'BUILD', status: 'green' })], ['REVIEW']);
  assert.deepEqual([...definedTargets({ stage: 'BUILD', status: 'yellow' })], []);
  assert.deepEqual([...definedTargets({ stage: 'DONE', status: 'green' })], []);
});

test('only green lead and user exits get a bare waiting word', () => {
  assert.equal(waitingOn(project({ exit: 'lead' })), 'lead');
  assert.equal(waitingOn(project({ exit: 'user' })), 'user');
  assert.equal(waitingOn(project({ exit: 'agent' })), '');
  assert.equal(waitingOn(project({ status: 'red', exit: 'lead' })), '');
  assert.equal(waitingOn(project({ stage: 'DONE', exit: 'user' })), '');
});

test('the board stays square, fixed, manually refreshed, and free of pills and ellipses', () => {
  const kanbanCss = workspaceCss.slice(workspaceCss.indexOf('.tk-kanban'), workspaceCss.indexOf('/* The tab is drawn'));
  assert.doesNotMatch(kanbanCss, /text-overflow|white-space:\s*nowrap|radius-pill|tk-chip/);
  assert.match(kanbanCss, /--tk-column-min:\s*230px/);
  assert.match(kanbanCss, /--tk-card-closed:\s*64px/);
  assert.match(kanbanCss, /--tk-card-open:\s*168px/);
  assert.doesNotMatch(kanbanCss, /line-clamp|-webkit-box/);
  assert.match(kanbanCss, /max-height:\s*calc\(var\(--tk-outcome-line\) \* 2\)/);
  assert.doesNotMatch(moduleSource, /setInterval|MutationObserver|tk-count|tk-chip/);
  assert.match(moduleSource, /tk-refresh/);
  assert.match(moduleSource, /tw-agent-density-lines/);
});

test('the beta notice sits in a collapsible Task Manager header zone', () => {
  assert.doesNotMatch(moduleSource, /createSurfaceHeader/);
  assert.match(moduleSource, /const header = node\('div', 'tk-header'/);
  assert.match(moduleSource, /const beta = node\('strong', 'tk-beta'/);
  assert.match(moduleSource, /team_kanban\.beta', 'Beta'/);
  assert.match(moduleSource, /team_kanban\.beta_message/);
  assert.match(moduleSource, /headerToggle\.setAttribute\('aria-expanded', String\(expanded\)\)/);
  assert.match(moduleSource, /headerMessage\.hidden = !expanded/);
  assert.match(moduleSource, /root\.append\(header, topline, board\)/);
  assert.match(workspaceCss, /\.tk-header \{[^}]*clamp\(6rem, 15dvh, 9rem\)/);
  assert.doesNotMatch(workspaceCss, /\.tk-beta > \.wk-surface-header-title/);
  assert.doesNotMatch(workspaceCss, /\.tk-beta[^}]*#[0-9a-f]/i, 'the beta header uses house tokens, not an invented color');
});

test('card expansion and owner opening are sibling controls, never nested interactions', () => {
  assert.match(moduleSource, /node\('button', 'tk-card-toggle'\)/);
  assert.doesNotMatch(moduleSource, /card\.setAttribute\('role', 'button'\)|card\.tabIndex/);
  assert.match(moduleSource, /toggle\.setAttribute\('aria-expanded'/);
  assert.match(moduleSource, /toggle\.addEventListener\('click', toggleOpen\)/);
  assert.match(moduleSource, /if \(!event\.target\.closest\('button'\)\) navigate\('project', project\.id\)/);
  assert.match(moduleSource, /team_kanban\.open_project', 'Open Project'/);
});

test('Task Manager scope derives Team lists, keeps the items an Agent holds, and reads evidence off the trail', () => {
  assert.deepEqual(taskManagerScope({ kind: 'desk', teams: () => ['alpha', 'beta', 'alpha'] }), { kind: 'desk', teams: ['alpha', 'beta'], agent: '' });
  const scope = taskManagerScope({ kind: 'agent', agent: 'surface-tasks', teams: ['surface', 'other'] });
  assert.deepEqual(scope, { kind: 'agent', teams: ['surface', 'other'], agent: 'surface-tasks' });
  const rows = projectsForScope([
    project({ id: 'w2', holder: 'agent:surface-tasks', trail: [{ op: 'create', note: 'x' }, { op: 'evidence', note: 'commit abc' }] }),
    project({ id: 'w2', holder: 'agent:surface-tasks' }),
    project({ id: 'w3', holder: 'agent:someone-else' }),
  ], scope);
  assert.deepEqual(rows.map((item) => item.id), ['w2']);
  assert.deepEqual(rows[0].evidence, ['commit abc']);
});

test('status and Project drill-downs are standalone Workbench surface types', () => {
  assert.match(moduleSource, /openSurface\?\.\(nextView, detail\)/);
  assert.match(moduleSource, /view === 'project'/);
  assert.match(moduleSource, /view === 'status'/);
});

test('a failed move request uses house copy rather than the raw response message', () => {
  assert.match(moduleSource, /team_kanban\.send_failed', 'The move request could not be sent\.'/);
  assert.doesNotMatch(moduleSource, /notice\.textContent\s*=\s*result\.message/);
});

test('an unavailable Commons tab contains only the house state', () => {
  assert.match(moduleSource, /topline\.hidden = !availability\.available/);
  assert.match(workspaceCss, /\.tk-topline\[hidden\] \{ display: none; \}/);
  assert.match(moduleSource, /if \(!availability\.available\) \{\s*board\.append\(node\('p', 'tk-unavailable', KANBAN_NOT_INSTALLED\)\);\s*return;/);
  assert.equal(KANBAN_NOT_INSTALLED, 'Unavailable.');
});
