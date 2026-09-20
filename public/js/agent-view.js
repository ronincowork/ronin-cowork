/* The single-Agent Workbench: one ordinary Workbench tenant, not a launch special case. */
import { WorkspaceKit } from './workspace-kit.js';
import { createWarmTerminalPool } from './team-terminal-pool.js';
import { createTeamKanban, kanbanAvailability, KANBAN_NOT_INSTALLED } from './team-kanban.js';
import { refreshTeams, setTeamMembership, subscribe, teamsFromState } from './team-controller.js';
import { buildDocs, createDocumentWorkspaceAdapter } from './docs.js';
import { createFeedbackSurface, FEEDBACK_TYPE, registerFeedbackSurface } from './feedback.js';
import { fetchSessions } from './api.js';
import { refreshHome } from './home.js';
import { request } from './request.js';
import { S } from './state.js';
import { t } from './lexicon.js';
import { WORKBENCH_HEADER, DISMISSED_WORKSPACE } from './workspace-contract.js';

const PROFILE = 'agent';
const TYPES = Object.freeze({ self: 'session.terminal', commons: 'agent.commons', teams: 'agent.team-membership', tasks: 'agent.task-manager', document: 'document' });
const el = (tag, cls = '', text = '') => { const out = document.createElement(tag); if (cls) out.className = cls; if (text) out.textContent = text; return out; };
const memberships = (name) => (S.sessions.find((row) => row.name === name)?.tags || []).map(String).sort();

function registerAgentCatalog() {
  registerFeedbackSurface();
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  add({ type: TYPES.commons, header: 'tabs', className: 'wk-selector-utility', label: () => t('agent.commons', 'Commons'), summary: () => t('agent.commons_summary', 'Docs and Task Manager'), discover: (_tenant, environment) => [{ key: environment.agent() }], create: ({ workspace, detail, environment }) => environment.commons(workspace, detail) });
  add({ type: TYPES.teams, header: 'surface', className: 'wk-selector-utility', label: () => t('agent.team_membership', 'Team membership'), summary: () => t('agent.team_membership_summary', 'Add or remove this Agent from installed Teams'), discover: (_tenant, environment) => [{ key: environment.agent() }], create: ({ workspace, detail, environment }) => environment.teams(workspace, detail) });
  add({ type: TYPES.tasks, header: 'surface', className: 'wk-selector-utility', label: () => t('workspace.tab_task_manager', 'Task Manager'), discover: (_tenant, environment) => environment.taskOffers(), create: ({ workspace, detail, environment }) => environment.tasks(workspace, detail) });
  profiles.define(PROFILE, [TYPES.self, TYPES.commons, TYPES.teams, TYPES.tasks, TYPES.document, FEEDBACK_TYPE]);
}

function createMembershipSurface(agent, changed) {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('agent.team_membership', 'Team membership'), className: 'agent-team-membership' });
  const list = el('div', 'league-team-member-list');
  surface.content.append(list);
  const render = () => {
    const joined = new Set(memberships(agent));
    list.replaceChildren();
    for (const team of teamsFromState().filter((row) => !row.holding)) {
      const row = el('article', 'league-team-member');
      const words = el('div', 'league-team-member-words');
      words.append(el('strong', '', String(team.title || '').trim() || team.name), el('span', 'league-team-member-id', team.name));
      const member = joined.has(team.name);
      const action = WorkspaceKit.primitives.createAction({
        label: member ? t('league.remove_member', 'Remove') : t('agent.join_team', 'Join'),
        size: 'compact', selected: member,
        action: async () => {
          const result = await setTeamMembership(agent, team.name, !member);
          if (!result.ok) return surface.setState('failed', result.message);
          surface.setState(null, '');
          render(); changed?.();
        },
      });
      row.append(words, action.el); list.append(row);
    }
    if (!list.childElementCount) list.append(el('p', 'league-team-empty', t('agent.no_teams', 'No Teams are installed.')));
  };
  return { el: surface.el, show: render, render };
}

export function createAgentView() {
  registerAgentCatalog();
  const root = el('main', 'tw-view agent-workbench');
  const seats = {};
  let bench = null, context = null, agent = '', unsubscribe = null, entered = false;
  let availability = { available: false, message: KANBAN_NOT_INSTALLED };

  const blank = (id) => {
    const surface = WorkspaceKit.primitives.createSurface({ label: t('team.workspace_blank', 'Workspace'), className: 'tw-blank' });
    const mark = el('div', 'tile-empty-mark'); mark.setAttribute('aria-hidden', 'true');
    const logo = el('img'); logo.src = 'brand/nin-mark.svg'; logo.alt = ''; mark.append(logo); surface.content.append(mark);
    return surface.el;
  };
  for (const id of ['workspace1', 'workspace2', 'workspace3', 'workspace4']) {
    const surface = WorkspaceKit.primitives.createSurface({ label: t('agent.self', 'Self'), className: 'tw-terminal', flush: true, header: false });
    const pool = createWarmTerminalPool({ createHost: (options) => WorkspaceKit.adapters.createTerminalTileHost(options), container: surface.content, streamCap: 1 });
    seats[id] = { surface, pool, blank: blank(id) };
  }

  const commons = new Map(), membership = new Map(), tasks = new Map();
  const makeTaskManager = (id, team) => {
    const key = `${id}\0${team}`;
    if (tasks.has(key)) return tasks.get(key);
    const surface = WorkspaceKit.primitives.createSurface({ label: t('workspace.tab_task_manager', 'Task Manager'), className: 'tw-kanban' });
    const manager = createTeamKanban({ openOwner: (name) => name === agent && bench.place(TYPES.self, bench.selected(), { key: agent }) });
    manager.setTeam(team); manager.setAvailability(availability); surface.content.append(manager.el);
    const made = { el: surface.el, show: () => manager.enter(), manager }; tasks.set(key, made); return made;
  };
  const makeCommons = (id, name = agent) => {
    const key = `${id}\0${name}`;
    if (commons.has(key)) return commons.get(key);
    const docsPane = el('div', 'home-docs tw-docs');
    const docs = buildDocs(null, docsPane, () => entered && docsPane.isConnected, (candidate) => candidate === name);
    const docsService = { el: docsPane, enter: () => { void refreshHome(); docs.enter(); }, leave() {}, destroy() {} };
    const taskHost = el('div', 'tw-kanban');
    let current = null;
    const taskService = { el: taskHost, enter: () => {
      const team = memberships(agent)[0] || '';
      taskHost.replaceChildren(); current = null;
      if (!team) taskHost.append(el('p', 'league-team-empty', t('agent.no_team_tasks', 'Join a Team to use its Task Manager.')));
      else { current = makeTaskManager(`${id}-commons`, team); taskHost.append(current.el); current.show(); }
    }, leave: () => current?.manager.leave(), destroy: () => current?.manager.destroy() };
    const tabs = WorkspaceKit.primitives.createTabbedSurface({ label: t('agent.commons', 'Commons'), tabs: [
      { id: 'docs', label: t('workspace.tab_docs', 'Docs'), panel: docsService },
      { id: 'kanban', label: t('workspace.tab_task_manager', 'Task Manager'), panel: taskService },
    ], selected: 'docs' });
    const made = { el: tabs.el, show: (detail = {}) => { tabs.enter(context); if (detail.tab) tabs.select(detail.tab); } };
    commons.set(key, made); return made;
  };
  const environment = {
    agent: () => agent,
    // session.terminal is a shared Workbench surface. Its library definition discovers
    // candidates through sessions() and creates them through terminal(); every profile
    // that offers it supplies both halves of that environment contract.
    sessions: () => agent ? [{ key: agent, label: agent }] : [],
    terminal: (id, detail) => ({ el: seats[id].surface.el, show: () => { seats[id].pool.sync([agent]); seats[id].pool.show(detail.key || agent, false); } }),
    commons: (id, detail) => makeCommons(id, detail.key || agent),
    teams: (id, detail) => {
      const key = `${id}\0${detail.key || agent}`;
      if (!membership.has(key)) membership.set(key, createMembershipSurface(detail.key || agent, () => { bench.refreshSelector(); for (const item of commons.values()) item.show(); }));
      return membership.get(key);
    },
    taskOffers: () => memberships(agent).map((team) => ({ key: team, label: t('agent.team_tasks', '{team} Task Manager', { team }), summary: t('agent.team_tasks_summary', 'Projects held by {team}', { team }) })),
    tasks: (id, detail) => makeTaskManager(id, detail.key),
    document: (detail = {}) => createDocumentWorkspaceAdapter({ root: detail.root, path: detail.path || detail.key }),
    feedback: () => createFeedbackSurface(() => bench.place(TYPES.commons, bench.selected(), { key: agent })),
  };
  bench = WorkspaceKit.workbench.create({
    profile: PROFILE, tenant: { kind: 'agent', name: () => agent }, environment,
    defaultNode: (id) => seats[id].blank, label: t('agent.workbench', 'Agent'), title: () => agent || t('agent.workbench', 'Agent'),
    shapeControl: document.getElementById('shapecycle'), selectorCurrent: 'placed',
    onStateChange: (snapshot) => remember(snapshot), onPlacement: (snapshot, change) => remember(snapshot, change),
  });
  root.append(bench.host);
  const remember = (snapshot = bench.snapshot(), change = null) => {
    if (change?.dismissed) snapshot = { ...snapshot, seats: { ...snapshot.seats, [change.dismissed]: DISMISSED_WORKSPACE } };
    context?.patchViewState('agent', snapshot);
  };
  const refreshAvailability = async () => {
    const result = await request('/api/installed', { cache: 'no-store' });
    availability = result.ok ? kanbanAvailability(result.data) : { available: false, message: KANBAN_NOT_INSTALLED };
    for (const item of tasks.values()) item.manager.setAvailability(availability);
  };
  const restore = () => {
    const defaults = { count: 2, selected: 'workspace1', seats: { workspace1: { type: TYPES.self, key: agent }, workspace2: { type: TYPES.commons, key: agent } } };
    const { state } = context.workbenchEntry(defaults);
    const typed = WorkspaceKit.contract.normalizeWorkbenchState(state, bench.declaration);
    bench.enter({ arrangement: typed.arrangement, count: state.count, selected: state.selected });
    for (const id of bench.visibleIds()) {
      const held = typed.seats[id];
      if (held === DISMISSED_WORKSPACE) continue;
      if (typeof held === 'string') bench.place(held, id);
      else if (held?.type) bench.place(held.type, id, held);
    }
  };
  return {
    el: root, glyph: '•', appearance: 'agent', arrangement: bench.arrangement, header: WORKBENCH_HEADER,
    title: ({ param }) => param || t('agent.workbench', 'Agent'),
    mount: (_host, ctx) => { context = ctx; unsubscribe = subscribe(() => { if (entered) { bench.refreshSelector(); for (const item of membership.values()) item.render(); } }); },
    enter: (ctx) => {
      context = ctx; agent = ctx.param; entered = true;
      for (const seat of Object.values(seats)) seat.pool.sync([agent]);
      restore();
      void Promise.all([fetchSessions(), refreshTeams(), refreshAvailability()]).then(() => { if (!entered) return; bench.refreshSelector(); for (const item of membership.values()) item.render(); });
    },
    leave: () => { entered = false; bench.leave(); for (const seat of Object.values(seats)) seat.pool.destroyAll(); },
    destroy: () => { entered = false; unsubscribe?.(); for (const seat of Object.values(seats)) seat.pool.destroyAll(); },
    placeFeedback: () => bench.place(FEEDBACK_TYPE, bench.selected()),
  };
}
