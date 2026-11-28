/* part of the ronin-cowork client — see js/README.md */
/**
 * ALL HANDS (w1146): the phone's one roster as a two-surface workbench, a door of its own at
 * #/allhands. Workspace 1 opens on the roster of every Agent and item, asked the phone's three
 * questions (roster-lists.js: Type, Kind, Sort); Workspace 2 starts empty. A group pressed opens
 * to its rows and closes again; an Agent's row opens its tile, an item's row its reading (Find
 * item, loaded on it), in the selected surface (the other one when the roster's own is
 * selected). The roster is a selector card too, so it can be put in either surface. The selector
 * is global: New Agent, New Team, Archived Agents, Epics and Find item, each the catalog's own
 * surface over no Team.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { doorWorkbench } from './door-workbenches.js';
import { WORKBENCH_PROFILES, WORKBENCH_TYPES } from './workbench-catalog.js';
import { subscribe as hear } from './store.js';
import { membersOfTeam, subscribe, teamsFromState } from './team-controller.js';
import { onAgeTick, situationTitle } from './home.js';
import { agentLabel, cardsByName, rosterGroups, rosterQuestions, ROSTER_CHOICE, sessionOf, situationOf } from './roster-lists.js';
import { ask } from './ask.js';
import { splitItemTitle } from './item-title.js';
import { createWarmTerminalPool } from './team-terminal-pool.js';
import { createNewAgentView } from './new-agent.js';
import { createNewTeamFormView } from './new-team-form.js';
import { buildArchives } from './archives.js';
import { createEpicRecord, createEpicStones, createEpicsRead } from './epics-surface.js';
import { createFindItem } from './team-find-item.js';
import { openWorkbenchTab } from './workspace.js';
import { BEHAVIOUR_SURFACE_TYPE } from './behaviour-surface.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};
const opposite = (id) => ({ workspace1: 'workspace2', workspace2: 'workspace1', workspace3: 'workspace4', workspace4: 'workspace3' })[id] || 'workspace1';

/** The roster: the three questions and the groups, kept by the kit's keyed list (KAN-414). */
function createAllHandsRoster({ open }) {
  const { createSurface, createKeyedList } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('all_hands.roster', 'All Hands'), className: 'all-hands-roster' });
  // This viewer's three answers and open groups, remembered as the phone remembers its own.
  const choiceKey = 'ronin.all-hands.roster';
  let choice = { ...ROSTER_CHOICE, open: [] };
  try { choice = { ...choice, ...(JSON.parse(localStorage.getItem(choiceKey) || '{}') || {}) }; } catch {}
  const opened = new Set(Array.isArray(choice.open) ? choice.open : []);
  const remember = () => { try { localStorage.setItem(choiceKey, JSON.stringify({ ...choice, open: [...opened] })); } catch {} };
  const questions = ask([{ group: '', fields: rosterQuestions() }], {
    value: { type: choice.type, kind: choice.kind, sort: choice.sort }, density: 'tight',
    onChange: (next) => { choice = { ...choice, ...next }; remember(); paint(); },
  });
  const list = el('div', 'all-hands-list');
  surface.content.append(questions.el, list);
  const rows = createKeyedList({ key: (row) => row.key, shows: (row) => row.shows, draw: (row) => row.draw() });
  const leads = () => new Set(teamsFromState().flatMap((team) => membersOfTeam(team.name).filter((member) => member.team_lead).map((member) => member.name)));

  const press = (node, act) => { node.type = 'button'; node.addEventListener('click', act); return node; };
  const groupRow = (group, isOpen) => {
    const head = press(el('button', 'all-hands-group'), () => { if (opened.has(group.cardId)) opened.delete(group.cardId); else opened.add(group.cardId); remember(); paint(); });
    head.setAttribute('aria-expanded', String(isOpen));
    head.append(el('span', 'all-hands-group-name', group.label), el('span', 'all-hands-count', String(group.rows.length)));
    return head;
  };
  const agentRow = (name, situation, lead) => {
    const label = agentLabel(sessionOf(name));
    const row = press(el('button', `all-hands-row${situation ? ` ${situation}` : ''}`), () => open({ kind: 'agent', name }));
    row.title = situationTitle(label, situation);
    if (lead) row.append(el('span', 'home-job lead', '人'));
    row.append(el('span', 'all-hands-name', label));
    if (situation === 'flagged') row.append(el('span', 'all-hands-flag', '⚑'));
    return { node: row, shows: JSON.stringify([name, label, lead, situation]) };
  };
  const itemRow = (item, situation) => {
    const row = press(el('button', `all-hands-row${situation ? ` ${situation}` : ''}`), () => open({ kind: 'item', id: item.id }));
    const words = el('span', 'all-hands-name', splitItemTitle(item.title || item.id).shortTitle);
    row.append(words, el('span', 'all-hands-key', [item.id, item.kind, item.status].filter(Boolean).join(' · ')));
    if (situation === 'flagged') row.append(el('span', 'all-hands-flag', '⚑'));
    return { node: row, shows: JSON.stringify([item.id, item.title, item.kind, item.status, situation]) };
  };
  const paint = () => {
    const cardOf = cardsByName();
    const lead = leads();
    const out = [];
    for (const group of rosterGroups(choice, cardOf)) {
      const isOpen = opened.has(group.cardId);
      out.push({ key: `g:${group.cardId}`, shows: JSON.stringify([group.label, group.rows.length, isOpen]), draw: () => groupRow(group, isOpen) });
      if (!isOpen) continue;
      if (!group.rows.length) out.push({ key: `e:${group.cardId}`, shows: '', draw: () => el('p', 'all-hands-empty', t('phone.no_rows', 'Nobody here yet.')) });
      for (const row of group.rows) {
        const situation = situationOf(row, cardOf);
        const made = row.kind === 'agent' ? agentRow(row.name, situation, lead.has(row.name)) : itemRow(row.item, situation);
        out.push({ key: `${group.cardId}|${row.key}`, shows: made.shows, draw: () => made.node });
      }
    }
    if (!out.length) out.push({ key: '!none', shows: '', draw: () => el('p', 'all-hands-empty', t('phone.no_rows', 'Nobody here yet.')) });
    rows.set(list, out);
  };
  const stops = [];
  return {
    el: surface.el,
    show: () => {
      if (!stops.length) stops.push(subscribe(paint), hear('home', paint), hear('epics', paint), hear('epicItems', paint), onAgeTick(paint));
      paint();
    },
    destroy: () => { for (const stop of stops.splice(0)) stop(); rows.destroy?.(); questions.destroy?.(); },
  };
}

export function createAllHandsView() {
  const made = [];
  const keep = (surface) => { made.push(surface); return surface; };
  const terminals = {}; // workspace -> its tile seat, built the first time an Agent opens there
  const newAgents = {};
  const newTeams = {};
  const archives = {};
  const deskDefaults = () => ({ destination: 'settings2', mode: 'replace', state: { count: 1, selected: 'workspace1', seats: { workspace1: WORKBENCH_TYPES.settings2AgentDefaults } } });
  const teamDefaults = (name) => ({ destination: 'team', param: name, mode: 'replace', state: { count: 2, selected: 'workspace1', seats: { workspace1: { type: WORKBENCH_TYPES.commons, tab: 'team-configuration' }, workspace2: WorkspaceKit.contract.DISMISSED_WORKSPACE } } });
  return doorWorkbench({
    id: 'allhands', profile: WORKBENCH_PROFILES.allHands, label: t('all_hands.title', 'All Hands'),
    seat: WORKBENCH_TYPES.allHandsRoster,
    selectorFilter: (type) => type !== WORKBENCH_TYPES.terminal && type !== WORKBENCH_TYPES.epicRecord && type !== BEHAVIOUR_SURFACE_TYPE,
    environment: ({ bench }) => {
      const epicsRead = createEpicsRead(() => '');
      const place = (type, id, detail = {}) => bench().place(type, id, detail);
      const seatFor = (id) => {
        if (!terminals[id]) {
          const surface = WorkspaceKit.primitives.createSurface({ label: t('team.workspace_blank', 'Tilespace'), className: 'tw-terminal', flush: true, header: false });
          const pool = createWarmTerminalPool({ createHost: (options) => WorkspaceKit.adapters.createTerminalTileHost(options), container: surface.content, streamCap: 1 });
          terminals[id] = { surface, pool };
        }
        return terminals[id];
      };
      return {
        allHandsRoster: (workspace) => keep(createAllHandsRoster({
          // A result opens in the selected surface; the roster's own selected, in the other one.
          open: (hit) => {
            const selected = bench().selected();
            const at = bench().typeAt(selected) === WORKBENCH_TYPES.allHandsRoster ? opposite(selected) : selected;
            if (hit.kind === 'agent') place(WORKBENCH_TYPES.terminal, at, { key: hit.name });
            else place(WORKBENCH_TYPES.teamFindItem, at, { key: hit.id });
            bench().select?.(at);
          },
        })),
        sessions: () => [],
        terminal: (id, detail = {}) => {
          const seat = seatFor(id);
          return { el: seat.surface.el, show: () => { seat.pool.sync([detail.key]); seat.pool.show(detail.key, false); } };
        },
        newAgent: (id, consumed) => {
          newAgents[id] ??= createNewAgentView(WorkspaceKit, {
            consumed, team: () => '',
            teamDefaultsSpec: teamDefaults, deskDefaultsSpec: deskDefaults,
            openTeamDefaults: (name) => { if (name) openWorkbenchTab(teamDefaults(name)); },
            openDeskDefaults: () => openWorkbenchTab(deskDefaults()),
            openBehaviours: () => place(BEHAVIOUR_SURFACE_TYPE, opposite(id)),
          });
          return { el: newAgents[id].el, show: (detail) => void newAgents[id].enter(detail) };
        },
        newTeamForm: (id, consumed) => {
          newTeams[id] ??= createNewTeamFormView(WorkspaceKit, { consumed, created: () => bench().refreshSelector() });
          return { el: newTeams[id].el, show: () => void newTeams[id].enter() };
        },
        archives: (id) => {
          if (!archives[id]) {
            const surface = WorkspaceKit.primitives.createSurface({ label: t('archives.card', 'Archived Agents'), className: 'tw-archives' });
            const host = el('div');
            surface.content.append(host);
            // A rehydrated Agent opens in the surface whose Archived Agents woke it.
            archives[id] = { el: surface.el, room: buildArchives({ connect: (name) => place(WORKBENCH_TYPES.terminal, id, { key: name }) }, host) };
          }
          return { el: archives[id].el, show: () => void archives[id].room.enter() };
        },
        epics: () => [],
        epicRecords: () => keep(createEpicStones({ epicsRead, workbench: bench() })),
        epicRecord: (_workspace, detail) => keep(createEpicRecord(detail.key, { epicsRead })),
        findItem: (_workspace, detail) => keep(createFindItem(detail?.key)),
      };
    },
    destroy: () => {
      for (const surface of made.splice(0)) surface.destroy?.();
      for (const seat of Object.values(terminals)) seat.pool.destroyAll();
      for (const view of Object.values(newAgents)) view.destroy?.();
    },
  });
}
