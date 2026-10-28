import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('the Jira panel is a Settings surface over the bridge routes alone', async () => {
  const panel = await read('public/js/jira-panel.js');
  const catalog = await read('public/js/workbench-catalog.js');
  const campaign = await read('public/js/campaign-view.js');
  assert.match(catalog, /campaignJira: 'campaign\.jira'/);
  assert.match(catalog, /WORKBENCH_TYPES\.document, WORKBENCH_TYPES\.campaignJira,/);
  assert.match(campaign, /campaignJira: \(\) => enterable\(createJiraPanel\(selected\)\)/);
  assert.match(campaign, /\[TYPES\.jira, t\('jira\.title', 'Jira'\)\]/);
  // Only the bridge's own routes: GET, PUT, DELETE, check, sync, sync one.
  assert.deepEqual([...new Set(panel.match(/api\([^)]*\)/g))].sort(), ['api()', "api('/check')", 'api(item ? `/sync/${encodeURIComponent(item)'].sort());
  assert.match(panel, /`\/api\/jira\/\$\{encodeURIComponent\(campaign\(\)\)\}\$\{tail\}`/);
  for (const method of ['PUT', 'DELETE', 'POST']) assert.match(panel, new RegExp(`method: '${method}'`));
  assert.doesNotMatch(panel, /fetch\(|\/api\/(?!jira)/);
  assert.match(panel, /result\.status === 404 \? \{ off: true \}/);
  assert.match(panel, /Services › Jira is off/);
  // The token goes out on PUT and is never read back into a field.
  assert.match(panel, /input\('password'\)/);
  assert.doesNotMatch(panel, /snap\.token(?!Expiry)|\.value = snap/);
  // The kit and ERABI, no second selector.
  assert.match(panel, /createStep\(/);
  assert.match(panel, /createField\(/);
  assert.match(panel, /ask\(\[\{ fields: \[\s*\{ key: 'polling'/);
});

test('every Jira panel word is in the lexicon', async () => {
  const lexicon = await read('ronin_catalogs/lexicons/professional_en.md');
  const sources = (await Promise.all(['public/js/jira-panel.js', 'public/js/workbench-catalog.js', 'public/js/campaign-view.js'].map(read))).join('\n');
  const keys = new Set([...sources.matchAll(/t\('(jira\.[a-z_]+)'/g)].map((m) => m[1]));
  assert.ok(keys.size > 40);
  for (const key of keys) assert.match(lexicon, new RegExp(`- \\*\\*${key.replace('.', '\\.')}:\\*\\* `), key);
});
