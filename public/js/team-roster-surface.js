/* The Cowork workbench's one reading of every Team: a Phalanx stone per Team. */
import { membersOfTeam, subscribe, teamsFromState, unassignedSessions, UNASSIGNED } from './team-controller.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { createPhalanx } from './phalanx.js';
import { ask } from './ask.js';
import { SURFACE_DRAG } from './workbench.js';
import { WORKBENCH_TYPES } from './workbench-catalog.js';
import { openWorkspaceTab } from './workspace.js';
import { teamsRows, workspaces } from './teams-surface-rows.js';
import { listedTeam } from './roster-groups.js';
import { createProgress } from './epic-progress.js';
import { agentTitle } from './team-members.js';

/**
 * A stone per Team (owner, 2026-11-22; w900): what the Team is. Its name, its concept (the roster
 * objective) and its lead, with a progress line along the bottom edge over everything the Team and
 * its Agents hold, in the Epic stones' colours (epic-progress.js); a Team holding nothing has no line.
 * One question, Workspace, many-of, blank All, narrows the stones to the Teams in those Workspaces.
 * The 人 mark opens the Team's own workbench. Agents outside any Team are one more stone, No Team,
 * last, while there are any: it opens the same way, into one Team workbench of their own.
 * Pressed, a stone shows its Team beside the rail (`teamDetail`, the cowork view's one renderer);
 * dragged, it places that Team in another tilespace.
 */
export function createTeamRosterSurface({ teamDetail } = {}) {
  const { createSurface, ninMark } = WorkspaceKit.primitives;
  const label = t('campaign.coworks', 'Teams');
  let roots = []; // the workspaces chosen
  const surface = createSurface({ label, className: 'team-roster-surface' });
  const filter = ask([{ fields: [
    { key: 'root', label: t('teams_surface.workspace', 'Workspace'), blank: t('teams_surface.all', 'All'), many: true, options: [] },
  ] }], { value: { root: roots }, density: 'tight', onChange: ({ root: nextRoots }) => {
    roots = (nextRoots || []).map(String);
    paint();
  } });
  const mark = (team) => {
    const node = ninMark('wk-launch-mark teams-launch');
    node.removeAttribute('aria-hidden');
    node.setAttribute('role', 'link');
    node.setAttribute('aria-label', t('teams_surface.launch', 'Launch'));
    node.addEventListener('click', (event) => { event.stopPropagation(); openWorkspaceTab('team', team); });
    return node;
  };
  // One marker per Team, kept: phalanx counts a Node by its identity, so a fresh one each push
  // would redraw every stone (KAN-413). The marker holds the 人 mark and the progress line.
  const markers = new Map();
  const markerOf = (team) => {
    if (!markers.has(team)) {
      const line = createProgress('line');
      line.el.classList.add('team-progress-line');
      const node = document.createElement('span');
      node.className = 'team-stone-marks';
      node.append(mark(team), line.el);
      markers.set(team, { node, line });
    }
    return markers.get(team);
  };
  const lead = (name) => { const one = membersOfTeam(name).find((member) => member.team_lead); return one ? agentTitle(one) : ''; };
  const items = () => {
    const rows = new Map(teamsRows(teamsFromState(), membersOfTeam, { roots }).map((row) => [row.id, row]));
    const teams = teamsFromState().filter((team) => !team.holding && listedTeam(team) && rows.has(team.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    const stones = teams.map((team) => {
      const name = String(team.title ?? '').trim() || team.name;
      const marks = markerOf(team.name);
      marks.line.update(null, (team.items || []).map((item) => ({ ...item, level: 0 })));
      const who = lead(team.name);
      return {
        id: team.name, label: name, secondary: team.objective || '', state: who ? `人 ${who}` : '',
        marker: marks.node, className: 'team-stone', draggable: true,
        events: { dragstart: (event) => {
          event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type: WORKBENCH_TYPES.team, detail: { key: team.name } }));
          event.dataTransfer.setData('text/plain', name);
          event.dataTransfer.effectAllowed = 'copy';
        } },
      };
    });
    if (!roots.length && unassignedSessions().length) {
      const marks = markerOf(UNASSIGNED);
      marks.line.update(null, []);
      stones.push({ id: UNASSIGNED, label: t('teams_surface.no_team', 'No Team'), secondary: t('teams_surface.no_team_summary', 'Agents outside any Team'), marker: marks.node, className: 'team-stone team-stone-none' });
    }
    return stones;
  };
  const renderDetail = (item, host) => {
    const view = teamDetail?.(item.id);
    if (view) host.append(view.el);
  };
  const stones = createPhalanx({ className: 'team-roster-phalanx', items: [], renderDetail });
  stones.mount(surface.content, { before: [filter.el] });
  // ONE TEAM MOVES, ONE STONE REPAINTS (KAN-413): the phalanx lays its stones through the kit's
  // keyed list, so a push that moves nothing a stone shows leaves the grid and an open detail
  // alone, and an edit in progress in the Team's configuration keeps its focus.
  const paint = () => {
    filter.options('root', workspaces(teamsFromState()).map((root) => ({ v: root, l: root })));
    stones.setItems(items());
  };
  const stop = subscribe(paint);
  return {
    el: surface.el,
    render: paint,
    destroy: () => { stop?.(); filter.destroy(); stones.destroy(); },
  };
}
