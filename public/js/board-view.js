/* part of the ronin-cowork client — see js/README.md */
/**
 * BOARD — the thin tenant on the tenant frame (js/tenant-frame.js). The route names the
 * board by its item id; the server narrows the reading to it. Standing raw: one card,
 * Reading. The board, the item, the holders' tiles, Add and its configuration follow,
 * one row of UI_STRUCTURE.md per hand-in.
 */
import { createTenantFrame } from './tenant-frame.js';
import { createReadingSurface, READING_TYPE } from './reading-surface.js';
import { S } from './state.js';
import { t } from './lexicon.js';
import { WORKBENCH_PROFILES } from './workbench-catalog.js';
import { DISMISSED_WORKSPACE } from './workspace-contract.js';

export function createBoardView() {
  const titles = new Map(); // board id -> title, learned from the reading; the bar name
  const bySeat = {};
  return createTenantFrame({
    key: 'board',
    profile: WORKBENCH_PROFILES.board,
    glyph: '卜',
    label: () => t('next.board', 'Board'),
    name: (id) => titles.get(id) || id || t('next.board', 'Board'),
    homeCard: READING_TYPE,
    firstOpen: () => ({ workspace1: READING_TYPE, workspace2: DISMISSED_WORKSPACE }),
    cards: (frame) => ({
      reading: (seat) => {
        bySeat[seat] ||= createReadingSurface({
          label: t('tenant.reading', 'Reading'),
          filter: () => ({ board: frame.param() }),
          onRead: (data) => {
            const board = (data.boards || []).find((row) => row.id === frame.param());
            if (!board?.title || titles.get(board.id) === board.title) return;
            titles.set(board.id, board.title);
            S.refreshWorkspaceHeader?.();
            S.workspace?.refreshTitle?.();
          },
        });
        return bySeat[seat];
      },
    }),
    destroy: () => { for (const surface of Object.values(bySeat)) surface.destroy(); },
  });
}
