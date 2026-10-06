/* part of the ronin-cowork client — see js/README.md */
/**
 * COLLECTIONS — the thin tenant on the tenant frame (js/tenant-frame.js): find work, add
 * work, reassign work (samurai_lab COLLECTIONS_DIRECTION.md). Its tenant is the campaign,
 * the one machine campaign when the route names none — the "all" layer. Cards: Who; What,
 * Where and New follow, one hand-in each. No tiles. The old Teams collection (#/cowork,
 * cowork-view.js) stands beside it until this one replaces it.
 */
import { createTenantFrame } from './tenant-frame.js';
import { createWhoSurface } from './who-surface.js';
import { createWorkViewsSurface } from './work-views-surface.js';
import { membersOfTeam, teamsFromState } from './team-controller.js';
import { openWorkspaceTab } from './workspace.js';
import { t } from './lexicon.js';
import { WORKBENCH_PROFILES, WORKBENCH_TYPES } from './workbench-catalog.js';
import { DISMISSED_WORKSPACE } from './workspace-contract.js';

// Launch opens the Team's tab on the new frame (team-view.js).
function openTeam(name) {
  return openWorkspaceTab('team-next', name);
}
function leadOf(name) {
  return membersOfTeam(name).find((member) => member.team_lead)?.name || '';
}
// The Team a work item's holder works in: the holding Team, or the Team of the holding Agent.
function holderTeam(holder) {
  if (holder.startsWith('team:')) return holder.slice(5);
  if (!holder.startsWith('agent:')) return '';
  const agent = holder.slice(6);
  return teamsFromState().find((row) => membersOfTeam(row.name).some((member) => member.name === agent))?.name || '';
}

export function createCollectionsView() {
  const whoBySeat = {};
  return createTenantFrame({
    key: 'collections',
    profile: WORKBENCH_PROFILES.collections,
    glyph: '⛩',
    label: () => t('collections.title', 'Collections'),
    name: () => t('collections.title', 'Collections'),
    homeCard: WORKBENCH_TYPES.who,
    // A board's Open places the Trello view beside Who (until What exists); it is never a card here.
    selectorFilter: (type) => type !== WORKBENCH_TYPES.workViews,
    firstOpen: () => ({ workspace1: WORKBENCH_TYPES.who, workspace2: DISMISSED_WORKSPACE }),
    cards: (frame) => ({
      who: (id) => {
        whoBySeat[id] ||= createWhoSurface({ openTeam, openBoard: () => frame.place(WORKBENCH_TYPES.workViews, frame.opposite(id)) });
        return whoBySeat[id];
      },
      workViews: () => createWorkViewsSurface({ holderTeam, openTeam, team: '', leadOf }),
    }),
    destroy: () => { for (const who of Object.values(whoBySeat)) who.destroy?.(); },
  });
}
