/* part of the ronin-cowork client — see js/README.md */
/**
 * NEW AGENT — the drawn launch form, and since 2026-08-31 the ONLY one: it was staged
 * beside the ＋ New board, the owner ruled that board obsolete, and `js/launcher.js` is
 * deleted. It seats on the Coworks bench and in the Launch workbench, whose Team | Agent
 * toggle chooses between this and New Team. The drawn contract is ronin-lab
 * `concepts/new-agent-condensed.html` — the density the owner preferred — and the object
 * it produces is `NEW_AGENT.md` § 7.4, nothing more: everything else on the resolved
 * profile is the server's, and a caller that states one is guessing at its job.
 *
 * THE SESSION TYPE DECIDES THE FORM (§ 1.1). A terminal is asked three things because
 * there are only three to ask — the rest is not hidden, it does not exist for that
 * session. A bare-metal Agent adds instructions and a model; only a Cowork Agent has a
 * kind, a template, a mandate and a loadout.
 *
 * TWO DOORS for a Cowork Agent, and the difference is where answers come from, never how
 * much is asked: Manual asks everything and fills nothing in; Template offers the tray,
 * and a pick answers the rest and folds it away — the number, the name and the answer
 * stay on the row, and the header opens it.
 *
 * WHERE THE ANSWERS COME FROM: `GET /api/launch-seed?team=` (CASCADE § 5.1) — the team's
 * answers when one is chosen, the campaign's for a rōnin. A default LANDS and is then
 * yours: joining a team lands its kind, touching the kind by hand stops the team
 * overwriting it. Routines are previewed with provenance and never editable here; the
 * desk is not an asked question anywhere (owner's fold, 2026-08-31) — the routine
 * selection is the decision, and no desk key rides this launch.
 */
import { request } from './request.js';
import { t } from './lexicon.js';
import { finalizeTeamName, isValidTeamName, sanitizeTeamName } from './new-team-draft.js';
import {
  createStep, dialRow, el, kindTiles, providerModelPair, readingRows, tagRow, templateTray,
} from './form-steps.js';

const REACH = ['open', 'discuss', 'plan', 'execute'];
const RECRUIT = ['open', 'nobody', 'propose agents', 'staff agents'];
const OUTPUT = ['open', 'a plan', 'ideas', 'code', 'an artifact', 'the team'];

export function createNewAgentView(kit, { connect = null } = {}) {
  const { createSurface, createAction, createActionBar, createField, createNotice } = kit.primitives;

  const draft = {
    door: 'template', type: 'cowork_agent', template: '', templateName: '',
    name: '', kind: 'coding', kindTouched: false, provider: '', model: '', instructions: '',
    teamMode: 'new', team: '', newTeam: '',
    reach: 'open', recruit: 'open', output: 'open',
    books: [], root: '',
    expanded: {},
  };
  let seed = null;
  let templates = [];
  let sops = [];
  let ways = [];
  let teams = [];
  let roots = [];
  let snapshot = '';
  let busy = false;
  let loaded = false;
  const touched = { mandate: false, model: false, root: false, books: false };

  const surface = createSurface({ label: t('new_agent.title', 'New Agent'), className: 'na-surface' });
  const notice = createNotice();

  const isCowork = () => draft.type === 'cowork_agent';
  const hasAgent = () => draft.type !== 'terminal';
  const templateRow = () => templates.find((row) => row.name === draft.template) || null;
  const offered = () => (draft.kind === 'open' ? templates : templates.filter((row) => row.kinds.includes(draft.kind)));
  const chosenTeam = () => (draft.teamMode === 'existing' ? draft.team : draft.teamMode === 'new' ? finalizeTeamName(draft.newTeam) : '');

  /* ---- the two doors ---- */
  const seg = el('div', 'fs-seg');
  const doorButton = (door, label) => {
    const button = el('button', null, label);
    button.type = 'button';
    button.addEventListener('click', () => {
      if (draft.door === door) return;
      draft.door = door;
      if (door === 'manual') { draft.template = ''; snapshot = ''; draft.expanded = {}; }
      paint();
    });
    seg.append(button);
    return button;
  };
  const templateDoor = doorButton('template', t('template', 'Template'));
  const manualDoor = doorButton('manual', t('forms.manual', 'Manual'));

  /* ---- 1 · New session ---- */
  const stepType = createStep({ n: 1, key: 'type', title: t('new_agent.new_session', 'New session') });
  const typeHost = el('div', 'fs-pair');
  const TYPES = () => [
    { key: 'cowork_agent', label: t('new_agent.type_cowork', 'Cowork Agent'), sub: t('new_agent.type_cowork_sub', 'Born into Ronin: the floor, its routines, its reading and its team.') },
    { key: 'bare_metal_agent', label: t('new_agent.type_bare', 'Bare-metal Agent'), sub: t('new_agent.type_bare_sub', 'The provider’s agent and nothing else — no floor, no routines, no reading.') },
    { key: 'terminal', label: t('new_agent.type_terminal', 'Terminal'), sub: t('new_agent.type_terminal_sub', 'A raw tmux pane. No agent is launched and nothing is sent to it.') },
  ];
  function paintTypes() {
    typeHost.replaceChildren();
    for (const type of TYPES()) {
      const box = el('button', 'fs-way');
      box.type = 'button';
      box.setAttribute('aria-pressed', String(draft.type === type.key));
      box.append(el('b', null, type.label), el('small', null, type.sub));
      box.addEventListener('click', () => { draft.type = type.key; paint(); });
      typeHost.append(box);
    }
  }
  stepType.body.append(typeHost);

  /* ---- 2 · name, model & kind (the step reshapes with the type and the door) ---- */
  const stepTop = createStep({ n: 2, key: 'top', title: t('new_agent.name_model_kind', 'Name, model & kind') });
  const nameInput = el('input');
  nameInput.type = 'text';
  nameInput.autocapitalize = 'off';
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
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
  });
  const leanNote = el('p', 'na-omitted');
  const pair = providerModelPair(
    () => ({ provider: draft.provider, model: draft.model }),
    (provider, model) => { draft.provider = provider; draft.model = model; touched.model = true; paintFoot(); },
    (label, control) => createField({ label, control }).el,
  );
  const kindHost = el('div');
  function paintKinds() {
    // THE KIND IS THE TRAY'S FILTER and only a Cowork Agent has one; Manual has no tray
    // to filter, so it does not ask (the drawing's own rule).
    kindHost.hidden = !(isCowork() && draft.door === 'template');
    if (kindHost.hidden) return;
    kindHost.replaceChildren(kindTiles(draft.kind, (key) => {
      draft.kind = key;
      draft.kindTouched = true;
      if (draft.template && !offered().some((row) => row.name === draft.template)) { draft.template = ''; snapshot = ''; }
      paint();
    }));
  }
  function paintLeanNote() {
    leanNote.hidden = isCowork();
    if (leanNote.hidden) return;
    leanNote.textContent = draft.type === 'terminal'
      ? t('new_agent.terminal_note', 'A terminal takes no kind, no instructions, no mandate and no loadout.')
      : t('new_agent.bare_note', 'A bare-metal Agent takes no kind, no mandate and no loadout.');
  }
  const topLeft = el('div', 'aa-col');
  topLeft.append(createField({ label: t('add_agent.name', 'name'), control: nameInput }).el, leanNote);
  const topRight = el('div', 'aa-col');
  topRight.append(pair.el);
  const topGrid = el('div', 'aa-top');
  topGrid.append(topLeft, topRight);
  stepTop.body.append(topGrid, kindHost);

  /* ---- 3 · Template ---- */
  const stepTemplate = createStep({ n: 3, key: 'template', title: t('template', 'Template') });
  function applyTemplate(name) {
    draft.template = name;
    draft.expanded = {};
    const row = templateRow();
    if (!row) { snapshot = ''; paint(); return; }
    if (row.brief) { draft.instructions = row.brief; instructionsInput.value = row.brief; }
    if (row.mandate) { draft.reach = row.mandate.reach; draft.recruit = row.mandate.recruit; draft.output = row.mandate.output; touched.mandate = true; }
    if (row.behaviours.length) { draft.books = [...row.behaviours]; touched.books = true; }
    snapshot = authored();
    paint();
  }
  const authored = () => JSON.stringify({
    instructions: draft.instructions, books: [...draft.books].sort(),
    mandate: [draft.reach, draft.recruit, draft.output],
  });
  const templateDirty = () => !!templateRow() && authored() !== snapshot;
  function paintTray() {
    stepTemplate.body.replaceChildren(templateTray(offered(), draft.template, (name) => applyTemplate(name)));
  }

  /* ---- 4 · Instructions ---- */
  const stepInstructions = createStep({ n: 4, key: 'instructions', title: t('new_agent.instructions', 'Instructions'), onToggle: () => toggle('instructions') });
  const instructionsInput = el('textarea');
  instructionsInput.rows = 3;
  instructionsInput.autocapitalize = 'off';
  instructionsInput.spellcheck = false;
  instructionsInput.placeholder = t('add_agent.instruction_placeholder', 'what this Agent should do');
  instructionsInput.addEventListener('input', () => { draft.instructions = instructionsInput.value; paintFoot(); });
  stepInstructions.body.append(createField({ label: t('new_agent.instructions', 'Instructions'), control: instructionsInput }).el);

  /* ---- 5 · Team ---- */
  const stepTeam = createStep({ n: 5, key: 'team', title: t('squad', 'Team'), onToggle: () => toggle('team') });
  const teamHost = el('div');
  function paintTeam() {
    teamHost.replaceChildren();
    const ways3 = el('div', 'fs-pair');
    const way = (key, label, sub) => {
      const box = el('button', 'fs-way');
      box.type = 'button';
      box.setAttribute('aria-pressed', String(draft.teamMode === key));
      box.append(el('b', null, label), el('small', null, sub));
      box.addEventListener('click', () => {
        draft.teamMode = key;
        if (key === 'existing' && !draft.team && teams.length) draft.team = teams[0].name;
        // THE DEFAULT LANDS: joining a team brings its answers into the form; the hand
        // has the last word. The seed door is re-asked for the team's resolution.
        void loadSeed();
        paintTeam();
        paintFoot();
      });
      return box;
    };
    // NEW TEAM LEADS, AND IT IS THE DEFAULT (owner, 2026-08-31). The order is the order
    // of intent: most launches are the start of something, joining one is next, and a
    // rōnin is the ordinary remainder rather than the opening offer.
    ways3.append(
      way('new', t('new_agent.team_new', 'A new team'), t('new_agent.team_new_sub', 'Created first, then this Agent is born into it.')),
      way('existing', t('new_agent.team_existing', 'An existing team'), t('new_agent.team_existing_sub', 'Join it. Its answers land at birth.')),
      way('none', t('new_agent.team_none', 'No team — a rōnin'), t('new_agent.team_none_sub', 'Ordinary, not a gap.')),
    );
    teamHost.append(ways3);
    if (draft.teamMode === 'existing') {
      const select = el('select');
      for (const team of teams) select.add(new Option(team.title || team.name, team.name));
      select.value = draft.team;
      select.addEventListener('change', () => { draft.team = select.value; void loadSeed(); paintFoot(); });
      teamHost.append(createField({ label: t('squad', 'Team'), control: select }).el);
    }
    if (draft.teamMode === 'new') {
      const input = el('input');
      input.type = 'text';
      input.spellcheck = false;
      input.autocapitalize = 'off';
      input.value = draft.newTeam;
      input.placeholder = t('new_team.name_placeholder', 'lowercase, digits, - _');
      input.addEventListener('input', () => {
        const caret = input.selectionStart;
        const clean = sanitizeTeamName(input.value);
        if (clean !== input.value) { input.value = clean; input.setSelectionRange(caret, caret); }
        draft.newTeam = input.value;
        paintFoot();
        paintActions(); // the button's promise follows the name as it is typed
      });
      // GO NEVER FAILS, and this tile is now the one you land on: leaving the name blank
      // is an answer — no team is made and the Agent is a rōnin — not an error to clear.
      teamHost.append(createField({
        label: t('new_team.name', 'Team name'),
        control: input,
        description: t('new_agent.team_new_blank', 'Blank makes no team — the Agent is a rōnin.'),
      }).el);
    }
  }
  stepTeam.body.append(teamHost);

  /* ---- 6 · Where ---- */
  const stepWhere = createStep({ n: 6, key: 'where', title: t('new_team.where', 'Where'), onToggle: () => toggle('where') });
  const rootSelect = el('select');
  rootSelect.addEventListener('change', () => { draft.root = rootSelect.value; touched.root = true; paintFoot(); });
  const rootField = createField({ label: t('team.project_root', 'Project root'), control: rootSelect }).el;
  stepWhere.body.append(rootField);
  function paintRoots() {
    rootSelect.replaceChildren();
    for (const root of roots) rootSelect.add(new Option(root.name, root.name));
    if (draft.root && !roots.some((root) => root.name === draft.root)) rootSelect.add(new Option(draft.root, draft.root));
    rootSelect.value = draft.root || (roots[0]?.name ?? '');
    draft.root = rootSelect.value;
  }

  /* ---- 7 · Mandate ---- */
  const stepMandate = createStep({ n: 7, key: 'mandate', title: t('mandate', 'Mandate'), onToggle: () => toggle('mandate') });
  const mandateHost = el('div');
  function paintMandate() {
    mandateHost.replaceChildren(
      dialRow(t('reach', 'Reach'), REACH, draft.reach, (value) => { draft.reach = value; touched.mandate = true; paintMandate(); paintFoot(); }),
      dialRow(t('recruit', 'Recruit'), RECRUIT, draft.recruit, (value) => { draft.recruit = value; touched.mandate = true; paintMandate(); paintFoot(); }),
      dialRow(t('output', 'Output'), OUTPUT, draft.output, (value) => { draft.output = value; touched.mandate = true; paintMandate(); paintFoot(); }),
    );
  }
  stepMandate.body.append(mandateHost);

  /* ---- 8 · Loadout ---- */
  const stepLoadout = createStep({ n: 8, key: 'loadout', title: t('loadout', 'Tools and skills'), onToggle: () => toggle('loadout') });
  const routinesHead = el('p', 'fs-head', t('routines', 'Routines'));
  const routinesHost = el('div');
  function paintRoutinePreview() {
    // A PREVIEW WITH PROVENANCE, NEVER A SWITCH (CASCADE § 5.1): the resolved set is the
    // campaign's and the team's; this form renders it and offers nothing to flip.
    routinesHost.replaceChildren();
    const row = (label, prov, on) => {
      const line = el('div', 'fs-routine');
      line.dataset.on = String(on);
      const words = el('div');
      words.append(el('b', null, label));
      line.append(el('span', 'fs-mark', on ? '✓' : ''), words, el('span', 'fs-prov', prov));
      routinesHost.append(line);
    };
    row(t('new_team.floor', 'Cowork floor'), t('forms.always', 'always'), true);
    for (const routine of seed?.routines || []) {
      row(routine.name, routine.stated_by?.[0]?.layer || '', routine.on);
    }
  }
  const shelvesHost = el('div');
  function paintShelves() {
    shelvesHost.replaceChildren();
    const shelf = (head, rows, prefix) => {
      shelvesHost.append(el('p', 'fs-head', head));
      const grid = el('div', 'na-sopgrid');
      for (const rowDef of rows) {
        const address = `${prefix}:${rowDef.name}`;
        const on = draft.books.includes(address);
        const box = el('button', 'na-sop');
        box.type = 'button';
        box.title = rowDef.blurb || rowDef.label;
        box.setAttribute('aria-pressed', String(on));
        box.append(el('span', 'aa-box'), el('b', null, rowDef.name));
        box.addEventListener('click', () => {
          draft.books = on ? draft.books.filter((book) => book !== address) : [...draft.books, address];
          touched.books = true;
          paintShelves();
          paintFoot();
        });
        grid.append(box);
      }
      shelvesHost.append(grid);
    };
    shelf(t('new_agent.shelf_house', 'behaviours · the house'), sops, 'sops');
    shelf(t('new_agent.shelf_ways', 'behaviours · ways of working'), ways, 'ways');
  }
  stepLoadout.body.append(routinesHead, routinesHost, shelvesHost);

  /* ---- the plan: which steps exist for this type and door ---- */
  const steps = {
    type: stepType, top: stepTop, template: stepTemplate, instructions: stepInstructions,
    team: stepTeam, where: stepWhere, mandate: stepMandate, loadout: stepLoadout,
  };
  const plan = () => {
    if (draft.type === 'terminal') return ['type', 'top', 'team'];
    if (draft.type === 'bare_metal_agent') return ['type', 'top', 'instructions', 'team'];
    return draft.door === 'manual'
      ? ['type', 'top', 'instructions', 'team', 'where', 'mandate', 'loadout']
      : ['type', 'top', 'template', 'instructions', 'team', 'where', 'mandate', 'loadout'];
  };
  const FOLDS = ['instructions', 'team', 'where', 'mandate', 'loadout'];
  function toggle(key) {
    if (draft.expanded[key]) delete draft.expanded[key];
    else draft.expanded[key] = true;
    paintFolds();
  }
  const meta = {
    instructions: () => draft.instructions.slice(0, 40),
    team: () => (draft.teamMode === 'none' ? t('new_agent.a_ronin', 'a rōnin') : chosenTeam()),
    where: () => draft.root,
    mandate: () => `${draft.reach} · ${draft.recruit} · ${draft.output}`,
    loadout: () => t('new_agent.loadout_meta', '{routines} routines · {books} books', {
      routines: (seed?.routines || []).filter((row) => row.on).length + 1, books: draft.books.length,
    }),
  };
  function paintFolds() {
    const folded = isCowork() && !!templateRow();
    for (const key of FOLDS) {
      steps[key].setCollapsed(folded && !draft.expanded[key], folded ? meta[key]() : '', folded);
    }
  }

  /* ---- Will be born ---- */
  const foot = el('div', 'ntf-foot');
  function paintFoot() {
    foot.replaceChildren();
    const typeRow = TYPES().find((type) => type.key === draft.type);
    const rows = [
      [t('new_agent.session', 'session'), typeRow?.label || draft.type],
      [t('add_agent.name', 'name'), draft.name],
      [t('squad', 'Team'), draft.teamMode === 'none' || !chosenTeam() ? '' : chosenTeam() + (draft.teamMode === 'new' ? `  ${t('new_agent.created_first', '(created first)')}` : '')],
    ];
    if (isCowork()) {
      if (draft.door === 'template') rows.push([t('kind', 'Kind'), draft.kind]);
      rows.push([t('mandate', 'Mandate'), `${draft.reach} · ${draft.recruit} · ${draft.output}`]);
    }
    rows.push([t('routines', 'Routines'), draft.type === 'terminal'
      ? (() => el('em', null, t('new_agent.routines_terminal', 'agent: none — a pane')))()
      : draft.type === 'bare_metal_agent'
        ? (() => el('em', null, t('new_agent.routines_bare', 'no floor, no routines')))()
        : tagRow([{ text: t('new_team.floor_tag', 'floor'), on: true }, ...(seed?.routines || []).filter((row) => row.on).map((row) => ({ text: row.name, on: true }))])]);
    if (isCowork() && draft.books.length) rows.push([t('behaviours', 'Behaviours'), tagRow(draft.books.map((text) => ({ text, on: true })))]);
    rows.push([t('add_agent.place', 'place'), draft.root]);
    if (hasAgent()) rows.push([t('forms.model', 'model'), draft.provider ? `${draft.provider}${draft.model ? ` / ${draft.model}` : ''}` : t('forms.default', 'default')]);
    foot.append(readingRows(rows));
    foot.append(el('p', 'na-note', t('new_agent.blank_note', 'A blank field is an answer, not a gap.')));
  }

  /* ---- start, and the conditional save ---- */
  const start = createAction({ label: t('add_agent.start', 'Start'), kind: 'primary', action: () => void doStart() });
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
  const actions = createActionBar({ label: t('add_agent.actions', 'Launch actions'), actions: [start] });
  actions.el.append(saveName, save.el);
  function paintActions() {
    // The button says what the press will DO: with the name blank there is no team to
    // create, so it must not promise one.
    start.el.textContent = draft.teamMode === 'new' && isCowork() && chosenTeam()
      ? t('new_agent.create_and_start', 'Create the team and start')
      : draft.type === 'terminal' ? t('new_agent.open_terminal', 'Open the terminal') : t('add_agent.start', 'Start');
    const offer = isCowork() && (!templateRow() || templateDirty());
    saveName.hidden = !offer;
    save.el.hidden = !offer;
    save.el.textContent = !templateRow() ? t('save_template', 'Save as template') : t('new_team.save_as_new', 'Save as new template');
  }

  async function doStart() {
    if (busy) return;
    const name = draft.name.trim();
    busy = true;
    start.setDisabled(true);
    notice.set('info', t('add_agent.starting', 'Starting…'));
    // A NEW TEAM IS TWO IDEMPOTENT DOORS (§ 7.5): write the record, then launch into it.
    let team = chosenTeam();
    // An unnamed new team is no team, not a refusal — see the field's own sentence.
    if (draft.teamMode === 'new' && !team) team = '';
    if (draft.teamMode === 'new' && isCowork() && team) {
      if (!isValidTeamName(team)) {
        busy = false;
        start.setDisabled(false);
        notice.set('failed', t('new_team.name_invalid', 'Lowercase letters, digits, _ and - only.'));
        return;
      }
      const made = await request('/api/team-rosters', { method: 'POST', json: { name: team, kind: draft.kind } });
      if (!made.ok) {
        busy = false;
        start.setDisabled(false);
        notice.set('failed', made.message);
        return;
      }
    }
    // ONLY THE § 7.4 BODY, by type — the route refuses the rest by name, and the desk is
    // never sent (the routine selection is the decision; the escape hatch stays unadvertised).
    const body = draft.type === 'terminal'
      ? { session_type: 'terminal', name, team, project_root: draft.root }
      : draft.type === 'bare_metal_agent'
        ? { session_type: 'bare_metal_agent', name, team, project_root: draft.root, instructions: draft.instructions.trim(), provider: draft.provider, model: draft.model }
        : {
          session_type: 'cowork_agent', name, team, project_root: draft.root,
          instructions: draft.instructions.trim(), provider: draft.provider, model: draft.model,
          kind: draft.kind,
          mandate: { reach: draft.reach, recruit: draft.recruit, output: draft.output },
          behaviours: [...draft.books],
          ...(draft.template ? { template: draft.template } : {}),
        };
    const result = await request('/api/launch', { method: 'POST', json: body });
    busy = false;
    start.setDisabled(false);
    if (!result.ok) {
      notice.set('failed', result.message);
      return;
    }
    const born = result.data?.name || name;
    const deskNote = result.data?.receipt?.desk_note || '';
    if (deskNote) notice.set('warning', t('add_agent.started_note', 'Started {name} — {note}', { name: born, note: deskNote }));
    else notice.set('success', t('add_agent.started', 'Started {name}', { name: born }));
    if (born && !deskNote) connect?.(born);
  }

  async function doSave() {
    const token = draft.templateName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!token) return;
    const result = await request('/api/templates', {
      method: 'POST',
      json: {
        name: token,
        label: draft.templateName.trim(),
        art: templateRow()?.art || '＋',
        blurb: draft.instructions.trim().slice(0, 120),
        kinds: draft.kind === 'open' ? ['coding', 'work', 'personal', 'household', 'social', 'school'] : [draft.kind],
        brief: draft.instructions.trim(),
        mandate: `${draft.reach} · ${draft.recruit} · ${draft.output}`,
        behaviours: draft.books,
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
    if (!touched.model && !draft.provider) { draft.provider = value('provider') || ''; draft.model = value('model') || ''; }
    if (!touched.root && value('project_root')) draft.root = value('project_root');
    if (!touched.mandate) {
      for (const key of ['reach', 'recruit', 'output']) if (value(key)) draft[key] = value(key);
    }
    if (!touched.books && Array.isArray(value('behaviours'))) draft.books = [...value('behaviours')];
    if (!draft.kindTouched && team && value('kind')) draft.kind = value('kind');
    pair.paint();
    paintRoots();
    paintKinds();
    paintTray();
    paintMandate();
    paintShelves();
    paintRoutinePreview();
    paintFolds();
    paintFoot();
  }

  function paint() {
    for (const button of [templateDoor, manualDoor]) button.setAttribute('aria-pressed', String(button === (draft.door === 'template' ? templateDoor : manualDoor)));
    seg.hidden = !isCowork();
    const order = plan();
    for (const [key, step] of Object.entries(steps)) step.el.hidden = !order.includes(key);
    order.forEach((key, index) => steps[key].setNumber(index + 1));
    stepTop.el.querySelector('h3').textContent = !isCowork()
      ? (hasAgent() ? t('new_agent.name_where_model', 'Name, where & model') : t('new_agent.name_where', 'Name & where'))
      : (draft.door === 'template' ? t('new_agent.name_model_kind', 'Name, model & kind') : t('new_agent.name_model', 'Name & model'));
    // The lean types fold the where step into the top block — the drawing's one-block
    // geometry: who it is, then where it runs. Moving the field keeps its typed state.
    topRight.hidden = !hasAgent();
    if (!isCowork()) topLeft.append(rootField);
    else stepWhere.body.append(rootField);
    paintTypes();
    paintLeanNote();
    paintKinds();
    paintTray();
    paintTeam();
    paintRoots();
    pair.paint();
    paintMandate();
    paintRoutinePreview();
    paintShelves();
    paintFolds();
    paintActions();
    paintFoot();
  }

  const form = el('div', 'ntf-form');
  form.append(seg, stepType.el, stepTop.el, stepTemplate.el, stepInstructions.el, stepTeam.el, stepWhere.el, stepMandate.el, stepLoadout.el);
  surface.content.append(form, actions.el, notice.el, foot);

  /**
   * THE ＋ NEW DOOR ARRIVES HERE NOW. `S.showNewSession(prompt)` — the bar's ＋, ⌃⇧N and
   * the gbrain tab's "ask the assistant" — used to open `js/launcher.js` pre-filled as a
   * `PersonalAssistant` launch. That board is retired and `session_role` with it, so the
   * prompt lands as INSTRUCTIONS and the settled replacement for the role is ticked on
   * the ways shelf: `ways:personal_assistant` (SETTLING § 1, the former session_roles
   * become the `ways/` books). The hand still moves everything, as on any other seed.
   */
  const PA_BOOK = 'ways:personal_assistant';
  const seedPrompt = (prompt) => {
    if (!prompt) return;
    draft.instructions = prompt;
    instructionsInput.value = prompt;
    if (ways.some((row) => row.name === 'personal_assistant') && !draft.books.includes(PA_BOOK)) {
      draft.books = [...draft.books, PA_BOOK];
      touched.books = true;
    }
  };

  return {
    el: surface.el,
    enter: async (detail = {}) => {
      paint();
      const [tray, sopRows, wayRows, teamRows, rootRows] = await Promise.all([
        request('/api/templates'),
        request('/api/sops'),
        request('/api/ways'),
        request('/api/team-rosters'),
        request('/api/project-roots'),
      ]);
      templates = tray.ok && Array.isArray(tray.data) ? tray.data : [];
      sops = sopRows.ok && Array.isArray(sopRows.data) ? sopRows.data : [];
      ways = wayRows.ok && Array.isArray(wayRows.data) ? wayRows.data : [];
      teams = teamRows.ok && Array.isArray(teamRows.data) ? teamRows.data.filter((row) => row.state !== 'archived') : [];
      roots = rootRows.ok && Array.isArray(rootRows.data) ? rootRows.data : [];
      if (!loaded) { await loadSeed(); loaded = true; }
      seedPrompt(typeof detail?.prompt === 'string' ? detail.prompt.trim() : '');
      paint();
    },
  };
}
