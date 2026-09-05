import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setupDefaultView } from '../public/js/campaign-home.js';
import { workspaceHeaderScope } from '../public/js/workspace-header.js';

const source = async (path) => readFile(new URL(`../public/${path}`, import.meta.url), 'utf8');

test('Ronin Home defaults Machine Settings from the activated-provider threshold', () => {
  assert.equal(setupDefaultView(0), 'setup');
  assert.equal(setupDefaultView(1), 'setup');
  assert.equal(setupDefaultView(2), 'campaign');
  assert.equal(setupDefaultView(7), 'campaign');
});

test('Ronin Home names the place and gates Teams and New Project on runtime readiness', async () => {
  const home = await source('js/campaign-home.js');
  assert.match(home, /Ronin Home/);
  assert.match(home, /request\('\/api\/setup\/runtime'/);
  assert.match(home, /activatedCount < 1/);
  assert.match(home, /aria-disabled/);
  assert.match(home, /Activate one model provider in Machine Settings/);
});

test('Setup and Settings share the machine-settings island without a right header editor', async () => {
  const [html, header, main] = await Promise.all([
    source('index.html'), source('js/workspace-header.js'), source('js/main.js'),
  ]);
  assert.equal(workspaceHeaderScope({ id: 'setup' }), 'campaign');
  assert.doesNotMatch(html, /id="viewname"/);
  assert.match(main, /nameSlot: document\.getElementById\('viewplace'\)/);
  assert.match(header, /workspace\.navigate\(setup \? 'campaign' : 'setup'\)/);
  assert.match(header, /Ronin Setup/);
  assert.match(header, /Ronin Settings/);
});

test('launch actions reuse the nin mark, never the Team Roster torii, and open tabs', async () => {
  const [primitives, kit, roster, workspace, agent, team, add] = await Promise.all([
    source('js/workspace-primitives.js'), source('workspace-kit.css'), source('js/team-roster-surface.js'),
    source('js/workspace.js'), source('js/new-agent.js'), source('js/new-team-form.js'),
    source('js/add-agent.js'),
  ]);
  assert.match(primitives, /brand\/nin-mark\.svg/);
  assert.match(kit, /\.wk-action\[data-launch='true'\] \{ border-color: var\(--kaki\); background: var\(--raise\);/);
  assert.match(roster, /launch: true/);
  assert.doesNotMatch(roster, /'torii', '⛩'/);
  assert.match(workspace, /window\.open\(url\.href, '_blank', 'noopener'\)/);
  for (const caller of [agent, team, add]) {
    assert.match(caller, /launch: true/);
    assert.match(caller, /openWorkspaceTab/);
  }
});

test('edited Cowork and Team workbench labels become the exact tab title', async () => {
  const cowork = await source('js/cowork-view.js');
  assert.match(cowork, /return name \? \{ bare: name \} : fallback/);
  assert.match(cowork, /patchViewState\(viewKey, \{ tabName:/);
});

test('the existing workbench can pin a Setup workspace and aim selector cards at the selected work surface', async () => {
  const workbench = await source('js/workbench.js');
  assert.match(workbench, /fixedWorkspaces\[id\].*fixedWorkspaces\[id\] !== type/);
  assert.match(workbench, /options\.selectorWorkspace \|\| selected/);
  assert.match(workbench, /options\.selectorFilter/);
  assert.match(workbench, /options\.selectorCurrent/);
});

test('the fourth Setup workbench registers real lane surfaces in ruled order', async () => {
  const [setup, main, cowork] = await Promise.all([
    source('js/setup-view.js'), source('js/main.js'), source('js/cowork-view.js'),
  ]);
  assert.match(setup, /registerSetupSurfaces\(\);[\s\S]*registerPresetsSurface\(\);/);
  assert.match(setup, /fixedWorkspaces: \{ workspace2: PRESETS_TYPE \}/);
  assert.match(setup, /selectorWorkspace: 'workspace1'/);
  assert.match(setup, /selectorCurrent: true/);
  assert.match(setup, /bench\.arrangement\.move\('selector', 0\)/);
  assert.match(setup, /hideFeedback: true/);
  assert.match(setup, /mountProviderSetupSession/);
  assert.match(setup, /createTerminalTileHost\(\{ mode: 'full' \}\)/);
  assert.match(setup, /environment\.setupRuntime = runtime\.ok \? runtime\.data : \{ providers: \[\] \};[\s\S]*bench\.refreshSelector\(\);[\s\S]*const stored/);
  assert.match(setup, /setSetupRequirementState: \(next\) => \{[\s\S]*environment\.setupRequirementState = requirementState\(next\);[\s\S]*bench\?\.refreshSelector\(\)/);
  assert.match(setup, /setSetupRequirementState: \(next\) => environment\.setSetupRequirementState\(next\)/);
  assert.match(setup, /SETUP_SURFACE_TYPES\.register, SETUP_SURFACE_TYPES\.providers, SETUP_SURFACE_TYPES\.roots/);
  assert.match(setup, /SETUP_SURFACE_TYPES\.services, SETUP_SURFACE_TYPES\.gbrain, SETUP_SURFACE_TYPES\.templates/);
  assert.match(main, /workspace\.register\('setup', createSetupView\(\)\)/);
  assert.match(cowork, /PRESETS_TYPE/);
});
