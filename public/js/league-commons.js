import { WorkspaceKit } from './workspace-kit.js';
import { buildProjectRoots } from './projectroots.js';
import { createTeamRosterSurface } from './team-roster-surface.js';
import { createTeamTemplatesSurface } from './team-templates-surface.js';
import { t } from './lexicon.js';

export function createLeagueCommons(options) {
  let surface;
  const roots = document.createElement('div'); roots.className = 'desk-pane desk-proj show';
  const rootRoom = buildProjectRoots(roots, () => surface?.el.isConnected && surface.current() === 'roots', null);
  const roster = createTeamRosterSurface(), templates = createTeamTemplatesSurface(options);
  const service = (el, enter) => ({ el, mount: () => {}, enter: () => enter?.(), leave: () => {}, destroy: () => {} });
  const services = { roots: service(roots, rootRoom.enter), roster: service(roster.el, roster.render), templates: service(templates.el, templates.enter) };
  surface = WorkspaceKit.primitives.createChannelSurface({
    label: t('league.commons', 'League commons'),
    channels: [
      { id: 'roots', label: t('cowork.tab_roots', 'Project roots') },
      { id: 'roster', label: t('league.team_roster', 'Team roster') },
      { id: 'templates', label: t('league.templates', 'Templates') },
    ],
    selected: 'roots', services,
  });
  const select = surface.select;
  surface.select = (id) => { const picked = select(id); services[picked]?.enter(); return picked; };
  return surface;
}
