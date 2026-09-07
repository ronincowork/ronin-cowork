import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/js/campaign-templates.js', import.meta.url), 'utf8');

test('Setup and Campaign share the one canonical Templates stone consumer', async () => {
  const [setup, campaign] = await Promise.all([
    readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8'),
  ]);
  assert.match(setup, /campaignTemplatesDefinition\(\)/);
  assert.match(campaign, /add\(campaignTemplatesDefinition\(\)\)/);
  assert.match(source, /import \{ createStoneWorkSurface \} from '\.\/stone-work-surface\.js'/);
  assert.match(source, /stoneSurface\.mount\(body, \{ before: \[installedHead\], after: \[libraryRoom\] \}\)/);
});

test('installed templates lead and filters remain one semantic two-axis region', () => {
  const installed = source.indexOf("t('campaign_view.templates_on_system'");
  const library = source.indexOf("t('campaign_view.library'");
  assert.ok(installed > -1 && installed < library);
  assert.match(source, /createActionBar\(\{ label: t\('campaign_view.templates_filter'/);
  assert.match(source, /filterGroup\(t\('campaign_view.shape'/);
  assert.match(source, /filterGroup\(t\('kind'/);
  assert.match(source, /box\.setAttribute\('aria-pressed', String\(key === current\)\)/);
  for (const value of ['all', 'team', 'agent', 'open', 'coding', 'work', 'personal', 'household', 'social', 'school']) {
    assert.match(source, new RegExp(`\\['${value}'|\\['${value}',`), value);
  }
});

test('Library stays action-first, lazy, disclosed, and retains install gates', () => {
  assert.match(source, /libraryRoom\.append\([\s\S]*createActionBar\(\{ actions: \[check\] \}\)\.el,[\s\S]*libraryNotice\.el,[\s\S]*libraryAbout,[\s\S]*libraryGrid/);
  assert.match(source, /const libraryAbout = el\('details'\)/);
  assert.match(source, /el\('summary', null, t\('campaign_view.library_about'/);
  assert.equal((source.match(/request\('\/api\/library',/g) || []).length, 1);
  assert.match(source, /action: async \(\) => \{[\s\S]*request\('\/api\/library', \{ cache: 'no-store' \}\)/);
  assert.match(source, /r\.data\?\.services_off \? 'warning' : 'failed'/);
  assert.match(source, /request\('\/api\/library\/install', \{ method: 'POST'/);
  assert.match(source, /Install, replacing my \{n\}/);
  assert.match(source, /Show everything it holds/);
});

test('installed detail retains removal and bundle-download behavior without consumer geometry', () => {
  assert.match(source, /method: 'DELETE'/);
  assert.match(source, /\/api\/library\/pack\//);
  assert.match(source, /download = `\$\{row\.name\}\.json`/);
  assert.match(source, /add\(teams, 'team'\)/);
  assert.match(source, /add\(agents, 'agent'\)/);
  assert.doesNotMatch(source, /\.sws-(?:rail|grid|detail)/);
  assert.doesNotMatch(source, /style\./);
});
