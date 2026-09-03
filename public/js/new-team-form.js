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
 * one is § 7.5's two idempotent doors — the record first, then a launch for every Agent
 * the Team is raised with, the marked one born as the 人 (`js/team-loader.js`).
 */
import { request } from './request.js';
import { t } from './lexicon.js';
import { createWhereItWorks } from './where-it-works.js';
import { finalizeTeamName, isValidTeamName, sanitizeTeamName } from './new-team-draft.js';
import { conflictingAgentNames } from './new-team-check.js';
import { agentPicks, agentRow, createAgentRows } from './team-agents.js';
import { launchTeamAgents } from './team-loader.js';
import {
  createBand, createStep, dialRowMulti, el, kindTiles, mandateSelect, providerModelPair, readingRows, tagRow, templateTray, wayTiles, bookShelves,
} from './form-steps.js';

const REACH = ['open', 'discuss', 'plan', 'execute'];
const RECRUIT = ['open', 'nobody', 'propose agents', 'staff agents'];
// A LIST since 2026-09-01, and `no code` is said rather than implied by absence.
const OUTPUT = ['open', 'a plan', 'ideas', 'code', 'an artifact', 'the team', 'no code'];
const DIALS = ['user', 'read', 'write'];
const KINDS = ['coding', 'work', 'personal', 'household', 'social', 'school'];

export function createNewTeamFormView(kit, { created = null } = {}) {
  const { createSurface, createAction, createActionBar, createField, createNotice } = kit.primitives;

  const draft = {
    template: '', templateName: '', title: '',
    name: '', kind: 'coding', objective: '',
    root: '', repos: [], branches: {},
    provider: '', model: '', reach: 'open', recruit: 'open', output: ['open'],
    dial: 'write',
    routines: {}, books: [], launchMode: 'live_dangerously',
    // The Agents this Team is raised with; the lead is a mark on one of them, not a seat.
    agents: [],
    expanded: {},
  };
  let seed = null;          // the campaign's answers, once the door has spoken
  let seedRoutines = {};    // the map as it landed — provenance's baseline
  let handRoutines = new Set();
  let templates = [];
  let routineRows = [];
  let sops = [];
  let ways = [];
  let roots = [];
  let snapshot = '';        // what the applied template wrote, for the dirty test
  let busy = false;
  let loaded = false;

  /* THE RAISE BUTTON LIVES IN THE TILE HEADER (owner, 2026-09-01), compact and quiet
   * rather than a slab at the foot of a long scroll — asleep until a team name is typed,
   * because the name is the only required field and everything under it is optional. */
  const raise = createAction({
    label: t('forms.launch', 'Launch'),
    size: 'compact',
    disabled: true,
    action: () => void doRaise(),
  });
  const surface = createSurface({ label: t('new_team.title', 'New Team'), className: 'ntf-surface', actions: [raise] });
  const notice = createNotice();

  // NO TEMPLATE | MANUAL SWITCHER (owner, 2026-09-01). The tray is a step like any other
  // and "Make your own" is the manual door; a mode switch above the form was a second way
  // to say the same thing.

  const templateRow = () => templates.find((row) => row.name === draft.template) || null;
  const offered = () => (draft.kind === 'open' ? templates : templates.filter((row) => row.kinds.includes(draft.kind)));
  const routineOn = (name) => draft.routines[name] === true;
  const onNames = () => routineRows.filter((row) => routineOn(row.name)).map((row) => row.name);

  /** What a template authors, as one string — the dirty test compares against it. */
  const authored = () => JSON.stringify({
    objective: draft.objective, books: [...draft.books].sort(), routines: draft.routines,
    mandate: [draft.reach, draft.recruit, ...draft.output], agents: draft.agents,
  });

  function applyTemplate(name) {
    draft.template = name;
    draft.expanded = {};
    const row = templateRow();
    // MAKE YOUR OWN EMPTIES THE FORM (owner, 2026-09-01: "if you select a template and
    // then you go back to make your own, it leaves the template entries there… it should
    // clear the entries below"). Back to the campaign's own answers, not to nothing — the
    // seeded defaults are what an untouched form holds. Your name, title, kind and place
    // are yours and are left alone.
    if (!row) {
      draft.objective = '';
      objectiveInput.value = '';
      draft.books = [];
      draft.routines = { ...seedRoutines };
      draft.agents = [];
      for (const key of ['reach', 'recruit']) draft[key] = seed?.seeds?.[key]?.value || 'open';
      draft.output = [seed?.seeds?.output?.value || 'open'].flat().filter(Boolean);
      snapshot = '';
      paint();
      return;
    }
    if (row.objective) { draft.objective = row.objective; objectiveInput.value = row.objective; }
    if (row.behaviours.length) draft.books = [...row.behaviours];
    for (const on of row.routines_on) if (on in draft.routines) draft.routines[on] = true;
    for (const off of row.routines_off) if (off in draft.routines) draft.routines[off] = false;
    if (row.mandate) { draft.reach = row.mandate.reach; draft.recruit = row.mandate.recruit; draft.output = [row.mandate.output].flat().filter(Boolean); }
    // THE CAST LANDS AS ROWS (@template_shelves' team shelf, 2026-09-01). A team template
    // carries `agents[]` in exactly the ruled wire shape `agentPicks()` produces, so it
    // reads straight into the editor — instructions becomes the row's assignment and
    // team_lead its mark, which is the same translation `agentPicks` does on the way out.
    // The old lead_brief/lead_mandate pair is gone: a lead is one marked row.
    draft.agents = (Array.isArray(row.agents) ? row.agents : []).map((pick) => ({
      ...agentRow(),
      name: pick.name || '',
      assignment: pick.instructions || '',
      lead: pick.team_lead === true,
      routinesOn: Array.isArray(pick.routines_on) ? [...pick.routines_on] : [],
      routinesOff: Array.isArray(pick.routines_off) ? [...pick.routines_off] : [],
      ...(pick.mandate ? {
        reach: pick.mandate.reach,
        recruit: pick.mandate.recruit,
        output: [pick.mandate.output].flat().filter(Boolean),
      } : {}),
    }));
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
    paintTitle();
    paintFoot();
    paintActions(); // Launch wakes on the first character of a name
  });
  // Settle the name when the owner leaves the field: a trailing separator is legal to
  // TYPE and wrong to CREATE (new-team-draft.js has the whole argument).
  nameInput.addEventListener('blur', () => {
    const settled = finalizeTeamName(nameInput.value);
    if (settled !== nameInput.value) nameInput.value = settled;
    draft.name = settled;
    paintName();
    paintTitle();
    paintFoot();
  });
  // No spelling rule under the field: the input enforces it as you type, so a sentence
  // describing it only tells you what you can already see happening (owner, 2026-09-01).
  const nameField = createField({ label: t('new_team.name', 'Team name'), control: nameInput });
  // THE TITLE IS DERIVED UNTIL YOU TOUCH IT (owner, 2026-09-01: "I believe it is
  // auto-populated. Then someone could change if they wanted."). Same rule as every other
  // seeded value on these forms: the default lands, the hand has the last word.
  let titleTouched = false;
  const titleInput = el('input');
  titleInput.type = 'text';
  titleInput.spellcheck = false;
  titleInput.addEventListener('input', () => { draft.title = titleInput.value; titleTouched = true; paintFoot(); });
  const titleField = createField({ label: t('new_team.readable', 'Title'), control: titleInput });
  const derivedTitle = () => finalizeTeamName(draft.name).split(/[_-]+/).filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
  const paintTitle = () => {
    if (!titleTouched) draft.title = derivedTitle();
    if (titleInput.value !== draft.title) titleInput.value = draft.title;
  };
  const topPair = el('div', 'fs-pair');
  topPair.append(nameField.el, titleField.el);
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
  stepTop.body.append(topPair, kindHost);

  /* ---- step 3 · Objective ---- */
  /* Owner, 2026-09-01: "this is just all extra stuff you can pass on to every agent in a
     team." The objective is the half already DELIVERED — `src/spawn.ts` writes it into
     every newborn's brief by name. */
  const stepObjective = createStep({ n: 3, key: 'objective', title: t('new_team.common', 'Common instructions'), onToggle: () => toggle('objective') });
  const objectiveInput = el('textarea');
  objectiveInput.rows = 3;
  objectiveInput.placeholder = t('new_team.objective_placeholder', 'what this team is for');
  objectiveInput.addEventListener('input', () => { draft.objective = objectiveInput.value; paintFoot(); });
  stepObjective.body.append(createField({ label: t('team.objective', 'Objective'), control: objectiveInput }).el);

  /* ---- step 4 · Where ---- */
  /* Owner, 2026-09-01: "combine the model provider and model with project root and branch
     into one section because that's really what we're doing. We're saying open codecs in
     the lab root… It will access whatever the fuck it wants." Where it OPENS, not where
     it is confined. */
  const stepWhere = createStep({ n: 5, key: 'where', title: t('new_team.who_where', 'Who and where'), onToggle: () => toggle('where') });
  const pair = providerModelPair(
    () => ({ provider: draft.provider, model: draft.model }),
    (provider, model) => { draft.provider = provider; draft.model = model; paintFoot(); },
    (label, control) => createField({ label, control }).el,
  );
  // WHERE IT WORKS (owner, 2026-09-03): the shared control — Born in, a tick per repository,
  // a Branch column only when Worktrees is off. The single team branch field is gone.
  const where = createWhereItWorks({ rootDefaultLabel: t('new_team.root_default', '— the box’s default —'), onChange: () => { draft.root = where.root; draft.repos = where.repos(); draft.branches = where.branches(); paintFoot(); } });
  const wherePair = el('div', 'fs-pair');
  wherePair.append(createField({ label: t('where.label', 'Where it works'), control: where.el }).el);
  // NO WIPEBOARD FIELD (owner, 2026-09-01): "the wipeboard is automatically configured…
  // no one ever even sees the fucking name." The store already defaults it to the team's
  // own token, so the form asks nothing and sends nothing.
  stepWhere.body.append(pair.el, wherePair);
  function paintRoots() { where.setRoots(roots); where.root = draft.root; where.setRepos(draft.repos, draft.branches); draft.root = where.root; }

  /* ---- step 5 · Team kit ---- */
  const stepKit = createStep({ n: 6, key: 'kit', title: t('team_kit', 'Shared toolkit'), onToggle: () => toggle('kit') });
  // NO MANDATE ON A TEAM (owner, 2026-09-01): "this is kind of a dumb thing for every
  // agent to inherit from its team. It's going to be very agent-specific anyway, and I
  // think open is the only natural thing." Reach, recruit and output stay `open` in the
  // record and are asked once, on the Agent, where they mean something.
  //
  // NO CONTROL DIAL EITHER: "I want to kill it visually, even if the plumbing is still
  // there." The record keeps its field; the form stops offering it.
  // NO PERMISSIONS FIELD (owner, 2026-09-01: "permissions just look like something to
  // confuse a user because they have no idea what that is"). He is right, and it is worse
  // than confusing: it names the provider CLI's approval mode, every launch-table cell
  // already carries `--dangerously-bypass-approvals-and-sandbox` hardcoded, and nothing
  // in `src/spawn.ts` reads the field to change a command. It is stored and attributed
  // and delivered nowhere. Raised with the lead; the record keeps its default.
  /* Launch mode is an agent default like the model: it lands in the next Agent form and
     the hand has the last word. js/new-agent.js carries the whole argument. */
  const LAUNCH_MODES = () => [
    { key: 'configured', label: t('launch_mode.configured', 'Model provider configuration'),
      sub: t('launch_mode.configured_sub', 'Ronin adds nothing to the command. The Agent starts with whatever its provider CLI already loads.') },
    { key: 'live_dangerously', label: t('launch_mode.live', 'Dangerously'),
      sub: t('launch_mode.live_sub', 'Ronin appends that provider’s own bypass flag, so the Agent does not stop to ask.') },
  ];
  const modeHost = el('div');
  const paintLaunchMode = () => {
    modeHost.replaceChildren(
      el('p', 'fs-head', t('launch_mode.head', 'launch mode')),
      wayTiles(LAUNCH_MODES(), draft.launchMode, (key) => { draft.launchMode = key; paintLaunchMode(); paintFoot(); }),
    );
  };
  /* gbrain connection is DERIVED from the gbrain ROUTINE, never a second switch (owner,
     2026-09-01: "we shouldn't have two places to turn gbrain on and off"). Here the
     routine is genuinely clickable, so "click it and it's on for the launch" is literally
     what happens — this reads its answer rather than asking again. */
  const gbrainMode = () => (routineOn('gbrain') ? 'connected' : 'disconnected');
  const routinesHead = el('p', 'fs-head', t('routines', 'Routines'));
  const worktreesMode = el('div', 'fs-worktrees-mode');
  const routinesHost = el('div');
  function paintRoutines() {
    routinesHost.replaceChildren();
    const worktreesOn = routineOn('ronin_worktrees');
    where.setWorktrees(worktreesOn);
    worktreesMode.replaceChildren(
      el('b', null, t('new_team.worktrees_mode', 'Agent work mode')),
      el('strong', null, worktreesOn
        ? t('new_team.worktrees_on', 'Own worktree where the Project Root allows it')
        : t('new_team.worktrees_off', 'Use the project checkout and its branches')),
      el('small', null, t('new_team.worktrees_help', 'Worktrees give each Agent a separate working folder and branch, so their file changes do not collide. They run only when both the Agent and repo have Worktrees on, and use the managed hand-in and Team-lead merge process.')),
    );
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
  const booksHost = el('div');
  function paintBooks() {
    // PICKED HERE, NOT BEHIND A DOOR (owner, 2026-09-01: "we should have the behaviours
    // here, and you can just choose it the same as you could in the agent form"). The same
    // two shelves New Agent offers, the same `<shelf>:<name>` addresses, one implementation
    // in form-steps.js. A team's books land in the next Agent form like every other default
    // and the hand has the last word — there is no required/offered switch any more.
    booksHost.replaceChildren(bookShelves([
      { head: t('new_agent.shelf_house', 'behaviours · the house'), prefix: 'sops', rows: sops },
      { head: t('new_agent.shelf_ways', 'behaviours · ways of working'), prefix: 'ways', rows: ways },
    ], draft.books, (address, on) => {
      draft.books = on ? [...draft.books, address] : draft.books.filter((book) => book !== address);
      paintBooks();
      paintFoot();
    }));
  }
  // No bare Behaviours heading: the two shelves head themselves.
  stepKit.body.append(modeHost, routinesHead, worktreesMode, routinesHost, booksHost);

  /* ---- step 6 · Team lead ---- */
  /* ---- step 4 · the team's own agents (js/team-agents.js) ---- */
  const agents = createAgentRows({
    n: 4, key: 'lead',
    rows: () => draft.agents,
    changed: () => paintFoot(),
    onToggle: () => toggle('lead'),
  });
  const stepLead = agents.step;

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
  /* THE TEAM'S OWN FACTS, THEN THE AGENT DEFAULTS (owner, 2026-09-01: "move the team lead
     up to number 4… everything underneath is for defaults for agent launches in that
     team"). Steps 1-4 are what this Team IS; 5-6 are what every Agent raised here starts
     with, and the band between them says so. */
  const plan = () => ['top', 'template', 'objective', 'lead', 'where', 'kit'];
  const meta = {
    objective: () => draft.objective.slice(0, 40),
    where: () => where.summary(),
    kit: () => t('new_team.kit_meta', '{routines} routines · {books} books', {
      routines: onNames().length + 1, books: draft.books.length,
    }),
    lead: () => t('new_team.agents_meta', '{n} agents', { n: draft.agents.length }),
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
      [t('add_agent.place', 'place'), where.summary()],
      [t('new_team.agents', 'Agents'), draft.agents.some((row) => row.name)
        ? tagRow(draft.agents.filter((row) => row.name).map((row) => ({ text: row.lead ? `人 ${row.name}` : row.name, on: true })))
        : ''],
      [t('new_team.members', 'members'), (() => { const em = el('em', null, t('new_team.members_note', 'derived from live tags — never stored here')); return em; })()],
    ]));
    foot.append(el('p', 'fs-head', t('new_team.inherits', 'an agent born here inherits')));
    foot.append(readingRows([
      [t('kind', 'Kind'), draft.kind],
      [t('routines', 'Routines'), tagRow([{ text: t('new_team.floor_tag', 'floor'), on: true }, ...onNames().map((text) => ({ text, on: true }))])],
      [t('behaviours', 'Behaviours'), draft.books.length ? tagRow(draft.books.map((text) => ({ text, on: true }))) : ''],
      [t('forms.model', 'model'), draft.provider ? `${draft.provider}${draft.model ? ` / ${draft.model}` : ''}` : t('forms.default', 'default')],
      [t('launch_mode.head', 'launch mode'), LAUNCH_MODES().find((row) => row.key === draft.launchMode)?.label || draft.launchMode],
      [t('gbrain_mode.head', 'gbrain connection'), gbrainMode() === 'connected' ? t('gbrain_mode.connected', 'Connected') : t('gbrain_mode.disconnected', 'Disconnected')],
      [t('mandate', 'Mandate'), `${draft.reach} · ${draft.recruit} · ${draft.output.join(', ')}`],
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
  // SAVE AS TEMPLATE SITS UNDER THE BLOCK IT SAVES (owner, 2026-09-01): "you're saving
  // that block as a configuration that you want to use over."
  const saveRow = createActionBar({ label: t('new_team.team_actions', 'Team actions'), className: 'ntf-actions' });
  saveRow.el.append(saveName, save.el);
  // SAVE AS TEMPLATE GOES AT THE BOTTOM, UNDER THE PACKET (owner, 2026-09-01: "why is the
  // save template not at the bottom with the blurb that is the packet"). The reading IS
  // the thing being saved — what this Team amounts to — so the button that saves it sits
  // beneath it, not inside one of the steps that feeds it. Mounted at the surface below.
  function paintActions() {
    // ONE WORD FOR STARTING ANYTHING (owner, 2026-09-01): "I want launch to be the
    // keyword everywhere for starting a new team and starting a new agent." Grey while
    // there is no name, kaki — the house's go colour — the moment there is one.
    const ready = !!finalizeTeamName(draft.name);
    raise.setDisabled(!ready);
    if (ready) raise.el.dataset.kind = 'primary';
    else delete raise.el.dataset.kind;
    const own = !templateRow();
    const dirty = templateDirty();
    saveName.hidden = !(own || dirty);
    save.el.hidden = saveName.hidden;
    save.el.textContent = own ? t('save_template', 'Save as template') : t('new_team.save_as_new', 'Save as new template');
  }

  const rosterBody = (name) => ({
    name,
    title: draft.title.trim(),
    kind: draft.kind,
    objective: draft.objective.trim(),
    project_root: draft.root,
    repos: draft.repos,
    branches: draft.branches,
    routines: { ...draft.routines },
    behaviours: { books: [...draft.books] },
    agent_defaults: {
      provider: draft.provider, model: draft.model,
      reach: draft.reach, recruit: draft.recruit, output: draft.output,
      dial: draft.dial, launch_mode: draft.launchMode, gbrain_mode: gbrainMode(),
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
    notice.set('info', t('new_team.checking_names', 'Checking Agent names…'));
    const picks = agentPicks(draft.agents);
    // CHECK BEFORE THE FIRST WRITE. The launch door rightly refuses an explicit name
    // collision, but discovering one after POST /api/team-rosters leaves a Team with only
    // part of the cast. The form knows the whole proposed cast, so its gate checks both
    // the live set and duplicates inside the form before it creates anything.
    const live = await request('/api/sessions', { cache: 'no-store' });
    if (!live.ok) {
      busy = false;
      raise.setDisabled(false);
      return notice.set('failed', t('new_team.name_check_failed', 'Agent names could not be checked, so nothing was created. {reason}', {
        reason: live.message,
      }));
    }
    const conflicts = conflictingAgentNames(picks, Array.isArray(live.data) ? live.data : []);
    if (conflicts.length) {
      busy = false;
      raise.setDisabled(false);
      return notice.set('failed', t('new_team.agent_name_taken', 'Nothing was created. Choose another name for: {names}.', {
        names: conflicts.join(', '),
      }));
    }
    notice.set('info', t('new_team.raising', 'Raising the team…'));
    // THE LOADER OWNS THE CAST (@team_loader, agreed on the board): one call creates the
    // record and, only if that succeeded, sends every picked row through the launch door.
    //
    // `agentPicks` is where the screen's words become the route's: a row says assignment
    // and lead, the wire says instructions and team_lead (lead's P0 ruling).
    // THE CANONICAL ROSTER DOOR STAYS HERE and is the duplicate-submit gate: only the
    // request that creates the Team reaches the staffing handoff, so pressing Raise twice
    // cannot birth the cast twice (@team_loader's refinement, taken).
    const made = await request('/api/team-rosters', { method: 'POST', json: rosterBody(name) });
    if (!made.ok) {
      busy = false;
      raise.setDisabled(false);
      return notice.set('failed', made.message);
    }
    // Then the cast, through the loader: births are awaited in order because every one
    // updates this Team's membership record. `agentPicks` is where the screen's words
    // become the route's — a row says assignment and lead, the wire says instructions
    // and team_lead.
    const outcomes = await launchTeamAgents(request, name, picks);
    const refused = outcomes.filter(({ result }) => !result?.ok);
    busy = false;
    raise.setDisabled(false);
    if (refused.length) {
      return notice.set('failed', t('new_team.staffing_failed', 'Team created, but {failed} of {total} Agents could not be launched: {names}. Open the Team and add them there.', {
        failed: refused.length,
        total: outcomes.length,
        names: refused.map(({ row }) => row.name).join(', '),
      }));
    }
    notice.set('', '');
    reset();
    await created?.(name);
  }

  async function doSave() {
    const token = draft.templateName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!token) return;
    const routinesOn = routineRows.filter((row) => routineOn(row.name) && seedRoutines[row.name] !== true).map((row) => row.name);
    const routinesOff = routineRows.filter((row) => !routineOn(row.name) && seedRoutines[row.name] === true).map((row) => row.name);
    // THE TEAM SHELF: a cast, not a loadout. Save-as-new only, per shelf.
    const result = await request('/api/templates/teams', {
      method: 'POST',
      json: {
        name: token,
        label: draft.templateName.trim(),
        art: templateRow()?.art || '＋',
        blurb: draft.objective.trim().slice(0, 120),
        kinds: draft.kind === 'open' ? KINDS : [draft.kind],
        objective: draft.objective.trim(),
        mandate: `${draft.reach} · ${draft.recruit} · ${draft.output.join(', ')}`,
        behaviours: draft.books,
        routines_on: routinesOn,
        routines_off: routinesOff,
        // The same rows the loader launches — one shape, produced in one place.
        agents: agentPicks(draft.agents),
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
    draft.repos = []; draft.branches = {};
    draft.books = [];
    draft.agents = [];
    draft.expanded = {};
    snapshot = '';
    handRoutines = new Set();
    nameInput.value = '';
    titleInput.value = '';
    titleTouched = false;
    objectiveInput.value = '';
    applySeed();
    paint();
  }

  /** The campaign's answers LAND — once, whole, before any hand has touched the form. */
  function applySeed() {
    if (!seed) return;
    const value = (field) => seed.seeds?.[field]?.value;
    draft.root = value('project_root') || '';
    draft.provider = value('provider') || '';
    draft.model = value('model') || '';
    for (const key of ['reach', 'recruit', 'dial']) {
      if (value(key)) draft[key] = value(key);
    }
    if (value('output')) draft.output = [value('output')].flat().filter(Boolean);
    // `permissions` LEAVES agent_defaults entirely (lead, 2026-09-01, carrying the owner):
    // § 7.2 is { provider, model, reach, recruit, output, dial, launch_mode }. Named on its
    // own because the seed's key is snake and the draft's is camel — folding it into the
    // loop above would have written `draft.launch_mode` and seeded nothing, forever.
    if (value('launch_mode')) draft.launchMode = value('launch_mode');
    draft.books = Array.isArray(value('behaviours')) ? [...value('behaviours')] : [];
    seedRoutines = Object.fromEntries((seed.routines || []).map((row) => [row.name, row.on]));
    draft.routines = { ...seedRoutines };
    paintRoots();
  }

  function paint() {
    plan().forEach((key, index) => steps[key].setNumber(index + 1));
    defaultsBand.setOpen(defaultsOpen);
    for (const key of ['where', 'kit']) steps[key].el.hidden = !defaultsOpen;
    payloadBand.setOpen(payloadOpen);
    foot.hidden = !payloadOpen;
    paintTray();
    paintKinds();
    paintName();
    paintRoots();
    pair.paint();
    agents.paint();
    paintRoutines();
    paintLaunchMode();
    paintBooks();
    paintFolds();
    paintActions();
    paintFoot();
  }

  const form = el('div', 'ntf-form');
  // ONE BAND OVER EVERYTHING THAT IS A DEFAULT, and it folds them all away together: a
  // Team can be raised without ever opening it, which is the point of saying so here
  // rather than repeating "this is a default, not a constraint" on each field below.
  let defaultsOpen = true;
  const defaultsBand = createBand(
    t('new_team.defaults_band', 'Everything below this is the default for Agents launched within this team.'),
    () => { defaultsOpen = !defaultsOpen; paint(); },
  );
  // THE PAYLOAD IS A SECTION, NOT A TAIL (owner, 2026-09-01): "it's just sort of stuck down
  // there like a turd. It should be a proper section, new launch payload, and marked with
  // an orange banner to hide or expand." It is what this press will actually send, so it
  // gets a band of its own and folds like the defaults above it.
  let payloadOpen = true;
  const payloadBand = createBand(
    t('forms.payload_band', 'New launch payload — what this raise will send'),
    () => { payloadOpen = !payloadOpen; paint(); },
  );
  form.append(stepTop.el, stepTemplate.el, stepObjective.el, stepLead.el, defaultsBand.el, stepWhere.el, stepKit.el);
  surface.content.append(form, notice.el, payloadBand.el, foot, saveRow.el);

  return {
    el: surface.el,
    enter: async () => {
      paint();
      const [seeded, tray, catalog, rootRows, sopRows, wayRows] = await Promise.all([
        request('/api/launch-seed'),
        request('/api/templates/teams'),
        request('/api/routines'),
        request('/api/project-roots'),
        request('/api/sops'),
        request('/api/ways'),
      ]);
      sops = sopRows.ok && Array.isArray(sopRows.data) ? sopRows.data : [];
      ways = wayRows.ok && Array.isArray(wayRows.data) ? wayRows.data : [];
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
