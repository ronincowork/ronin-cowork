import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { definedTargets, kanbanAvailability, KANBAN_NOT_INSTALLED, moveMessage, waitingOn } from '../public/js/team-kanban.js';

const project = (values = {}) => ({
  id: 'virtual-kanban/7', title: 'Kanban tab', objective: 'Render it.', holder: 'tab_cut',
  stage: 'BUILDING', exit: 'user', status: 'green', ...values,
});
const NOW = new Date('2026-09-13T13:02:00.000Z');
const moduleSource = readFileSync(new URL('../public/js/team-kanban.js', import.meta.url), 'utf8');
const workspaceCss = readFileSync(new URL('../public/css/team-workspace.css', import.meta.url), 'utf8');

test('availability comes from the installed part inventory, never a second flag', () => {
  assert.deepEqual(kanbanAvailability({ services: { capabilities: { desired: { task_manager: true }, running: ['task_manager'] }, loaded: [] } }), { available: true, message: '' });
  assert.deepEqual(kanbanAvailability({ services: { capabilities: { desired: { task_manager: false }, running: ['task_manager'] }, loaded: ['kanban'] } }), { available: false, message: 'Unavailable.' });
  assert.deepEqual(kanbanAvailability({ services: { capabilities: { desired: { task_manager: true }, running: [] }, loaded: ['kanban'] } }), { available: false, message: 'Unavailable.' });
  assert.deepEqual(kanbanAvailability({ services: { loaded: ['kanban'], parked: [] } }), { available: true, message: '' });
  assert.deepEqual(kanbanAvailability({ services: { loaded: [], parked: [{ name: 'kanban', routine: 'ronin_services' }] } }), {
    available: false, message: 'Unavailable.',
  });
  assert.deepEqual(kanbanAvailability({ services: { loaded: [], parked: [] } }), {
    available: false, message: 'Unavailable.',
  });
});

test('a green forward drop tells the holder the defined move without moving data', () => {
  const move = moveMessage(project(), 'LANDING', 'kanban_revive', NOW);
  assert.equal(move.target, 'tab_cut');
  assert.match(move.text, /^from @kanban \(the Team Task Manager, moved by the user at 2026-09-13T13:02Z\):/);
  assert.match(move.text, /MOVE virtual-kanban\/7 "Kanban tab" from Building \(green, exit: user\) to Landing/);
  assert.match(move.text, /meaning: show approved; hand in\./);
  assert.match(move.text, /next: worktree-desk hand-in, then work-record project write 7 --stage LANDING/);
});

test('lead moves resolve to the live lead session and non-green drops remain requests', () => {
  assert.equal(moveMessage(project({ holder: 'lead', stage: 'IDEAS', exit: 'lead' }), 'PLANNING', 'kanban_revive', NOW).target, 'kanban_revive');
  const blocked = moveMessage(project({ status: 'red' }), 'LANDING', 'kanban_revive', NOW);
  assert.equal(blocked.target, 'tab_cut');
  assert.match(blocked.text, /a request to move on, not an approval; the card is blocked/);
});

test('Planning back to Ideas and Landing forward are sent to the lead', () => {
  const returned = moveMessage(project({ stage: 'PLANNING', status: 'yellow' }), 'IDEAS', 'kanban_revive', NOW);
  assert.equal(returned.target, 'kanban_revive');
  assert.match(returned.text, /return it to Ideas/);
  const promoted = moveMessage(project({ stage: 'LANDING', exit: 'lead' }), 'DONE', 'kanban_revive', NOW);
  assert.equal(promoted.target, 'kanban_revive');
  assert.match(promoted.text, /meaning: promote/);
});

test('dragging marks only destinations with a defined meaning', () => {
  assert.deepEqual([...definedTargets({ stage: 'IDEAS', status: 'green' })], ['PLANNING']);
  assert.deepEqual([...definedTargets({ stage: 'PLANNING', status: 'green' })], ['BUILDING', 'IDEAS']);
  assert.deepEqual([...definedTargets({ stage: 'BUILDING', status: 'yellow' })], []);
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
  assert.match(moduleSource, /wk-density-lines/);
});

test('the beta notice is a prominent Workspace Kit header above every board state', () => {
  assert.match(moduleSource, /import \{ createSurfaceHeader \} from '\.\/workspace-primitives\.js'/);
  assert.match(moduleSource, /const beta = createSurfaceHeader\(\{/);
  assert.match(moduleSource, /team_kanban\.beta', 'Beta'/);
  assert.match(moduleSource, /root\.append\(beta\.el, topline, board\)/);
  assert.match(workspaceCss, /\.tk-beta > \.wk-surface-header-title \{ font-size: var\(--text-6\)/);
  assert.doesNotMatch(workspaceCss, /\.tk-beta[^}]*#[0-9a-f]/i, 'the beta header uses house tokens, not an invented color');
});

test('card expansion and owner opening are sibling controls, never nested interactions', () => {
  assert.match(moduleSource, /node\('button', 'tk-card-toggle'\)/);
  assert.doesNotMatch(moduleSource, /card\.setAttribute\('role', 'button'\)|card\.tabIndex/);
  assert.match(moduleSource, /toggle\.setAttribute\('aria-expanded'/);
  assert.match(moduleSource, /if \(!event\.target\.closest\('button'\)\) toggleOpen\(\)/);
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
