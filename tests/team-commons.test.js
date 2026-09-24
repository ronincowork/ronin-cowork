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

test('Task Manager is offered only when available as a standalone surface', async () => {
  const [view, catalog] = await Promise.all([
    source('public/js/cowork-view.js'), source('public/js/workbench-catalog.js'),
  ]);
  assert.match(catalog, /kanban: 'team\.kanban'/);
  assert.match(catalog, /type: WORKBENCH_TYPES\.kanban, header: 'surface'[\s\S]*e\.kanbanOffers\(\)/);
  assert.match(catalog, /WORKBENCH_PROFILES\.team, \[WORKBENCH_TYPES\.commons, WORKBENCH_TYPES\.kanban,/);
  assert.match(view, /request\('\/api\/installed'/);
  assert.match(view, /kanbanOffers: \(\) => kanbanGate\.available \? \[\{/);
  assert.match(view, /teamKanban: \(id\) => taskManagerFor\(id\)/);
  assert.match(view, /taskManagerBySeat\[cacheKey\] = \{ el: surface\.el, manager, show: \(\) => manager\.enter\(\), leave: \(\) => manager\.leave\(\) \}/);
  assert.doesNotMatch(view, /\{ id: 'kanban', label:/);
  assert.match(view, /for \(const surface of Object\.values\(taskManagerBySeat\)\) surface\.manager\.leave\(\)/);
  assert.match(view, /workspace\.tab_task_manager', 'Task Manager'/);
});

test('People surface shares roster/org selection and density; selection opens adjacent composition while Launch opens the Agent workbench', async () => {
  const [view, members, retirement, css, workbench, coworkRoster, composition, catalog] = await Promise.all([
    source('public/js/cowork-view.js'), source('public/js/team-members.js'), source('public/js/session-retire.js'), source('public/css/team-workspace.css'), source('public/js/workbench.js'), source('public/js/team-roster-surface.js'),
    source('public/js/agent-composition.js'), source('public/js/workbench-catalog.js'),
  ]);
  assert.match(view, /workspace1: 'workspace2', workspace2: 'workspace1', workspace3: 'workspace4', workspace4: 'workspace3'/);
  assert.match(view, /openOwner: \(name\) => arrange\(\{ \[oppositeSeat\(id\)\]: \{ session: name \} \}\)/);
  assert.match(view, /onOpen: \(member\) => openAgentWorkbench\(member\.name\)/);
  assert.match(view, /function openAgentWorkbench\(name\)[\s\S]*reserveWorkspaceTab\(\)[\s\S]*openWorkspaceTab\('agent', name, tab\)/);
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
  assert.match(members, /let reading = 'roster', density = 'compact', selected/);
  assert.match(members, /rosterButton\.el\.addEventListener\('click'[\s\S]*reading = 'roster'[\s\S]*orgButton\.el\.addEventListener\('click'[\s\S]*reading = 'org'/);
  assert.match(members, /options\.onSelect\?\.\(member\)/, 'both readings use the same selection callback');
  assert.match(view, /onSelect: \(member\) => bench\.place\(WB_TYPES\.agentComposition, oppositeSeat\(id\), \{ key: member\.name \}\)/, 'selection drives the adjacent Agent composition surface');
  assert.match(catalog, /agentComposition: AGENT_COMPOSITION_TYPE/);
  assert.match(catalog, /WORKBENCH_PROFILES\.team[^\n]*WORKBENCH_TYPES\.agentComposition/);
  assert.match(composition, /\/api\/sessions\/\$\{encodeURIComponent\(agent\)\}\/composition/);
  assert.match(composition, /Immutable history/);
  assert.match(members, /densityButton\.el\.addEventListener\('click'[\s\S]*density === 'compact' \? 'expanded' : 'compact'/);
  assert.match(members, /detail\.hidden = density !== 'expanded'/);
  assert.match(members, /const leads = members\.filter\(\(member\) => member\.team_lead\), others = members\.filter/);
  assert.match(members, /'Reporting lines are not set, so these Agents remain unplaced\.'/);
  assert.match(members, /'Team lead not assigned'[\s\S]*'Assign lead'[\s\S]*'Add new Agent'/);
  assert.match(members, /import \{ ask \} from '\.\/ask\.js'/);
  assert.match(members, /const pick = ask\(\[\{ fields: \[\{[\s\S]*key: 'lead'[\s\S]*options: choices\.map/);
  assert.match(view, /onAddLead: \(\) => bench\.place\(WB_TYPES\.newAgent, oppositeSeat\(id\), \{[\s\S]*teamLead: true/);
  assert.match(await source('public/js/new-agent.js'), /if \(detail\?\.teamLead === true\) draft\.teamLead = true/);
  assert.match(members, /if \(reading\.description\) detail\.append/);
  assert.match(view, /campaign \? \{ action: \(\) => openAgentWorkbench\(member\.name\) \} : \{\}/, 'Team selector cards keep their default placement action');
  assert.match(view, /createTeamRosterSurface\(\{ onOpen: openAgentWorkbench \}\)/, 'the Cowork Team Roster row opens the standalone Agent workbench');
  assert.match(coworkRoster, /connect: \(name\) => options\.onOpen\?\.\(name\)/);
  assert.doesNotMatch(coworkRoster, /S\.connectSession/, 'the Cowork Team Roster cannot fall back to in-workspace seating');
  assert.match(workbench, /card\.el\.addEventListener\('dragstart',[\s\S]*JSON\.stringify\(\{ type: definition\.type, detail \}\)/, 'drag still carries the terminal surface and Agent resource to a workspace');
  assert.match(css, /\.league-team-member-actions \{[^}]*flex-wrap: wrap;[^}]*justify-content: flex-end;/);
  for (const label of ['Archive', 'Delete', 'Hard Delete']) assert.match(retirement, new RegExp(`'${label}'`));
});
