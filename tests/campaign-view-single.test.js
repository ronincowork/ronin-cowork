import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the Campaign page has one switch for offering New Campaign', async () => {
  const source = await readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8');
  const campaigns = await readFile(new URL('../public/js/campaigns.js', import.meta.url), 'utf8');
  assert.match(campaigns, /export const MULTIPLE_CAMPAIGNS_ENABLED = false;/);
  assert.match(source, /if \(MULTIPLE_CAMPAIGNS_ENABLED\) add\(\{ type: TYPES\.create/);
  assert.match(source, /\.\.\.\(MULTIPLE_CAMPAIGNS_ENABLED \? \[TYPES\.create\] : \[\]\)/);
  for (const type of ['identity', 'profile', 'installations', 'defaults']) {
    assert.match(source, new RegExp(`add\\(\\{ type: TYPES\\.${type}`));
  }
  assert.doesNotMatch(source, /campaignTemplatesDefinition|SETUP_SURFACE_TYPES\.launchOwn, TYPES\.templates/, 'Templates is absent from Settings');
  assert.match(source, /add\(providerSurfaceDefinition\(\)\)/);
  assert.match(source, /providers: PROVIDER_SURFACE_TYPE/);
});

test('the home page renders the Campaign as a fixed door', async () => {
  const source = await readFile(new URL('../public/js/campaign-home.js', import.meta.url), 'utf8');
  assert.match(source, /key: 'campaign', route: 'campaign'/);
  assert.doesNotMatch(source, /\bcreateCampaign\b|campaignSelection|campaign_ids|archiveCampaign|New Campaign/);
});

test('the fixed Campaign identity does not render its id', async () => {
  const source = await readFile(new URL('../public/js/campaign-surfaces.js', import.meta.url), 'utf8');
  assert.match(source, /const id = MULTIPLE_CAMPAIGNS_ENABLED/);
  assert.match(source, /if \(id\) id\.control\.value/);
});

test('a Campaign surface placed after the Campaign read is settled at creation, not left loading', async () => {
  const source = await readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8');
  assert.match(source, /campaignRead = true;\s*\n\s*for \(const surface of campaignSurfaces\) surface\.settle\(\);/);
  assert.match(source, /campaignSurfaces\.add\(coordinated\);[\s\S]*?if \(campaignRead\) coordinated\.settle\(\);/);
});

test('the Campaign page clears the loading state it set before it paints a surface', async () => {
  // The Ronin Desk surface's show() is a tab select that never touches surface state; the
  // wrapper that said "Loading Campaign…" is the one that must take it back.
  const source = await readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8');
  assert.match(source, /paint: \(\.\.\.args\) => \{ WorkspaceKit\.primitives\.setSurfaceState\(surface\.el, null, ''\); return surface\.show\?\.\(\.\.\.args\); \}/);
});

test('Settings carries Setup capabilities and starts with Mika beside an empty workspace', async () => {
  const source = await readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8');
  for (const type of ['register', 'launchOwn']) {
    assert.match(source, new RegExp(`SETUP_SURFACE_TYPES\\.${type}`));
  }
  assert.doesNotMatch(source, /SETUP_SURFACE_TYPES\.(?:services|gbrain|installations)/, 'Campaign uses its own Installations surface');
  assert.match(source, /createMikaHelpPanel/);
  assert.doesNotMatch(source, /campaign-mika-card/, 'Mika is not highlighted independently of workspace placement');
  assert.match(source, /selectorCurrent: 'placed'/, 'Settings highlights every card represented in a visible workspace');
  assert.match(source, /profiles\.define\(PROFILE, \[\s*TERMINAL_TYPE,\s*TYPES\.identity/, 'Mika is the first Settings selector card');
  assert.match(source, /bench\.setCount\(2\)/);
  assert.match(source, /ensureAndPlaceMika\('workspace1'\)/);
  assert.match(source, /bench\.restoreDefault\('workspace2'\)/);
  assert.doesNotMatch(source, /const DEFAULT_VIEW/);
});

test('Campaign delegates Workspace folders assembly with scope and no future-root arrangement default', async () => {
  const [campaign, shared] = await Promise.all([
    readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/workspace-folders-surface.js', import.meta.url), 'utf8'),
  ]);
  assert.match(campaign, /campaignId: \(\) => e\.selected\(\)\?\.id \|\| ''/);
  assert.match(campaign, /connected: \(host\) => e\.entered\(\) && host\.isConnected/);
  assert.match(campaign, /presentation: 'stones'/);
  assert.match(campaign, /environment: e,[\s\S]*workspace,/);
  assert.doesNotMatch(campaign, /worktreesDefault/);
  assert.doesNotMatch(shared, /new_project|family: 'desks'/);
});
