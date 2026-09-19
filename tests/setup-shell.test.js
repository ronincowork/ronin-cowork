import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setupDefaultView } from '../public/js/campaign-home.js';
import { workspaceHeaderScope } from '../public/js/workspace-header.js';

const source = async (path) => readFile(new URL(`../public/${path}`, import.meta.url), 'utf8');

test('Ronin Home defaults Machine Settings from the activated-provider threshold', () => {
  assert.equal(setupDefaultView(0), 'setup');
  assert.equal(setupDefaultView(1), 'campaign');
  assert.equal(setupDefaultView(2), 'campaign');
  assert.equal(setupDefaultView(7), 'campaign');
});

test('Ronin Home names the place and gates Teams and New Project on runtime readiness', async () => {
  const home = await source('js/campaign-home.js');
  assert.match(home, /Ronin Home/);
  assert.match(home, /request\('\/api\/setup\/runtime'/);
  assert.match(home, /activatedCount < 1/);
  assert.match(home, /aria-disabled/);
  assert.match(home, /Activate one model provider in Machine Setup/);
});

test('Ronin Home and Setup share the same persisted light and dark control', async () => {
  const [home, setup, toggle, workspace, ram, services, contract] = await Promise.all([
    source('js/campaign-home.js'), source('js/setup-view.js'), source('js/theme-toggle.js'),
    source('js/workspace.js'), source('js/ramrpm.js'), source('js/services-activation.js'), source('js/workspace-contract.js'),
  ]);
  assert.match(home, /const themeToggle = createThemeToggle\(\)/);
  assert.match(home, /header: \{ actions: \[themeToggle\] \}/);
  assert.doesNotMatch(home, /ronin-home-active/);
  assert.match(setup, /const themeToggle = createThemeToggle\(\)/);
  assert.match(setup, /header: \{ actions: \[themeToggle\] \}/);
  assert.match(toggle, /import\('\.\/theme\.js'\)[\s\S]*setTheme\(dark \? 'light' : 'dark'\)/);
  assert.match(toggle, /aria-pressed/);
  assert.match(workspace, /shapeControl\.hidden = next\.header\?\.shape !== true/, 'undeclared pane count stays absent');
  assert.match(workspace, /options\.ramRpm\?\.setVisible\(next\.header\?\.ram === true\)/);
  assert.match(workspace, /options\.servicesStatus\?\.setVisible\(next\.header\?\.services === true\)/);
  assert.match(ram, /return \{ setVisible\(next\) \{ visible = next === true; paint\(\); \} \}/, 'the poller supplies facts while the active view owns visibility');
  assert.match(services, /trigger\.hidden = !showsServicesHeader\(visible, stage, readyDismissed\)/);
  assert.match(contract, /WORKBENCH_HEADER = Object\.freeze\([\s\S]*shape: true,[\s\S]*ram: true,[\s\S]*services: true,[\s\S]*feedback: true/);
});

test('Setup and Settings share the machine-settings island without a right header editor', async () => {
  const [html, header, main, style] = await Promise.all([
    source('index.html'), source('js/workspace-header.js'), source('js/main.js'), source('style.css'),
  ]);
  assert.equal(workspaceHeaderScope({ id: 'setup' }), 'campaign');
  assert.doesNotMatch(html, /id="viewname"/);
  assert.match(main, /nameSlot: document\.getElementById\('viewplace'\)/);
  assert.match(header, /workspace\.navigate\(setup \? 'campaign' : 'setup'\)/);
  assert.match(header, /'Setup'/);
  assert.match(header, /'Settings'/);
  assert.match(style, /#bar > \[hidden\] \{ display: none !important; \}/, 'optional header controls cannot flash before the active view owns them');
});

test('Setup hints start collapsed without inheriting another workbench preference', async () => {
  const [setup, workbench, controls] = await Promise.all([
    source('js/setup-view.js'), source('js/workbench.js'), source('js/terminal-controls.js'),
  ]);
  assert.match(setup, /hintsCollapsed: true/);
  assert.match(setup, /hintsPreferenceScope: 'setup'/);
  assert.match(workbench, /preferenceScope: options\.hintsPreferenceScope \|\| ''/);
  assert.match(controls, /ronin\.hints\.\$\{preferenceScope\}\.\$\{name\}\.collapsed/);
});

test('phone Setup workspaces keep one common viewport height for stone rail scrolling', async () => {
  const kit = await source('workspace-kit.css');
  assert.match(kit, /data-workbench-profile='setup'\] \.wk-workbench-column \{ height: calc\(100dvh - var\(--row-head\) - var\(--space-6\)\); min-height: 0; \}/);
  assert.match(kit, /\.wk-surface-content:has\(\.sws\) \{ display: flex; flex-direction: column; overflow: hidden; \}/);
  assert.match(kit, /\.wk-surface-content:has\(\.sws\) > :has\(> \.sws\) \{ flex: 1 1 auto; min-height: 0; \}/);
  assert.doesNotMatch(kit, /data-workbench-profile='setup'\] \.wk-workbench-column \{ height: auto; \}/);
  assert.doesNotMatch(kit, /data-surface='workspace1'\] \.sp-surface \{ height:/);
});

test('launch actions reuse the nin mark, never the Team Roster torii, and open tabs', async () => {
  const [primitives, kit, roster, workspace, agent, team] = await Promise.all([
    source('js/workspace-primitives.js'), source('workspace-kit.css'), source('js/team-roster-surface.js'),
    source('js/workspace.js'), source('js/new-agent.js'), source('js/new-team-form.js'),
  ]);
  assert.match(primitives, /brand\/nin-mark\.svg/);
  assert.match(kit, /\.wk-action\[data-launch='true'\] \{ border-color: var\(--kaki\); background: var\(--raise\);/);
  assert.match(roster, /launch: true/);
  assert.doesNotMatch(roster, /'torii', '⛩'/);
  assert.match(workspace, /window\.open\(url\.href, '_blank', 'noopener'\)/);
  for (const caller of [agent, team]) {
    assert.match(caller, /launch: true/);
    assert.match(caller, /openWorkspaceTab|openWorkbenchTab/);
  }
});

test('a newly raised Team tab carries a one-shot instruction to drop the opener tab name', async () => {
  const form = await source('js/new-team-form.js');
  assert.match(form, /openWorkbenchTab\(\{ destination: 'team', param: name, mode: 'overlay', state: \{ tabName: '' \} \}, launchTab\)/);
});

test('edited Cowork and Team workbench labels become the exact tab title', async () => {
  const [cowork, kit] = await Promise.all([
    source('js/cowork-view.js'), source('workspace-kit.css'),
  ]);
  assert.match(cowork, /return name \? \{ bare: name \} : fallback/);
  assert.match(cowork, /patchViewState\(viewKey, \{ tabName:/);
  assert.match(cowork, /get: \(\) => ctx\?\.viewState\(viewKey\)\?\.tabName[\s\S]*campaign \? teamsLabel : readableTeam\(team\)/);
  assert.match(kit, /\.ui-bar-place \.wk-tab-name \{[^}]*background: transparent;[^}]*color: inherit;/);
});

test('Cowork Team and Team Agent cards toggle between names-only and the full reading', async () => {
  const [view, css] = await Promise.all([
    readFile(new URL('../public/js/cowork-view.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/css/team-workspace.css', import.meta.url), 'utf8'),
  ]);
  assert.match(view, /\[campaign \? 'teamCardDensity' : 'agentCardDensity'\]: thinSelectorCards \? 'thin' : 'thick'/);
  assert.match(view, /let thinSelectorCards = true;/);
  assert.match(view, /entry\[campaign \? 'teamCardDensity' : 'agentCardDensity'\] !== 'thick'/);
  assert.match(view, /mark: member\.team_lead \? '人' : null,[\s\S]*thinSelectorCards \? \{\} : \{ summary: reading\.step, metadata: reading\.lines \}/,
    'the lead mark remains while names-only mode removes the rest of the reading');
  assert.match(view, /thinSelectorCards \? \{\} : \{ summary: item\.objective \|\| '' \}/);
  assert.match(view, /dataset\.lines = thinSelectorCards \? 'two' : 'one'/);
  assert.match(view, /host\.dataset\.selectorDensity = thinSelectorCards \? 'thin' : 'thick'/);
  assert.match(view, /actions: \[densityToggle\.el, rosterNote, mikaHelp\]/);
  assert.match(css, /\.selector-card-thin\s*\{[^}]*padding:/s);
  assert.match(css, /\.wk-workbench-host\[data-selector-density='thin'\] \.wk-workbench-selector-cards > \.wk-card \.wk-card-summary/);
});

test('Campaign remembers density while Setup stays in the names-only selector', async () => {
  const [campaign, setup] = await Promise.all([
    source('js/campaign-view.js'), source('js/setup-view.js'),
  ]);
  assert.match(campaign, /let thinSelectorCards = true;/);
  assert.match(campaign, /selectorDensity: thinSelectorCards \? 'thin' : 'thick'/);
  assert.match(campaign, /thinSelectorCards = entry\.selectorDensity !== 'thick'/);
  assert.match(campaign, /host\.dataset\.selectorDensity = thinSelectorCards \? 'thin' : 'thick'/);
  assert.match(campaign, /actions: \[densityToggle, mikaHelp\]/);
  assert.match(setup, /bench\.host\.dataset\.selectorDensity = 'thin'/);
});

test('the existing workbench can pin a Setup workspace and aim selector cards at the selected work surface', async () => {
  const workbench = await source('js/workbench.js');
  assert.match(workbench, /fixedWorkspaces\[id\].*fixedWorkspaces\[id\] !== type/);
  assert.match(workbench, /options\.selectorWorkspace \|\| selected/);
  assert.match(workbench, /options\.selectorFilter/);
  assert.match(workbench, /options\.selectorCurrent/);
  assert.match(workbench, /options\.selectorCurrent === 'placed'[\s\S]*locations\(definition\.type, resource\)/,
    'a workbench may mark every selector card represented in its visible workspaces');
  assert.doesNotMatch(workbench, /setupRequirement|is-requirement|requirementFlash/);
  assert.match(workbench, /definition\.groupKey/);
  assert.match(workbench, /INTERACTIVE_DESCENDANT/);
  assert.match(workbench, /event\.target instanceof Element && event\.target\.closest\(INTERACTIVE_DESCENDANT\)/);
  assert.match(workbench, /cell\.addEventListener\('pointerdown',[\s\S]*select\(id\);[\s\S]*}, true\)/);
});

test('Setup progression is selected card, factual checks, and one gated Next in Workspace 2', async () => {
  const [setup, style] = await Promise.all([source('js/setup-view.js'), source('style.css')]);
  assert.match(setup, /createAction\(\{ label: 'Next', launch: true, action: \(\) => advance\(\) \}\)/, 'Next uses the Launch-format action');
  assert.match(setup, /active\.number < SCENES\.length && sceneComplete\(active\)/, 'Next exists only for a complete non-final selected card');
  assert.match(setup, /\[data-workspace="workspace2"\] > \.wk-surface > \.wk-surface-header \.wk-surface-header-actions/, 'Next sits at the top-right of Workspace 2');
  assert.match(setup, /actions\.prepend\(nextAction\.el\)/);
  assert.match(setup, /garden\.controls\.replaceChildren\(\);[\s\S]*garden\.controls\.hidden = true/, 'Workspace 1 cannot retain the progression action');
  assert.match(setup, /SETUP_SURFACE_TYPES\.providers\) return Number\(runtime\?\.activated_count \|\| 0\) > 0/);
  assert.match(setup, /SETUP_SURFACE_TYPES\.register\) return completion\.registered \|\| kinds\.get\(\)\.length > 0/);
  assert.match(setup, /SETUP_SURFACE_TYPES\.roots\) return completion\.github \|\| completion\.roots/);
  assert.match(setup, /SETUP_SURFACE_TYPES\.installations\) return installationsComplete/);
  assert.match(setup, /SETUP_SURFACE_TYPES\.launchOwn\) return launchComplete/);
  assert.doesNotMatch(setup, /data\.stepState|flashSelector|setup-selector-pulse/);
  assert.match(style, /data-workbench-profile='setup'[\s\S]*?\.wk-card\[aria-current='page'\][^}]*background: var\(--kaki\)/, 'only the selected card gets the orange fill');
  assert.match(setup, /mark\.className = 'wk-card-mark';[\s\S]*mark\.textContent = '✓';[\s\S]*heading\.prepend\(mark\)/, 'completion uses the stock visible card mark');
  assert.doesNotMatch(style, /data-complete='true'[^\n]*::before/, 'completion is not a fragile pseudo-element');
});

test('the Setup workbench registers real surfaces and maps each scene to workspace 2', async () => {
  const [setup, main, cowork] = await Promise.all([
    source('js/setup-view.js'), source('js/main.js'), source('js/cowork-view.js'),
  ]);
  assert.match(setup, /registerSetupSurfaces\(\);[\s\S]*registerPresetsSurface\(\);/);
  assert.match(setup, /const scene = sceneAt\(number\)/);
  assert.match(setup, /bench\.place\(scene\.type, 'workspace2'\)/);
  assert.match(setup, /selectorWorkspace: 'workspace2'/);
  assert.match(setup, /selectorCurrent: true/);
  assert.doesNotMatch(setup, /arrangement\.move\('selector', 0\)/);
  assert.match(setup, /order: Object\.freeze\(\['workspace1', 'selector', 'workspace2'\]\)/);
  assert.match(setup, /header: \{ actions: \[themeToggle\] \}/);
  assert.match(setup, /header: \{ actions: \[themeToggle\] \}/);
  // Provider sign-in reuses the existing tile host; Setup itself starts no helper Agent.
  assert.match(setup, /mountProviderSetupSession: providerSessions\.mountProviderSetupSession/);
  assert.doesNotMatch(setup, /createMikaTilePool|createMikaHelpPanel|MIKA_SESSION/);
  assert.match(setup, /request\('\/api\/setup\/runtime', \{ cache: 'no-store' \}\)/);
  assert.doesNotMatch(setup, /SetupRequirement|requirementState|flashCycle/);
  assert.match(setup, /const SCENES = Object\.freeze\(SETUP_SCENES/);
  assert.match(setup, /scene\.type !== 'setup\.bounty'/);
  assert.doesNotMatch(setup, /SETUP_SURFACE_TYPES\.(?:services|gbrain)/);
  assert.doesNotMatch(setup, /SETUP_SURFACE_TYPES\.templates/);
  const providers = await source('js/provider-surface.js');
  assert.match(providers, /context\.environment\.onSetupRuntime\?\.\(runtime\)/,
    'provider measurements report facts to the journey instead of moving Setup furniture themselves');
  assert.match(main, /workspace\.register\('setup', createSetupView\(\)\)/);
  assert.match(cowork, /PRESETS_TYPE/);
});

test('Setup is the one public destination and has no parallel preview route', async () => {
  const [setup, kit, html, main] = await Promise.all([
    source('js/setup-view.js'), source('workspace-kit.css'), source('index.html'), source('js/main.js'),
  ]);
  assert.match(setup, /const PROFILE = 'setup'/);
  assert.match(setup, /patchViewState\('setup'/);
  assert.match(setup, /context\.workbenchEntry\(\)/);
  assert.doesNotMatch(kit, /data-setup-viewport|setup-header-toggle/);
  assert.match(main, /workspace\.register\('setup', createSetupView\(\)\)/);
  assert.doesNotMatch(main, /setup2|createSetup2View/);
  assert.match(html, /js\/setup-view\.js/);
  assert.doesNotMatch(html, /js\/setup2-view\.js/);
});
