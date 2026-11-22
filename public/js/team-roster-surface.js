/* The Cowork workbench's one reading of every Team: a Phalanx stone per Team. */
import { membersOfTeam, subscribe, teamsFromState, unassignedSessions, UNASSIGNED } from './team-controller.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { createPhalanx } from './phalanx.js';
import { ask } from './ask.js';
import { SURFACE_DRAG } from './workbench.js';
import { WORKBENCH_TYPES } from './workbench-catalog.js';
import { teamsRows, workspaces } from './teams-surface-rows.js';
import { listedTeam } from './roster-groups.js';
import { attention, attentionWords, createLifecycle } from './item-lifecycle.js';
import { agentTitle } from './team-members.js';

/**
 * A stone per Team (owner, 2026-11-22; w900), in the Epic stones' grammar so the two collections
 * read alike: the Team's name; what needs the person, in amber, only when something does (Needs
 * review, Flagged, Work to assign: the shared rule, item-lifecycle.js); its lead (no lead: how many
 * Agents it has); and along the bottom edge the shared item lifecycle over everything the Team and its
 * Agents hold (no line when it holds nothing). Those needing the person first, then by name. The
 * concept, the Workspace and Launch are the opened Team's. Agents outside any Team are one more
 * stone, No Team, last and plain, while there are any.
 * One question, Workspace, many-of, blank All, narrows the stones to the Teams in those Workspaces.
 * Pressed, a stone shows its Team beside the rail (`teamDetail`, the cowork view's one renderer);
 * dragged, it places that Team in another tilespace.
 */
export function createTeamRosterSurface({ teamDetail } = {}) {
  const { createSurface } = WorkspaceKit.primitives;
  const label = t('campaign.coworks', 'Teams');
  let roots = []; // the workspaces chosen
  const surface = createSurface({ label, className: 'team-roster-surface' });
  const filter = ask([{ fields: [
    { key: 'root', label: t('teams_surface.workspace', 'Workspace'), blank: t('teams_surface.all', 'All'), many: true, options: [] },
  ] }], { value: { root: roots }, density: 'tight', onChange: ({ root: nextRoots }) => {
    roots = (nextRoots || []).map(String);
    paint();
  } });
  // One line per Team, kept: phalanx counts a Node by its identity, so a fresh one each push
  // would redraw every stone (KAN-413).
  const lines = new Map();
  const lineOf = (team) => {
    if (!lines.has(team)) { const line = createLifecycle('line'); line.el.classList.add('team-progress-line'); lines.set(team, line); }
    return lines.get(team);
  };
  const agentsWord = (count) => (count === 1 ? t('teams_surface.one_agent', '1 Agent') : t('teams_surface.agents', '{count} Agents', { count }));
  const people = (name) => {
    const members = membersOfTeam(name);
    const one = members.find((member) => member.team_lead);
    return one ? `人 ${agentTitle(one)}` : agentsWord(members.length);
  };
  const items = () => {
    const rows = new Map(teamsRows(teamsFromState(), membersOfTeam, { roots }).map((row) => [row.id, row]));
    const teams = teamsFromState().filter((team) => !team.holding && listedTeam(team) && rows.has(team.name)).map((team) => {
      const needs = attention(team.items || []);
      return { team, needs, waiting: Number(needs.review || needs.flagged || needs.unassigned) };
    }).sort((a, b) => (b.waiting - a.waiting) || a.team.name.localeCompare(b.team.name));
    const stones = teams.map(({ team, needs }) => {
      const name = String(team.title ?? '').trim() || team.name;
      const line = lineOf(team.name);
      line.update(team.items || []);
      const words = attentionWords(needs);
      return {
        id: team.name, label: name, ...(words ? { secondary: words } : {}), state: people(team.name),
        marker: line.el, className: 'team-stone', draggable: true,
        events: { dragstart: (event) => {
          event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type: WORKBENCH_TYPES.team, detail: { key: team.name } }));
          event.dataTransfer.setData('text/plain', name);
          event.dataTransfer.effectAllowed = 'copy';
        } },
      };
    });
    if (!roots.length && unassignedSessions().length) {
      stones.push({ id: UNASSIGNED, label: t('teams_surface.no_team', 'No Team'), state: agentsWord(unassignedSessions().length), className: 'team-stone team-stone-none' });
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
