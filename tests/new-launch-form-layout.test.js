import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');

test('New Agent uses one ruled ask() spec after its three session types', async () => {
  const form = await source('new-agent.js');
  assert.match(form, /import \{ ask \} from '\.\/ask\.js'/);
  assert.match(form, /const questions = ask\(\[/);
  assert.match(form, /const teamQuestions = ask\(\[/);
  assert.match(form, /trayHost: identityRow/);
  assert.match(form, /when: 'current', key: 'teamName'/);
  assert.match(form, /new_agent\.team_none', 'No team \(rōnin\)'/);
  assert.match(form, /row: \(\) => newTeamField\(\), required: true/);
  assert.match(form, /invalid: \(\) => \(draft\.newTeam && !isValidTeamName\(draft\.newTeam\)/);
  assert.match(form, /new_team\.name_placeholder', 'lowercase, digits, - _'/);
  assert.doesNotMatch(form, /input\.placeholder = t\('new_agent\.team_new_blank'/);
  assert.match(form, /className: 'na-questions',[\s\S]*density: 'tight'/);
  assert.doesNotMatch(form, /key: 'template'.*Apply Template/);
  assert.match(form, /Cowork Agent[\s\S]*Bare-metal Agent[\s\S]*Terminal/);
  assert.match(form, /Session type/);
  assert.match(form, /agent_body', 'Agent'/);
  assert.match(form, /Name · required/);
  assert.match(form, /group: t\('new_agent\.model_package', 'Model'\)/);
  assert.match(form, /after: 'provider'/);
  assert.match(form, /group: t\('new_agent\.model_package', 'Model'\), fields: \[[\s\S]*key: 'provider'[\s\S]*key: 'model'[\s\S]*key: 'teamLead'[\s\S]*\] \},[\s\S]*group: t\('mandate', 'Mandate'\)/);
  assert.match(form, /group: t\('mandate', 'Mandate'\)/);
  assert.doesNotMatch(form, /key: '(?:reach|recruit|output)'[^\n]+shape: 'square'/);
  assert.match(form, /group: t\('squad', 'Team'\)/);
  assert.match(form, /key: 'teamLead'.*Make team lead.*switch: \[t\('forms\.on', 'On'\), t\('forms\.off', 'Off'\)\]/);
  assert.doesNotMatch(form, /switch: \[[^\]]+\], word:/);
  assert.match(form, /group: t\('where\.label', 'Where it works'\)/);
  assert.match(form, /group: t\('where\.label', 'Where it works'\), fields: \[[\s\S]*key: 'root'[\s\S]*key: 'repos'[\s\S]*key: 'launchMode'/);
  assert.match(form, /key: 'launchMode', label: t\('launch_mode\.mode', 'Mode'\)/);
  assert.match(form, /many: true, after: 'root'/);
  assert.match(form, /questions\.show\(draft\.type === 'terminal' \? \[\] : draft\.type === 'bare_metal_agent' \? \['provider', 'model', 'root', 'launchMode'\] : null\)/);
  assert.match(form, /session_type: 'bare_metal_agent'[\s\S]*launch_mode: draft\.launchMode/);
  assert.match(form, /teamQuestions\.show\(isCowork\(\) \? null : \['team'\]\)/);
  assert.match(form, /questions\.el\.hidden = draft\.type === 'terminal'/);
  assert.match(form, /\? \{ session_type: 'terminal', name, team \}/);
  assert.match(form, /if \(connect\) await connect\(born\)/, 'every successful birth awaits replacement of the launcher');
  assert.match(form, /stepPayload\.setNumber\(order\.length \+ 1\)/);
  assert.match(form, /key: 'payload'.*Payload/);
  assert.match(form, /identityRow\.append\(nameField, teamQuestions\.el\)/);
  assert.match(form, /stepTop\.body\.replaceChildren\(identityRow, questions\.el, instructionsField\)/);
  assert.doesNotMatch(form, /providerModelStones|na-choice-stone|na-mini-stone|stones: true/);
});

test('both workbench entrances use the canonical New Agent form with contextual Team default', async () => {
  const cowork = await source('cowork-view.js');
  assert.doesNotMatch(cowork, /createAddAgentView/);
  assert.doesNotMatch(cowork, /WB_TYPES\.addAgent|addAgentBySeat|environment\.addAgent/);
  assert.match(cowork, /profiles\.define\(WB_PROFILES\.team, \[WB_TYPES\.commons, WB_TYPES\.kanban, WB_TYPES\.terminal, WB_TYPES\.newAgent/);
  assert.match(cowork, /const newAgentBySeat = \{\};[\s\S]*newAgent: \(id, consumed\)[\s\S]*createNewAgentView\(WorkspaceKit, \{[\s\S]*consumed,[\s\S]*team: \(\) =>/);
  assert.match(cowork, /connect: async \(name\) => \{\s*await fetchSessions\(\);\s*return connectSession\(name, id\)/);
  assert.match(cowork, /const live = new Set\(S\.sessions\.map/, 'a newborn is not discarded against the slower home reading');
  assert.match(cowork, /'team\.add-agent': WB_TYPES\.newAgent/);
});

test('choosing New team requires a valid name before any session type can launch', async () => {
  const form = await source('new-agent.js');
  assert.match(form, /draft\.teamMode !== 'new' \|\| isValidTeamName\(chosenTeam\(\)\)/);
  assert.match(form, /if \(draft\.teamMode === 'new'\) \{[\s\S]*if \(!isValidTeamName\(team\)\)/);
  assert.doesNotMatch(form, /unnamed new team is no team|isCowork\(\) && team/);
});

test('Where it works keeps birthplace separate and offers all workspaces to Cowork Agents', async () => {
  const form = await source('new-agent.js');
  assert.match(form, /request\('\/api\/project-roots\/detail'\)/);
  assert.match(form, /rootRows\.data\?\.roots/);
  assert.doesNotMatch(form, /worktrees/);
  assert.match(form, /v: row\.name, l: row\.title \|\| row\.name/, 'root choices submit the Workspace Folder handle and display the optional title');
  assert.match(form, /label: t\('where\.born_in', 'Born in'\), options: rootRows/);
  assert.match(form, /label: t\('new_agent\.workspaces', 'Workspaces'\), many: true, after: 'root', options: rootRows/);
  assert.match(form, /draft\.type === 'bare_metal_agent' \? \['provider', 'model', 'root', 'launchMode'\]/,
    'bare-metal Agents choose one birthplace and are not offered additional workspaces');
  assert.match(form, /if \(!touched\.repos\) draft\.repos = draft\.root \? \[draft\.root\] : \[\]/);
  assert.match(form, /draft\.repos = workspaceRepos\(\{ root: draft\.root, teamRepos:/);
  assert.doesNotMatch(form, /no auto desk|extra sessions/i);
});

test('the old New Agent selector implementation and CSS are deleted', async () => {
  const [parts, css] = await Promise.all([source('form-steps.js'), readFile(new URL('../public/css/launch-forms.css', import.meta.url), 'utf8')]);
  assert.doesNotMatch(parts, /providerModelStones/);
  await assert.rejects(source('where-it-works.js'), 'the details popover is gone: Where it works is two ERABI questions everywhere');
  assert.doesNotMatch(css, /na-choice-stone|na-stone|na-mandate-grid|na-model-picker|na-workspace-stone/);
  assert.match(css, /\.na-surface :is\(\.wk-field, \.ask\)\[hidden\] \{ display: none; \}/);
});

test('New Team folds Kind and Template into one optional first row', async () => {
  const [form, agents] = await Promise.all([source('new-team-form.js'), source('team-agents.js')]);
  assert.match(form, /\['setup', 'top', 'lead', 'defaults', 'where', 'kit'\]/);
  assert.match(form, /key: 'setup', title: t\('new_team\.kind_template', 'Kind & Template'\), onToggle/);
  assert.match(form, /stepSetup\.body\.append\(kindHost,[\s\S]*trayHost\)/);
  assert.match(form, /stepSetup\.setCollapsed\(!setupOpen,[\s\S]*Optional — Kind and Template/);
  assert.match(form, /form\.append\(stepSetup\.el, stepTop\.el/);
  assert.match(form, /className: 'ntf-kind-questions',[\s\S]*exposed: true/);
  assert.match(form, /draft\.expanded = name \? \{ lead: true \} : \{\}/, 'choosing a template opens its populated Agents section');
  assert.match(form, /templateTray\(offered\(\), draft\.template, \(name\) => applyTemplate\(name\)\)/, 'the tray includes its No template reset');
  assert.match(form, /Name & instructions/);
  assert.match(agents, /＋ Add Agent/);
  assert.match(agents, /key: 'teamLead'.*Make team lead.*switch: \[t\('forms\.on', 'On'\), t\('forms\.off', 'Off'\)\]/);
  assert.doesNotMatch(agents, /Add Lead Agent|Add Team Agent/);
});

test('collapsible steps expose one full-width disclosure row and Team defaults use it', async () => {
  const [steps, team, agents, css] = await Promise.all([
    source('form-steps.js'), source('new-team-form.js'), source('team-agents.js'),
    readFile(new URL('../public/css/launch-forms.css', import.meta.url), 'utf8'),
  ]);
  assert.match(steps, /el\(onToggle \? 'button' : 'div', 'fs-step-head'\)/);
  assert.match(steps, /setAttribute\('aria-expanded'/);
  assert.match(steps, /forms\.expand', 'Expand'/);
  assert.match(steps, /forms\.collapse', 'Collapse'/);
  assert.match(css, /\.fs-togglable \{ grid-column: 1 \/ -1; width: 100%/);
  assert.match(css, /\.na-team-questions \{ flex: 0 0 auto; \}/);
  assert.match(team, /key: 'defaults'.*Agent defaults/);
  assert.match(team, /Settings inherited by Agents launched in this Team/);
  assert.match(team, /for \(const key of \['where', 'kit'\]\) steps\[key\]\.el\.hidden = !defaultsOpen/);
  assert.match(team, /const stepWhere = createStep\(\{ n: 5, key: 'where', title:[^}]+\}\);/);
  assert.match(team, /const stepKit = createStep\(\{ n: 6, key: 'kit', title:[^}]+\}\);/);
  assert.match(team, /const FOLDS = \['lead'\]/);
  assert.doesNotMatch(team, /stepDefaults\.body\.append/);
  assert.doesNotMatch(team, /createBand/);
  assert.match(agents, /if \(editor\) host\.append\(paintEditor\(\)\);[\s\S]*createAction\(\{ label:[\s\S]*＋ Add Agent/);
});

test('Add Agent confirms a draft into a compact row with the one selector utility', async () => {
  const [agents, team] = await Promise.all([source('team-agents.js'), source('new-team-form.js')]);
  assert.match(agents, /let editor = null/);
  assert.match(agents, /if \(index < 0\) rows\(\)\.push\(saved\)/);
  assert.match(agents, /editor = null; changed\(\); paint\(\)/);
  assert.match(agents, /agent_add_confirm', 'Add'/);
  assert.match(agents, /ntf-agent-row/);
  assert.match(agents, /const questions = ask\(\[/);
  assert.match(agents, /group: t\('new_agent\.model_package', 'Model'\)/);
  assert.match(agents, /group: t\('new_agent\.model_package', 'Model'\), fields: \[[\s\S]*key: 'provider'[\s\S]*key: 'model'[\s\S]*key: 'teamLead'[\s\S]*\] \},[\s\S]*group: t\('mandate', 'Mandate'\)/);
  assert.match(agents, /group: t\('mandate', 'Mandate'\)/);
  assert.match(agents, /const mandateRows = \(values\) => values\.map/);
  assert.match(agents, /options: mandateRows\(REACH\)/);
  assert.match(agents, /options: mandateRows\(RECRUIT\)/);
  assert.match(agents, /many: true, options: mandateRows\(OUTPUT\)/);
  assert.doesNotMatch(agents, /shape: 'square'|ruledRows|glyph:/);
  assert.match(agents, /many: true/);
  assert.match(agents, /key: 'teamLead'.*switch:/);
  assert.doesNotMatch(agents, /switch:[^\n]+word:/);
  assert.match(agents, /density: 'tight'/);
  assert.match(agents, /tierWord\(item\.tier\)/);
  assert.match(agents, /modelAvailabilityFact/);
  assert.doesNotMatch(agents, /forms\.provider_off|forms\.provider_turned_off|machine\?\.state|modelWord\([^)]*\)\.split/);
  assert.match(agents, /box\.append\(actions\.el, field/);
  assert.doesNotMatch(agents, /wk-button/);
  assert.doesNotMatch(agents, /dialRow|providerModelPair|type = 'checkbox'|aria-pressed/);
  assert.match(agents, /provider: row\.provider/);
  assert.match(agents, /model: row\.model/);
  assert.match(agents, /instructions: row\.assignment\.trim\(\)/);
  assert.match(agents, /team_lead: row\.team_lead === true/);
  assert.doesNotMatch(agents, /routines_/);
  assert.match(team, /loadProviderCatalog\(\)/, 'New Team loads provider choices for its inline Agent editor');
  assert.match(team, /Promise\.all\(\[[\s\S]*request\('\/api\/project-roots'\),[\s\S]*loadProviderCatalog\(\)/,
    'provider choices load as part of entering the New Team surface');
});

test('New Team cast text is labelled and all cast selections belong to ask()', async () => {
  const [agents, css, newAgent] = await Promise.all([
    source('team-agents.js'),
    readFile(new URL('../public/css/launch-forms.css', import.meta.url), 'utf8'),
    source('new-agent.js'),
  ]);
  assert.match(agents, /el\('label', 'ntf-agent-field'\)/);
  assert.match(agents, /el\('span', 'wk-field-label', label\)/);
  assert.doesNotMatch(agents, /ntf-agent-label/);
  assert.match(agents, /import \{ ask \} from '\.\/ask\.js'/);
  assert.match(agents, /title: t\('new_team\.agent_drop_named'/);
  assert.match(agents, /className: 'ntf-agent-row-actions'/);
  assert.doesNotMatch(css, /\.ntf-agent-(?:stone|mandate-toggle|lead-choice)/);
  assert.doesNotMatch(css, /\.na-[^,{ ]*[^}]*ntf-agent/);
  assert.doesNotMatch(css, /@media \(max-width: 44rem\)[\s\S]*\.na-surface \.ntf-agent/);
  assert.doesNotMatch(newAgent, /ntf-agent-field|new-team-agent-/);
});

test('New Team routes each selector region through ask() and leaves Templates browsing alone', async () => {
  const form = await source('new-team-form.js');
  assert.match(form, /const kindQuestions = ask\(/);
  assert.match(form, /ruledRows\('kind', \['open', \.\.\.KINDS\]/);
  assert.match(form, /const whereQuestions = ask\(/);
  assert.match(form, /kitQuestions = ask\(/);
  assert.match(form, /key: 'launchMode', label: t\('launch_mode\.mode', 'Mode'\)/);
  assert.match(form, /after: 'provider'/);
  assert.match(form, /after: 'root'/);
  assert.match(form, /row: branchField/);
  assert.match(form, /group: t\('behaviours', 'Behaviours'\)/);
  assert.doesNotMatch(form, /availableFeatures|group: t\('features'/);
  assert.match(form, /options: LAUNCH_MODES\(\)\.map/);
  assert.match(form, /trayHost: kitHost/, 'launch mode opens below the full kit row without moving Behaviours');
  assert.match(form, /many: true, shape: 'tall', options: shelfRows/);
  assert.equal((form.match(/density: 'tight'/g) || []).length, 2, 'both defaults regions use launch density');
  assert.match(form, /tierWord\(row\.tier\)/);
  assert.match(form, /modelAvailabilityFact/);
  assert.doesNotMatch(form, /forms\.provider_off|forms\.provider_turned_off|machine\?\.state|modelWord\([^)]*\)\.split/);
  assert.match(form, /templateTray\(offered\(\)/);
  assert.doesNotMatch(form, /kindTiles|providerModelPair|mandateSelect|dialRowMulti|wayTiles|bookShelves|createWhereItWorks|fs-routine/);
  assert.doesNotMatch(form, /draft\.dial|value\('dial'\)/, 'New Team stores the fixed Control default without presenting or seeding a dial');
});

test('Team Configuration hides legacy Control and hosts Runtime trays below its full row', async () => {
  const form = await source('team-configuration.js');
  assert.doesNotMatch(form, /key: 'dial'|ruledRows\('dial'|team_config\.dial/);
  assert.match(form, /trayHost: defaultsRow/);
});

test('New Team checks names only for a cast and opens partial Teams with exact recovery evidence', async () => {
  const form = await source('new-team-form.js');
  assert.match(form, /if \(picks\.length\) \{[\s\S]*request\('\/api\/sessions'/);
  assert.match(form, /const born = outcomes\.filter\(\(\{ result \}\) => result\?\.ok\)/);
  assert.match(form, /Team created\. Launched \{launched\} of \{total\} Agents: \{born\}\. Failed: \{names\}/);
  assert.match(form, /if \(refused\.length\) \{[\s\S]*seedReservedWorkspaceTab\(launchTab, 'team',[\s\S]*openWorkspaceTab\('team', name, launchTab\);[\s\S]*return;/);
  assert.doesNotMatch(form, /if \(refused\.length\) \{\s*closeWorkspaceTab/);
});
