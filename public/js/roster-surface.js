/* The detailed Ronin roster, promoted to a Cowork workspace surface. Restored as it was
 * consumed before the Phalanx port (b2d47e6d^:public/js/team-roster-surface.js); the Teams
 * surface is now the Phalanx, so this one lives under its own name. */
import { deleteTeamRoster, subscribe, teamsFromState } from './team-controller.js';
import { subscribe as subscribeStore } from './store.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { buildRoster } from './roster.js';
import { openWorkspaceTab } from './workspace.js';

const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

export function createRosterSurface(options = {}) {
  const label = t('league.team_roster', 'Team roster');
  const surface = WorkspaceKit.primitives.createSurface({ label, className: 'team-roster-surface' });
  const host = node('div', 'home-sec team-roster-detail');
  surface.content.append(host);
  const openTeam = (name) => openWorkspaceTab('team', name);
  const teamLabel = (name) => {
    const title = teamsFromState().find((team) => team.name === name)?.title;
    return String(title ?? '').trim() || name;
  };
  const removeTeam = async (team, count) => {
    if (!window.confirm(t('league.delete_team_confirm', 'Delete {team}? {count} Agents will lose this Team membership.', { team: teamLabel(team), count }))) return;
    const result = await deleteTeamRoster(team);
    if (!result.ok) surface.setState('failed', result.message);
    else { surface.setState(null, ''); roster.render(); }
  };
  const roster = buildRoster({ index: 'team-roster', connect: (name) => options.onOpen?.(name) }, host, {
    hideGroupCounts: true,
    groups: () => teamsFromState().filter((team) => !team.holding).map((team) => team.name),
    groupLabel: teamLabel,
    groupActions: (team, count) => {
      const launch = WorkspaceKit.primitives.createAction({
        label: t('league.launch_team', 'Launch'), launch: true, size: 'compact', action: () => openTeam(team),
      }).el;
      const remove = node('button', 'kill', '🗑');
      remove.type = 'button';
      remove.title = t('league.delete_team', 'Delete');
      remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () => void removeTeam(team, count));
      return [launch, remove];
    },
  });
  subscribe(() => roster.render());
  // The rows and rosters now arrive only by push; a pushed row repaints the list.
  subscribeStore('home', () => roster.render());
  return {
    el: surface.el,
    render: () => roster.render(),
  };
}
