import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the Campaign page has one switch for offering New Campaign', async () => {
  const [source, campaigns, catalog, setupSurfaces] = await Promise.all([
    readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/campaigns.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/workbench-catalog.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8'),
  ]);
  assert.match(campaigns, /export const MULTIPLE_CAMPAIGNS_ENABLED = false;/);
  assert.match(catalog, /if \(MULTIPLE_CAMPAIGNS_ENABLED\) campaign\(WORKBENCH_TYPES\.campaignCreate/);
  assert.match(catalog, /\.\.\.\(MULTIPLE_CAMPAIGNS_ENABLED \? \[WORKBENCH_TYPES\.campaignCreate\] : \[\]\)/);
  for (const type of ['Identity', 'Profile', 'Installations', 'Defaults']) {
    assert.match(catalog, new RegExp(`campaign\\(WORKBENCH_TYPES\\.campaign${type}`));
  }
  assert.match(source, /registerWorkbenchCatalog\(\)/);
  assert.doesNotMatch(source, /profiles\.define|library\.register/, 'Settings keeps no private catalog or profile');
  assert.doesNotMatch(catalog, /campaignTemplatesDefinition|SETUP_SURFACE_TYPES\.launchOwn, WORKBENCH_TYPES\.templates/, 'Templates is absent from Settings');
  assert.match(catalog, /registerSetupSurfaces\(\)/);
  assert.match(catalog, /PROVIDER_SURFACE_TYPE/);
  assert.match(setupSurfaces, /providerSurfaceDefinition\(\),/, 'Setup surfaces register the one shared provider definition');
});

test('the home page renders the Campaign as a fixed door', async () => {
  const source = await readFile(new URL('../public/js/campaign-home.js', import.meta.url), 'utf8');
  assert.match(source, /key: 'campaign', route: 'campaign'/);
  assert.doesNotMatch(source, /\bcreateCampaign\b|campaign_ids|archiveCampaign|New Campaign/);
  assert.match(source, /setupDefaultView\(setupCampaign\)/, 'the fixed machine door may choose Setup from persisted progress');
});

test('the fixed Campaign identity does not render its id', async () => {
  const source = await readFile(new URL('../public/js/campaign-surfaces.js', import.meta.url), 'utf8');
  assert.match(source, /const id = MULTIPLE_CAMPAIGNS_ENABLED/);
  assert.match(source, /if \(id\) id\.control\.value/);
});

test('Campaign surfaces paint directly and are repainted when the Campaign record arrives', async () => {
  const source = await readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /progressiveSurface|campaignSurfaces|campaignRead/);
  assert.match(source, /loadCampaigns\(\)\.then[\s\S]*?bench\.place\(type, workspace/);
  assert.doesNotMatch(source, /\/api\/setup\/runtime|\/api\/machine-settings/,
    'Settings entry does not prefetch data for unopened surfaces');
  assert.match(source, /\/api\/project-roots\$\{query\}/, 'selector root count uses the light catalog, not repository detail assembly');
});

test('Settings carries Setup capabilities and first opens with Defaults beside Workspace folders', async () => {
  const [source, catalog] = await Promise.all([
    readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/workbench-catalog.js', import.meta.url), 'utf8'),
  ]);
  for (const type of ['register', 'launchOwn']) {
    assert.match(catalog, new RegExp(`SETUP_SURFACE_TYPES\\.${type}`));
  }
  assert.doesNotMatch(catalog, /SETUP_SURFACE_TYPES\.(?:services|gbrain|installations)/, 'Campaign uses its own Installations surface');
  assert.match(source, /createMikaHelpPanel/);
  assert.doesNotMatch(source, /campaign-mika-card/, 'Mika is not highlighted independently of workspace placement');
  assert.match(source, /selectorCurrent: 'placed'/, 'Settings highlights every card represented in a visible workspace');
  assert.match(catalog, /profiles\.define\(WORKBENCH_PROFILES\.campaign, \[WORKBENCH_TYPES\.terminal, WORKBENCH_TYPES\.campaignMachine/, 'Mika is the first Settings selector card');
  assert.match(source, /workbenchEntry\(\{\s*count: 2, selected: 'workspace1',\s*arrangement: normalizeWorkbenchState\(null, bench\.declaration\)\.arrangement,\s*seats: \{ workspace1: TYPES\.defaults, workspace2: TYPES\.roots \}/);
  assert.doesNotMatch(source, /mikaDefaultV1|bench\.setCount\(2\)|bench\.restoreDefault\('workspace2'\)/,
    'no initializer may overwrite remembered Settings state');
  assert.doesNotMatch(source, /const DEFAULT_VIEW/);
  assert.match(source, /const \{ state: entry \} = context\.workbenchEntry\(\{/,
    'Settings resolves intentional launches before remembered and first-open state');
  assert.doesNotMatch(source, /context\.param === 'defaults'/, 'Settings has no link-specific restoration branch');
});

test('Campaign delegates Workspace folders assembly with scope and no future-root arrangement default', async () => {
  const [campaign, shared] = await Promise.all([
    readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/workspace-folders-surface.js', import.meta.url), 'utf8'),
  ]);
  assert.match(campaign, /campaignId: \(\) => selected\(\)\?\.id \|\| ''/);
  assert.match(campaign, /connected: \(host\) => entered && host\.isConnected/);
  assert.match(campaign, /presentation: 'stones'/);
  assert.match(campaign, /environment,[\s\S]*workspace,/);
  assert.doesNotMatch(campaign, /worktreesDefault/);
  assert.doesNotMatch(shared, /new_project|family: 'desks'/);
});
