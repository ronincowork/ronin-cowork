import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Setup opts into roots stones while Campaign keeps the existing project-root surface', async () => {
  const [setup, campaign] = await Promise.all([
    source('public/js/setup-surfaces.js'),
    source('public/js/campaign-view.js'),
  ]);
  assert.match(setup, /buildProjectRoots\([^;]+\{ presentation: 'stones' \}\)/);
  assert.doesNotMatch(campaign, /presentation: 'stones'/);
});

test('Setup mounts the roots stones on the surface content so the shared insets apply', async () => {
  const setup = await source('public/js/setup-surfaces.js');
  assert.match(setup, /buildProjectRoots\(out\.content, \(\) => out\.content\.isConnected,[^;]+\{ presentation: 'stones' \}\)/);
  assert.doesNotMatch(setup, /'desk-pane desk-proj show'\); out\.content\.append\(host\);\s*const room = buildProjectRoots\(host/, 'a nested host zeroes the content padding and gets none of its own');
});

test('roots adapt the real project-root detail and Add form to the shared stone work surface', async () => {
  const roots = await source('public/js/projectroots.js');
  assert.match(roots, /options\.presentation === 'stones'/);
  assert.match(roots, /import \{ createStoneWorkSurface \} from '\.\/stone-work-surface\.js'/);
  assert.match(roots, /stoneSurface = createStoneWorkSurface/);
  assert.match(roots, /if \(current\) host\.append\(detail\(current\)\)/);
  assert.match(roots, /stoneSurface\.refreshDetail\(\)/);
  assert.match(roots, /const openAdd = stones \? null : createAction/);
  assert.match(roots, /stoneSurface\.mount\(root, \{ before: \[messages\] \}\)/);
  assert.match(roots, /id: NEW,[\s\S]*?label: t\('roots\.add_stone', 'Add A Workspace'\),[\s\S]*?glyph: '\+',[\s\S]*?className: 'setup-roots-add-stone'/);
  assert.doesNotMatch(roots, /stoneSurface\.openDetail/);
  assert.doesNotMatch(roots, /secondary: r\.remit \|\| r\.dir/);
  assert.match(roots, /t\('roots\.stone_ready', 'Ready'\)/);
  assert.match(roots, /t\('roots\.stone_missing', 'Folder missing'\)/);
  assert.match(roots, /t\('roots\.chip_archived', 'Archived'\)/);
  assert.match(roots, /createFolderPicker/);
  assert.match(roots, /\/api\/project-roots\/inspect/);
  assert.match(roots, /\/repo-profile/);
});

test('the selected folder is one page: a head line with every action, then Summary, Folder, Repository', async () => {
  const roots = await source('public/js/projectroots.js');
  const detail = roots.slice(roots.indexOf('function detail(r)'), roots.indexOf('function render()'));
  assert.match(detail, /make\('article', 'pr-detail'\)/);
  assert.match(detail, /d\.dataset\.mode = editing === r\.name \? 'edit' : 'read'/);
  assert.match(detail, /make\('p', 'pr-detail-state', words\.join\(' · '\)\)/, 'one measured state line');
  assert.match(detail, /if \(editing === r\.name\) \{\s*const f = form\(r\);[\s\S]*?d\.append\(f\);\s*return d;\s*\}/, 'Edit swaps the facts for the real form under the same head');
  assert.match(detail, /go\.append\(edit, shelve, drop\)/, 'Edit, Archive and Exclude share the head line');
  assert.match(detail, /go\.append\(f\.querySelector\('\.pr-frow'\)\)/, 'Save and Cancel stand where Edit stood');
  assert.match(detail, /make\('h3', 'pr-detail-name', r\.name\)/, 'the head is the handle');
  const order = ["t('roots.edit_folder', 'Edit')", "t('roots.summary', 'Summary')", "t('roots.section_folder', 'Folder')", "t('roots.section_repository', 'Repository')"]
    .map((needle) => detail.indexOf(needle));
  assert.ok(order.every((at) => at >= 0), 'every section is present');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'sections come in the ruled order');
  assert.match(detail, /t\('roots\.fact_directory', 'Directory'\), r\.dir, \{ tone:/);
  assert.doesNotMatch(detail, /make\('code'|font-mono/, 'the path is set in the same face as everything else');
  assert.match(detail, /t\('roots\.fact_publishing', 'Publishing'\)/);
  assert.match(detail, /t\('roots\.repository_none'/);
  assert.match(detail, /kind: 'primary'/, 'Edit is the one primary action');
  assert.match(detail, /const \{ shelve, drop \} = maintenance\(r\)/, 'Archive and Exclude keep their real handlers');
  assert.doesNotMatch(detail, /createElement\('details'\)|pr-disclosure|pr-chip|pr-maintenance/, 'no disclosures, chips, or second action group');
  assert.doesNotMatch(detail, /pr-remit|pr-dir\b/, 'summary and directory appear once each');
});

test('the Setup form keeps the real fields and reads as sections, while Campaign keeps fieldsets', async () => {
  const roots = await source('public/js/projectroots.js');
  assert.match(roots, /document\.createElement\(stones \? 'section' : 'fieldset'\)/);
  assert.match(roots, /document\.createElement\(stones \? 'h3' : 'legend'\)/);
  assert.match(roots, /if \(stones && !creating\) handleInput\.closest\('label'\)\.hidden = true/);
  assert.match(roots, /stones \? t\('roots\.save_folder', 'Save'\) : t\('roots\.save', 'save'\)/);
  assert.match(roots, /stones \? t\('roots\.cancel_folder', 'Cancel'\) : t\('roots\.cancel', 'cancel'\)/);
  assert.match(roots, /acts\.append\(edit, shelve, drop\)/, 'the Campaign block keeps edit, archive, exclude inline');
  assert.match(roots, /if \(editing === r\.name\) b\.appendChild\(form\(r\)\)/, 'the Campaign block still edits inline');
  assert.match(roots, /d\.dataset\.mode = 'add'/);
  assert.match(roots, /t\('roots\.add_head', 'Add a workspace'\)/);
  assert.match(roots, /!\(stones && stoneSurface\.selected\(\)\)/, 'an open Setup detail is not repainted by the poll');
});

test('roots carry no parallel stone DOM or CSS presentation and the detail rhythm uses kaki rules', async () => {
  const [roots, css] = await Promise.all([
    source('public/js/projectroots.js'),
    source('public/style.css'),
  ]);
  assert.doesNotMatch(roots, /className = 'pr-stone'/);
  assert.doesNotMatch(roots, /aria-pressed/);
  assert.doesNotMatch(css, /\.setup-roots-stones \.pr-stone/);
  assert.doesNotMatch(css, /--pr-stone/);
  assert.doesNotMatch(css, /\.setup-roots-stones \.sws-(rail|grid|detail|host)\b/, 'no consumer override of the shared rail, grid, or detail geometry');
  assert.match(css, /\.setup-roots-stones \.sws-stone\.archived \.sws-state/);
  assert.doesNotMatch(css, /\.setup-roots-stones \.sws-stone\.archived \.sws-state\s*\{[^}]*?(?:border|border-radius|background|padding):/);
  assert.match(css, /\.setup-roots-stones \.setup-roots-add-stone[\s\S]*?border-color: var\(--kaki\)[\s\S]*?border-style: dashed[\s\S]*?background: color-mix\(in srgb, var\(--kaki-tint\)/);
  assert.match(css, /\.pr-detail-head \{[^}]*border-bottom: var\(--edge-2\) solid var\(--kaki\)/, 'one kaki rule closes the head');
  assert.match(css, /\.pr-detail-heading \{[^}]*justify-content: space-between/, 'the head line carries the name and its actions, as Presets does');
  const detailCss = css.slice(css.indexOf("/* Setup's selected folder"), css.indexOf('.cv-worktrees-default {'));
  assert.doesNotMatch(detailCss, /--text-(?:[1-3]|[6-9]|10)\b/, 'only 14px body and 13px notes inside the detail');
  assert.doesNotMatch(detailCss, /font-mono|var\(--ok\)|@container roots-detail/, 'no second face, no green, labels never stack over values');
  assert.match(detailCss, /\.pr-detail \.pr-f input,\s*\.pr-detail \.pr-f select \{[^}]*border: 0;[^}]*background: var\(--well\)[^}]*font: inherit/, 'fields are drawn as Presets fields, never browser defaults');
  assert.match(css, /\.pr-detail \{[^}]*font-size: var\(--text-5\)/);
  assert.match(css, /\.pr-detail \.pr-group \{[^}]*border: 0/, 'no boxes inside the detail');
  assert.match(roots, /go\.append\(f\.querySelector\('\.pr-frow'\)\); \/\/ Add and Cancel on the head line/);
});

test('roots stones mount visible loading, empty, and failure output without changing Campaign roots', async () => {
  const roots = await source('public/js/projectroots.js');
  assert.match(roots, /messages\.className = 'pr-status'/);
  assert.match(roots, /messages\.setAttribute\('role', 'status'\)/);
  assert.match(roots, /stoneSurface\.mount\(root, \{ before: \[messages\] \}\)/);
  assert.match(roots, /const output = stones \? messages : list/);
  assert.match(roots, /messages\.replaceChildren\(\)/, 'a successful render clears loading or failure output');
  assert.match(roots, /\(stones \? messages : list\)\.appendChild/, 'the zero-roots message uses the mounted status host');
  assert.match(roots, /else root\.append\(head, list\)/, 'ordinary Campaign roots retain their existing list mount');
  assert.match(roots, /say\(t\('roots\.loading'/, 'loading is emitted through the shared say path');
  assert.match(roots, /say\(t\('roots\.read_failed'/, 'catalog failures are emitted through the shared say path');
});
