/* part of the ronin-cowork client — see js/README.md */
/**
 * THE ONE TEAM PROFILE (owner, 2026-10-03: one format, on Who's stone detail and on the Team
 * profile surface alike): head (name, objective, Launch), then
 * Agents — each Agent a block: its live dot, 人 and name on the first line, the work items
 * it holds as lines beneath, Launch at the right; pressing the name opens the Agent's
 * profile in place under it, the same reader the rail opens — then one section per board the
 * Team works on, titled with the board's name, its items as lines, then Configuration. No
 * numbering. Built from the Team's collection reading (GET /api/collection?team=, its boards
 * with their holders), the Team controller's members, and the pieces that exist: createStep,
 * itemLine, the composition reader, the Team configuration form, ask for the plus. `openItem`
 * hears an item line pressed; Who selects the item's stone, a surface opens the item overlay.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createStep, el } from './form-steps.js';
import { itemLine } from './team-kanban.js';
import { holderName } from './work-readings.js';
import { itemsHeldBy } from './who-rows.js';
import { createAgentCompositionReader } from './agent-composition.js';
import { renderTeamConfiguration, teamConfigurationMeta } from './team-configuration.js';
import { deleteTeamRoster, membersOfTeam, sessionsAvailableToTeam, setTeamLead, setTeamMembership, subscribe, teamByName } from './team-controller.js';
import { request } from './request.js';
import { agentTitle } from './team-members.js';
import { stanceLabel } from './home.js';
import { subscribe as subscribeStore } from './store.js';
import { ask } from './ask.js';
import { t } from './lexicon.js';

export function createTeamProfile(name, { openTeam = () => {}, openAgent = () => {}, onNewAgent = () => {}, openItem = () => {}, onDeleted = () => {}, say = () => {} } = {}) {
  const { createAction, createActionBar } = WorkspaceKit.primitives;
  const box = el('div', 'league-team-detail wtd');
  const head = el('div', 'league-team-detail-head');
  const title = el('h2'); const objective = el('p', 'league-team-objective');
  const launch = createAction({ label: '', launch: true, size: 'compact', title: t('league.launch_team', 'Launch'), action: () => openTeam(name) });
  launch.el.setAttribute('aria-label', launch.el.title);
  const tools = el('div', 'wk-surface-header-actions'); tools.append(launch.el);
  head.append(title, tools, objective);
  const status = el('p', 'league-team-detail-state'); status.setAttribute('role', 'status'); status.hidden = true;
  const main = el('div', 'league-team-edit-content');
  box.append(head, status, main);
  const tell = (state, message) => { status.hidden = state !== 'failed'; status.textContent = state === 'failed' ? message : ''; say(state, message); };
  const failed = (result) => { if (!result.ok) tell('failed', result.message); else tell(); };

  const folded = { agents: false, config: true };
  const boardsFolded = new Map();
  let stances = new Map(); // session name -> stance
  let open = new Set(); // Agents whose profile is open
  const readers = new Map(); // Agent name -> its composition reader

  /** The plus: an Agent already running joins, or a new one starts; with no lead, it leads. */
  const plus = () => {
    const lead = membersOfTeam(name).some((member) => member.team_lead);
    const choices = lead ? sessionsAvailableToTeam(name) : [...membersOfTeam(name), ...sessionsAvailableToTeam(name)];
    const NEW = ' new';
    const pick = ask([{ fields: [{
      key: 'agent', label: lead ? t('league.add_agent', 'Add an Agent') : t('league.choose_lead', 'Choose an Agent as team lead'),
      blank: lead ? t('league.add_agent', 'Add an Agent') : t('league.choose_lead', 'Choose an Agent as team lead'),
      options: [...choices.map((member) => ({ v: member.name, l: agentTitle(member) })), { v: NEW, l: t('league.add_lead_agent', 'Add new Agent') }],
    }] }], { density: 'tight', onChange: async ({ agent }) => {
      if (!agent) return;
      if (agent === NEW) { onNewAgent(name, !lead); return; }
      const joined = membersOfTeam(name).some((member) => member.name === agent) ? { ok: true } : await setTeamMembership(agent, name, true);
      failed(joined.ok && !lead ? await setTeamLead(agent, name, true) : joined);
    } });
    return pick.el;
  };

  const line = (item) => {
    const row = itemLine(item, { holder: holderName(item.holder) });
    row.addEventListener('click', () => openItem(item));
    return row;
  };
  const agentBlock = (member, held) => {
    const block = el('div', 'wtd-agent'); block.dataset.session = member.name;
    const row = el('div', 'wtd-agent-row');
    const button = el('button', 'wtd-agent-head'); button.type = 'button';
    button.setAttribute('aria-expanded', String(open.has(member.name)));
    const live = el('i', 'home-live'); live.dataset.stance = stances.get(member.name) || 'unknown';
    live.title = stanceLabel(stances.get(member.name)) || ''; live.setAttribute('aria-hidden', 'true');
    const words = el('span', 'wtd-agent-name');
    if (member.team_lead) words.append(el('span', 'league-team-agent-lead', '人'));
    words.append(agentTitle(member), el('span', 'wtd-agent-id', `@${member.name}`));
    button.append(live, words);
    button.addEventListener('click', () => { if (open.has(member.name)) open.delete(member.name); else open.add(member.name); paintAgents(); });
    const go = createAction({ label: t('league.launch_agent', 'Launch'), launch: true, size: 'compact', action: () => openAgent(member.name) });
    row.append(button, go.el);
    const items = el('div', 'wtd-agent-items'); items.append(...held.map(line));
    block.append(row, items);
    if (open.has(member.name)) {
      const profile = readers.get(member.name) || createAgentCompositionReader(member.name, { setState: tell });
      readers.set(member.name, profile);
      const host = el('div', 'wtd-agent-profile'); host.append(profile.el); block.append(host);
      void profile.show();
    }
    return block;
  };

  const steps = {};
  const step = (key, text, collapsed, onToggle) => { steps[key] = createStep({ n: 0, key, title: text, onToggle }); steps[key].body.classList.add('league-team-step-body'); steps[key].setCollapsed(collapsed); return steps[key]; };
  const agents = step('agents', t('league.agents', 'Agents'), folded.agents, () => { folded.agents = !folded.agents; paintFolds(); });
  const config = step('config', t('workspace.tab_team_configuration', 'Configuration'), folded.config, () => { folded.config = !folded.config; paintFolds(); });
  const boardHost = el('div', 'wtd-boards');
  main.append(agents.el, boardHost, config.el);

  let boards = []; // the Team's boards, from its collection reading
  const teamBoards = () => boards;
  let readingWork = null;
  const readWork = async () => {
    readingWork?.abort();
    const controller = new AbortController(); readingWork = controller;
    const result = await request(`/api/collection?team=${encodeURIComponent(name)}`, { cache: 'no-store', signal: controller.signal });
    if (controller.signal.aborted || !result.ok) return;
    boards = (result.data.boards || []).filter((board) => board.teams?.includes(name));
    paintAgents(); paintBoards(); paintFolds();
  };
  const paintFolds = () => {
    agents.setCollapsed(folded.agents, t('league.agent_count', '{count} Agents', { count: membersOfTeam(name).length }));
    config.setCollapsed(folded.config, teamConfigurationMeta(teamByName(name)));
  };
  const paintAgents = () => {
    const boards = teamBoards();
    const list = membersOfTeam(name).map((member) => agentBlock(member, itemsHeldBy(boards, member.name)));
    const add = el('button', 'league-team-row league-team-agent league-team-agent-plus');
    add.append(el('span'), el('span', 'league-team-agent-name', '+'));
    add.type = 'button'; add.setAttribute('aria-label', t('league.add_agent', 'Add an Agent'));
    add.addEventListener('click', () => add.replaceWith(plus()));
    agents.body.replaceChildren(...list, add);
    for (const key of [...readers.keys()]) if (!open.has(key)) { readers.get(key).destroy(); readers.delete(key); }
  };
  const paintBoards = () => {
    boardHost.replaceChildren(...teamBoards().map((board) => {
      const section = createStep({ n: 0, key: `board-${board.id}`, title: board.title, onToggle: () => { boardsFolded.set(board.id, !boardsFolded.get(board.id)); paintBoards(); } });
      section.body.classList.add('league-team-step-body');
      const items = board.stages.flatMap((stage) => stage.items);
      section.body.append(...(items.length ? items.map(line) : [el('p', 'wtd-empty', t('collection.board_empty', 'Nothing under this board yet.'))]));
      section.setCollapsed(Boolean(boardsFolded.get(board.id)), t('league.item_count', '{count} items', { count: items.length }));
      return section.el;
    }));
  };
  let seenRecord = '';
  const paintConfig = () => {
    const current = teamByName(name);
    const record = JSON.stringify(current.durable ? current : null);
    if (record === seenRecord) return;
    seenRecord = record;
    title.textContent = String(current.title ?? '').trim() || name;
    objective.textContent = current.objective || ''; objective.hidden = !current.objective;
    const fields = el('div');
    const remove = createAction({ label: t('league.delete_team', 'Delete team'), kind: 'danger', size: 'compact', action: async () => {
      const count = membersOfTeam(name).length;
      if (!window.confirm(t('league.delete_team_confirm', 'Delete {team}? {count} Agents will lose this Team membership.', { team: name, count }))) return;
      const result = await deleteTeamRoster(name);
      failed(result);
      if (result.ok) onDeleted();
    } });
    config.body.replaceChildren(fields, createActionBar({ actions: [remove] }).el);
    renderTeamConfiguration(fields, { ...current, durable: true }, { createAction, onSaved: paintConfig });
  };
  // Membership and the record follow the Team controller; the live dots follow the store's
  // home rows; the boards are read again whenever membership moves.
  let seenMembers = '';
  const render = () => {
    paintConfig();
    const members = JSON.stringify(membersOfTeam(name).map((member) => [member.name, member.team_lead]));
    if (members !== seenMembers) { seenMembers = members; void readWork(); }
    paintAgents(); paintBoards(); paintFolds();
  };
  const stopTeams = subscribe(render);
  const stopRows = subscribeStore('home', (rows) => { stances = new Map((rows || []).map((row) => [row.name, row.stance])); paintAgents(); });
  render();
  return {
    el: box, title, objective, controls: [launch], main, status, render,
    destroy: () => { stopTeams?.(); stopRows?.(); readingWork?.abort(); for (const reader of readers.values()) reader.destroy(); readers.clear(); box.remove(); },
  };
}
