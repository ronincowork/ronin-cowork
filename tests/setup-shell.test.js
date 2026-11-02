import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setupDefaultView } from '../public/js/campaigns.js';
import { workspaceHeaderAppearance } from '../public/js/workspace-header.js';

const source = async (path) => readFile(new URL(`../public/${path}`, import.meta.url), 'utf8');

test('Ronin Home routes the Machine door from persisted Campaign Setup answers', () => {
  assert.equal(setupDefaultView(null), 'setup');
  assert.equal(setupDefaultView({ config: { setup: { answers: { provider: 'acted' } } } }), 'setup');
  assert.equal(setupDefaultView({ config: { setup: { answers: {
    provider: 'acted', register: 'not_now', workspace: 'acted', installations: 'not_now', password: 'acted',
  } } } }), 'campaign');
});

test('Ronin Home\u2019s Models and Workspaces doors each open their own workbench in the same tab; Teams opens the Teams workbench at #/cowork (owner, 2026-10-19, 2026-10-20)', async () => {
  const [home, doors, catalog, contract, header, main, cowork] = await Promise.all([
    source('js/campaign-home.js'), source('js/door-workbenches.js'), source('js/workbench-catalog.js'), source('js/workspace-contract.js'), source('js/workspace-header.js'), source('js/main.js'), source('js/cowork-view.js'),
  ]);
  assert.match(home, /Ronin Home/);
  for (const key of ['models', 'workspaces', 'epics']) {
    assert.match(home, new RegExp(`key: '${key}', route: '${key}'`), `the ${key} door navigates to its own destination`);
    assert.match(main, new RegExp(`workspace\\.register\\('${key}', `), `the ${key} destination is registered`);
    assert.match(contract, new RegExp(`'${key}'`), `${key} is a Workbench appearance, so the tab machinery applies`);
  }
  assert.match(home, /ctx\?\.navigate\(route\)/, 'a plain press opens the workbench in this tab');
  // THE GATE (owner, 2026-10-19): as on the old root, the doors are locked until one model
  // provider is activated and Settings is the one live stone, so a new user's way in is Setup.
  // Help is outside the gate: a new user needs it before Setup (owner, 2026-10-21).
  assert.match(home, /const locked = door\.gated !== false && \(!runtimeKnown \|\| activatedCount < 1\);/, 'the doors lock until a provider is activated');
  assert.match(home, /key: 'help'[^\n]*gated: false/, 'Help opens before a provider');
  assert.match(home, /if \(locked\) return;\s*ctx\?\.navigate\(route\)/, 'a locked door does not open');
  assert.match(home, /request\('\/api\/setup\/runtime', \{ cache: 'no-store' \}\)/, 'the gate reads the runtime once on enter');
  assert.match(home, /setup\.provider_gate/, 'a locked door says where the way in is');
  assert.match(home, /campaign_home\.settings', 'Settings'/);
  assert.match(doors, /seat: WORKBENCH_TYPES\.modelStones,/, 'Models seats its own stones of providers');
  assert.match(catalog, /profiles\.define\(WORKBENCH_PROFILES\.models, \[WORKBENCH_TYPES\.modelStones, WORKBENCH_TYPES\.modelRefresh, WORKBENCH_TYPES\.modelDefaults, WORKBENCH_TYPES\.modelProvider\]\)/, 'Model refresh then Defaults follow Models; a provider whole is placeable on Models, by a dragged stone or its card');
  assert.match(doors, /seats: \{ workspace1: WORKBENCH_TYPES\.workspaceRecords, workspace2: FILES_ON \? WORKBENCH_TYPES\.files : WORKBENCH_TYPES\.folderGithub \}/, 'Workspaces seats its Workspaces in Workspace 1 and Explorer in Workspace 2 where Ronin found Python, GitHub CLI otherwise (KAN-146)');
  assert.match(catalog, /profiles\.define\(WORKBENCH_PROFILES\.workspaces, \[WORKBENCH_TYPES\.workspaceRecords, WORKBENCH_TYPES\.workspaceRecord, WORKBENCH_TYPES\.workspaceNew, WORKBENCH_TYPES\.folderGithub, FILES_TYPE\]\)/, 'Workspaces, a Workspace whole, New Workspace, GitHub CLI and Explorer are placeable on Workspaces');
  assert.match(home, /key: 'teams', route: 'cowork'/, 'the Teams door opens the Teams workbench at #/cowork (owner, 2026-10-20)');
  // The crumb (owner, 2026-10-20): RoninCowork • Home • Teams • <Team title>; before, a Team page read
  // 'RoninCowork • Teams' with no Home and no name, and Home's doors hid the Teams step.
  assert.match(header, /home\.hidden = landing/, 'Home stands in the bar everywhere off the landing');
  assert.match(header, /const underTeams = !landing && \(!placed \|\| active\.id === 'team'\)/, 'a Team page sits under Teams; another placed view under Home alone');
  assert.match(cowork, /place: \(\) => campaign \? '' : readableTeam\(team\)/, 'a Team page ends the crumb with the Team title');
});

test('Home: Teams, Epics and Workspaces in a triangle at Home\u2019s stone size; Model Providers, Help and Settings smaller, inset on the right (owner, 2026-11-02; KAN-186, KAN-191, KAN-194)', async () => {
  const [home, style] = await Promise.all([source('js/campaign-home.js'), source('css/campaign-home.css')]);
  assert.doesNotMatch(home, /OFFICE Space|ch-office/, 'no heading over the triangle (KAN-191)');
  assert.match(home, /key: 'epics'[^\n]*glyph: '◇'/, 'Epics carries a plain symbol, no kanji (KAN-191)');
  const office = home.slice(home.indexOf('function OFFICE()'), home.indexOf('function SIDE()'));
  const side = home.slice(home.indexOf('function SIDE()'), home.indexOf('/** THE ROOT TOGGLE'));
  assert.deepEqual([...office.matchAll(/key: '(\w+)'/g)].map((m) => m[1]), ['teams', 'epics', 'workspaces'], 'Teams at the apex, then Epics bottom left and Workspaces bottom right: Who, What, Where (KAN-194)');
  assert.match(side, /key: 'models'[^\n]*'Model Providers'/, 'the Models stone reads Model Providers (KAN-194)');
  assert.deepEqual([...side.matchAll(/key: '(\w+)'/g)].map((m) => m[1]), ['models', 'help', 'settings'], 'the smaller stones, top to bottom');
  assert.match(office, /Who does the work[\s\S]*What the work is[\s\S]*Where the work is/);
  assert.match(side, /key: 'settings', route: null[^\n]*gated: false/, 'Settings is a live stone whose route is read at paint');
  assert.match(home, /const route = door\.route \|\| setupDefaultView\(setupCampaign\)/, 'Settings opens Setup until its answers are recorded');
  assert.doesNotMatch(home, /ch-settings/, 'the corner Settings button is now a stone');
  assert.match(style, /\.ch-doors > \.ch-door\[data-door='teams'\] \{ grid-column: 1 \/ -1;/, 'Teams spans the apex');
  assert.match(style, /--ch-door-w: 208px;/, 'the main stones keep Home\u2019s size from before the triangle');
  assert.match(style, /\.ch-doors \{[^}]*grid-template-columns: repeat\(2, var\(--ch-door-w\)\);[^}]*gap: var\(--ch-office-gap\);/, 'one even gap across and down');
  assert.match(style, /\.ch-side \{[^}]*margin-inline-end: var\(--ch-side-inset\);/, 'the side stones are inset from the page edge');
  assert.match(style, /\.ch-is \{[^}]*font-size: var\(--text-heading\);/, 'the who, what, where line reads at a glance (KAN-194)');
  assert.match(style, /\.ch-door\[data-door='epics'\] \.ch-glyph \{ font-size: var\(--ch-glyph-epics\);/, '◇ is drawn at ⌂\u2019s visual size, not the glyph size (KAN-192)');
  assert.match(style, /\.ch-side \{[^}]*grid-column: 3;[^}]*flex-direction: column;/, 'the side stones stand in a column on the right');
});

test('the Epics workbench: a stone per Epic in Tilespace 1, opened by Home\u2019s Epics stone (owner, 2026-11-02; KAN-187)', async () => {
  const [doors, catalog, surface, main] = await Promise.all([source('js/door-workbenches.js'), source('js/workbench-catalog.js'), source('js/epics-surface.js'), source('js/main.js')]);
  assert.match(main, /workspace\.register\('epics', createEpicsView\(\)\)/);
  assert.match(doors, /id: 'epics', profile: WORKBENCH_PROFILES\.epics,[^\n]*seat: WORKBENCH_TYPES\.epicRecords,/, 'Epics seats its stones in Tilespace 1');
  assert.match(catalog, /profiles\.define\(WORKBENCH_PROFILES\.epics, \[WORKBENCH_TYPES\.epicRecords, WORKBENCH_TYPES\.epicRecord\]\)/);
  assert.match(catalog, /type: WORKBENCH_TYPES\.epicRecord, header: 'surface', discover: \(\) => \[\]/, 'an Epic whole is placed by a dragged stone, never a selector card');
  assert.match(surface, /filter\(\(item\) => item\.level === 1\)/, 'Epics are the level-1 work items');
  assert.match(surface, /createPhalanx\(/, 'the stones are the kit phalanx');
  assert.match(surface, /renderItemDetail\(host, epic/, 'a pressed stone reads the item as Work Items does');
  assert.match(surface, /hear\('epics',/, 'the Epics are the store\u2019s pushed epics (KAN-190), over the Campaign');
});

test('two roots: the default Home and the current Home at #/current, one bar toggle between them (owner, 2026-10-19)', async () => {
  const [home, current, main, header, style] = await Promise.all([
    source('js/campaign-home.js'), source('js/current-home.js'), source('js/main.js'), source('js/workspace-header.js'), source('css/campaign-home.css'),
  ]);
  assert.match(main, /workspace\.register\('home', createCampaignHome\(\)\)/, 'the default root is the three-door page');
  assert.match(main, /workspace\.register\('current', createCurrentHome\(\)\)/, 'the current root keeps its own address');
  for (const key of ['desk', 'team', 'agent']) assert.match(current, new RegExp(`key: '${key}', route: '`), `the current root keeps its ${key} door`);
  assert.match(current, /api\/setup\/runtime/, 'the current root keeps its provider gate as it was');
  assert.match(home, /createRootToggle\(\{ route: 'current', label: \(\) => t\('campaign_home\.current', 'Current'\)/, 'the new Home reads Current');
  assert.match(current, /createRootToggle\(\{ route: 'home', label: \(\) => t\('campaign_home\.next', 'Next'\)/, 'the current Home reads Next');
  for (const page of [home, current]) assert.match(page, /header: \{ leading: \[rootToggle\], actions: \[themeToggle\] \}/, 'the toggle sits in the same bar spot on each');
  assert.match(header, /active\.id === 'home' \|\| active\.id === 'current'/, 'both roots are landings to the bar');
  for (const key of ['desk', 'team', 'agent']) assert.match(style, new RegExp(`\\.ch-door\\[data-door='${key}'\\]`), `the ${key} door keeps its tone`);
});

test('Ronin Home and Setup share the same persisted light and dark control', async () => {
  const [home, setup, toggle, workspace, ram, services, contract] = await Promise.all([
    source('js/campaign-home.js'), source('js/setup-view.js'), source('js/theme-toggle.js'),
    source('js/workspace.js'), source('js/ramrpm.js'), source('js/services-activation.js'), source('js/workspace-contract.js'),
  ]);
  assert.match(home, /const themeToggle = createThemeToggle\(\)/);
  assert.match(home, /header: \{ leading: \[rootToggle\], actions: \[themeToggle\] \}/);
  assert.doesNotMatch(home, /ronin-home-active/);
  assert.match(setup, /const themeToggle = createThemeToggle\(\)/);
  assert.match(setup, /workbenchView\('setup'/);
  assert.match(setup, /ram: false/);
  assert.match(setup, /feedback: false/);
  assert.match(setup, /leading: \[setupStepsHeader\]/);
  assert.match(setup, /actions: \[themeToggle\]/);
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
  assert.equal(workspaceHeaderAppearance({ id: 'setup', view: { appearance: 'setup' } }), 'setup');
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
  assert.match(kit, /data-workbench-profile='setup'\] \.wk-workbench-column \{ height: calc\(100dvh - var\(--row-head\) - var\(--space-inset\)\); min-height: 0; \}/);
  assert.match(kit, /\.wk-surface-content:has\(\.sws\) \{ display: flex; flex-direction: column; overflow: hidden; \}/);
  assert.match(kit, /\.wk-surface-content:has\(\.sws\) > :has\(> \.sws\) \{ flex: 1 1 auto; min-height: 0; \}/);
  assert.doesNotMatch(kit, /data-workbench-profile='setup'\] \.wk-workbench-column \{ height: auto; \}/);
  assert.doesNotMatch(kit, /data-surface='workspace1'\] \.sp-surface \{ height:/);
});

test('launch actions reuse the nin mark, never the Team Roster torii, and open tabs', async () => {
  const [primitives, kit, workspace, agent, team] = await Promise.all([
    source('js/workspace-primitives.js'), source('workspace-kit.css'),
    source('js/workspace.js'), source('js/new-agent.js'), source('js/new-team-form.js'),
  ]);
  assert.match(primitives, /el\.append\(ninMark\('wk-launch-mark'\)/);
  assert.match(kit, /\.wk-action\[data-launch='true'\] \{ border-color: var\(--kaki\); background: var\(--surface\);/);
  assert.match(workspace, /window\.open\(url\.href, '_blank', 'noopener'\)/);
  for (const caller of [agent, team]) {
    assert.match(caller, /launch: true/);
    assert.match(caller, /openLaunchHandoff|openWorkbenchTab/);
  }
});

test('a newly raised Team opens its Team page before Agent birth and clears the inherited tab name', async () => {
  const [form, handoff] = await Promise.all([source('js/new-team-form.js'), source('js/launch-handoff.js')]);
  assert.match(form, /openLaunchHandoff\(\{ team: name, sessions: picks \}, launchTab\);[\s\S]*await launchTeamAgents\(request, name, picks\)/);
  assert.match(handoff, /destination: 'team'[\s\S]*mode: 'replace'[\s\S]*tabName: ''/);
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

test('Cowork cards always expose their reading while the base controls compact presentation', async () => {
  const [view, workbench, css] = await Promise.all([
    readFile(new URL('../public/js/cowork-view.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/workbench.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/workspace-kit.css', import.meta.url), 'utf8'),
  ]);
  assert.match(view, /mark: member\.team_lead \? '人' : null,[\s\S]*summary: reading\.step, metadata: reading\.lines/);
  assert.doesNotMatch(view, /thinSelectorCards|selector-card-thin|onSelectorDensityChange/);
  assert.match(workbench, /densityToggle\.el\.addEventListener\('click'/);
  assert.match(css, /\.wk-workbench-host\[data-selector-density='thin'\] \.wk-workbench-selector-cards > \.wk-card \.wk-card-summary/);
});

test('the base Workbench owns selector density for every profile', async () => {
  const [workbench, contract, kitCss] = await Promise.all([
    source('js/workbench.js'), source('js/workspace-contract.js'), source('workspace-kit.css'),
  ]);
  assert.match(contract, /workbenchView\(appearance, options = \{\}\)/);
  assert.match(workbench, /headers: \{ selector: \{ label: '', actions: \[densityToggle, \.\.\.\(options\.actions \|\| \[\]\)\] \} \}/);
  assert.match(workbench, /snapshot = \(\) => \(\{ count, selected, selectorDensity,/);
  assert.match(kitCss, /\.wk-workbench-host\[data-selector-density='thin'\]/);
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

test('Setup progression paints the server record and leaves completion actions in each surface footer', async () => {
  const [setup, style] = await Promise.all([source('js/setup-view.js'), source('style.css')]);
  assert.match(setup, /request\('\/api\/setup\/progress', \{ cache: 'no-store' \}\)/);
  assert.match(setup, /setupProgressHandlers\.add\(onProgress\)/);
  assert.doesNotMatch(setup, /nextAction|notNowAction|seatNext|seatNotNow/, 'the surface header owns no hidden progression controls');
  assert.match(setup, /garden\.controls\.replaceChildren\(\);[\s\S]*garden\.controls\.hidden = true/, 'Workspace 1 cannot retain the progression action');
  assert.doesNotMatch(setup, /saveCampaign|setupAnswers|providers\/measure/, 'the client neither writes Campaign answers nor researches the machine');
  assert.match(style, /\.setup-zone \{/, 'Setup answers in the header zone, not a per-step footer');
  assert.doesNotMatch(style, /\.setup-step-footer \{/, 'the per-step footer is retired');
  assert.match(style, /\.setup-scan\[data-state='scanning'\]/);
  assert.doesNotMatch(setup, /data\.stepState|flashSelector|setup-selector-pulse/);
  assert.match(style, /data-workbench-profile='setup'[\s\S]*?\.wk-card\[aria-current='page'\][^}]*background: var\(--kaki\)/, 'only the selected card gets the orange fill');
  assert.match(setup, /mark\.className = 'wk-card-mark';[\s\S]*mark\.textContent = '✓';[\s\S]*heading\.prepend\(mark\)/, 'completion uses the stock visible card mark');
  assert.doesNotMatch(style, /data-complete='true'[^\n]*::before/, 'completion is not a fragile pseudo-element');
});

test('the Setup workbench registers real surfaces and maps each scene to workspace 2', async () => {
  const [setup, main, cowork, catalog] = await Promise.all([
    source('js/setup-view.js'), source('js/main.js'), source('js/cowork-view.js'), source('js/workbench-catalog.js'),
  ]);
  assert.match(setup, /registerSetupSurfaces\(\);[\s\S]*registerPresetsSurface\(\);/);
  assert.match(setup, /const scene = sceneAt\(number\)/);
  assert.match(setup, /bench\.place\(scene\.type, 'workspace2'\)/);
  assert.match(setup, /selectorWorkspace: 'workspace2'/);
  assert.match(setup, /selectorCurrent: true/);
  assert.doesNotMatch(setup, /arrangement\.move\('selector', 0\)/);
  assert.match(setup, /order: Object\.freeze\(\['workspace1', 'selector', 'workspace2'\]\)/);
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
  assert.match(cowork, /registerWorkbenchCatalog\(\)/);
  assert.doesNotMatch(cowork, /registerPresetsSurface|profiles\.define/, 'Cowork owns no private Presets registration or profile');
  assert.match(catalog, /profiles\.define\(WORKBENCH_PROFILES\.cowork, \[[^\]]*PRESETS_TYPE/, 'the canonical Cowork profile exposes Presets');
});

test('Setup is the one public destination and has no parallel preview route', async () => {
  const [setup, kit, html, main] = await Promise.all([
    source('js/setup-view.js'), source('workspace-kit.css'), source('index.html'), source('js/main.js'),
  ]);
  assert.match(setup, /const PROFILE = 'setup'/);
  assert.match(setup, /patchViewState\('setup'/);
  assert.match(setup, /context\.workbenchEntry\(\{\s*count: 2, selected: 'workspace1', arrangement: ARRANGEMENT,\s*seats: \{ workspace1: GARDEN_CANVAS_TYPE, workspace2: SCENES\[0\]\.type \}/,
    'Setup declares its complete first-open shape and seats for a new tab instance');
  assert.doesNotMatch(kit, /data-setup-viewport|setup-header-toggle/);
  assert.match(main, /workspace\.register\('setup', createSetupView\(\)\)/);
  assert.doesNotMatch(main, /setup2|createSetup2View/);
  assert.match(html, /js\/setup-view\.js/);
  assert.doesNotMatch(html, /js\/setup2-view\.js/);
});
