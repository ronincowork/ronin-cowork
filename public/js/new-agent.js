/* part of the ronin-cowork client — see js/README.md */
/** NEW AGENT — the sole drawn launch form. Session type decides which questions exist;
 * only a Cowork Agent has a mandate and loadout. Defaults arrive through
 * `GET /api/launch-seed?team=` and land until the user's hand changes them. The Behaviors
 * step is brief-step.js: this Agent's own brief settings, integrations and project
 * management, and what comes with it as the server works it out (docs/architecture/brief.md, Where it is set in the UI). */
import { store } from './store.js';
import { gatewayBlockWord, modelSettingsLink, shownInNewAgent } from './harness-model-entries.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { finalizeTeamName, isValidTeamName, sanitizeTeamName } from './new-team-draft.js';
import {
  createStep, el, loadHarnessCatalog, modelLabel, harnessCatalog, readingRows, rowTierWord, tagRow,
} from './form-steps.js';
import { openLaunchHandoff } from './launch-handoff.js';
import { mandateRows, setMandates } from './mandates.js';
import { briefValue, emptyBriefValue, paintBriefForm } from './brief-step.js';
import { closeWorkspaceTab, reserveWorkspaceTab, workbenchLaunchUrl, workbenchLink } from './workspace.js';


export function createNewAgentView(kit, { connect = null, consumed = null, embedded = false, team = null, configure = null, openTeamDefaults = null, openDeskDefaults = null, openBehaviours = null, teamDefaultsSpec = null, deskDefaultsSpec = null } = {}) {
  const { createSurface, createAction, createField, createNotice } = kit.primitives;

  const freshDraft = () => {
    const entryTeam = typeof team === 'function' ? team() : team;
    return {
      type: 'cowork_agent',
      name: '', provider: '', model: '', instructions: '',
      teamMode: entryTeam ? 'existing' : 'none', team: entryTeam || '', newTeam: '',
      reach: 'open', recruit: 'open', output: ['open'],
      role: 'coworker',
      setting: emptyBriefValue(), // { brief: { add, block, only }, integrations, pm? } — this Agent's own
      expanded: {},
    };
  };
  const draft = freshDraft();
  let seed = null;
  let catalog = [];
  let preview = null; // the server's answer: { in_play, integrations, pm }
  let previewAsked = 0;
  let teams = [];
  let busy = false;
  let loaded = false;
  let configured = '';
  const touched = { mandate: false, model: false };

  const start = createAction({
    label: configure ? t('agent_composition.send', 'Send') : t('forms.launch', 'Launch'),
    launch: true,
    size: 'compact',
    disabled: true,
    endsEdit: true, // Send / Launch: the edit is over, and a held row lands (the kit's editHold)
    action: () => void (configure ? doSend() : doStart()),
  });
  const surface = createSurface({ label: configure ? t('me.configuration', 'Configuration') : t('new_agent.title', 'New Agent'), className: 'na-surface', actions: [start], header: !embedded });
  surface.header?.el.classList.add('launch-form-head'); // the form's own head, sticky (launch-forms.css)
  const notice = createNotice();
  if (embedded && !configure) {
    surface.content.classList.add('na-surface', 'launch-form-embed');
    const embedActions = el('div', 'launch-form-embed-actions');
    embedActions.append(start.el);
    surface.content.append(embedActions);
  }
  const isCowork = () => draft.type === 'cowork_agent';
  const hasAgent = () => draft.type !== 'terminal';
  const chosenTeam = () => (draft.teamMode === 'existing' ? draft.team : draft.teamMode === 'new' ? finalizeTeamName(draft.newTeam) : '');

  /* ---- 2 · Session type ---- */
  const stepType = createStep({ n: 2, key: 'type', title: t('new_agent.session_type_step', 'Session type') });
  const typeHost = el('div', 'fs-pair');
  const TYPES = () => [
    { key: 'cowork_agent', label: t('new_agent.type_cowork', 'Cowork Agent'), sub: t('new_agent.type_cowork_sub', 'Born with Ronin capabilities, behaviors, and assigned Team.') },
    { key: 'bare_metal_agent', label: t('new_agent.type_bare', 'Bare-metal Agent'), sub: t('new_agent.type_bare_sub', 'The harness’s agent and nothing else from Ronin.') },
    { key: 'terminal', label: t('new_agent.type_terminal', 'Terminal'), sub: t('new_agent.type_terminal_sub', 'A raw tmux pane, no agent launched, and nothing sent to it.') },
  ];
  function paintTypes() {
    typeHost.replaceChildren();
    for (const type of TYPES().filter((row) => !configure || row.key === draft.type)) {
      const box = el('button', 'fs-way');
      box.type = 'button';
      box.disabled = !!configure;
      box.setAttribute('aria-pressed', String(draft.type === type.key));
      box.append(el('b', null, type.label), el('small', null, type.sub));
      box.addEventListener('click', () => {
        draft.type = type.key;
        paint();
        void loadPreview();
      });
      typeHost.append(box);
    }
  }
  stepType.body.append(typeHost);

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
    const clean = configure ? nameInput.value : nameInput.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
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
    leanNote.textContent = t('new_agent.bare_note', 'A bare-metal Agent takes no mandate and no loadout.');
  }
  const topLeft = el('div', 'aa-col');
  const name = createField({ label: configure ? t('agent_composition.agent_title', 'Title') : t('new_agent.name_required', 'Name · required'), control: nameInput });
  const nameField = name.el;
  nameField.classList.add('na-name-required');
  name.label.classList.add('na-name-label');
  nameInput.classList.add('na-name-input');
  topLeft.append(nameField, leanNote);
  stepTop.body.append(topLeft);

  const agentIdentity = ask([{ fields: [{
    key: 'agentId', label: t('add_agent.name', 'Name'), fixed: true,
    options: [{ v: configure || '', l: configure || '' }],
  }] }], { value: { agentId: configure || '' }, className: 'na-agent-identity', density: 'tight' });

  const instructionsInput = el('textarea');
  instructionsInput.classList.add('wk-field-control');
  instructionsInput.rows = 6;
  instructionsInput.autocapitalize = 'off';
  instructionsInput.spellcheck = false;
  instructionsInput.placeholder = t('add_agent.instruction_placeholder', 'what this Agent should do');
  instructionsInput.addEventListener('input', () => {
    draft.instructions = instructionsInput.value;
    paintFoot();
    paintActions();
  });
  const instructionsField = createField({ label: configure ? t('agent_composition.objective', 'Objective') : t('new_agent.instructions', 'Instructions'), control: instructionsInput }).el;
  instructionsField.classList.add('na-field');
  stepTop.body.append(instructionsField);

  /* ---- The one question utility: Model, Mandate, Team, and Where it works. ---- */
  const harnessRows = () => harnessCatalog().harnesses.map(entry => ({
    v: entry.provider, l: entry.cli_label || entry.label,
    off: entry.operational ? undefined : entry.off ? t('forms.reason_turned_off', 'turned off') : t('forms.reason_not_on_machine', 'not on this machine'),
  }));
  const modelRows = ({ provider }) => {
    const catalog = harnessCatalog();
    const entry = catalog.harnesses.find(item => item.provider === provider);
    return (entry?.models || []).filter(row => configure || shownInNewAgent(catalog, entry, row))
      .map(row => ({ v: row.model, l: modelLabel(row), word: row.service_name || rowTierWord(row),
        off: row.selectable ? undefined : gatewayBlockWord(row.blocked) || t('forms.reason_not_on_machine', 'not on this machine'),
      }));
  };
  const needsModel = () => {
    if (configure || !hasAgent()) return false;
    const provider = draft.provider || seed?.seeds?.provider?.value;
    if (!provider) return false;
    const model = draft.model || (!draft.provider && seed?.seeds?.model?.value);
    return !modelRows({ provider }).some(row => row.v === model && !row.off);
  };
  const teamChoice = () => draft.teamMode === 'new' ? 'new' : draft.teamMode === 'none' ? 'none' : 'current';
  const teamRows = () => teams.map((row) => ({ v: row.name, l: String(row.title ?? '').trim() || row.name, sub: row.name }));
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
  // A defaults link hovers as its plain address; the launch state is made at the press (KAN-473).
  const defaultsLink = (label, spec, open) => {
    const link = workbenchLink(el('a', null, label), spec);
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (open) open(); else location.assign(workbenchLaunchUrl(spec));
    });
    return link;
  };
  const paintDefaultsNote = () => {
    defaultsNote.replaceChildren();
    const hasTeam = draft.teamMode !== 'none';
    const teaching = el('p', null, hasTeam
      ? t('new_agent.defaults_cascade_team', 'Defaults cascade from Desk → Workspace → Team → this Agent. Changes on this form apply only to this Agent.')
      : t('new_agent.defaults_cascade_desk', 'Defaults cascade from Desk → this Agent. Changes on this form apply only to this Agent.'));
    const links = el('p', 'na-defaults-links');
    if (hasTeam && chosenTeam()) links.append(defaultsLink(t('new_agent.team_defaults', 'Team defaults'),
      teamDefaultsSpec?.(chosenTeam()) || { destination: 'team', param: chosenTeam(), mode: 'overlay' },
      openTeamDefaults ? () => openTeamDefaults(chosenTeam()) : null), ' · ');
    links.append(defaultsLink(t('new_agent.desk_defaults', 'Desk defaults'),
      deskDefaultsSpec?.() || { destination: 'settings2', mode: 'overlay', state: { count: 1, selected: 'workspace1', seats: { workspace1: 'settings2.agent-defaults' } } }, openDeskDefaults));
    if (!configure && hasAgent()) {
      const entry = harnessCatalog().harnesses.find(row => row.provider === (draft.provider || seed?.seeds?.provider?.value));
      links.append(' · ', modelSettingsLink(entry?.cli));
    }
    defaultsNote.append(teaching, links);
  };
  const onQuestionChange = (value, key) => {
    if ('provider' in value) {
      draft.provider = value.provider; draft.model = key === 'provider' ? '' : value.model;
      if (key === 'provider' && value.model) questions.set('model', '');
    }
    if ('reach' in value) { draft.reach = value.reach; draft.recruit = value.recruit; draft.output = value.output; }
    if ('role' in value) draft.role = value.role;
    if (key === 'role' && !configure) void loadSeed();
    if (key === 'provider' || key === 'model') touched.model = true;
    if (['reach', 'recruit', 'output'].includes(key)) touched.mandate = true;
    if (key === 'team' || key === 'teamName') {
      draft.teamMode = value.team === 'new' ? 'new' : value.team === 'none' ? 'none' : 'existing';
      draft.team = draft.teamMode === 'existing' ? value.teamName : '';
      if (!configure) void loadSeed();
    }
    if (['role', 'team', 'teamName'].includes(key)) void loadPreview();
    paintDefaultsNote(); paintFoot(); paintActions();
  };
  /** What Default launches (Models > Defaults: a Team lead's own pair when the seed was read for one). */
  const defaultWord = () => {
    const provider = seed?.seeds?.provider?.value || ''; const model = seed?.seeds?.model?.value || '';
    const row = harnessCatalog().rows.find((item) => item.provider === provider && item.model === model);
    if (row && !modelRows({ provider }).some(option => option.v === model)) return t('new_agent.choose_harness', 'Choose harness');
    const named = row ? modelLabel(row) : model || harnessCatalog().harnesses.find((item) => item.provider === provider)?.label || '';
    return named ? t('new_agent.default_named', 'Default · {model}', { model: named }) : t('forms.default', 'Default');
  };
  const questions = ask([
    { group: t('new_agent.model_package', 'Model'), fields: [
      { key: 'provider', label: t('forms.provider', 'Harness'), blank: defaultWord, options: harnessRows, fixed: !!configure },
      { key: 'model', shape: 'rect', label: t('forms.model', 'Model'), blank: () => draft.provider ? t('new_agent.choose_model', 'Choose model') : defaultWord(), after: 'provider', empty: () => draft.provider ? 'No model entries selected for this harness.' : '', options: modelRows, fixed: !!configure },
      { key: 'role', label: t('agent_composition.role', 'Role'), options: [
        { v: 'coworker', l: 'Coworker' }, { v: 'lead', l: 'Lead' }, { v: 'epic_lead', l: 'Epic Lead' }, { v: 'coordinator', l: 'Coordinator' },
      ] },
    ] },
    { group: t('mandate', 'Mandate'), fields: [
      { key: 'reach', label: t('reach', 'Reach'), options: () => mandateRows('reach', { block: preview?.off || [] }) },
      { key: 'recruit', label: t('recruit', 'Recruit'), options: () => mandateRows('recruit', { block: preview?.off || [] }) },
      { key: 'output', label: t('output', 'Output'), many: true, options: () => mandateRows('output', { block: preview?.off || [] }) },
    ] },
  ], {
    value: { provider: draft.provider, model: draft.model, reach: draft.reach, recruit: draft.recruit, output: draft.output, role: draft.role},
    className: 'na-questions',
    density: 'tight',
    onChange: onQuestionChange,
  });
  const teamQuestions = ask([
    { group: t('squad', 'Team'), fields: [
      { key: 'team', label: t('squad', 'Team'), options: [
        { v: 'none', l: t('new_agent.team_none', 'No team (rōnin)'), sub: t('new_agent.team_none_sub', 'Ordinary, not a gap.') },
        { v: 'current', l: t('new_agent.team_current', 'Current team'), sub: t('new_agent.team_current_sub', 'Choose from your teams.') },
        ...(!configure ? [{ v: 'new', l: t('new_agent.team_new', 'New team'), sub: t('new_agent.team_new_sub', 'Created first, then this Agent is born into it.'), row: () => newTeamField(), required: true,
          invalid: () => (draft.newTeam && !isValidTeamName(draft.newTeam) ? t('new_team.name_invalid', 'Lowercase letters, digits, _ and - only.') : '') },
        ] : []),
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
    questions.set({ provider: draft.provider, model: draft.model, reach: draft.reach, recruit: draft.recruit, output: draft.output, role: draft.role});
    teamQuestions.set({ team: teamChoice(), teamName: draft.team });
  };
  const refreshModels = () => loadHarnessCatalog().then(() => {
    if (!configure && draft.model && !modelRows(draft).some(row => row.v === draft.model)) {
      draft.model = '';
      questions.set('model', '');
    }
    questions.paint();
    paintDefaultsNote();
    paintFoot();
    paintActions();
  });
  const forgetModels = store.listen('model-services-changed', refreshModels);
  void refreshModels();

  /* ---- 7 · Loadout ---- */
  const stepLoadout = createStep({ n: 7, key: 'loadout', title: t('behaviours', 'Behaviors'), onToggle: () => toggle('loadout') });
  const shelvesHost = el('div', 'na-behaviour-sections');
  let briefForm = null;
  function paintBehaviourShelves() {
    briefForm?.destroy();
    briefForm = paintBriefForm(shelvesHost, {
      layer: 'agent', catalog, value: draft.setting, above: { integrations: preview?.integrations, off: preview?.integrations_off, pm: preview?.pm, available: preview?.available }, inPlay: preview?.in_play || [],
      openBehaviours: configure ? null : openBehaviours,
      onChange: (setting) => { draft.setting = setting; paintFoot(); paintActions(); void loadPreview(); },
    });
  }
  /** What comes with this Agent, as the server works it out from the draft (it fills in what it knows itself). */
  async function loadPreview() {
    const asked = ++previewAsked;
    const result = await request('/api/brief/preview', { method: 'POST', json: {
      type: draft.type, team: chosenTeam(), role: draft.role,
      ...(configure ? { name: configure } : {}), ...draft.setting,
    } });
    if (asked !== previewAsked || !result.ok) return;
    preview = result.data || null;
    paintBehaviourShelves();
    questions.paint(); // the mandate menus, less what the layers in play block
  }
  async function loadCatalog() {
    const result = await request('/api/brief/catalog');
    catalog = result.ok && Array.isArray(result.data) ? result.data : [];
    setMandates(catalog); // the mandate menus are the catalog's mandate files (mandates.js)
  }
  stepLoadout.body.append(el('p', 'na-behaviour-intro', t('brief.intro', 'What this Agent is told: the integrations it works with, the behaviors you add, and what comes with its situation.')), shelvesHost);

  /* ---- the plan: which steps exist for this type and door ---- */
  const steps = {
    type: stepType, top: stepTop, loadout: stepLoadout,
  };
  const plan = () => draft.type === 'cowork_agent' ? ['type', 'top', 'loadout'] : ['type', 'top'];
  const FOLDS = ['loadout'];
  function toggle(key) {
    if (draft.expanded[key]) delete draft.expanded[key];
    else draft.expanded[key] = true;
    paintFolds();
  }
  function paintFolds() {
    for (const key of FOLDS) steps[key].setCollapsed(!draft.expanded[key], null, true);
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
      rows.push([t('agent_composition.role', 'Role'), draft.role]);
    }
    const added = draft.setting.brief.add;
    if (isCowork() && added.length) rows.push([t('behaviours', 'Behaviours'), tagRow(added.map((row) => ({ text: row.name, on: true })))]);
    if (hasAgent()) rows.push([t('forms.model', 'Model'), draft.provider ? `${draft.provider}${draft.model ? ` / ${modelLabel(draft)}` : ''}` : defaultWord()]);
    return rows;
  }
  function paintFoot() {
    foot.replaceChildren(readingRows(bornRows()));
    foot.append(el('p', 'na-note', t('new_agent.blank_note', 'A blank field is an answer, not a gap.')));
  }

  function paintActions() {
    // The button says what the press will DO: with the name blank there is no team to
    // create, so it must not promise one.
    // Send can always be pressed; a change only highlights it (the server sends what changed).
    const ready = configure ? JSON.stringify(configurationValue()) !== configured : !!draft.name.trim() && (draft.teamMode !== 'new' || isValidTeamName(chosenTeam()));
    start.setDisabled(busy || (configure ? !loaded : !ready || needsModel()));
    if (ready) start.el.dataset.kind = 'primary';
    else delete start.el.dataset.kind;
  }

  const configurationValue = () => ({
    objective: draft.instructions.trim(), title: draft.name.trim(), role: draft.role, team: chosenTeam(),
    mandate: { reach: draft.reach, recruit: draft.recruit, output: draft.output }, ...draft.setting,
  });

  // The press shows at once: Send turns green and says Sending… until the brief is out.
  function sending(on) {
    if (on) start.el.dataset.busy = 'true';
    else delete start.el.dataset.busy;
    start.el.lastChild.textContent = on ? t('agent_composition.sending', 'Sending…') : t('agent_composition.send', 'Send');
  }

  async function doSend() {
    if (busy) return;
    busy = true; start.setDisabled(true); sending(true); notice.set('', '');
    const result = await request(`/api/sessions/${encodeURIComponent(configure)}/configuration`, { method: 'PUT', json: configurationValue() });
    busy = false; sending(false);
    if (!result.ok) { notice.set('failed', result.message); paintActions(); return; }
    configured = JSON.stringify(configurationValue()); paintActions();
    // The server sends only what changed in the brief (sent: false when nothing did).
    notice.set('success', result.data?.sent === false ? t('agent_composition.unchanged', 'Its brief is unchanged: nothing was sent.') : t('agent_composition.updated', 'The Agent has been sent its new brief.'));
  }

  function clearAfterLaunch() {
    Object.assign(draft, freshDraft());
    for (const key of Object.keys(touched)) touched[key] = false;
    seed = null;
    loaded = false;
    nameInput.value = '';
    instructionsInput.value = '';
    paint();
  }

  // THE AGENT IS BEING BUILT (KAN-89). A launch cuts a workspace, compiles a brief and starts
  // a CLI, which takes seconds; a small Starting… under the form said none of that. The press
  // goes busy at once, like Send, and the form steps back under the transcript's working dots.
  const building = el('div', 'tile-transcript-stance na-building');
  building.setAttribute('aria-live', 'polite');
  building.hidden = true;
  function built(name) {
    if (name) start.el.dataset.busy = 'true';
    else delete start.el.dataset.busy;
    start.el.lastChild.textContent = name ? t('add_agent.building_button', 'Building…') : t('forms.launch', 'Launch');
    form.inert = !!name;
    building.hidden = !name;
    if (!name) return;
    const words = t('add_agent.building', 'Building {name}: its workspace, its brief, then its CLI', { name });
    building.replaceChildren(...[0, 1, 2].map(() => document.createElement('i')), words);
    building.setAttribute('aria-label', words);
    building.scrollIntoView?.({ block: 'nearest' });
  }

  async function doStart() {
    if (busy || needsModel()) return;
    const launchTab = connect ? null : reserveWorkspaceTab();
    const name = draft.name.trim();
    busy = true;
    start.setDisabled(true);
    notice.set('', '');
    built(name);
    // A NEW TEAM IS TWO IDEMPOTENT DOORS (§ 7.5): write the record, then launch into it.
    let team = chosenTeam();
    if (draft.teamMode === 'new') {
      if (!isValidTeamName(team)) {
        if (launchTab) closeWorkspaceTab(launchTab);
        busy = false;
        start.setDisabled(false);
        built('');
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
        built('');
        notice.set('failed', made.message);
        return;
      }
    }
    // ONLY THE § 7.4 BODY, by type — the route refuses the rest by name.
    const body = draft.type === 'terminal'
      ? { session_type: 'terminal', name, team }
      : draft.type === 'bare_metal_agent'
        ? { session_type: 'bare_metal_agent', name, team, instructions: draft.instructions.trim(), provider: draft.provider, model: draft.model }
        : {
          session_type: 'cowork_agent', name, team,
          instructions: draft.instructions.trim(), provider: draft.provider, model: draft.model,
          mandate: { reach: draft.reach, recruit: draft.recruit, output: draft.output },
          team_lead: draft.role === 'lead',
          role: draft.role,
          ...draft.setting,
        };
    const result = await request('/api/launch', { method: 'POST', json: body });
    busy = false;
    start.setDisabled(false);
    built('');
    if (!result.ok) {
      if (launchTab) closeWorkspaceTab(launchTab);
      notice.set('failed', result.message);
      return;
    }
    const born = result.data?.name || name;
    notice.set('success', t('add_agent.started', 'Started {name}', { name: born }));
    if (connect) await connect(born);
    else openLaunchHandoff({ team, sessions: [{ name: born, team_lead: body.team_lead === true }] }, launchTab);
    clearAfterLaunch();
    await consumed?.();
  }

  /** The level above answers — the team's when one is chosen, the campaign's otherwise —
   *  and lands only on fields no hand has touched. */
  /** The seed's door: the chosen Team's, and a Team lead's pair when Make team lead is on. */
  const seedUrl = () => {
    const query = new URLSearchParams();
    if (draft.teamMode === 'existing' && draft.team) query.set('team', draft.team);
    if (draft.role === 'lead' && draft.teamMode !== 'none') query.set('lead', '1');
    const text = query.toString();
    return `/api/launch-seed${text ? `?${text}` : ''}`;
  };
  async function loadSeed() {
    const team = draft.teamMode === 'existing' ? draft.team : '';
    const answer = await request(seedUrl());
    if (!answer.ok) return;
    seed = answer.data || null;
    const value = (field) => seed?.seeds?.[field]?.value;
    // Blank means inherit the resolved provider/model. The launcher says Default until the
    // owner deliberately overrides either choice.
    if (!touched.mandate) {
      for (const key of ['reach', 'recruit']) if (value(key)) draft[key] = value(key);
      if (value('output')) draft.output = [value('output')].flat().filter(Boolean);
    }
    syncQuestions();
    paintFolds();
    paintFoot();
    await loadPreview();
  }
  const refreshBehaviours = async () => { await loadCatalog(); await loadPreview(); };
  window.addEventListener('ronin:behaviours-changed', refreshBehaviours);

  function paint() {
    const order = plan();
    for (const [key, step] of Object.entries(steps)) step.el.hidden = !order.includes(key);
    order.forEach((key, index) => steps[key].setNumber(index + 1));
    stepPayload.setNumber(order.length + 1);
    stepPayload.el.hidden = !!configure || draft.type === 'terminal';
    stepTop.el.querySelector('h3').textContent = hasAgent() ? t('new_agent.agent_body', 'Agent') : t('new_agent.name_required_step', 'Name · required');
    if (configure) questions.show(['provider', 'model', 'role', 'reach', 'recruit', 'output']);
    else questions.show(draft.type === 'terminal' ? [] : draft.type === 'bare_metal_agent' ? ['provider', 'model'] : null);
    teamQuestions.show(isCowork() ? null : ['team']);
    teamQuestions.el.hidden = false;
    questions.el.hidden = draft.type === 'terminal';
    if (configure) defaultsNote.hidden = true;
    else defaultsNote.hidden = draft.type === 'terminal';
    instructionsField.hidden = !hasAgent();
    paintTypes();
    paintLeanNote();
    syncQuestions();
    paintDefaultsNote();
    paintBehaviourShelves();
    paintFolds();
    paintActions();
    paintFoot();
  }

  // A band of its own rather than trailing off the end of a long form.
  let payloadOpen = false;
  const stepPayload = createStep({ n: 8, key: 'payload', title: t('forms.payload', 'Payload'), onToggle: () => {
    payloadOpen = !payloadOpen;
    stepPayload.setCollapsed(!payloadOpen, null, true);
  } });
  stepPayload.body.append(foot);
  stepPayload.setCollapsed(true, null, true);
  if (configure) identityRow.append(agentIdentity.el);
  identityRow.append(nameField, teamQuestions.el);
  stepTop.body.replaceChildren(identityRow, questions.el, defaultsNote, instructionsField);
  const form = el('div', 'ntf-form');
  form.append(stepType.el, stepTop.el, stepLoadout.el, stepPayload.el);
  surface.content.append(building, form, notice.el);

  const seedPrompt = (prompt) => {
    if (!prompt) return;
    draft.instructions = prompt;
    instructionsInput.value = prompt;
  };
  async function loadConfiguration() {
    const answer = await request(`/api/sessions/${encodeURIComponent(configure)}/composition`, { cache: 'no-store' });
    if (!answer.ok) return notice.set('failed', answer.message);
    const data = answer.data; const current = data.current;
    draft.type = current.session_type || 'cowork_agent'; draft.name = current.title || configure; nameInput.value = draft.name;
    draft.instructions = current.objective || ''; instructionsInput.value = draft.instructions;
    draft.provider = current.provider || ''; draft.model = current.model || '';
    draft.role = current.role || 'coworker';
    draft.teamMode = current.team ? 'existing' : 'none'; draft.team = current.team || '';
    draft.reach = current.mandate.reach; draft.recruit = current.mandate.recruit; draft.output = [...current.mandate.output];
    draft.setting = briefValue(current);
    teams = data.available_teams || [];
    configured = JSON.stringify(configurationValue()); loaded = true; paint();
    await loadPreview();
  }
  return {
    el: embedded ? surface.content : surface.el,
    enter: async (detail = {}) => {
      if (configure) { await Promise.all([loadHarnessCatalog(), loadCatalog()]); await loadConfiguration(); return; }
      const entryTeam = String(detail?.team || (typeof team === 'function' ? team() : team) || '');
      if (entryTeam) { draft.teamMode = 'existing'; draft.team = entryTeam; }
      if (detail?.teamLead === true) draft.role = 'lead';
      paint();
      const [teamRows] = await Promise.all([
        request('/api/team-rosters'),
        loadCatalog(),
      ]);
      teams = teamRows.ok && Array.isArray(teamRows.data) ? teamRows.data.filter((row) => row.state !== 'archived') : [];
      if (!loaded) { await loadSeed(); loaded = true; }
      seedPrompt(typeof detail?.prompt === 'string' ? detail.prompt.trim() : '');
      paint();
    },
    action: start,
    destroy: () => {
      forgetModels();
      window.removeEventListener('ronin:behaviours-changed', refreshBehaviours);
      questions.destroy();
      teamQuestions.destroy();
      briefForm?.destroy();
      agentIdentity.destroy();
    },
  };
}

/** Form-only adapter for an existing work-surface detail region. */
export function createEmbeddedNewAgentView(kit, options = {}) {
  return createNewAgentView(kit, { ...options, embedded: true });
}
