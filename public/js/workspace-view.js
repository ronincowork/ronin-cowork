/* part of the ronin-cowork client — see js/README.md */
/**
 * WORKSPACE — the thin tenant on the tenant frame (js/tenant-frame.js) for one workspace
 * folder; the route names it, the server narrows the reading to it. Standing raw: one
 * card, Reading. The Teams and boards in it, its docs and repos, the tiles of whoever is
 * in it and its configuration follow, one row of UI_STRUCTURE.md per hand-in.
 */
import { createTenantFrame } from './tenant-frame.js';
import { createReadingSurface, READING_TYPE } from './reading-surface.js';
import { t } from './lexicon.js';
import { WORKBENCH_PROFILES } from './workbench-catalog.js';
import { DISMISSED_WORKSPACE } from './workspace-contract.js';

export function createWorkspaceView() {
  const bySeat = {};
  return createTenantFrame({
    key: 'workspace',
    profile: WORKBENCH_PROFILES.workspace,
    glyph: '⌂',
    label: () => t('next.workspace', 'Workspace'),
    name: (folder) => folder || t('next.workspace', 'Workspace'),
    homeCard: READING_TYPE,
    firstOpen: () => ({ workspace1: READING_TYPE, workspace2: DISMISSED_WORKSPACE }),
    cards: (frame) => ({
      reading: (seat) => {
        bySeat[seat] ||= createReadingSurface({ label: t('tenant.reading', 'Reading'), filter: () => ({ root: [frame.param()] }) });
        return bySeat[seat];
      },
    }),
    destroy: () => { for (const surface of Object.values(bySeat)) surface.destroy(); },
  });
}
