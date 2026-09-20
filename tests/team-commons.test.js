import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Commons opens on its separate Roster and keeps Configuration separate', async () => {
  const view = await source('public/js/cowork-view.js');
  assert.match(view, /label: t\('team\.commons', 'Commons'\)/);
  assert.match(view, /tabs: \[\s*\{ id: 'roster'/);
  assert.match(view, /selected: 'roster'/);
  assert.match(view, /\{ id: 'roster'[^}]*panel: service\(roster\) \}[\s\S]*\{ id: 'team-configuration'[^}]*panel: service\(config\) \}/);
  assert.match(view, /commons\.roster\.replaceChildren\(members\)/);
  assert.match(view, /commons\.config\.replaceChildren\(config\)/);
  assert.doesNotMatch(view, /commons\.config\.replaceChildren\(members, config\)/);
});

test('Task Manager is offered only when available and its Commons tab stays present', async () => {
  const view = await source('public/js/cowork-view.js');
  assert.match(view, /kanban: 'team\.kanban'/);
  assert.match(view, /type: WB_TYPES\.kanban[\s\S]*environment\.kanbanOffers\(\)/);
  assert.match(view, /WB_PROFILES\.team, \[WB_TYPES\.commons, WB_TYPES\.kanban,/);
  assert.match(view, /request\('\/api\/installed'/);
  assert.match(view, /kanbanOffers: \(\) => kanbanGate\.available \? \[\{/);
  assert.match(view, /commons\.channels\.setAvailable\('kanban', \{ on: true, title: '' \}\)/);
  assert.doesNotMatch(view, /kanbanTab/, 'no consumer reaches a tab node');
  assert.match(view, /item\.channels\.select\('kanban'\)/);
  assert.match(view, /workspace\.tab_task_manager', 'Task Manager'/);
});

test('Roster expands live readings; its Launch opens the Agent workbench while Close retires', async () => {
  const [view, members, retirement, css, workbench] = await Promise.all([
    source('public/js/cowork-view.js'), source('public/js/team-members.js'), source('public/js/session-retire.js'), source('public/css/team-workspace.css'), source('public/js/workbench.js'),
  ]);
  assert.match(view, /workspace1: 'workspace2', workspace2: 'workspace1', workspace3: 'workspace4', workspace4: 'workspace3'/);
  assert.match(view, /openOwner: \(name\) => arrange\(\{ \[oppositeSeat\(id\)\]: \{ session: name \} \}\)/);
  assert.match(view, /onOpen: \(member\) => openWorkspaceTab\('agent', member\.name\)/);
  assert.match(view, /reading: readingsOf/);
  assert.match(view, /configSignature\(team\) \+ JSON\.stringify\(members\.map\(\(member\) => readingsOf\(member\)\.lines\)\)/);
  // The member rows follow the live readings; the Configuration tab follows the saved record alone,
  // so a five-second status tick never throws away an edit in progress (owner, 2026-09-13).
  assert.match(view, /const record = JSON\.stringify\(roster \|\| null\);/);
  assert.match(view, /if \(!recordMoved\) continue;\s*\n\s*if \(!roster\) \{ renderTeamConfiguration/);
  assert.match(view, /if \(recordMoved \|\| !configNode\) \{/, 'the Coworks page’s copy of the tab keeps the same rule');
  assert.match(view, /onClose: \(member\) => retireSession\(member\.name/);
  assert.match(members, /actions: \[launch, rename, lead, eject, close\]/);
  assert.match(members, /classList\.add\('league-team-member-live'\)/);
  assert.match(members, /'Title · \{title\}'/);
  assert.match(members, /'Agent · \{name\}'/);
  assert.match(members, /'ID · @\{id\}'[\s\S]*id: member\.name/);
  assert.match(members, /league-team-member-disclosure', '⌄'/);
  assert.match(members, /label: t\('league\.launch_agent', 'Launch'\)/);
  assert.match(css, /\.league-team-member-detail\[hidden\] \{ display: none; \}/);
  assert.match(members, /toggle\.setAttribute\('aria-expanded', 'false'\)/);
  assert.match(members, /toggle\.setAttribute\('aria-controls', detail\.id\)/);
  assert.match(members, /toggle\.addEventListener\('click', \(\) => \{[\s\S]*detail\.hidden = !expanded;/);
  assert.match(members, /if \(reading\.description\) detail\.append/);
  assert.match(view, /campaign \? \{ action: \(\) => openWorkspaceTab\('agent', member\.name\) \} : \{\}/, 'Team selector cards keep their default placement action');
  assert.match(workbench, /card\.el\.addEventListener\('dragstart',[\s\S]*JSON\.stringify\(\{ type: definition\.type, detail \}\)/, 'drag still carries the terminal surface and Agent resource to a workspace');
  assert.match(css, /\.league-team-member-actions \{[^}]*flex-wrap: wrap;[^}]*justify-content: flex-end;/);
  for (const label of ['Archive', 'Delete', 'Hard Delete']) assert.match(retirement, new RegExp(`'${label}'`));
});
