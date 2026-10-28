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
  // Besides its own routes, only the existing work-items list for the Desk.
  assert.doesNotMatch(panel, /fetch\(|\/api\/(?!jira|work-items\?campaign=)/);
  assert.match(panel, /result\.status === 404 \? \{ off: true \}/);
  assert.match(panel, /Services › Jira is off/);
  // The token goes out on PUT and is never read back into a field.
  assert.match(panel, /input\('password'\)/);
  assert.doesNotMatch(panel, /snap\.token(?!Expiry)|\.value = snap/);
  // The kit and ERABI, no second selector.
  assert.match(panel, /createStep\(/);
  assert.match(panel, /createField\(/);
  assert.match(panel, /ask\(\[\{ fields: \[\s*\{ key: 'polling'/);
  // Per pair: status on both sides, the last write in and out (the Bridge doc's panel).
  assert.match(panel, /el\('td', null, pair\.status\), el\('td', null, pair\.jiraStatus \|\| '—'\)/);
  assert.match(panel, /when\(pair\.lastIn\)\), el\('td', null, when\(pair\.lastOut\)\)/);
});

test('the Jira panel folds every section, reads at body size, and says how it runs', async () => {
  const panel = await read('public/js/jira-panel.js');
  const css = await read('public/css/launch-forms.css');
  // Every numbered section is a fold that keeps its state; the one unnumbered fold is Replace token.
  assert.equal(panel.match(/createStep\(/g).length, 2);
  assert.match(panel, /onToggle: \(\) => \{ open\[key\] = !open\[key\]; step\.setCollapsed\(!open\[key\], meta\); \}/);
  for (const key of ['how', 'before', 'connect', 'connection', 'sync', 'items', 'pairs']) assert.match(panel, new RegExp(`section\\((?:\\d|n), '${key}'`), key);
  assert.doesNotMatch(panel, /'li', 'fs-step-help'|el\('p', 'fs-step-help', t\(/, 'instructions are reading text, not captions');
  assert.match(css, /\.jira-read \{[^}]*font-size: var\(--text-body\)/);
  assert.match(css, /\.jira-form > \.fs-step \+ \.fs-step \{ margin-top: var\(--space-paragraph\); \}/);
  for (const key of ['how_master', 'how_up', 'how_down', 'how_sync']) assert.match(panel, new RegExp(`t\\('jira\\.${key}'`), key);
  // Work items by level: roots are items whose parent is not in the Desk, epics first; children nest.
  assert.match(panel, /items\.filter\(\(item\) => !byId\.has\(item\.parent\)\)\.sort\(\(a, b\) => b\.level - a\.level\)/);
  assert.match(panel, /for \(const child of children\(item\.id\)\) row\(child, depth \+ 1\)/);
  assert.match(panel, /t\('jira\.goes_up', 'goes up at sync'\)/);
});

test('every Jira panel word is in the lexicon', async () => {
  const lexicon = await read('ronin_catalogs/lexicons/professional_en.md');
  const sources = (await Promise.all(['public/js/jira-panel.js', 'public/js/workbench-catalog.js', 'public/js/campaign-view.js'].map(read))).join('\n');
  const keys = new Set([...sources.matchAll(/t\('(jira\.[a-z_]+)'/g)].map((m) => m[1]));
  assert.ok(keys.size > 40);
  for (const key of keys) assert.match(lexicon, new RegExp(`- \\*\\*${key.replace('.', '\\.')}:\\*\\* `), key);
});
