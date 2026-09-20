import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Setup and Settings use the same Workspace Folders stone presentation', async () => {
  const [setup, campaign, shared] = await Promise.all([
    source('public/js/setup-surfaces.js'),
    source('public/js/campaign-view.js'),
    source('public/js/workspace-folders-surface.js'),
  ]);
  assert.match(setup, /createWorkspaceFoldersSurface\(\{[\s\S]*presentation: 'stones'/);
  assert.match(campaign, /createWorkspaceFoldersSurface\(\{[\s\S]*presentation: 'stones'[\s\S]*environment: e,[\s\S]*workspace,/);
  assert.doesNotMatch(campaign, /worktreesDefault/);
  assert.match(shared, /presentation === 'stones' \? createGithubWorkspaceSetup/);
  assert.match(shared, /presentation \? \{[\s\S]*presentation,[\s\S]*extraItems: github\?\.items \|\| \[\],[\s\S]*onSelection: \(id\) => environment\?\.onWorkspaceFolderChosen\?\.\(id\),[\s\S]*\} : \{\}/);
  assert.doesNotMatch(shared, /onboardingExtras/, 'GitHub clone is an ongoing Workspace Folders operation, not an onboarding-only extra');
  assert.doesNotMatch(setup, /onboardingExtras|setupOnboardingExtras/);
  assert.doesNotMatch(await source('public/js/setup-view.js'), /setupOnboardingExtras/);
  assert.match(campaign, /createWorkspaceFoldersSurface\(\{[\s\S]*presentation: 'stones'/, 'Settings receives the shared GitHub authentication and clone stones');
});

test('Setup GitHub lifecycle uses only a published session and hands success to Clone', async () => {
  const [github, kit] = await Promise.all([
    source('public/js/github-workspace-setup.js'),
    source('public/workspace-kit.css'),
  ]);
  assert.match(github, /import \{ WorkspaceKit \} from '\.\/workspace-kit\.js'/);
  assert.match(github, /const connect = action\([^\n]+, 'primary'\)/);
  assert.match(github, /const install = action\([^\n]+, 'primary'\)/);
  assert.match(github, /const remove = action\([^\n]+, 'danger'\)/);
  assert.match(github, /const cloneButton = action\([^\n]+, 'primary'\)/);
  assert.match(kit, /\.wk-action:hover:not\(:disabled\) \{[^}]*border-color: var\(--kaki\);[^}]*background: var\(--accent-soft\)/, 'ordinary actions visibly respond to a pointer');
  assert.match(kit, /\.wk-action\[data-kind='primary'\]:hover:not\(:disabled\) \{[^}]*background: var\(--kaki-lift\)/, 'primary actions lift on hover');
  assert.match(github, /attachment\?\.type !== 'session' \|\| !attachment\.key/);
  assert.match(github, /mountAttachment\(result\.data\.attachment\)/, 're-entering resumes the published temporary session');
  assert.match(github, /if \(connecting \|\| mounted \|\| destroyed\) return/);
  assert.match(github, /if \(checking \|\| destroyed\) return/);
  assert.match(github, /stopWatch\(\); unmount\(\)/);
  assert.match(github, /onAuthenticated\?\.\(\)/);
  assert.doesNotMatch(github, /roots\.github_check|Check connection/);
  assert.match(github, /roots\.github_remove_auth', 'Remove authentication'/);
  assert.match(github, /remove\.hidden = !authenticated \|\| !installed/);
  assert.match(github, /request\('\/api\/setup\/github\/logout', \{ method: 'POST' \}\)/);
  assert.match(github, /request\('\/api\/setup\/github\/install', \{ method: 'POST' \}\)/);
  assert.match(github, /setup-provider-steps setup-github-steps/);
  assert.doesNotMatch(github, /glyph: '⌘'/, 'GitHub never borrows the macOS Command key as its identity');
  const finish = github.slice(github.indexOf('const finishAuthentication'), github.indexOf('const poll'));
  assert.doesNotMatch(finish, /\/clone|onCloned/, 'authentication never starts a clone');
  assert.match(github, /if \(result\.ok\) await onCloned\?\.\(result\.data\?\.workspace\)/);
  const shared = await source('public/js/workspace-folders-surface.js');
  assert.match(shared, /onAuthenticated: \(\) => \{[\s\S]*environment\?\.onGithubAuthenticated\?\.\(\);[\s\S]*room\?\.select\('\\0github-clone', \{ focus: true \}\)/);
  assert.match(shared, /await room\?\.refresh\(\);[\s\S]*room\?\.select\(root\.name, \{ focus: true \}\)/);
  assert.match(shared, /destroy: \(\) => github\?\.destroy\(\)/);
});

test('Setup mounts the roots stones on the surface content so the shared insets apply', async () => {
  const shared = await source('public/js/workspace-folders-surface.js');
  assert.match(shared, /presentation === 'stones'\s*\? surface\.content\s*: el\('div', 'desk-pane desk-proj show'\)/);
  assert.match(shared, /connected\?\.\(rootHost\) \?\? rootHost\.isConnected/);
});

test('roots adapt the real project-root detail and Add form to the shared stone work surface', async () => {
  const roots = await source('public/js/projectroots.js');
  assert.match(roots, /options\.presentation === 'stones'/);
  assert.match(roots, /import \{ createStoneWorkSurface \} from '\.\/stone-work-surface\.js'/);
  assert.match(roots, /stoneSurface = createStoneWorkSurface/);
  assert.match(roots, /if \(current\) host\.append\(detail\(current\)\)/);
  assert.match(roots, /stoneSurface\.refreshDetail\(\)/);
  assert.match(roots, /const openAdd = stones \? null : createAction/);
  assert.match(roots, /stoneSurface\.mount\(root, \{ before: \[\.\.\.\(options\.before \|\| \[\]\), messages\] \}\)/);
  assert.doesNotMatch(roots, /roots\.intro_|roots\.learn_more|pr-intro/, 'Workspace Folders has no explanatory preamble');
  assert.match(roots, /options\.onSelection\?\.\(id\)/, 'choosing a real folder records owner completion');
  assert.match(roots, /stoneSurface\.setItems\(\[\{\s*id: NEW,\s*label: t\('roots\.add_stone', 'Add a workspace'\),\s*glyph: '\+',\s*className: 'setup-roots-add-stone'/, 'Add a workspace is the first stone');
  assert.doesNotMatch(roots, /stoneSurface\.openDetail/);
  assert.doesNotMatch(roots, /secondary: r\.remit \|\| r\.dir/);
  assert.match(roots, /t\('roots\.stone_plain_folder', 'Plain folder'\)/);
  assert.match(roots, /t\('roots\.stone_repo_no_remote', 'Repository · no remote'\)/);
  assert.match(roots, /t\('roots\.stone_repo_worktrees', 'Repository · Worktrees'\)/);
  assert.match(roots, /t\('roots\.stone_repo_checkout', 'Repository · checkout'\)/);
  assert.match(roots, /t\('roots\.stone_missing', 'Folder missing'\)/);
  assert.match(roots, /t\('roots\.chip_archived', 'Archived'\)/);
  assert.match(roots, /createFolderPicker/);
  assert.match(roots, /\/api\/project-roots\/inspect/);
  assert.match(roots, /\/repo-profile/);
  assert.match(roots, /existing\.repo_profile\?\.worktrees \|\| \(creating \? 'enabled' : 'disabled'\)/, 'new repository workspaces default to a worktree root without rewriting existing choices');
  assert.match(roots, /creating \? \(existing\.repo_profile\?\.mode \|\| 'direct'\) : before\.mode/, 'the worktree default does not silently opt into reviewed publishing');
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
  assert.match(detail, /make\('h3', 'pr-detail-name', r\.title \|\| r\.name\)/, 'the head uses the display title with the Workspace Folder handle as fallback');
  assert.match(detail, /t\('roots\.fact_handle', 'Workspace Folder handle'\), r\.name/, 'the detail keeps the Workspace Folder handle visible');
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
  assert.match(roots, /t\('roots\.f_title', 'display title'\)/);
  assert.match(roots, /stones \? t\('roots\.save_folder', 'Save'\) : t\('roots\.save', 'save'\)/);
  assert.match(roots, /stones \? t\('roots\.cancel_folder', 'Cancel'\) : t\('roots\.cancel', 'cancel'\)/);
  assert.match(roots, /acts\.append\(edit, shelve, drop\)/, 'the Campaign block keeps edit, archive, exclude inline');
  assert.match(roots, /if \(editing === r\.name\) b\.appendChild\(form\(r\)\)/, 'the Campaign block still edits inline');
  assert.match(roots, /d\.dataset\.mode = 'add'/);
  assert.match(roots, /t\('roots\.add_head', 'Add a workspace'\)/);
  assert.match(roots, /words: \{[\s\S]*?chosen: t\('roots\.picker_path', 'Path'\),[\s\S]*?note: '',[\s\S]*?take: t\('roots\.picker_keep', 'Keep'\)/, 'Setup says the picker in keep-or-ignore terms, never "choose" or "where the Agent will start"');
  assert.doesNotMatch(roots.slice(roots.indexOf('function addCard')), /roots\.add_hint/, 'the add page does not say choose');
  assert.doesNotMatch(roots, /setInterval|poll/, 'the roots surface has no background repaint loop');
});

test('Workspace Folder creation reuses object-ID normalization and house confirmation sheets', async () => {
  const [roots, picker, ui, css] = await Promise.all([
    source('public/js/projectroots.js'), source('public/js/folder-picker.js'),
    source('public/js/ui.js'), source('public/style.css'),
  ]);
  assert.match(roots, /import \{ finalizeTeamName, sanitizeTeamName \} from '\.\/new-team-draft\.js'/);
  assert.match(roots, /sanitizeTeamName\(handleInput\.value\)\.slice\(0, 32\)/);
  assert.match(roots, /finalizeTeamName\(handleInput\.value\)\.slice\(0, 32\)/);
  assert.match(roots, /handleInput\.maxLength = 32/);
  assert.match(roots, /confirmDialog\(\{/);
  assert.match(picker, /confirmDialog\(\{/);
  assert.doesNotMatch(roots, /confirm\(t\('roots\.profile_confirm'/);
  assert.doesNotMatch(picker, /\bconfirm\(/);
  assert.match(ui, /export function confirmDialog/);
  assert.match(ui, /cls: 'ui-confirm-card'/);
  assert.match(css, /\.ui-confirm-copy \{[^}]*overflow-wrap: anywhere/);
  assert.match(css, /\.pr-err \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere/s);
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
  assert.match(css, /\.setup-roots-stones \.setup-roots-add-stone \{[^}]*border-style: dashed;[^}]*background: var\(--panel\);[^}]*color: var\(--fg\)/, 'Add is neutral until selected');
  assert.doesNotMatch(css, /\.setup-roots-stones \.setup-roots-add-stone \.sws-glyph/, 'both add-action plus glyphs inherit the shared accent');
  assert.match(css, /\.setup-roots-stones \.sws-stone\[aria-pressed='true'\] \{[^}]*border-color: var\(--kaki\);[^}]*background: var\(--accent-soft\);[^}]*color: var\(--fg-strong\)/, 'only the selected stone receives the highlight');
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
  assert.match(roots, /stoneSurface\.mount\(root, \{ before: \[\.\.\.\(options\.before \|\| \[\]\), messages\] \}\)/);
  assert.match(roots, /const output = stones \? messages : list/);
  assert.match(roots, /messages\.replaceChildren\(\)/, 'a successful render clears loading or failure output');
  assert.match(roots, /\(stones \? messages : list\)\.appendChild/, 'the zero-roots message uses the mounted status host');
  assert.match(roots, /else root\.append\(head, list\)/, 'ordinary Campaign roots retain their existing list mount');
  assert.match(roots, /say\(t\('roots\.loading'/, 'loading is emitted through the shared say path');
  assert.match(roots, /say\(t\('roots\.read_failed'/, 'catalog failures are emitted through the shared say path');
});

test('the folder picker takes its words from the consumer and keeps its stock words for others', async () => {
  const picker = await source('public/js/folder-picker.js');
  assert.match(picker, /createFolderPicker\(\{ value = '', onChange = \(\) => \{\}, words = \{\} \}/);
  assert.match(picker, /chosen: words\.chosen \?\? t\('folders\.selected', 'Selected folder'\)/);
  assert.match(picker, /note: words\.note \?\? t\('folders\.start_context', 'This is where the Agent will start\.'\)/);
  assert.match(picker, /take: words\.take \?\? t\('folders\.choose', 'Choose'\)/);
  assert.match(picker, /context\.hidden = !say\.note/, 'an empty note hides the standing line until a folder is inspected');
  assert.match(picker, /folder\.registered_root \? \(say\.kept \|\| 'evaluate'\) : say\.take/);
  assert.match(picker, /sort\(\(a, b\) => Number\(isRepo\(b\)\) - Number\(isRepo\(a\)\)\)/, 'folders with a repository come first');
  assert.match(picker, /t\('folders\.group_repositories', 'Folders with a Git repository'\)/);
  assert.match(picker, /t\('folders\.group_plain', 'Folders'\)/);
  assert.match(picker, /if \(folder\.registered_root && say\.kept\) choose\.disabled = true/, 'a kept folder is inert where the consumer names it so');
  assert.doesNotMatch(await source('public/js/presets.js'), /words:/, 'presets keeps the stock words');
});
