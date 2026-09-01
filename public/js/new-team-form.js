/* part of the ronin-cowork client — see js/README.md */
/**
 * NEW TEAM — the drawn raise form, staged BESIDE the seven-field New Team card
 * (owner's staging rule, 2026-08-31): a new surface type, nothing removed, and the owner
 * decides when one retires the other. The drawn contract is ronin-lab
 * `concepts/new-team.html` at the condensed density; the record it writes is
 * `NEW_AGENT.md` § 7.2, whole — no `team_role`, no `repos`, both removed by the owner.
 *
 * TWO DOORS, differing only by the tray: Template offers the catalog and collapse-on-pick;
 * Manual asks the same steps and fills nothing in. Picking a template answers the steps
 * it carries and folds them — the number, the name and the answer stay on the row, and
 * the header opens it. `Make your own` collapses nothing, because it filled nothing in.
 *
 * WHERE THE ANSWERS COME FROM: `GET /api/launch-seed` with no team — the rōnin case, the
 * campaign's answers (CASCADE § 5.1). The form opens on them; a default LANDS and is then
 * yours. Routines are TWO-STATE and the map is complete (owner via the lead, 2026-08-31,
 * overturning the drawing's own three-state row): the form opens on the campaign's
 * current values, Save stores the team's complete map, and a campaign edit reaches only
 * the next team made. No inherit control, no reset-to-campaign, anywhere.
 *
 * RAISE NEVER FAILS for the ordinary states — no objective, no root, `open` on every
 * dial. The lead is an OFFER (a brief and a mandate, never a roster row): raising with
 * one is § 7.5's two idempotent doors — the record first, then one § 7.4 launch born as
 * the 人 — and a lead that fails to be born still leaves a raised team, said out loud.
 */
import { request } from './request.js';
import { t } from './lexicon.js';
import { finalizeTeamName, isValidTeamName, sanitizeTeamName } from './new-team-draft.js';
import {
  createStep, el, kindTiles, mandateSelect, providerModelPair, readingRows, tagRow, templateTray,
} from './form-steps.js';

const REACH = ['open', 'discuss', 'plan', 'execute'];
const RECRUIT = ['open', 'nobody', 'propose agents', 'staff agents'];
const OUTPUT = ['open', 'a plan', 'ideas', 'code', 'an artifact', 'the team'];
const DIALS = ['user', 'read', 'write'];
const KINDS = ['coding', 'work', 'personal', 'household', 'social', 'school'];

const LEAD_DEFAULT = () => ({
  brief: t('new_team.lead_brief_default', 'Hold the objective, dispatch, unblock, keep the gaps closed.'),
  reach: 'execute', recruit: 'staff agents', output: 'open',
});

export function createNewTeamFormView(kit, { created = null } = {}) {
  const { createSurface, createAction, createActionBar, createField, createNotice } = kit.primitives;

  const draft = {
    door: 'template', template: '', templateName: '',
    name: '', kind: 'coding', objective: '',
    root: '', branch: '',
    provider: '', model: '', reach: 'open', recruit: 'open', output: 'open',
    dial: 'write', permissions: 'default',
    routines: {}, books: [],
    lead: null,
    expanded: {},
  };
  let seed = null;          // the campaign's answers, once the door has spoken
  let seedRoutines = {};    // the map as it landed — provenance's baseline
  let handRoutines = new Set();
  let templates = [];
  let routineRows = [];
  let roots = [];
  let snapshot = '';        // what the applied template wrote, for the dirty test
  let busy = false;
  let loaded = false;

  /* THE RAISE BUTTON LIVES IN THE TILE HEADER (owner, 2026-09-01), compact and quiet
   * rather than a slab at the foot of a long scroll — asleep until a team name is typed,
   * because the name is the only required field and everything under it is optional. */
  const raise = createAction({
    label: t('new_team.raise', 'Raise the team'),
    size: 'compact',
    disabled: true,
    action: () => void doRaise(),
  });
  const surface = createSurface({ label: t('new_team.title', 'New Team'), className: 'ntf-surface', actions: [raise] });
  const notice = createNotice();

  /* ---- the two doors ---- */
  const seg = el('div', 'fs-seg');
  const doorButton = (door, label) => {
    const button = el('button', null, label);
    button.type = 'button';
    button.addEventListener('click', () => {
      if (draft.door === door) return;
      draft.door = door;
      // Manual has no tray, so nothing is template-filled and nothing stays folded.
      if (door === 'manual') { draft.template = ''; snapshot = ''; draft.expanded = {}; }
      paint();
    });
    seg.append(button);
    return button;
  };
  const templateDoor = doorButton('template', t('template', 'Template'));
  const manualDoor = doorButton('manual', t('forms.manual', 'Manual'));

  const templateRow = () => templates.find((row) => row.name === draft.template) || null;
  const offered = () => (draft.kind === 'open' ? templates : templates.filter((row) => row.kinds.includes(draft.kind)));
  const routineOn = (name) => draft.routines[name] === true;
  const onNames = () => routineRows.filter((row) => routineOn(row.name)).map((row) => row.name);

  /** What a template authors, as one string — the dirty test compares against it. */
  const authored = () => JSON.stringify({
    objective: draft.objective, books: [...draft.books].sort(), routines: draft.routines,
    mandate: [draft.reach, draft.recruit, draft.output], lead: draft.lead,
  });

  function applyTemplate(name) {
    draft.template = name;
    draft.expanded = {};
    const row = templateRow();
    if (!row) { snapshot = ''; paint(); return; }
    if (row.objective) { draft.objective = row.objective; objectiveInput.value = row.objective; }
    if (row.behaviours.length) draft.books = [...row.behaviours];
    for (const on of row.routines_on) if (on in draft.routines) draft.routines[on] = true;
    for (const off of row.routines_off) if (off in draft.routines) draft.routines[off] = false;
    if (row.mandate) { draft.reach = row.mandate.reach; draft.recruit = row.mandate.recruit; draft.output = row.mandate.output; }
    if (row.lead) {
      draft.lead = { ...LEAD_DEFAULT() };
      if (row.lead.brief) draft.lead.brief = row.lead.brief;
      if (row.lead.mandate) { draft.lead.reach = row.lead.mandate.reach; draft.lead.recruit = row.lead.mandate.recruit; draft.lead.output = row.lead.mandate.output; }
    }
    snapshot = authored();
    paint();
  }
  const templateDirty = () => !!templateRow() && authored() !== snapshot;

  /* ---- step 2 · Template (the kind above it has already narrowed the tray) ---- */
  const stepTemplate = createStep({ n: 2, key: 'template', title: t('template', 'Template') });
  function paintTray() {
    stepTemplate.body.replaceChildren(templateTray(offered(), draft.template, (name) => applyTemplate(name)));
  }

  /* ---- step 1 · Name & kind ---- */
  const stepTop = createStep({ n: 1, key: 'top', title: t('new_team.name_kind', 'Name & kind') });
  const nameInput = el('input');
  nameInput.type = 'text';
  nameInput.autocapitalize = 'off';
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  nameInput.placeholder = t('new_team.name_placeholder', 'lowercase, digits, - _');
  nameInput.addEventListener('input', () => {
    const caret = nameInput.selectionStart;
    const clean = sanitizeTeamName(nameInput.value);
    if (clean !== nameInput.value) {
      nameInput.value = clean;
      nameInput.setSelectionRange(caret, caret);
    }
    draft.name = nameInput.value;
    paintName();
    paintFoot();
    paintActions(); // Raise wakes on the first character of a name
  });
  // Settle the name when the owner leaves the field: a trailing separator is legal to
  // TYPE and wrong to CREATE (new-team-draft.js has the whole argument).
  nameInput.addEventListener('blur', () => {
    const settled = finalizeTeamName(nameInput.value);
    if (settled !== nameInput.value) nameInput.value = settled;
    draft.name = settled;
    paintName();
    paintFoot();
  });
  // No spelling rule under the field: the input enforces it as you type, so a sentence
  // describing it only tells you what you can already see happening (owner, 2026-09-01).
  const nameField = createField({ label: t('new_team.name', 'Team name'), control: nameInput });
  const paintName = () => {
    const settled = finalizeTeamName(draft.name);
    if (!settled) return nameField.setValidation('', '');
    if (!isValidTeamName(settled)) return nameField.setValidation('invalid', t('new_team.name_invalid', 'Lowercase letters, digits, _ and - only.'));
    nameField.setValidation('valid', '');
  };
  const kindHost = el('div');
  function paintKinds() {
    kindHost.replaceChildren(kindTiles(draft.kind, (key) => {
      draft.kind = key;
      // The tray narrows with the kind; a pick the kind no longer offers is let go.
      if (draft.template && !offered().some((row) => row.name === draft.template)) { draft.template = ''; snapshot = ''; }
      paint();
    }));
  }
  stepTop.body.append(nameField.el, kindHost);

  /* ---- step 3 · Objective ---- */
  const stepObjective = createStep({ n: 3, key: 'objective', title: t('team.objective', 'Objective'), onToggle: () => toggle('objective') });
  const objectiveInput = el('textarea');
  objectiveInput.rows = 3;
  objectiveInput.placeholder = t('new_team.objective_placeholder', 'what this team is for');
  objectiveInput.addEventListener('input', () => { draft.objective = objectiveInput.value; paintFoot(); });
  stepObjective.body.append(createField({ label: t('team.objective', 'Objective'), control: objectiveInput }).el);

  /* ---- step 4 · Where ---- */
  const stepWhere = createStep({ n: 4, key: 'where', title: t('new_team.where', 'Where'), onToggle: () => toggle('where') });
  const rootSelect = el('select');
  rootSelect.addEventListener('change', () => { draft.root = rootSelect.value; paintFoot(); });
  const branchInput = el('input');
  branchInput.type = 'text';
  branchInput.spellcheck = false;
  branchInput.placeholder = 'team/<name>/dev';
  branchInput.addEventListener('input', () => { draft.branch = branchInput.value.trim(); paintFoot(); });
  const wherePair = el('div', 'fs-pair');
  wherePair.append(
    createField({ label: t('team.project_root', 'Project root'), control: rootSelect }).el,
    createField({ label: t('team.branch', 'Branch'), control: branchInput }).el,
  );
  // NO WIPEBOARD FIELD (owner, 2026-09-01): "the wipeboard is automatically configured…
  // no one ever even sees the fucking name." The store already defaults it to the team's
  // own token, so the form asks nothing and sends nothing.
  stepWhere.body.append(wherePair);
  function paintRoots() {
    rootSelect.replaceChildren();
    rootSelect.add(new Option(t('new_team.root_default', '— the box’s default —'), ''));
    for (const root of roots) rootSelect.add(new Option(root.name, root.name));
    rootSelect.value = roots.some((root) => root.name === draft.root) ? draft.root : '';
  }

  /* ---- step 5 · Team kit ---- */
  const stepKit = createStep({ n: 5, key: 'kit', title: t('team_kit', 'Shared toolkit'), onToggle: () => toggle('kit') });
  const pair = providerModelPair(
    () => ({ provider: draft.provider, model: draft.model }),
    (provider, model) => { draft.provider = provider; draft.model = model; paintFoot(); },
    (label, control) => createField({ label, control }).el,
  );
  const dialsRow = el('div', 'fs-pair');
  const dialCell = (label, values, key) => createField({
    label, control: mandateSelect(values, draft[key], (value) => { draft[key] = value; paintFoot(); }),
  }).el;
  dialsRow.append(
    dialCell(t('reach', 'Reach'), REACH, 'reach'),
    dialCell(t('recruit', 'Recruit'), RECRUIT, 'recruit'),
    dialCell(t('output', 'Output'), OUTPUT, 'output'),
  );
  // Dial and permissions are agent_defaults now (§ 7.2, amended 2026-08-31) — a stored
  // default lands in a form the owner presses, so the hand on the dial is still theirs.
  const dialsRow2 = el('div', 'fs-pair');
  const permissionsInput = el('input');
  permissionsInput.type = 'text';
  permissionsInput.spellcheck = false;
  permissionsInput.addEventListener('input', () => { draft.permissions = permissionsInput.value.trim() || 'default'; });
  dialsRow2.append(
    dialCell(t('team_config.dial', 'Control'), DIALS, 'dial'),
    createField({ label: t('permissions', 'Permissions'), control: permissionsInput }).el,
  );
  const routinesHead = el('p', 'fs-head', t('routines', 'Routines'));
  const routinesHost = el('div');
  function paintRoutines() {
    routinesHost.replaceChildren();
    const row = (label, blurb, on, prov, act) => {
      const line = el(act ? 'button' : 'div', 'fs-routine');
      if (act) { line.type = 'button'; line.addEventListener('click', act); }
      line.dataset.on = String(on);
      const words = el('div');
      words.append(el('b', null, label), el('small', null, blurb));
      line.append(el('span', 'fs-mark', on ? '✓' : ''), words, el('span', 'fs-prov', prov));
      routinesHost.append(line);
    };
    row(
      t('new_team.floor', 'Cowork floor'),
      t('new_team.floor_why', 'The launch, campaign and team resolution, the shelf map, the birth receipt.'),
      true, t('forms.always', 'always'), null,
    );
    for (const routine of routineRows) {
      const on = routineOn(routine.name);
      const prov = handRoutines.has(routine.name)
        ? (on ? t('forms.team_on', 'team turns on') : t('forms.team_off', 'team turns off'))
        : (on ? t('forms.campaign_on', 'campaign on') : t('forms.campaign_off', 'campaign off'));
      row(routine.label, routine.blurb, on, prov, () => {
        draft.routines[routine.name] = !on;
        if (draft.routines[routine.name] === (seedRoutines[routine.name] === true)) handRoutines.delete(routine.name);
        else handRoutines.add(routine.name);
        paintRoutines();
        paintFoot();
      });
    }
  }
  const booksHead = el('p', 'fs-head', t('behaviours', 'Behaviours'));
  const booksHost = el('div');
  function paintBooks() {
    booksHost.replaceChildren();
    // NO REQUIRED/OFFERED SWITCH (owner, 2026-09-01): "it totally violates the principle
    // in cascade, which is that everything from above cascades down, but it's optional."
    // A team's books land in the next Agent form like every other default, and the hand
    // has the last word. The record's `required` stays false; SETTLING § 1's "required
    // only when a team kit says so" is overturned and raised with the lead.
    booksHost.append(tagRow(draft.books.map((book) => ({ text: book, on: true })),
      t('new_team.kit_none', 'nothing yet — a template lays it, or open the kit')));
    // The browsing lives in a second workbench (OPEN_THREADS 0.10, drawn, not scheduled):
    // the door stands so the tag summary is not mistaken for the whole kit.
    const door = el('button', 'fs-door', t('new_team.kit_door', 'Open the Team Kit  ▸'));
    door.type = 'button';
    door.disabled = true;
    door.title = t('new_team.kit_door_why', 'A workbench of its own: browse every routine and behaviour, read them, and make them yours. Not yet built.');
    booksHost.append(door);
  }
  stepKit.body.append(pair.el, dialsRow, dialsRow2, routinesHead, routinesHost, booksHead, booksHost);

  /* ---- step 6 · Team lead ---- */
  const stepLead = createStep({ n: 6, key: 'lead', title: t('new_team.lead', 'Team lead'), onToggle: () => toggle('lead') });
  const leadHost = el('div');
  function paintLead() {
    leadHost.replaceChildren();
    const ways = el('div', 'fs-pair');
    const way = (on, title, sub) => {
      const box = el('button', 'fs-way');
      box.type = 'button';
      box.setAttribute('aria-pressed', String(!!draft.lead === on));
      box.append(el('b', null, title), el('small', null, sub));
      box.addEventListener('click', () => {
        draft.lead = on ? (draft.lead || { ...LEAD_DEFAULT() }) : null;
        paintLead();
        paintActions();
        paintFoot();
      });
      return box;
    };
    ways.append(
      way(true, t('new_team.lead_include', 'Include a team lead'), t('new_team.lead_include_sub', 'Raised with the team and briefed.')),
      way(false, t('new_team.lead_empty', 'Open it empty'), t('new_team.lead_empty_sub', 'Ordinary. Add one whenever you like.')),
    );
    leadHost.append(ways);
    if (!draft.lead) return;
    const brief = el('input');
    brief.type = 'text';
    brief.value = draft.lead.brief;
    brief.placeholder = t('new_team.lead_brief_placeholder', 'what the lead is for');
    brief.addEventListener('input', () => { draft.lead.brief = brief.value; });
    leadHost.append(createField({ label: t('new_team.lead_brief', 'brief'), control: brief }).el);
    const dials = el('div', 'fs-pair');
    const cell = (label, values, key) => createField({
      label, control: mandateSelect(values, draft.lead[key], (value) => { draft.lead[key] = value; paintFoot(); }),
    }).el;
    dials.append(cell(t('reach', 'Reach'), REACH, 'reach'), cell(t('recruit', 'Recruit'), RECRUIT, 'recruit'), cell(t('output', 'Output'), OUTPUT, 'output'));
    leadHost.append(dials);
  }
  stepLead.body.append(leadHost);

  /* ---- the collapse rules: a template's answers fold; the header opens them ---- */
  const FOLDS = ['objective', 'where', 'kit', 'lead'];
  const steps = { template: stepTemplate, top: stepTop, objective: stepObjective, where: stepWhere, kit: stepKit, lead: stepLead };
  function toggle(key) {
    if (draft.expanded[key]) delete draft.expanded[key];
    else draft.expanded[key] = true;
    paintFolds();
  }
  // KIND BEFORE TEMPLATE (owner, 2026-08-31): the kind narrows the tray, so asking for a
  // template first offered all fifteen tiles and then quietly dropped the pick when a
  // later kind excluded it. New Agent already asked in this order; the two forms agree.
  // One list, read by the form's numbering AND by the Launch selector's outline.
  const plan = () => (draft.door === 'manual'
    ? ['top', 'objective', 'where', 'kit', 'lead']
    : ['top', 'template', 'objective', 'where', 'kit', 'lead']);
  const meta = {
    objective: () => draft.objective.slice(0, 40),
    where: () => `${draft.root || t('new_team.root_default', '— the box’s default —')} @ ${draft.branch || '—'}`,
    kit: () => t('new_team.kit_meta', '{routines} routines · {books} books', {
      routines: onNames().length + 1, books: draft.books.length,
    }),
    lead: () => (draft.lead ? t('new_team.lead_included', 'included') : t('new_team.lead_none', 'none')),
  };
  function paintFolds() {
    const folded = !!templateRow();
    for (const key of FOLDS) {
      steps[key].setCollapsed(folded && !draft.expanded[key], folded ? meta[key]() : '', folded);
    }
  }

  /* ---- Will be raised — the reading, and what an Agent born here inherits ---- */
  const foot = el('div', 'ntf-foot');
  function paintFoot() {
    const name = finalizeTeamName(draft.name);
    foot.replaceChildren();
    foot.append(readingRows([
      [t('add_agent.team', 'team'), name],
      [t('team.objective', 'Objective'), draft.objective],
      [t('add_agent.place', 'place'), draft.root ? `${draft.root}${draft.branch ? ` @ ${draft.branch}` : ''}` : ''],
      [t('new_team.lead', 'Team lead'), draft.lead ? t('new_team.lead_raised', 'included, briefed at raise') : ''],
      [t('new_team.members', 'members'), (() => { const em = el('em', null, t('new_team.members_note', 'derived from live tags — never stored here')); return em; })()],
    ]));
    foot.append(el('p', 'fs-head', t('new_team.inherits', 'an agent born here inherits')));
    foot.append(readingRows([
      [t('kind', 'Kind'), draft.kind],
      [t('routines', 'Routines'), tagRow([{ text: t('new_team.floor_tag', 'floor'), on: true }, ...onNames().map((text) => ({ text, on: true }))])],
      [t('behaviours', 'Behaviours'), draft.books.length ? tagRow(draft.books.map((text) => ({ text, on: true }))) : ''],
      [t('forms.model', 'model'), draft.provider ? `${draft.provider}${draft.model ? ` / ${draft.model}` : ''}` : t('forms.default', 'default')],
      [t('mandate', 'Mandate'), `${draft.reach} · ${draft.recruit} · ${draft.output}`],
      [t('add_agent.still_asked', 'still asked'), tagRow([
        t('session_type', 'Session type'), t('add_agent.name', 'name'), t('add_agent.instruction', 'instruction'),
        ...(draft.provider ? [] : [t('forms.model', 'model')]),
      ])],
    ]));
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
  const actions = createActionBar({ label: t('new_team.team_actions', 'Team actions') });
  actions.el.append(saveName, save.el);
  function paintActions() {
    raise.setDisabled(!finalizeTeamName(draft.name));
    raise.el.textContent = draft.lead ? t('new_team.raise_lead', 'Raise the team and its lead') : t('new_team.raise', 'Raise the team');
    const own = !templateRow();
    const dirty = templateDirty();
    saveName.hidden = !(own || dirty);
    save.el.hidden = saveName.hidden;
    save.el.textContent = own ? t('save_template', 'Save as template') : t('new_team.save_as_new', 'Save as new template');
  }

  const rosterBody = (name) => ({
    name,
    kind: draft.kind,
    objective: draft.objective.trim(),
    project_root: draft.root,
    branch: draft.branch,
    routines: { ...draft.routines },
    behaviours: { books: [...draft.books] },
    agent_defaults: {
      provider: draft.provider, model: draft.model,
      reach: draft.reach, recruit: draft.recruit, output: draft.output,
      dial: draft.dial, permissions: draft.permissions,
    },
  });

  async function doRaise() {
    const name = finalizeTeamName(draft.name);
    if (busy || !isValidTeamName(name)) {
      if (!busy) notice.set('failed', t('new_team.name_invalid', 'Lowercase letters, digits, _ and - only.'));
      return;
    }
    busy = true;
    raise.setDisabled(true);
    notice.set('info', t('new_team.raising', 'Raising the team…'));
    const made = await request('/api/team-rosters', { method: 'POST', json: rosterBody(name) });
    if (!made.ok) {
      busy = false;
      raise.setDisabled(false);
      notice.set('failed', made.message);
      return;
    }
    // THE SECOND DOOR (§ 7.5): the lead offer becomes one launch, born as the 人. A team
    // with no lead is ordinary, and a lead that could not be born leaves a raised team —
    // said out loud, never rolled back (one file deletion undoes the record; a launch is
    // not a transaction with it).
    let leadFailed = '';
    if (draft.lead) {
      const born = await request('/api/launch', {
        method: 'POST',
        json: {
          session_type: 'cowork_agent',
          team: name,
          team_lead: true,
          name: `${name}_lead`,
          project_root: draft.root,
          instructions: draft.lead.brief.trim(),
          mandate: { reach: draft.lead.reach, recruit: draft.lead.recruit, output: draft.lead.output },
        },
      });
      if (!born.ok) leadFailed = born.message;
    }
    busy = false;
    raise.setDisabled(false);
    if (leadFailed) notice.set('warning', t('new_team.raised_no_lead', 'Raised {team} — the lead was not born: {reason}', { team: name, reason: leadFailed }));
    else notice.set('', '');
    reset();
    await created?.(name);
  }

  async function doSave() {
    const token = draft.templateName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!token) return;
    const routinesOn = routineRows.filter((row) => routineOn(row.name) && seedRoutines[row.name] !== true).map((row) => row.name);
    const routinesOff = routineRows.filter((row) => !routineOn(row.name) && seedRoutines[row.name] === true).map((row) => row.name);
    const result = await request('/api/templates', {
      method: 'POST',
      json: {
        name: token,
        label: draft.templateName.trim(),
        art: templateRow()?.art || '＋',
        blurb: draft.objective.trim().slice(0, 120),
        kinds: draft.kind === 'open' ? KINDS : [draft.kind],
        objective: draft.objective.trim(),
        mandate: `${draft.reach} · ${draft.recruit} · ${draft.output}`,
        behaviours: draft.books,
        routines_on: routinesOn,
        routines_off: routinesOff,
        ...(draft.lead ? {
          lead_brief: draft.lead.brief.trim(),
          lead_mandate: `${draft.lead.reach} · ${draft.lead.recruit} · ${draft.lead.output}`,
        } : {}),
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

  function reset() {
    draft.template = '';
    draft.name = '';
    draft.objective = '';
    draft.branch = '';
    draft.books = [];
    draft.lead = null;
    draft.expanded = {};
    snapshot = '';
    handRoutines = new Set();
    nameInput.value = '';
    objectiveInput.value = '';
    boardInput.value = '';
    branchInput.value = '';
    applySeed();
    paint();
  }

  /** The campaign's answers LAND — once, whole, before any hand has touched the form. */
  function applySeed() {
    if (!seed) return;
    const value = (field) => seed.seeds?.[field]?.value;
    draft.root = value('project_root') || '';
    draft.branch = value('branch') || '';
    draft.provider = value('provider') || '';
    draft.model = value('model') || '';
    for (const key of ['reach', 'recruit', 'output', 'dial', 'permissions']) {
      if (value(key)) draft[key] = value(key);
    }
    draft.books = Array.isArray(value('behaviours')) ? [...value('behaviours')] : [];
    seedRoutines = Object.fromEntries((seed.routines || []).map((row) => [row.name, row.on]));
    draft.routines = { ...seedRoutines };
    branchInput.value = draft.branch;
    permissionsInput.value = draft.permissions === 'default' ? '' : draft.permissions;
  }

  function paint() {
    for (const button of [templateDoor, manualDoor]) button.setAttribute('aria-pressed', String(button === (draft.door === 'template' ? templateDoor : manualDoor)));
    stepTemplate.el.hidden = draft.door === 'manual';
    plan().forEach((key, index) => steps[key].setNumber(index + 1));
    paintTray();
    paintKinds();
    paintName();
    paintRoots();
    pair.paint();
    paintRoutines();
    paintBooks();
    paintLead();
    paintFolds();
    paintActions();
    paintFoot();
  }

  const form = el('div', 'ntf-form');
  form.append(seg, stepTop.el, stepTemplate.el, stepObjective.el, stepWhere.el, stepKit.el, stepLead.el);
  surface.content.append(form, actions.el, notice.el, foot);

  return {
    el: surface.el,
    enter: async () => {
      paint();
      const [seeded, tray, catalog, rootRows] = await Promise.all([
        request('/api/launch-seed'),
        request('/api/templates'),
        request('/api/routines'),
        request('/api/project-roots'),
      ]);
      templates = tray.ok && Array.isArray(tray.data) ? tray.data : [];
      routineRows = catalog.ok && Array.isArray(catalog.data) ? catalog.data : [];
      roots = rootRows.ok && Array.isArray(rootRows.data) ? rootRows.data : [];
      if (seeded.ok) seed = seeded.data;
      // The seed lands only while the form is untouched — re-entering an open draft
      // must not overwrite the owner's hand.
      if (!loaded) { applySeed(); loaded = true; }
      paint();
    },
  };
}
