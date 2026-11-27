/* part of the ronin-cowork client — see js/README.md */
/**
 * ONE TEAM'S OPEN VIEW (owner, 2026-11-23; KAN-801): its bar (an Epic's bar on its page; pressed,
 * its Configuration under it), its Agents as bars that open the same way (KAN-964) and its Epics
 * as stones, each a line that expands and collapses. One module so every surface that opens a Team shows the same thing: the
 * Teams page (cowork-view.js), a Team placed in a tilespace, and a Workspace's own Teams
 * (workspaces-surface.js, through createTeamOne).
 */
import { WorkspaceKit } from './workspace-kit.js';
import { deleteTeamRoster, membersOfTeam, subscribe, teamByName, teamGone, UNASSIGNED } from './team-controller.js';
import { agentSituation, situationTitle } from './home.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { openWorkspaceTab } from './workspace.js';
import { subscribe as subscribeStore, get as getStore } from './store.js';
import { renderTeamConfiguration } from './team-configuration.js';
import { agentTitle, configSignature } from './team-members.js';
import { createAgentCompositionReader } from './agent-composition.js';
import { teamEpicIds } from './team-epics.js';
import { createEpicStones, createEpicsRead, createItemBoard } from './epics-surface.js';
import { counted, createLifecycle, statusKey } from './item-lifecycle.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};
const { createAction, createActionBar } = WorkspaceKit.primitives;
/** A Team's name as a person reads it: its title, else its name in words; No Team for the Agents outside any. */
export const readableTeam = (name) => (name === UNASSIGNED ? t('teams_surface.no_team', 'No Team') : String(teamByName(name)?.title ?? '').trim() || teamGone(name)?.title || String(name).split(/[_-]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(' '));

// ONE TEAM (owner, 2026-11-22; w900): what the Team is — its concept (the objective) and the
// Workspace it covers with that Workspace's repositories — then its Agents (a bar each, the Epic
// page's item bars: the lead's first, each opening its Agent), and below them two lines that
// expand and collapse (owner, 2026-11-23: no view switch): Epics (the Team's open Epics as the
// Epic stones) and Configuration (the Team's form, Delete team at its foot). Painted into a host: a Teams stone's detail
// (leagueTeamDetail) or a whole tilespace (createLeagueTeamSurface). No Team has Agents only.
const teamFoldsOpen = new Map(); // `${team}\0${fold}` -> open, for this page
/** A BAR THAT OPENS (owner, 2026-11-23; the Epic's own bar on its page): pressed, `under` shows
 * beneath it, the bar staying as its title; pressed again it closes. Remembered under `key` for
 * this page; `onOpen` runs each time it opens. The Team's bar and each Agent's. */
const pressable = (bar, under, key, title, onOpen = () => {}) => {
  bar.classList.add('team-bar-pressable');
  bar.setAttribute('role', 'button');
  bar.tabIndex = 0;
  bar.title = title;
  const set = (open) => {
    under.hidden = !open;
    teamFoldsOpen.set(key, open);
    bar.setAttribute('aria-expanded', String(open));
    if (open) onOpen();
  };
  set(teamFoldsOpen.get(key) === true);
  bar.addEventListener('click', (event) => { if (!event.target.closest('button, a, .lifecycle')) set(under.hidden); });
  bar.addEventListener('keydown', (event) => { if (event.target === bar && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); set(under.hidden); } });
};
export function createTeamBody(name, { say = () => {}, rows: rowsOf = () => new Map(), openTeam = (team) => openWorkspaceTab('team', team), onDeleted = () => {} } = {}) {
  const rows = { get: (agent) => rowsOf().get(agent) };
  const holding = name === UNASSIGNED;
  // THE TEAM'S BAR (owner, 2026-11-23): the Epic's own bar on its page, the same item bar its
  // work items wear (tile-island.js itemBar's classes): the name with Launch, the concept in full
  // and the shared lifecycle line along its foot. No facts line (owner, 2026-11-23: crowded).
  const title = el('span', 'item-bar-title team-bar-title', readableTeam(name));
  const objective = el('span', 'item-bar-objective team-bar-objective');
  const teamLine = createLifecycle('line');
  const launch = createAction({ label: t('league.launch_team', 'Launch'), size: 'compact', action: () => openTeam(name) });
  const remove = createAction({ label: t('league.delete_team', 'Delete team'), kind: 'danger', size: 'compact', action: async () => { const count = membersOfTeam(name).length; if (!window.confirm(t('league.delete_team_confirm', 'Delete {team}? {count} Agents will lose this Team membership.', { team: name, count }))) return; const result = await deleteTeamRoster(name); if (!result.ok) { say('failed', result.message); return; } onDeleted(name); } });
  // A FOLD (owner, 2026-11-23): a line naming what is under it; press it to expand or collapse.
  const fold = (key, label, onOpen = () => {}, remembered = `${name}\0${key}`) => {
    const node = el('details', `team-fold team-fold-${key}`);
    const line = el('summary', 'team-fold-line', label);
    // Its count in brackets (owner, 2026-11-23), so a closed line still says how many.
    const count = (n) => { const words = `${label} (${n})`; if (line.textContent !== words) line.textContent = words; };
    const body = el('div', `team-fold-body league-team-view league-team-view-${key}`);
    node.append(line, body);
    node.open = teamFoldsOpen.get(remembered) ?? key === 'agents'; // Agents open on arrival
    node.addEventListener('toggle', () => { teamFoldsOpen.set(remembered, node.open); if (node.open) onOpen(); });
    if (node.open) queueMicrotask(onOpen);
    return { node, body, count };
  };
  let epicStones = null; // built the first time Epics opens
  const epicsFold = fold('epics', t('epics.title', 'Epics'), () => {
    if (epicStones) return;
    const every = createEpicsRead(() => '');
    const mine = () => teamEpicIds(teamByName(name));
    epicStones = createEpicStones({ bare: true, emptyWords: t('team_epics.none', 'No Epics for this Team yet.'), epicsRead: {
      list: () => every.list().filter((epic) => mine().has(epic.id)),
      items: (id) => every.items(id),
      subscribe: (listener) => { const a = every.subscribe(listener); const b = subscribe(listener); return () => { a(); b(); }; },
    } });
    epicsFold.body.append(epicStones.el);
    epicStones.show();
  });
  const agentsFold = fold('agents', t('league.agents', 'Agents'));
  const agents = agentsFold.body;
  // THE TEAM'S CONFIGURATION (owner, 2026-11-23): pressing the Team's bar opens it under the bar,
  // as an Epic's bar opens its reading; pressing again closes it. Agents and Epics stay below.
  const config = el('div', 'league-team-view league-team-view-config team-config-open');
  const main = el('div', 'league-team-edit-content');
  const actions = el('span', 'item-bar-state team-bar-actions');
  actions.append(launch.el);
  const head = el('span', 'item-bar-head team-bar-head'); head.append(title, actions);
  const bar = el('div', 'item-bar item-bar-lean team-bar'); bar.append(head, objective, teamLine.el);
  const top = el('div', 'epic-detail team-detail'); top.append(bar);
  if (!holding) {
    top.append(config);
    pressable(bar, config, `${name}\0config`, t('league.team_config_toggle', 'Open or close this Team\'s configuration'));
  }
  main.append(top, agentsFold.node);
  if (!holding) main.append(epicsFold.node);
  let held = new Map(); // agent name -> the items it holds, from the Team reading
  const lines = new Map(); // agent name -> its progress line, kept so a bar compares the same node
  const lineOf = (agent) => { if (!lines.has(agent)) lines.set(agent, createLifecycle('line')); return lines.get(agent); };
  // No New Agent here (owner, 2026-11-23): an Agent is added to a Team where Agents are made.
  // AN AGENT OPENED (owner, 2026-11-23), under its bar: lines that expand and collapse: Work items
  // (the Epics board's bars over what it holds, epics-surface.js createItemBoard) and Configuration
  // (the Agent's own: name, mandate and the rest, agent-composition.js). Its objective is on its bar.
  // Kept per Agent, so it keeps what is open in it.
  const panels = new Map();
  const panelOf = (agent) => {
    if (panels.has(agent)) return panels.get(agent);
    const box = el('div', 'team-config-open team-agent-open');
    const board = createItemBoard({ every: () => (held.get(agent) || []).map((item) => ({ ...item })), empty: t('island.none', 'This Agent holds no open work items.') });
    const work = fold('agent-items', t('island.items', 'Work items held'), () => board.paint(), `${name}\0${agent}\0items`);
    work.body.append(board.el);
    let reader = null;
    const configKey = `${name}\0${agent}\0config`;
    if (!teamFoldsOpen.has(configKey)) teamFoldsOpen.set(configKey, true);
    const config = fold('agent-config', t('workspace.tab_team_configuration', 'Configuration'), () => {
      if (reader) return;
      // Its Save, as the tile's Configuration has it (tilehead.js openConfiguration): nothing saves on its own.
      reader = createAgentCompositionReader(agent);
      config.body.append(reader.el, createActionBar({ actions: [reader.action] }).el);
      reader.show?.();
    }, configKey);
    box.append(work.node, config.node);
    const one = { box, board, destroy: () => { board.destroy(); reader?.destroy?.(); } };
    panels.set(agent, one);
    return one;
  };
  // THE AGENTS AS BARS (owner, 2026-11-27, KAN-964): each Agent a bar as the Team's own bar above
  // and an Epic's bar are (item-bar's classes in .epic-detail): 人 and its title; at the right how
  // many open items it holds and one mark — ⚑ when flagged, else the pill's dot (solid working,
  // hollow just finished); its objective (its work record's); the lifecycle line along its foot.
  // Pressed, its panel opens under the bar, the bar staying as its title (panelOf); pressed again
  // it closes. Laid by the kit's keyed list (KAN-413): one Agent moves, one bar repaints, an open
  // panel is never rebuilt.
  const agentList = el('div', 'epic-bars team-agent-bars');
  agents.append(agentList);
  const agentBars = WorkspaceKit.primitives.createKeyedList({ key: (row) => row.name, create: (first) => {
    const agent = first.name;
    const title = el('span', 'item-bar-title team-bar-title');
    const size = el('small', 'team-agent-size');
    const mark = el('span', 'team-agent-mark');
    const state = el('span', 'item-bar-state team-bar-actions'); state.append(size, mark);
    const head = el('span', 'item-bar-head team-bar-head'); head.append(title, state);
    const objective = el('span', 'item-bar-objective team-bar-objective');
    const bar = el('div', 'item-bar item-bar-lean team-bar team-agent-bar'); bar.append(head, objective, lineOf(agent).el);
    const box = el('div', 'epic-detail team-detail team-agent'); box.dataset.session = agent;
    const panel = panelOf(agent);
    box.append(bar, panel.box);
    pressable(bar, panel.box, `${name}\0${agent}\0open`, t('league.agent_toggle', 'Open or close this Agent'), () => panel.board.paint());
    let shown = '';
    const update = (row) => {
      const words = String(rows.get(agent)?.tegami?.objective || '').trim();
      const now = JSON.stringify([row.title, row.team_lead, row.mark, row.markTitle, row.size, words]);
      if (now === shown) return;
      shown = now;
      title.textContent = row.team_lead ? `人 ${row.title}` : row.title;
      size.textContent = String(row.size);
      mark.className = `team-agent-mark${row.mark ? ` is-${row.mark}` : ''}`;
      mark.textContent = row.mark === 'flagged' ? '⚑' : '';
      mark.title = row.markTitle;
      mark.hidden = !row.mark;
      bar.classList.toggle('is-flagged', row.mark === 'flagged');
      objective.textContent = words;
      objective.hidden = !words;
    };
    update(first);
    return { nodes: () => [box], update };
  } });
  const paintAgents = () => {
    const list = membersOfTeam(name).map((member) => {
      const card = rows.get(member.name) || {};
      // What an Agent holds is its work, an Epic too (owner, 2026-11-23): counted and drawn as a
      // Task is; a Subtask stays its Task's step. (An Epic's or a Team's own summary still counts
      // level-0 items only: there an Epic is the summary itself.)
      const mine = (held.get(member.name) || []).map((item) => (item.level === 1 ? { ...item, level: 0 } : item));
      const open = mine.filter((item) => statusKey(item.status) !== 'done' && counted(item));
      lineOf(member.name).update(mine);
      const situation = mine.some((item) => item.flagged && statusKey(item.status) !== 'done') ? 'flagged' : agentSituation(card);
      const mark = ['flagged', 'working', 'ready'].includes(situation) ? situation : '';
      return { name: member.name, team_lead: member.team_lead, title: agentTitle(member),
        mark, markTitle: mark ? situationTitle(agentTitle(member), mark) : '', size: open.length };
    }).sort((a, b) => Number(b.team_lead) - Number(a.team_lead) || Number(b.mark === 'flagged') - Number(a.mark === 'flagged') || a.title.localeCompare(b.title));
    for (const [agent, panel] of panels) if (!list.some((row) => row.name === agent)) { panel.destroy(); panels.delete(agent); }
    agentsFold.count(list.length);
    agentBars.set(agentList, list);
    for (const panel of panels.values()) if (panel.box.isConnected && !panel.box.hidden) panel.board.paint();
  };
  const readWork = async () => {
    if (holding) return;
    const result = await request(`/api/work-items?team=${encodeURIComponent(name)}`, { cache: 'no-store' });
    const items = result.ok && Array.isArray(result.data.items) ? result.data.items : [];
    held = new Map();
    for (const item of items) if (item.holder.startsWith('agent:')) held.set(item.holder.slice(6), [...(held.get(item.holder.slice(6)) || []), item]);
    paintAgents();
  };
  // Same contract as renderConfig below: every publish lands here, so the body only
  // rebuilds — and refetches the configuration's catalogs — when what it shows moved.
  // The configuration follows the saved record alone, so a session coming or going never
  // repaints an edit in progress (owner, 2026-09-13). A stance moves only its Agent's row;
  // the work is asked again when the members or the Team's items moved, never on a stance (KAN-413).
  let seen = '';
  let seenRecord = '';
  let seenItems = '';
  const render = () => {
    const current = teamByName(name);
    const signature = configSignature(name);
    const record = JSON.stringify(current.durable ? current : null);
    const itemsNow = JSON.stringify(current.items || []);
    const membersMoved = signature !== seen;
    const recordMoved = record !== seenRecord;
    const itemsMoved = itemsNow !== seenItems;
    paintAgents();
    if (!membersMoved && !recordMoved && !itemsMoved) return;
    seen = signature;
    seenRecord = record;
    seenItems = itemsNow;
    teamLine.update(holding ? [] : current.items || []);
    epicsFold.count((current.items || []).filter((item) => item.level === 1 && statusKey(item.status) !== 'done').length);
    objective.textContent = holding ? t('teams_surface.no_team_summary', 'Agents outside any Team') : current.objective || '';
    objective.hidden = !objective.textContent;
    if (membersMoved || itemsMoved) void readWork();
    if (recordMoved && !holding) {
      const fields = el('div', null);
      config.replaceChildren(fields, createActionBar({ actions: [remove] }).el);
      renderTeamConfiguration(fields, { ...current, durable: true }, { createAction, onSaved: render });
    }
  };
  render();
  // Let go (owner via lead, 2026-11-23): its Epic stones if built, its Agent bars, each Agent's panel.
  const destroy = () => {
    epicStones?.destroy?.();
    agentBars.destroy();
    for (const panel of panels.values()) panel.destroy();
    panels.clear();
  };
  return { main, render, destroy };
}

/**
 * ONE TEAM, STANDING ALONE (KAN-801): the same view for a surface outside the Teams page. It hears
 * the Teams push and the Agents' home rows itself. Returns { el, render, destroy }.
 */
export function createTeamOne(name, { say } = {}) {
  let rows = new Map((getStore('home') || []).map((row) => [row.name, row]));
  const box = el('div', 'league-team-detail team-one');
  const status = el('p', 'league-team-detail-state'); status.setAttribute('role', 'status'); status.hidden = true;
  const team = createTeamBody(name, { rows: () => rows, say: say || ((state, message) => { status.hidden = state !== 'failed'; status.textContent = state === 'failed' ? message : ''; }) });
  box.append(status, team.main);
  const stopTeams = subscribe(() => team.render());
  const stopRows = subscribeStore('home', (list) => { rows = new Map((list || []).map((row) => [row.name, row])); team.render(); });
  return { el: box, render: team.render, destroy: () => { stopTeams?.(); stopRows?.(); team.destroy(); } };
}
