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
  assert.match(campaign, /campaignJira: \(\{ workspace \}\) => enterable\(createJiraPanel\(selected, \{/);
  assert.match(campaign, /\[TYPES\.jira, t\('jira\.title', 'Jira'\)\]/);
  // Only the bridge's own routes: GET, PUT, DELETE, check, sync, sync one.
  assert.deepEqual([...new Set(panel.match(/api\([^)]*\)/g))].sort(), ['api()', 'api(tail)'].sort());
  assert.match(panel, /`\/api\/jira\/\$\{encodeURIComponent\(campaign\(\)\)\}\$\{tail\}`/);
  for (const method of ['PUT', 'DELETE', 'POST']) assert.match(panel, new RegExp(`method: '${method}'`));
  // Besides its own routes, only the existing work-items list for the Desk.
  assert.doesNotMatch(panel, /fetch\(|\/api\/(?!jira|work-items\?campaign=)/);
  assert.match(panel, /result\.status === 404 \? \{ off: true \}/);
  assert.match(panel, /Services › Jira is off/);
  // The two fields a new user gets wrong: the site's address and the space's code.
  assert.match(panel, /t\('jira\.site_help', 'The address you open Jira at, up to \.atlassian\.net/);
  assert.match(panel, /t\('jira\.space_help', 'The space’s short code, not its name/);
  assert.match(panel, /const WALKTHROUGH = \(\) => \[\s*t\('jira\.step_site', 'In Jira, open the space you want Ronin on/);
  // The token goes out on PUT and is never read back into a field.
  assert.match(panel, /input\('password'\)/);
  assert.doesNotMatch(panel, /snap\.token(?!Expiry)|token\.value = /);
  // The kit and ERABI, no second selector.
  assert.match(panel, /createStep\(/);
  assert.match(panel, /createField\(/);
  // Always shown, one ask() per switch with its caption under it; before Connect a draft that rides the Connect PUT.
  assert.match(panel, /ask\(\[\{ fields: \[field\] \}\]/);
  assert.match(panel, /value: \{ \[field\.key\]: connected \? snap\[field\.key\] : draft\[field\.key\] \}/);
  assert.match(panel, /if \(!connected\) \{ draft\[field\.key\] = answer;/);
  // Ronin's items is a pick of three: off, under an epic, all; it starts off.
  assert.match(panel, /\{ v: 'off'[^}]*\},\s*\{ v: 'epics'[^}]*\},\s*\{ v: 'all'/);
  assert.match(panel, /const draft = \{ polling: true, assigned: false, ronin: 'off' \}/);
  // A head row folds its group in both hosts, remembered per epic.
  assert.match(panel, /const FOLDED = new Set\(\);/);
  assert.match(panel, /expiry: expiry\.value, \.\.\.draft \}/);
  assert.doesNotMatch(panel, /if \(connected\) \{\s*const both/);
  assert.match(panel, /t\('jira\.assigned_text', 'Up, Ronin → Jira/);
  assert.match(panel, /t\('jira\.ronin_text', 'Up, Ronin → Jira/);
  assert.doesNotMatch(panel, /'take'/);
  assert.match(panel, /put\(\{ \[field\.key\]: answer \}\)/);
  // Busy at once where the owner pressed, the outcome on the same line, and both hosts repaint.
  assert.match(panel, /async function run\(key, action, busy, doing, call, done\)/);
  assert.match(panel, /t\('jira\.connecting_text', 'Checking the account, then sending \{n\} items, then the first read\.', \{ n: toGo\(draft\) \}\)/);
  // Per pair: one status (Jira's own name), the last write in and out.
  assert.match(panel, /el\('td', null, pair\.status\), holders,/);
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
  for (const key of ['how_master', 'how_sync', 'polling_text', 'assigned_text', 'ronin_text']) assert.match(panel, new RegExp(`t\\('jira\\.${key}'`), key);
  // Work items by level: one table renderer in two hosts, in itemStones' order, epics heading groups.
  assert.match(panel, /export function renderJiraItems\(items, conn\)/);
  assert.match(panel, /const stones = itemStones\(items\)/);
  assert.match(panel, /host\.replaceChildren\(renderJiraItems\(items, snap\.connected \? snap : \{ site: snap\.site, \.\.\.draft \}\)\)/);
  assert.match(panel, /host\.append\(renderJiraItems\(listed\.ok \? listed\.data\.items : \[\], conn\.ok \? conn\.data : \{\}\)\)/);
  assert.doesNotMatch(panel, /createPhalanx/);
  // The Jira column: the key, goes up, or stays in Ronin under the choice; counted above the table.
  assert.match(panel, /goesUp\(item, byId, conn\) \? t\('jira\.goes_up', 'goes up'\) : t\('jira\.stays', 'stays in Ronin'\)/);
  assert.match(panel, /t\('jira\.items_counts', '\{on\} on Jira · \{go\} to go · \{stay\} stay in Ronin'/);
});

test('every Jira panel word is in the lexicon', async () => {
  const lexicon = await read('ronin_catalogs/lexicons/professional_en.md');
  const sources = (await Promise.all(['public/js/jira-panel.js', 'public/js/workbench-catalog.js', 'public/js/campaign-view.js'].map(read))).join('\n');
  const keys = new Set([...sources.matchAll(/t\('(jira\.[a-z_]+)'/g)].map((m) => m[1]));
  assert.ok(keys.size > 40);
  for (const key of keys) assert.match(lexicon, new RegExp(`- \\*\\*${key.replace('.', '\\.')}:\\*\\* `), key);
});
