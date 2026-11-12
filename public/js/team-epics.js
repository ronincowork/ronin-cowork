/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TEAM WORKBENCH'S EPICS (`createTeamEpics`; KAN-232): the Team's Epics on the Epics board
 * (`createEpicBoard`; owner, 2026-11-06, w340): a stone per Epic across the top, the pressed one
 * shown below on this same card; with one Epic, that one.
 *
 * "The Team's Epics" are those the Team or its members hold, and the Epic above each item they
 * hold. The teams push carries their ids on the Team's row (`epics`; teams-api.ts, teamWork in
 * work-items-read.ts); the Epics themselves are the store's pushed `epics`. Nothing here asks
 * the server.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { subscribe as hearTeams, teamByName } from './team-controller.js';
import { createEpicBoard, createEpicsRead } from './epics-surface.js';

/** The Team's row on the teams push: its `epics` (ids). */
export const teamEpicIds = (row) => new Set(Array.isArray(row?.epics) ? row.epics : []);

/** The Team's Epics: the Epics board over the Epics the Team or its Agents hold. */
export function createTeamEpics({ team, openAgent = null }) {
  const { createSurface, setSurfaceState } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('epics.title', 'Epics'), className: 'setup-surface team-epics', flush: true }); // the board inside keeps its own inset
  const every = createEpicsRead(() => '');
  const mine = () => teamEpicIds(teamByName(team()));
  const read = {
    list: () => every.list().filter((epic) => mine().has(epic.id)),
    items: (id) => every.items(id),
    subscribe: (listener) => {
      const stopEpics = every.subscribe(listener);
      const stopTeams = hearTeams(listener);
      return () => { stopEpics(); stopTeams(); };
    },
  };
  const board = createEpicBoard({ epicsRead: read, header: false, openAgent });
  out.content.append(board.el);
  function paint() {
    const epics = read.list();
    const one = epics.length === 1 ? epics[0] : null;
    out.header.title.textContent = one ? (one.title || one.id) : t('epics.title', 'Epics');
    setSurfaceState(out.el, epics.length ? null : 'empty', epics.length ? '' : t('team_epics.none', 'No Epics for this Team yet.'));
    board.el.hidden = !epics.length;
  }
  let stop = null;
  return {
    el: out.el,
    show: () => { stop ??= read.subscribe(paint); paint(); board.show(); },
    destroy: () => { stop?.(); stop = null; board.destroy(); },
  };
}
