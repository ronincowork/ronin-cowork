/* part of the ronin-cowork client — see js/README.md */
/**
 * ALL HANDS (w1146): the phone's one roster as a two-surface workbench, a door of its own at
 * #/allhands. Workspace 1 opens on the roster of every Agent and item, asked the phone's three
 * questions (roster-lists.js: Kind, Sort, and Type when sorting by type); Workspace 2 starts empty. A group pressed opens
 * to its rows and closes again; an Agent's row opens its tile, an item's row its reading (Find
 * item, loaded on it), in the selected surface (the other one when the roster's own is
 * selected). The roster is a selector card too, so it can be put in either surface. The selector
 * is global, in three groups — All Hands (coloured, the priority), Teams, Epics, Workspaces; Find
 * item; New Agent, New Team, Archived Agents — each the catalog's own
 * surface over no Team.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { doorWorkbench } from './door-workbenches.js';
import { WORKBENCH_PROFILES, WORKBENCH_TYPES } from './workbench-catalog.js';
import { subscribe as hear } from './store.js';
import { membersOfTeam, subscribe, teamByName, teamsFromState, UNASSIGNED } from './team-controller.js';
import { createTeamRosterSurface } from './team-roster-surface.js';
import { createTeamOne } from './team-one.js';
import { onAgeTick, situationTitle } from './home.js';
import { agentLabel, cardsByName, rosterGroups, rosterMark, rosterQuestions, rosterRowClass, rosterShown, ROSTER_CHOICE, sessionOf, situationOf } from './roster-lists.js';
import { ask } from './ask.js';
import { splitItemTitle } from './item-title.js';
import { createWarmTerminalPool } from './team-terminal-pool.js';
import { createNewAgentView } from './new-agent.js';
import { createNewTeamFormView } from './new-team-form.js';
import { buildArchives } from './archives.js';
import { createEpicRecord, createEpicStones, createEpicsRead } from './epics-surface.js';
import { createFindItem } from './team-find-item.js';
import { createWorkspaceRecord, createWorkspaceStones, workspaceOffers } from './workspaces-surface.js';
import { createWorkspacesRead } from './workspaces-read.js';
import { loadCampaigns } from './campaigns.js';
import { openWorkbenchTab } from './workspace.js';
import { BEHAVIOUR_SURFACE_TYPE } from './behaviour-surface.js';
import { SURFACE_DRAG } from './workbench.js';

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
  // This viewer's three answers and the groups they closed, remembered as the phone remembers its
  // own. Every group opens expanded (owner, 28 Nov): closed only once pressed closed.
  const choiceKey = 'ronin.all-hands.roster';
  let choice = { ...ROSTER_CHOICE, closed: [] };
  try { choice = { ...choice, ...(JSON.parse(localStorage.getItem(choiceKey) || '{}') || {}) }; } catch {}
  const closed = new Set(Array.isArray(choice.closed) ? choice.closed : []);
  const remember = () => { try { localStorage.setItem(choiceKey, JSON.stringify({ type: choice.type, kind: choice.kind, sort: choice.sort, closed: [...closed] })); } catch {} };
  // ANYTHING DRAGS (owner, 28 Nov): a row, or an Epic's group, dropped on a work surface opens
  // there, as the selector's cards and the Epic stones do (the kit's SURFACE_DRAG drop).
  const draggable = (node, type, key, label) => {
    node.draggable = true;
    node.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type, detail: { key } }));
      event.dataTransfer.setData('text/plain', label);
      event.dataTransfer.effectAllowed = 'copy';
    });
    return node;
  };
  const questions = ask([{ group: '', fields: rosterQuestions() }], {
    value: { type: choice.type, kind: choice.kind, sort: choice.sort }, density: 'tight',
    onChange: (next) => { choice = { ...choice, ...next }; remember(); questions.show(rosterShown(choice)); paint(); },
  });
  questions.show(rosterShown(choice));
  const list = el('div', 'all-hands-list');
  surface.content.append(questions.el, list);
  const rows = createKeyedList({ key: (row) => row.key, shows: (row) => row.shows, draw: (row) => row.draw() });
  const leads = () => new Set(teamsFromState().flatMap((team) => membersOfTeam(team.name).filter((member) => member.team_lead).map((member) => member.name)));

  const press = (node, act) => { node.type = 'button'; node.addEventListener('click', act); return node; };
  const groupRow = (group, isOpen) => {
    const head = press(el('button', 'all-hands-group'), () => { if (closed.has(group.cardId)) closed.delete(group.cardId); else closed.add(group.cardId); remember(); paint(); });
    head.setAttribute('aria-expanded', String(isOpen));
    head.append(el('span', 'all-hands-group-name', group.label), el('span', 'all-hands-count', String(group.rows.length)));
    // An Epic's group is that Epic, a Team's that Team: dragged, it opens where it is dropped.
    if (choice.sort !== 'active' && choice.type === 'epic' && group.id) draggable(head, WORKBENCH_TYPES.epicRecord, group.id, group.label);
    if (choice.sort !== 'active' && choice.type === 'team' && group.team && group.team !== UNASSIGNED) draggable(head, WORKBENCH_TYPES.team, group.team, group.label);
    if (choice.sort !== 'active' && choice.type === 'workspace' && group.id) draggable(head, WORKBENCH_TYPES.workspaceRecord, group.id, group.label);
    return head;
  };
  const agentRow = (name, situation, lead) => {
    const label = agentLabel(sessionOf(name));
    const row = press(el('button', `all-hands-row ${rosterRowClass(situation)}`), () => open({ kind: 'agent', name }));
    row.title = situationTitle(label, situation);
    if (lead) row.append(el('span', 'home-job lead', '人'));
    row.append(el('span', 'all-hands-name roster-name', label), rosterMark());
    draggable(row, WORKBENCH_TYPES.terminal, name, label);
    return { node: row, shows: JSON.stringify([name, label, lead, situation]) };
  };
  const itemRow = (item, situation) => {
    const row = press(el('button', `all-hands-row ${rosterRowClass(situation)}`), () => open({ kind: 'item', id: item.id }));
    const words = el('span', 'all-hands-name roster-name', splitItemTitle(item.title || item.id).shortTitle);
    row.append(words, el('span', 'all-hands-key', [item.id, item.kind, item.status].filter(Boolean).join(' · ')), rosterMark());
    draggable(row, WORKBENCH_TYPES.teamFindItem, item.id, words.textContent);
    return { node: row, shows: JSON.stringify([item.id, item.title, item.kind, item.status, situation]) };
  };
  const paint = () => {
    const cardOf = cardsByName();
    const lead = leads();
    const out = [];
    for (const group of rosterGroups(choice, cardOf)) {
      const isOpen = !closed.has(group.cardId);
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
    seat: WORKBENCH_TYPES.allHandsRoster, loaded: loadCampaigns, // the Workspaces stones read the Campaign
    selectorFilter: (type) => ![WORKBENCH_TYPES.terminal, WORKBENCH_TYPES.team, WORKBENCH_TYPES.epicRecord, WORKBENCH_TYPES.workspaceRecord, BEHAVIOUR_SURFACE_TYPE].includes(type),
    environment: ({ bench }) => {
      const epicsRead = createEpicsRead(() => '');
      const workspacesRead = createWorkspacesRead();
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
          // A result opens in the selected surface. The roster's own selected, it opens in the first
          // empty surface on screen (two or four), else the one beside the roster, else any other
          // on screen; a drag puts it exactly where it is dropped.
          open: (hit) => {
            const selected = bench().selected();
            const shown = bench().visibleIds().filter((id) => bench().typeAt(id) !== WORKBENCH_TYPES.allHandsRoster);
            const at = bench().typeAt(selected) === WORKBENCH_TYPES.allHandsRoster
              ? shown.find((id) => bench().isDefault(id)) || shown.find((id) => id === opposite(selected)) || shown[0] || opposite(selected)
              : selected;
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
        // TEAMS (owner, 28 Nov): every Team as the Teams workbench's stones, a pressed one's view in
        // their place; a dragged stone, or a Team's group in the roster, places that Team whole.
        // The view is team-one.js's standing-alone one (createTeamOne), hearing its own pushes.
        roster: () => {
          const views = new Map();
          const stones = createTeamRosterSurface({ teamDetail: (name) => { if (!views.has(name)) views.set(name, createTeamOne(name)); return views.get(name); } });
          return keep({ el: stones.el, show: () => stones.render(), destroy: () => { for (const view of views.values()) view.destroy(); stones.destroy(); } });
        },
        teams: () => [],
        team: (_workspace, detail = {}) => {
          const surface = WorkspaceKit.primitives.createSurface({ label: teamByName(detail.key)?.title || detail.key, className: 'league-team-edit' });
          const view = createTeamOne(detail.key, { say: (state, message) => surface.setState(state, message) });
          surface.content.append(view.el);
          return keep({ el: surface.el, show: () => view.render(), destroy: () => view.destroy() });
        },
        epics: () => [],
        epicRecords: () => keep(createEpicStones({ epicsRead, workbench: bench() })),
        epicRecord: (_workspace, detail) => keep(createEpicRecord(detail.key, { epicsRead })),
        findItem: (_workspace, detail) => keep(createFindItem(detail?.key)),
        // WORKSPACES (owner, 28 Nov): the Workspaces workbench's stones, a pressed one's page in
        // their place; a dragged stone, or a Workspace's group in the roster, places it whole.
        workspaces: () => workspaceOffers(workspacesRead),
        workspaceRecords: () => keep(createWorkspaceStones({ workspacesRead, workbench: bench(), recordType: WORKBENCH_TYPES.workspaceRecord })),
        workspaceRecord: (_workspace, detail) => keep(createWorkspaceRecord(detail.key, { workspacesRead })),
      };
    },
    destroy: () => {
      for (const surface of made.splice(0)) surface.destroy?.();
      for (const seat of Object.values(terminals)) seat.pool.destroyAll();
      for (const view of Object.values(newAgents)) view.destroy?.();
    },
  });
}
