/* part of the ronin-cowork client — see js/README.md */
/**
 * NEW TEAM (owner, 25 Nov; KAN-850): one form, in Setup's Team step and wherever a Team is launched.
 * It asks only what launching a Team needs: its name, its objective (what the lead picks up and
 * starts executing), its instructions (standing directions to every Agent in it), the Workspace it is
 * dedicated to, its Agents (the lead and any others), and its Epic: one of the Workspace's open epics,
 * or a new one. No kind (a Workspace's only), no defaults (the Workspace's), no payload.
 */
import { request } from './request.js';
import { S } from './state.js';
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { screenOf, setMandates } from './mandates.js';
import { finalizeTeamName, isValidTeamName, sanitizeTeamName } from './new-team-draft.js';
import { conflictingAgentNames } from './new-team-check.js';
import { agentPicks, agentRow, createAgentRows } from './team-agents.js';
import { openLaunchHandoff } from './launch-handoff.js';
import { launchTeamAgents } from './team-loader.js';
import { createStep, el, loadHarnessCatalog } from './form-steps.js';
import { closeWorkspaceTab, reserveWorkspaceTab } from './workspace.js';
import { hearWorkspaces } from './workspaces-read.js';

export function createNewTeamFormView(kit, { created = null, consumed = null, embedded = false } = {}) {
  const { createSurface, createAction, createField, createActionBar, createNotice } = kit.primitives;

  // A Team starts with its lead (owner, 2026-10-21): one Agent marked team lead, named
  // <first word of the team name>_lead — front-2 → front_lead. The name follows the Team
  // name as it is typed until the person edits the Agent's name; the row goes like any other.
  const leadName = (teamName) => { const first = finalizeTeamName(teamName).split(/[_-]+/).filter(Boolean)[0]; return first ? `${first}_lead` : ''; };
  const seededAgents = (teamName = '') => [{ ...agentRow(), name: leadName(teamName), team_lead: true }];
  const draft = {
    title: '', name: '', objective: '', instructions: '',
    workspace: '',
    epic: '', epicTitle: '',
    agents: seededAgents(),
  };
  const followLead = (before) => {
    const was = leadName(before);
    const now = leadName(draft.name);
    if (was === now) return; // nothing to follow: a repaint here would pull the rows out from under a click
    for (const row of draft.agents) if (row.team_lead && row.name === was) row.name = now;
    agents.paint();
  };
  let screen = {};          // what the layers in play take off the mandate menus
  const rescreen = async () => { screen = await screenOf(draft.workspace ? { workspace: draft.workspace } : {}); };
  let workspaces = [];
  let epics = [];           // the Workspace's open epics, as the item search answers them
  let busy = false;

  const raise = createAction({
    label: t('forms.launch', 'Launch'),
    launch: true,
    size: 'compact',
    disabled: true,
    action: () => void doRaise(),
  });
  const surface = createSurface({ label: t('new_team.title', 'New Team'), className: 'ntf-surface', actions: [raise], header: !embedded });
  surface.header?.el.classList.add('launch-form-head'); // the form's own head, sticky (launch-forms.css)
  const notice = createNotice();
  if (embedded) {
    surface.content.classList.add('ntf-surface', 'launch-form-embed');
    const embedActions = el('div', 'launch-form-embed-actions');
    embedActions.append(raise.el);
    surface.content.append(embedActions);
  }

  /* ---- 1 · Name, objective and instructions ---- */
  const stepTop = createStep({ n: 1, key: 'top', title: t('new_team.name_objective', 'Name & objective') });
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
    const before = draft.name;
    draft.name = nameInput.value;
    followLead(before);
    paintName();
    paintTitle();
    paintActions(); // Launch wakes on the first character of a name
  });
  // Settle the name when the owner leaves the field: a trailing separator is legal to
  // TYPE and wrong to CREATE (new-team-draft.js has the whole argument).
  nameInput.addEventListener('blur', () => {
    const settled = finalizeTeamName(nameInput.value);
    if (settled !== nameInput.value) nameInput.value = settled;
    const before = draft.name;
    draft.name = settled;
    followLead(before);
    paintName();
    paintTitle();
  });
  const nameField = createField({ label: t('new_team.name', 'Team name'), control: nameInput });
  // The title follows the name until the hand edits it: the default lands, the hand has the last word.
  let titleTouched = false;
  const titleInput = el('input');
  titleInput.type = 'text';
  titleInput.spellcheck = false;
  titleInput.addEventListener('input', () => { draft.title = titleInput.value; titleTouched = true; });
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
  stepTop.body.append(topPair);
  const objectiveInput = el('textarea');
  objectiveInput.rows = 3;
  objectiveInput.placeholder = t('new_team.objective_placeholder', 'what the lead picks up and starts on');
  objectiveInput.addEventListener('input', () => { draft.objective = objectiveInput.value; });
  stepTop.body.append(createField({ label: t('new_team.objective', 'Team objective'), control: objectiveInput }).el);
  const instructionsInput = el('textarea');
  instructionsInput.rows = 3;
  instructionsInput.placeholder = t('new_team.instructions_placeholder', 'standing directions every Agent in the Team reads');
  instructionsInput.addEventListener('input', () => { draft.instructions = instructionsInput.value; });
  stepTop.body.append(createField({ label: t('new_team.instructions', 'Team instructions'), control: instructionsInput }).el);

  /* ---- 2 · The Workspace: a Team is always dedicated to one, and inherits its settings ---- */
  const stepWhere = createStep({ n: 2, key: 'where', title: t('new_team.workspace', 'Workspace') });
  const workspaceRows = () => workspaces.map((row) => ({ v: row.name, l: row.title || row.name, sub: row.objective || '' }));
  const whereQuestions = ask([
    { fields: [{ key: 'workspace', label: t('new_team.workspace', 'Workspace'), options: workspaceRows, blank: t('new_team.workspace_blank', 'Choose a Workspace') }] },
  ], {
    value: { workspace: draft.workspace },
    className: 'ntf-where-questions',
    density: 'tight',
    onChange: (value) => {
      if (value.workspace === draft.workspace) return;
      draft.workspace = value.workspace;
      draft.epic = '';
      paintActions();
      void rescreen();
      void readEpics();
    },
  });
  stepWhere.body.append(whereQuestions.el);
  const paintRoots = () => whereQuestions.set('workspace', draft.workspace);

  /* ---- 3 · Agents (js/team-agents.js) ---- */
  const agents = createAgentRows({
    n: 3, key: 'lead',
    rows: () => draft.agents,
    createAction, createActionBar,
    changed: () => {},
    screen: () => screen,
  });

  /* ---- 4 · Epic: one of the Workspace's open epics, or a new one ---- */
  const stepEpic = createStep({ n: 4, key: 'epic', title: t('new_team.epic', 'Epic') });
  const epicRows = () => epics.map((row) => ({ v: row.id, l: row.title, sub: row.id }));
  const epicQuestions = ask([
    { fields: [{ key: 'epic', label: t('new_team.epic', 'Epic'), blank: t('new_team.epic_new', 'A new epic'), options: epicRows }] },
  ], {
    value: { epic: draft.epic },
    className: 'ntf-epic-questions',
    density: 'tight',
    onChange: (value) => { draft.epic = value.epic || ''; paintEpic(); },
  });
  const epicTitleInput = el('input');
  epicTitleInput.type = 'text';
  epicTitleInput.addEventListener('input', () => { draft.epicTitle = epicTitleInput.value; });
  const epicTitleField = createField({ label: t('new_team.epic_title', 'New epic'), control: epicTitleInput });
  stepEpic.body.append(epicQuestions.el, epicTitleField.el);
  // The new epic's title, when none is written: the Team's title.
  const newEpicTitle = () => draft.epicTitle.trim() || draft.title.trim() || finalizeTeamName(draft.name);
  function paintEpic() {
    epicQuestions.set('epic', draft.epic);
    epicTitleField.el.hidden = !!draft.epic;
    epicTitleInput.placeholder = draft.title.trim() || t('new_team.epic_title_placeholder', 'what done looks like');
  }
  async function readEpics() {
    const at = draft.workspace;
    if (!at) { epics = []; epicQuestions.options('epic', epicRows); return paintEpic(); }
    const answer = await request(`/api/work-items?kind=epic&holder=${encodeURIComponent(`workspace:${at}`)}`);
    if (at !== draft.workspace) return;
    const icebox = `Icebox: ${at}`;
    epics = answer.ok && Array.isArray(answer.data?.items)
      ? answer.data.items.filter((row) => row.status !== 'Done' && row.title !== icebox) : [];
    epicQuestions.options('epic', epicRows);
    paintEpic();
  }

  const rosterBody = (name) => ({
    name,
    title: draft.title.trim(),
    objective: draft.objective.trim(),
    instructions: draft.instructions.trim(),
    workspace: draft.workspace,
  });

  // The Team's epic, once the Team exists: the one picked, handed to it, or a new one it holds.
  async function teamEpic(name) {
    if (draft.epic) {
      const handed = await request(`/api/work-items/${encodeURIComponent(draft.epic)}/handoff`, { method: 'POST', json: { team: name } });
      return handed.ok ? { id: draft.epic, title: epics.find((row) => row.id === draft.epic)?.title || '' } : { failed: handed.message };
    }
    const title = newEpicTitle();
    const made = await request('/api/work-items', { method: 'POST', json: { title, kind: 'Epic', objective: draft.objective.trim(), team: name } });
    const id = made.data?.item?.id || made.data?.id || '';
    return made.ok && id ? { id, title } : { failed: made.message };
  }

  // What the lead is told at birth: the Team's objective and its epic, then its own row's words.
  const leadPrompt = (row, epic) => [
    draft.objective.trim() ? `${t('new_team.lead_objective', 'Team objective')}: ${draft.objective.trim()}` : '',
    epic?.id ? `${t('new_team.lead_epic', 'Your epic')}: ${epic.id}${epic.title ? ` ${epic.title}` : ''}` : '',
    row.instructions,
  ].filter(Boolean).join('\n\n');

  async function doRaise() {
    const name = finalizeTeamName(draft.name);
    if (busy || !isValidTeamName(name) || !draft.workspace) {
      if (!busy && !isValidTeamName(name)) notice.set('failed', t('new_team.name_invalid', 'Lowercase letters, digits, _ and - only.'));
      return;
    }
    const launchTab = reserveWorkspaceTab();
    busy = true;
    raise.setDisabled(true);
    const picks = agentPicks(draft.agents);
    // CHECK BEFORE THE FIRST WRITE: a name taken found after the roster is made leaves a Team
    // with only part of its cast, so the whole proposed cast is checked first.
    if (picks.length) {
      const conflicts = conflictingAgentNames(picks, S.sessions);
      if (conflicts.length) {
        closeWorkspaceTab(launchTab);
        busy = false;
        raise.setDisabled(false);
        return notice.set('failed', t('new_team.agent_name_taken', 'Nothing was created. Choose another name for: {names}.', {
          names: conflicts.join(', '),
        }));
      }
    }
    notice.set('info', t('new_team.raising', 'Raising the team…'));
    // THE CANONICAL ROSTER DOOR is the duplicate-submit gate: only the request that creates
    // the Team reaches the epic and the staffing, so pressing Launch twice cannot birth the cast twice.
    const made = await request('/api/team-rosters', { method: 'POST', json: rosterBody(name) });
    if (!made.ok) {
      closeWorkspaceTab(launchTab);
      busy = false;
      raise.setDisabled(false);
      return notice.set('failed', made.message);
    }
    const epic = await teamEpic(name);
    const cast = picks.map((row) => (row.team_lead ? { ...row, instructions: leadPrompt(row, epic) } : row));
    // The Team record is the new tab's tenant. Open its requested Workbench now;
    // terminal seats remain pending until each Agent appears in the live roster.
    openLaunchHandoff({ team: name, sessions: cast }, launchTab);
    const outcomes = await launchTeamAgents(request, name, cast);
    const born = outcomes.filter(({ result }) => result?.ok).map(({ row, result }) => result.data?.name || row.name);
    const refused = outcomes.filter(({ result }) => !result?.ok);
    busy = false;
    raise.setDisabled(false);
    if (refused.length || epic.failed) {
      notice.set('failed', [
        epic.failed ? t('new_team.epic_failed', 'Team created; its epic was not: {why}.', { why: epic.failed }) : '',
        refused.length ? t('new_team.staffing_failed', 'Team created. Launched {launched} of {total} Agents: {born}. Failed: {names}. The Team is open; add the failed Agents there.', {
          launched: born.length,
          total: outcomes.length,
          born: born.length ? born.join(', ') : t('forms.none', 'none'),
          names: refused.map(({ row, result }) => `${row.name}: ${result?.message || t('forms.failed', 'failed')}`).join(', '),
        }) : '',
      ].filter(Boolean).join(' '));
      return;
    }
    notice.set('', '');
    reset();
    await created?.(name);
    await consumed?.();
  }

  function reset() {
    Object.assign(draft, { title: '', name: '', objective: '', instructions: '', epic: '', epicTitle: '', agents: seededAgents() });
    nameInput.value = '';
    titleInput.value = '';
    titleTouched = false;
    objectiveInput.value = '';
    instructionsInput.value = '';
    epicTitleInput.value = '';
    paint();
  }

  function paint() {
    paintName();
    paintRoots();
    agents.paint();
    paintEpic();
    paintActions();
  }
  function paintActions() {
    // Grey until there is a name and a Workspace, kaki — the house's go colour — once there are.
    const ready = !!finalizeTeamName(draft.name) && !!draft.workspace;
    raise.setDisabled(!ready);
    if (ready) raise.el.dataset.kind = 'primary';
    else delete raise.el.dataset.kind;
  }

  const form = el('div', 'ntf-form');
  form.append(stepTop.el, stepWhere.el, agents.step.el, stepEpic.el);
  surface.content.append(form, notice.el);

  // ITS WORKSPACES (KAN-724): read on entering, and again whenever a bench reads them (a Workspace
  // saved on the Workspaces page), so a Workspace just made is offered here without a reload.
  const readWorkspaces = async () => {
    const answer = await request('/api/workspaces');
    workspaces = answer.ok && Array.isArray(answer.data?.workspaces) ? answer.data.workspaces.filter((w) => !w.archived) : [];
    if (!draft.workspace && workspaces.length === 1) draft.workspace = workspaces[0].name;
  };
  const unhear = hearWorkspaces(() => void readWorkspaces().then(() => {
    whereQuestions.options('workspace', workspaceRows);
    paint();
    return Promise.all([rescreen(), readEpics()]);
  }));

  return {
    el: embedded ? surface.content : surface.el,
    destroy: unhear,
    enter: async (detail = {}) => {
      paint();
      const [, , catalogRows] = await Promise.all([
        readWorkspaces(),
        // The Team's inline Agent editor reads the shared provider catalog too. Load it
        // here so a fresh New Team journey does not depend on another launch surface
        // having happened to populate the module cache first.
        loadHarnessCatalog(),
        request('/api/brief/catalog'),
      ]);
      setMandates(catalogRows?.ok && Array.isArray(catalogRows.data) ? catalogRows.data : []); // the mandate menus are the catalog's mandate files
      whereQuestions.options('workspace', workspaceRows);
      await Promise.all([rescreen(), readEpics()]);
      if (typeof detail?.prompt === 'string' && detail.prompt.trim()) {
        draft.objective = detail.prompt.trim();
        objectiveInput.value = draft.objective;
      }
      paint();
    },
  };
}

/** Form-only adapter for an existing work-surface detail region. */
export function createEmbeddedNewTeamFormView(kit, options = {}) {
  return createNewTeamFormView(kit, { ...options, embedded: true });
}
