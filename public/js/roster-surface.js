/* The detailed Ronin roster, promoted to a Cowork workspace surface. Restored as it was
 * consumed before the Phalanx port (b2d47e6d^:public/js/team-roster-surface.js); the Teams
 * surface is now the Phalanx, so this one lives under its own name. */
import { deleteTeamRoster, membersOfTeam, setTeamLead, subscribe, teamsFromState } from './team-controller.js';
import { subscribe as subscribeStore } from './store.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { buildRoster } from './roster.js';
import { openWorkspaceTab } from './workspace.js';
import { ask } from './ask.js';
import { agentTitle } from './team-members.js';
import { createAgentCompositionReader } from './agent-composition.js';

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
  // AN AGENT OPENED (owner, 2026-11-27, KAN-964): a pressed row opens the Agent here, never
  // launches it (a Team launches from its heading): its Team's lead, one question to make another
  // member lead, then its configuration (the New Agent form reopened on it: mandate and the rest,
  // agent-composition.js) with its Save.
  const agentDetail = (name, team) => {
    const box = node('div', 'team-roster-agent');
    let lead = null;
    const leadNow = () => membersOfTeam(team).find((member) => member.team_lead)?.name || '';
    if (team) {
      lead = ask([{ fields: [
        { key: 'lead', label: t('league.team_lead', 'Team Lead'), blank: t('roster.no_lead', 'None'),
          options: () => membersOfTeam(team).map((member) => ({ v: member.name, l: agentTitle(member), sub: `@${member.name}` })) },
      ] }], { value: { lead: leadNow() }, density: 'tight', onChange: async ({ lead: picked }) => {
        const next = String(picked || '');
        const before = membersOfTeam(team).filter((member) => member.team_lead).map((member) => member.name);
        if (before.length === (next ? 1 : 0) && (!next || before[0] === next)) return;
        for (const one of [...before.filter((agent) => agent !== next).map((agent) => [agent, false]), ...(next && !before.includes(next) ? [[next, true]] : [])]) {
          const result = await setTeamLead(one[0], team, one[1]);
          if (!result.ok) { surface.setState('failed', result.message); return; }
        }
        surface.setState(null, '');
      } });
      box.append(lead.el);
    }
    const reader = createAgentCompositionReader(name);
    box.append(reader.el, WorkspaceKit.primitives.createActionBar({ actions: [reader.action] }).el);
    void reader.show?.();
    const stop = team ? subscribe(() => { if (lead.value().lead !== leadNow()) lead.set('lead', leadNow()); }) : null;
    return { el: box, destroy: () => { stop?.(); lead?.destroy(); reader.destroy?.(); } };
  };
  const roster = buildRoster({ index: 'team-roster', connect: () => {} }, host, {
    detail: agentDetail,
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
