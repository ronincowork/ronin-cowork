/* part of the ronin-cowork client — see js/README.md */
/** NEW AGENT — the sole drawn launch form. Session type decides which questions exist;
 * only a Cowork Agent has kind, template, mandate, and loadout. Defaults arrive through
 * `GET /api/launch-seed?team=` and land until the user's hand changes them. Behaviours
 * are the complete editable cascade for a Cowork Agent. */
import { request } from './request.js';
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { finalizeTeamName, isValidTeamName, sanitizeTeamName } from './new-team-draft.js';
import {
  createStep, el, kindTiles, loadProviderCatalog, mandateWord, modelAvailabilityFact, modelLabel, providerCatalog, readingRows, subscribeProviderCatalog, tagRow, templateTray, tierWord,
} from './form-steps.js';
import { openLaunchHandoff } from './launch-handoff.js';
import { closeWorkspaceTab, reserveWorkspaceTab, workbenchLaunchUrl } from './workspace.js';

const REACH = ['open', 'discuss', 'plan', 'execute'];
const RECRUIT = ['open', 'nobody', 'propose agents', 'staff agents'];
// absence of `code`: silence is not an instruction. Nothing validates the combination.
const OUTPUT = ['open', 'a plan', 'ideas', 'code', 'an artifact', 'the team', 'no code'];

/** A preload may name a template outside the form's default kind filter. Keep a compatible
 * current kind when possible; otherwise use the template's first declared kind. */
function templateEntryKind(current, template) {
  const kinds = Array.isArray(template?.kinds) ? template.kinds.filter(Boolean) : [];
  return kinds.includes(current) ? current : kinds[0] || current;
}

export function templateEntryPlan({ currentKind, kindTouched = false, templates = [], template = '' } = {}) {
  const row = templates.find((candidate) => candidate.name === template);
  if (!row) return { kind: currentKind, template: '' };
  const kind = templateEntryKind(currentKind, row);
  if (kindTouched && kind !== currentKind) return { kind: currentKind, template: '' };
  return { kind, template: row.name };
}

export function workspaceRepos({ root = '', teamRepos = [], current = [], touched = false } = {}) {
  return touched ? [...current] : [...new Set([root, ...teamRepos].filter(Boolean))];
}

export function coworkWorkspacePayload(repos = []) {
  return { repos: [...repos] };
}

export function createNewAgentView(kit, { connect = null, consumed = null, embedded = false, team = null, openTeamDefaults = null, openDeskDefaults = null, openBehaviours = null, teamDefaultsUrl = null, deskDefaultsUrl = null } = {}) {
  const { createSurface, createAction, createActionBar, createField, createNotice } = kit.primitives;

  const freshDraft = () => {
    const entryTeam = typeof team === 'function' ? team() : team;
    return {
      type: 'cowork_agent', template: '', templateName: '',
      name: '', kind: 'coding', kindTouched: false, provider: '', model: '', instructions: '',
      teamMode: entryTeam ? 'existing' : 'none', team: entryTeam || '', newTeam: '',
      reach: 'open', recruit: 'open', output: ['open'], launchMode: 'configured',
      teamLead: false,
      books: [], root: '', repos: [],
      expanded: {},
    };
  };
  const draft = freshDraft();
  let seed = null;
  let templates = [];
  let teams = [];
  let roots = [];
  let snapshot = '';
  let busy = false;
  let loaded = false;
  let templateMode = false;
  const touched = { mandate: false, model: false, root: false, repos: false, books: false, launchMode: false };

  const start = createAction({
    label: t('forms.launch', 'Launch'),
    launch: true,
    size: 'compact',
    disabled: true,
    action: () => void doStart(),
  });
  const surface = createSurface({ label: t('new_agent.title', 'New Agent'), className: 'na-surface', actions: [start], header: !embedded });
  const notice = createNotice();
  if (embedded) {
    surface.content.classList.add('na-surface', 'launch-form-embed');
    const embedActions = el('div', 'launch-form-embed-actions');
    embedActions.append(start.el);
    surface.content.append(embedActions);
  }

  const isCowork = () => draft.type === 'cowork_agent';
  const hasAgent = () => draft.type !== 'terminal';
  const templateRow = () => templates.find((row) => row.name === draft.template) || null;
  const offered = () => (draft.kind === 'open' ? templates : templates.filter((row) => row.kinds.includes(draft.kind)));
  const chosenTeam = () => (draft.teamMode === 'existing' ? draft.team : draft.teamMode === 'new' ? finalizeTeamName(draft.newTeam) : '');

  // and "Make your own" is the manual door; a mode switch above the form said it twice.

  /* ---- 1 · Kind ---- */
  const stepKind = createStep({ n: 1, key: 'kind', title: t('kind', 'Kind') });
  const kindHost = el('div');
  function paintKinds() {
    kindHost.replaceChildren(kindTiles(draft.kind, (key) => {
      draft.kind = key;
      draft.kindTouched = true;
      if (draft.template && !offered().some((row) => row.name === draft.template)) { draft.template = ''; snapshot = ''; }
      paint();
    }));
  }
  stepKind.body.append(kindHost);

  /* ---- 2 · Session type ---- */
  const stepType = createStep({ n: 2, key: 'type', title: t('new_agent.session_type_step', 'Session type') });
  const typeHost = el('div', 'fs-pair');
  const templateHost = el('div', 'na-template-tray');
  const TYPES = () => [
    { key: 'cowork_agent', label: t('new_agent.type_cowork', 'Cowork Agent'), sub: t('new_agent.type_cowork_sub', 'Born with Ronin capabilities, behaviors, and assigned Team.') },
    { key: 'bare_metal_agent', label: t('new_agent.type_bare', 'Bare-metal Agent'), sub: t('new_agent.type_bare_sub', 'The provider’s agent and nothing else from Ronin.') },
    { key: 'terminal', label: t('new_agent.type_terminal', 'Terminal'), sub: t('new_agent.type_terminal_sub', 'A raw tmux pane, no agent launched, and nothing sent to it.') },
  ];
  function paintTypes() {
    typeHost.replaceChildren();
    for (const type of TYPES()) {
      const box = el('button', 'fs-way');
      box.type = 'button';
      box.setAttribute('aria-pressed', String(draft.type === type.key));
      box.append(el('b', null, type.label), el('small', null, type.sub));
      box.addEventListener('click', () => {
        templateMode = false;
        draft.type = type.key;
        paint();
      });
      typeHost.append(box);
    }
  }
  stepType.body.append(typeHost, templateHost);

  /* ---- 3 · Name & instructions ---- */
  const stepTop = createStep({ n: 2, key: 'top', title: t('new_agent.agent_body', 'Agent') });
  const nameInput = el('input');
  nameInput.type = 'text';
  nameInput.autocapitalize = 'off';
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  nameInput.required = true;
  nameInput.maxLength = 40;
  nameInput.placeholder = t('new_agent.name_placeholder', 'name');
  nameInput.addEventListener('input', () => {
    const clean = nameInput.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (clean !== nameInput.value) {
      const at = nameInput.selectionStart;
      nameInput.value = clean;
      nameInput.setSelectionRange(at, at);
    }
    draft.name = nameInput.value;
    paintFoot();
    paintActions(); // Start wakes on the first character of a name
  });
  const leanNote = el('p', 'na-omitted');
  function paintLeanNote() {
    leanNote.hidden = isCowork() || draft.type === 'terminal';
    if (leanNote.hidden) return;
    leanNote.textContent = t('new_agent.bare_note', 'A bare-metal Agent takes no kind, no mandate and no loadout.');
  }
  const topLeft = el('div', 'aa-col');
  const nameField = createField({ label: t('new_agent.name_required', 'Name · required'), control: nameInput }).el;
  nameField.classList.add('na-name-required');
  topLeft.append(nameField, leanNote);
  stepTop.body.append(topLeft);

  /* ---- Apply Template lives under the fourth session choice. ---- */
  function restoreTemplateDefaults() {
    const value = (field) => seed?.seeds?.[field]?.value;
    draft.instructions = '';
    instructionsInput.value = '';
    draft.books = Array.isArray(value('behaviours')) ? [...value('behaviours')] : [];
    for (const key of ['reach', 'recruit']) draft[key] = value(key) || 'open';
    draft.output = [value('output') || 'open'].flat().filter(Boolean);
    draft.teamMode = 'new'; draft.team = ''; draft.newTeam = '';
    touched.mandate = false; touched.books = false;
  }
  function applyTemplate(name) {
    draft.template = name;
    draft.expanded = {};
    // Make your own and every new template start from inherited defaults, never the last
    // template's answers. Name, kind and where are the owner's own answers and stay put.
    restoreTemplateDefaults();
    const row = templateRow();
    if (!row) { snapshot = ''; paint(); return; }
    draft.instructions = row.brief || '';
    instructionsInput.value = draft.instructions;
    // A template's output may still be a single word — the record wraps a legacy scalar,
    // and so does the form, rather than handing a string to code that expects a list.
    // The shelf hands back a parsed mandate — `{ reach, recruit, output[] }` or null when
    // the template is silent — so a silent one seeds nothing rather than seeding a guess.
    if (row.mandate) { draft.reach = row.mandate.reach; draft.recruit = row.mandate.recruit; draft.output = [row.mandate.output].flat().filter(Boolean); touched.mandate = true; }
    // `team_mode: 'new'` births the box into its own team (the Personal Assistant ruling).
    if (row.team_mode === 'new') { draft.teamMode = 'new'; }
    if (row.behaviours.length) { draft.books = [...row.behaviours]; touched.books = true; }
    snapshot = authored();
    paint();
  }
  const authored = () => JSON.stringify({
    instructions: draft.instructions, books: [...draft.books].sort(),
    mandate: [draft.reach, draft.recruit, ...draft.output],
  });
  const templateDirty = () => !!templateRow() && authored() !== snapshot;
  function paintTray() {
    templateHost.hidden = !templateMode;
    templateHost.replaceChildren();
    if (templateMode) templateHost.append(templateTray(offered(), draft.template, (name) => applyTemplate(name), { includeOwn: false }));
  }

  const instructionsInput = el('textarea');
  instructionsInput.classList.add('wk-field-control');
  instructionsInput.rows = 6;
  instructionsInput.autocapitalize = 'off';
  instructionsInput.spellcheck = false;
  instructionsInput.placeholder = t('add_agent.instruction_placeholder', 'what this Agent should do');
  instructionsInput.addEventListener('input', () => {
    draft.instructions = instructionsInput.value;
    paintFoot();
    // The save offer appears when a template goes dirty, and an instructions-only edit IS
    // dirt — it just never repainted the actions, so Save as template stayed hidden until
    // you happened to type a name too. (@template_shelves measured it.)
    paintActions();
  });
  const instructionsField = createField({ label: t('new_agent.instructions', 'Instructions'), control: instructionsInput }).el;
  stepTop.body.append(instructionsField);

  /* ---- The one question utility: Model, Mandate, Team, and Where it works. ---- */
  const providerRows = () => providerCatalog().rows
    .filter((row, index, all) => all.findIndex((other) => other.provider === row.provider) === index)
    .map((row) => {
      const unavailable = row.operational ? '' : row.off
        ? t('forms.reason_turned_off', 'turned off')
        : t('forms.reason_not_on_machine', 'not on this machine');
      return { v: row.provider, l: row.cli_label || row.provider_label || row.provider, off: unavailable || undefined };
    });
  const modelRows = (provider) => providerCatalog().rows.filter((row) => row.provider === provider).map((row) => {
    const machine = providerCatalog().machine.find((item) => item.id === row.cli);
    return {
      v: row.model, l: modelLabel(row), word: tierWord(row.tier), sub: row.cost || '',
      off: !row.operational
        ? t('forms.reason_not_on_machine', 'not on this machine')
        : !row.selectable
          ? modelAvailabilityFact(row)
          : undefined,
    };
  });
  const teamChoice = () => draft.teamMode === 'new' ? 'new' : draft.teamMode === 'none' ? 'none' : 'current';
  const teamRows = () => teams.map((row) => ({ v: row.name, l: String(row.title ?? '').trim() || row.name, sub: row.name }));
  const rootRows = () => roots.map((row) => ({ v: row.name, l: row.title || row.name, sub: row.title ? row.name : '' }));
  const mandateRows = (values) => values.map((value) => ({ v: value, l: mandateWord(value) }));
  const launchModes = () => {
    const supported = providerCatalog().providers.find((row) => row.provider === draft.provider)?.launch_modes || ['configured'];
    return [
      { v: 'configured', l: t('launch_mode.configured', 'Native'),
        sub: t('launch_mode.configured_sub', 'Do not override the provider CLI’s approval behavior. Model selection is separate.') },
      ...(supported.includes('live_dangerously') ? [{ v: 'live_dangerously', l: t('launch_mode.live', 'Dangerously'),
        sub: t('launch_mode.live_sub', 'Use that provider CLI’s own approval-bypass launch.') }] : []),
    ];
  };
  const newTeamField = () => {
    const input = el('input'); input.type = 'text'; input.spellcheck = false; input.autocapitalize = 'off'; input.value = draft.newTeam;
    input.placeholder = t('new_team.name_placeholder', 'lowercase, digits, - _');
    input.addEventListener('input', () => {
      const caret = input.selectionStart; const clean = sanitizeTeamName(input.value);
      if (clean !== input.value) { input.value = clean; input.setSelectionRange(caret, caret); }
      draft.newTeam = input.value; paintFoot(); paintActions();
    });
    return input;
  };
  const identityRow = el('div', 'na-identity-row');
  const defaultsNote = el('div', 'fs-step-help na-defaults-note');
  const defaultsLink = (label, href, open) => {
    const link = el('a', null, label);
    link.href = href;
    if (open) link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); open();
    });
    return link;
  };
  const paintDefaultsNote = () => {
    defaultsNote.replaceChildren();
    const hasTeam = draft.teamMode !== 'none';
    const teaching = el('p', null, hasTeam
      ? t('new_agent.defaults_cascade_team', 'Defaults cascade from Desk → Team → this Agent. Changes on this form apply only to this Agent.')
      : t('new_agent.defaults_cascade_desk', 'Defaults cascade from Desk → this Agent. Changes on this form apply only to this Agent.'));
    const links = el('p', 'na-defaults-links');
    if (hasTeam && chosenTeam()) links.append(defaultsLink(t('new_agent.team_defaults', 'Team defaults'),
      teamDefaultsUrl?.(chosenTeam()) || workbenchLaunchUrl({ destination: 'team', param: chosenTeam(), mode: 'overlay' }),
      openTeamDefaults ? () => openTeamDefaults(chosenTeam()) : null), ' · ');
    links.append(defaultsLink(t('new_agent.desk_defaults', 'Desk defaults'),
      deskDefaultsUrl?.() || workbenchLaunchUrl({ destination: 'campaign', mode: 'overlay' }), openDeskDefaults));
    defaultsNote.append(teaching, links);
  };
  const onQuestionChange = (value, key) => {
    if ('provider' in value) {
      draft.provider = value.provider; draft.model = value.model;
      if (!providerCatalog().providers.find((row) => row.provider === draft.provider)?.launch_modes?.includes(draft.launchMode)) draft.launchMode = 'configured';
    }
    if ('reach' in value) { draft.reach = value.reach; draft.recruit = value.recruit; draft.output = value.output; }
    if ('teamLead' in value) draft.teamLead = value.teamLead === true;
    if ('root' in value) { draft.root = value.root; draft.repos = [...value.repos]; }
    if ('launchMode' in value) draft.launchMode = value.launchMode;
    if (key === 'provider' || key === 'model') touched.model = true;
    if (['reach', 'recruit', 'output'].includes(key)) touched.mandate = true;
    if (key === 'root') {
      touched.root = true;
      if (!touched.repos) draft.repos = draft.root ? [draft.root] : [];
      questions.set('repos', draft.repos);
    }
    if (key === 'repos') touched.repos = true;
    if (key === 'launchMode') touched.launchMode = true;
    if (key === 'team' || key === 'teamName') {
      draft.teamMode = value.team === 'new' ? 'new' : value.team === 'none' ? 'none' : 'existing';
      draft.team = draft.teamMode === 'existing' ? value.teamName : '';
      if (!touched.repos) {
        const selected = teams.find((row) => row.name === draft.team);
        draft.repos = workspaceRepos({ root: draft.root, teamRepos: draft.teamMode === 'existing' ? selected?.repos || [] : [] });
      }
      void loadSeed();
    }
    paintDefaultsNote(); paintFoot(); paintActions();
  };
  const questions = ask([
    { group: t('new_agent.model_package', 'Model'), fields: [
      { key: 'provider', label: t('forms.provider', 'Model provider'), blank: t('forms.default', 'Default'), options: providerRows },
      { key: 'model', label: t('forms.model', 'Model'), blank: t('forms.default', 'Default'), after: 'provider', options: (value) => modelRows(value.provider) },
      { key: 'teamLead', label: t('new_agent.make_team_lead', 'Make team lead'), switch: [t('forms.on', 'On'), t('forms.off', 'Off')] },
    ] },
    { group: t('mandate', 'Mandate'), fields: [
      { key: 'reach', label: t('reach', 'Reach'), options: mandateRows(REACH) },
      { key: 'recruit', label: t('recruit', 'Recruit'), options: mandateRows(RECRUIT) },
      { key: 'output', label: t('output', 'Output'), many: true, options: mandateRows(OUTPUT) },
    ] },
    { group: t('where.label', 'Where it works'), fields: [
      { key: 'root', label: t('where.born_in', 'Born in'), options: rootRows },
      { key: 'repos', label: t('new_agent.workspaces', 'Workspaces'), many: true, after: 'root', options: rootRows },
      { key: 'launchMode', label: t('launch_mode.mode', 'Mode'), options: launchModes },
    ] },
  ], {
    value: { provider: draft.provider, model: draft.model, reach: draft.reach, recruit: draft.recruit, output: draft.output, teamLead: draft.teamLead, root: draft.root, repos: draft.repos, launchMode: draft.launchMode },
    className: 'na-questions',
    density: 'tight',
    onChange: onQuestionChange,
  });
  const teamQuestions = ask([
    { group: t('squad', 'Team'), fields: [
      { key: 'team', label: t('squad', 'Team'), options: [
        { v: 'none', l: t('new_agent.team_none', 'No team (rōnin)'), sub: t('new_agent.team_none_sub', 'Ordinary, not a gap.') },
        { v: 'current', l: t('new_agent.team_current', 'Current team'), sub: t('new_agent.team_current_sub', 'Choose from your teams.') },
        { v: 'new', l: t('new_agent.team_new', 'New team'), sub: t('new_agent.team_new_sub', 'Created first, then this Agent is born into it.'), row: () => newTeamField(), required: true,
          invalid: () => (draft.newTeam && !isValidTeamName(draft.newTeam) ? t('new_team.name_invalid', 'Lowercase letters, digits, _ and - only.') : '') },
      ], then: [
        { when: 'current', key: 'teamName', label: t('new_agent.which_team', 'Which team'), options: teamRows },
      ] },
    ] },
  ], {
    value: { team: teamChoice(), teamName: draft.team },
    className: 'na-team-questions',
    density: 'tight',
    trayHost: identityRow,
    onChange: onQuestionChange,
  });
  const syncQuestions = () => {
    questions.set({ provider: draft.provider, model: draft.model, reach: draft.reach, recruit: draft.recruit, output: draft.output, teamLead: draft.teamLead, root: draft.root, repos: draft.repos || [], launchMode: draft.launchMode });
    teamQuestions.set({ team: teamChoice(), teamName: draft.team });
  };
  void loadProviderCatalog().then(() => questions.paint());
  const unsubscribeProviderCatalog = subscribeProviderCatalog(() => questions.paint());

  /* ---- 7 · Loadout ---- */
  const stepLoadout = createStep({ n: 7, key: 'loadout', title: t('behaviours', 'Behaviors'), onToggle: () => toggle('loadout') });
  const behaviourRows = () => seed?.behaviours || [];
  const shelvesHost = el('div', 'na-behaviour-sections');
  function paintShelves() {
    const general = behaviourRows().filter((row) => row.scope === 'selected' && row.available === true && !row.installation);
    const automatic = behaviourRows().filter((row) => row.scope === 'floor');
    const conditional = behaviourRows().filter((row) => row.scope === 'conditional');
    const row = (item, availability = '') => ({
      v: item.name || '+', l: item.label || item.name,
      sub: typeof availability === 'object' && Object.hasOwn(availability, 'sub') ? availability.sub : item.blurb || '', read: item.reading,
      view: item.name ? { name: item.name, scope: item.scope } : null,
      off: typeof availability === 'string' ? availability : availability.off || '',
      disabled: typeof availability === 'object' && availability.disabled === true,
    });
    const picker = ask([{ group: t('behaviours.available', 'Optional'), fields: [{
      key: 'behaviours', label: t('behaviours', 'Behaviours'), many: true, shape: 'tall',
      options: [
        ...general.map((item) => row(item, item.required ? t('team_config.required', 'Required for each new Agent') : '')),
        ...(openBehaviours ? [{ v: '@customize', l: t('behaviours.customize', 'Customize Behaviors'), action: () => openBehaviours() }] : []),
      ],
    }] }], { value: { behaviours: draft.books }, density: 'tight', exposed: true, onChange: (value) => {
      draft.books = [...value.behaviours]; touched.books = true; paintFoot();
    } });
    const readonly = (label, key, rows, reason) => ask([{ group: label, fields: [{ key, label, many: true, shape: 'tall', options: rows.map((item) => row(item, reason(item))) }] }], { value: { [key]: [] }, className: 'na-behaviour-readonly', density: 'tight', exposed: true });
    const auto = readonly(`${t('behaviours.auto', 'All Cowork Agents')} (${t('behaviours.auto_included', 'All Ronin Agents include these')})`, 'automatic', automatic,
      () => ({ disabled: true, sub: '' }));
    const conditions = readonly(t('behaviours.conditional', 'Conditional'), 'conditional', conditional, () => ({ disabled: true, sub: '' }));
    const autoSection = el('div', 'na-behaviour-section');
    autoSection.append(auto.el, el('p', 'na-behaviour-note', t('behaviours.bare_metal_excludes', 'Exclude by using a bare metal Agent.')));
    shelvesHost.replaceChildren(picker.el, autoSection, conditions.el);
  }
  stepLoadout.body.append(el('p', 'na-behaviour-intro', t('behaviours.intro', 'Behaviors are specific guidance given to Agents at birth.')), shelvesHost);

  /* ---- the plan: which steps exist for this type and door ---- */
  const steps = {
    kind: stepKind, type: stepType, top: stepTop, loadout: stepLoadout,
  };
  const plan = () => draft.type === 'cowork_agent' ? ['type', 'top', 'loadout'] : ['type', 'top'];
  const FOLDS = ['loadout'];
  function toggle(key) {
    if (draft.expanded[key]) delete draft.expanded[key];
    else draft.expanded[key] = true;
    paintFolds();
  }
  function paintFolds() {
    const templateFolded = isCowork() && !!templateRow();
    for (const key of FOLDS) {
      const folded = key === 'loadout' || templateFolded;
      steps[key].setCollapsed(folded && !draft.expanded[key], null, folded);
    }
  }

  /* ---- Will be born ---- */
  const foot = el('div', 'ntf-foot');
  function bornRows() {
    const typeRow = TYPES().find((type) => type.key === draft.type);
    const rows = [
      [t('new_agent.session', 'session'), typeRow?.label || draft.type],
      [t('add_agent.name', 'name'), draft.name],
      [t('squad', 'Team'), draft.teamMode === 'none' || !chosenTeam() ? '' : chosenTeam() + (draft.teamMode === 'new' ? `  ${t('new_agent.created_first', '(created first)')}` : '')],
    ];
    if (isCowork()) {
      rows.push([t('mandate', 'Mandate'), `${draft.reach} · ${draft.recruit} · ${draft.output.join(', ')}`]);
      rows.push([t('new_agent.make_team_lead', 'Make team lead'), draft.teamLead ? t('forms.on', 'On') : t('forms.off', 'Off')]);
    }
    if (isCowork() && draft.books.length) rows.push([t('behaviours', 'Behaviours'), tagRow(draft.books.map((text) => ({ text, on: true })))]);
    rows.push([t('launch_mode.head', 'launch mode'), launchModes().find((row) => row.v === draft.launchMode)?.l || draft.launchMode]);
    rows.push([t('add_agent.place', 'place'), draft.root]);
    if (hasAgent()) rows.push([t('forms.model', 'model'), draft.provider ? `${draft.provider}${draft.model ? ` / ${modelLabel(draft)}` : ''}` : t('forms.default', 'default')]);
    return rows;
  }
  function paintFoot() {
    foot.replaceChildren(readingRows(bornRows()));
    foot.append(el('p', 'na-note', t('new_agent.blank_note', 'A blank field is an answer, not a gap.')));
  }

  /* ---- the conditional save ---- */
  const saveName = el('input', 'ntf-tmplname');
  saveName.type = 'text';
  saveName.spellcheck = false;
  saveName.autocapitalize = 'off';
  saveName.placeholder = t('new_team.save_name_placeholder', 'template name');
  saveName.addEventListener('input', () => {
    draft.templateName = saveName.value;
    save.setDisabled(!saveName.value.trim());
  });
  const save = createAction({ label: t('save_template', 'Save as template'), disabled: true, action: () => void doSave() });
  const actions = createActionBar({ label: t('add_agent.actions', 'Launch actions'), className: 'ntf-actions' });
  actions.el.append(saveName, save.el);
  function paintActions() {
    // The button says what the press will DO: with the name blank there is no team to
    // create, so it must not promise one.
    const ready = !!draft.name.trim() && (draft.teamMode !== 'new' || isValidTeamName(chosenTeam()));
    start.setDisabled(!ready);
    if (ready) start.el.dataset.kind = 'primary';
    else delete start.el.dataset.kind;
    const offer = isCowork() && (!templateRow() || templateDirty());
    saveName.hidden = !offer;
    save.el.hidden = !offer;
    save.el.textContent = !templateRow() ? t('save_template', 'Save as template') : t('new_team.save_as_new', 'Save as new template');
  }

  function clearAfterLaunch() {
    Object.assign(draft, freshDraft());
    for (const key of Object.keys(touched)) touched[key] = false;
    seed = null;
    loaded = false;
    snapshot = '';
    templateMode = false;
    nameInput.value = '';
    instructionsInput.value = '';
    paint();
  }

  async function doStart() {
    if (busy) return;
    const launchTab = connect ? null : reserveWorkspaceTab();
    const name = draft.name.trim();
    busy = true;
    start.setDisabled(true);
    notice.set('info', t('add_agent.starting', 'Starting…'));
    // A NEW TEAM IS TWO IDEMPOTENT DOORS (§ 7.5): write the record, then launch into it.
    let team = chosenTeam();
    if (draft.teamMode === 'new') {
      if (!isValidTeamName(team)) {
        if (launchTab) closeWorkspaceTab(launchTab);
        busy = false;
        start.setDisabled(false);
        notice.set('failed', t('new_team.name_invalid', 'Lowercase letters, digits, _ and - only.'));
        return;
      }
      const made = await request('/api/team-rosters', {
        method: 'POST',
        json: { name: team },
      });
      if (!made.ok) {
        if (launchTab) closeWorkspaceTab(launchTab);
        busy = false;
        start.setDisabled(false);
        notice.set('failed', made.message);
        return;
      }
    }
    // ONLY THE § 7.4 BODY, by type — the route refuses the rest by name.
    const body = draft.type === 'terminal'
      ? { session_type: 'terminal', name, team }
      : draft.type === 'bare_metal_agent'
        ? { session_type: 'bare_metal_agent', name, team, project_root: draft.root, instructions: draft.instructions.trim(), provider: draft.provider, model: draft.model, launch_mode: draft.launchMode }
        : {
          session_type: 'cowork_agent', name, team, project_root: draft.root,
          instructions: draft.instructions.trim(), provider: draft.provider, model: draft.model,
          ...coworkWorkspacePayload(draft.repos),
          mandate: { reach: draft.reach, recruit: draft.recruit, output: draft.output },
          team_lead: draft.teamLead,
          behaviours: [...draft.books],
          launch_mode: draft.launchMode,
          ...(draft.template ? { template: draft.template } : {}),
        };
    const result = await request('/api/launch', { method: 'POST', json: body });
    busy = false;
    start.setDisabled(false);
    if (!result.ok) {
      if (launchTab) closeWorkspaceTab(launchTab);
      notice.set('failed', result.message);
      return;
    }
    const born = result.data?.name || name;
    const deskNote = result.data?.receipt?.desk_note || '';
    if (deskNote) notice.set('warning', t('add_agent.started_note', 'Started {name} — {note}', { name: born, note: deskNote }));
    else notice.set('success', t('add_agent.started', 'Started {name}', { name: born }));
    if (connect) await connect(born);
    else openLaunchHandoff({ team, sessions: [{ name: born, team_lead: body.team_lead === true }] }, launchTab);
    clearAfterLaunch();
    await consumed?.();
  }

  async function doSave() {
    const token = draft.templateName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!token) return;
    // templates are two shelves with two doors. This form only ever reads or writes the
    // agent one — a cast belongs to a Team and means nothing to a single launch.
    const result = await request('/api/templates/agents', {
      method: 'POST',
      json: {
        name: token,
        label: draft.templateName.trim(),
        art: templateRow()?.art || '＋',
        blurb: draft.instructions.trim().slice(0, 120),
        kinds: draft.kind === 'open' ? ['coding', 'work', 'personal', 'household', 'social', 'school'] : [draft.kind],
        brief: draft.instructions.trim(),
        mandate: `${draft.reach} · ${draft.recruit} · ${draft.output.join(', ')}`,
        team_mode: draft.teamMode === 'new' ? 'new' : '',
        behaviours: draft.books,
        // THE SWITCHES A LOADOUT IS MEANT TO CARRY. `TemplateBoxSave` stores these
        // (@template_shelves measured `boxTail` writing all three) and this form was
        // sending only `behaviours`, so a saved Personal Assistant lost its gbrain.
        //
      },
    });
    if (!result.ok) return notice.set('failed', result.message);
    notice.set('success', t('new_team.saved_template', 'Saved template {name}', { name: token }));
    templates = [...templates, result.data.template];
    draft.templateName = '';
    saveName.value = '';
    save.setDisabled(true);
    paintTray();
  }

  /** The level above answers — the team's when one is chosen, the campaign's otherwise —
   *  and lands only on fields no hand has touched. */
  async function loadSeed() {
    const team = draft.teamMode === 'existing' ? draft.team : '';
    const answer = await request(`/api/launch-seed${team ? `?team=${encodeURIComponent(team)}` : ''}`);
    if (!answer.ok) return;
    seed = answer.data || null;
    const value = (field) => seed?.seeds?.[field]?.value;
    // Blank means inherit the resolved provider/model. The launcher says Default until the
    // owner deliberately overrides either choice.
    if (!touched.root && value('project_root')) draft.root = value('project_root');
    if (!touched.repos) {
      const selected = draft.teamMode === 'existing' ? teams.find((row) => row.name === draft.team) : null;
      draft.repos = workspaceRepos({ root: draft.root, teamRepos: selected?.repos || [] });
    }
    if (!touched.mandate) {
      for (const key of ['reach', 'recruit']) if (value(key)) draft[key] = value(key);
      if (value('output')) draft.output = [value('output')].flat().filter(Boolean);
    }
    if (!touched.books && Array.isArray(value('behaviours'))) draft.books = [...value('behaviours')];
    // The campaign's, or the team's if one is joined — an editable value like every other
    if (!touched.launchMode && value('launch_mode')) draft.launchMode = value('launch_mode');
    if (!draft.kindTouched && team && value('kind')) draft.kind = value('kind');
    syncQuestions();
    paintKinds();
    paintTray();
    paintShelves();
    paintFolds();
    paintFoot();
  }
  const refreshBehaviours = async () => {
    const team = draft.teamMode === 'existing' ? draft.team : '';
    const result = await request(`/api/launch-seed${team ? `?team=${encodeURIComponent(team)}` : ''}`);
    if (!result.ok || !seed) return;
    seed = { ...seed, behaviours: result.data?.behaviours || [] };
    paintShelves();
  };
  window.addEventListener('ronin:behaviours-changed', refreshBehaviours);

  function paint() {
    const order = plan();
    for (const [key, step] of Object.entries(steps)) step.el.hidden = !order.includes(key);
    order.forEach((key, index) => steps[key].setNumber(index + 1));
    stepPayload.setNumber(order.length + 1);
    stepPayload.el.hidden = draft.type === 'terminal';
    stepTop.el.querySelector('h3').textContent = hasAgent() ? t('new_agent.agent_body', 'Agent') : t('new_agent.name_required_step', 'Name · required');
    questions.show(draft.type === 'terminal' ? [] : draft.type === 'bare_metal_agent' ? ['provider', 'model', 'root', 'launchMode'] : null);
    teamQuestions.show(isCowork() ? null : ['team']);
    teamQuestions.el.hidden = false;
    questions.el.hidden = draft.type === 'terminal';
    defaultsNote.hidden = draft.type === 'terminal';
    instructionsField.hidden = !hasAgent();
    paintTypes();
    paintLeanNote();
    paintKinds();
    paintTray();
    syncQuestions();
    paintDefaultsNote();
    paintShelves();
    paintFolds();
    paintActions();
    paintFoot();
  }

  // a band of its own rather than trailing off the end of a long form.
  let payloadOpen = false;
  const stepPayload = createStep({ n: 8, key: 'payload', title: t('forms.payload', 'Payload'), onToggle: () => {
    payloadOpen = !payloadOpen;
    stepPayload.setCollapsed(!payloadOpen, null, true);
  } });
  stepPayload.body.append(foot, actions.el);
  stepPayload.setCollapsed(true, null, true);
  identityRow.append(nameField, teamQuestions.el);
  stepTop.body.replaceChildren(identityRow, questions.el, defaultsNote, instructionsField);
  const form = el('div', 'ntf-form');
  form.append(stepType.el, stepTop.el, stepLoadout.el, stepPayload.el);
  // Save as template sits UNDER the reading, for the same reason as on New Team: the
  // reading is the packet, and the button saves the packet.
  surface.content.append(form, notice.el);

  const seedPrompt = (prompt) => {
    if (!prompt) return;
    draft.instructions = prompt;
    instructionsInput.value = prompt;
  };

  return {
    el: embedded ? surface.content : surface.el,
    enter: async (detail = {}) => {
      const entryTeam = typeof team === 'function' ? team() : team;
      if (entryTeam) { draft.teamMode = 'existing'; draft.team = entryTeam; }
      paint();
      const [tray, teamRows, rootRows] = await Promise.all([
        request('/api/templates/agents'),
        request('/api/team-rosters'),
        request('/api/project-roots/detail'),
      ]);
      templates = tray.ok && Array.isArray(tray.data) ? tray.data : [];
      teams = teamRows.ok && Array.isArray(teamRows.data) ? teamRows.data.filter((row) => row.state !== 'archived') : [];
      roots = rootRows.ok && Array.isArray(rootRows.data?.roots) ? rootRows.data.roots.filter((row) => !row.archived) : [];
      if (!loaded) { await loadSeed(); loaded = true; }
      if (typeof detail?.template === 'string' && detail.template) {
        const entry = templateEntryPlan({ currentKind: draft.kind, kindTouched: draft.kindTouched, templates, template: detail.template });
        draft.kind = entry.kind;
        if (entry.template) applyTemplate(entry.template);
      }
      seedPrompt(typeof detail?.prompt === 'string' ? detail.prompt.trim() : '');
      paint();
    },
    destroy: () => {
      window.removeEventListener('ronin:behaviours-changed', refreshBehaviours);
      unsubscribeProviderCatalog();
      questions.destroy();
      teamQuestions.destroy();
    },
  };
}

/** Form-only adapter for an existing work-surface detail region. */
export function createEmbeddedNewAgentView(kit, options = {}) {
  return createNewAgentView(kit, { ...options, embedded: true });
}
