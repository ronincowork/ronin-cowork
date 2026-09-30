/* part of the ronin-cowork client — see js/README.md */
/**
 * WORK ITEMS — every board's items read two ways, off GET /api/work-items. No phalanx. The
 * button at the top left names the view you are in; pressing it switches to the other.
 *
 *   Status   one list per stage across the top; under each, a rectangle for every board
 *            with items at that stage, and that board's items at that stage under it
 *   Board    one list per board across the top; under each, a rectangle for every stage the
 *            board has items at, and the board's items at that stage under it
 *
 * A board is a root item and its items are every item under it. Press a list head, a
 * container or an item and its overlay lies over the lists: the item overlay for a board
 * or an item, the status's items in their context for a status. Close or Escape lifts it.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { el } from './form-steps.js';
import { PROJECT_STAGES } from './team-kanban.js';
import { itemOverlay, listOverlay } from './work-details.js';
import { request } from './request.js';
import { boardStages, holderName } from './work-readings.js';
import { t } from './lexicon.js';

export const WORK_VIEWS_TYPE = 'work.views';

const STAGE_KEYS = PROJECT_STAGES.map((stage) => stage.key);
const stageName = (key) => PROJECT_STAGES.find((stage) => stage.key === key)?.label || key;
const count = (n) => n === 1 ? t('new_work.count_one', '1 item') : t('new_work.count', '{n} items', { n });

/** `holderTeam(holder)` names the Team a holder works in; `openTeam(team)` opens its workbench. */
export function createWorkViewsSurface({ holderTeam = () => '', openTeam = () => {} } = {}) {
  const { createSurface, createAction } = WorkspaceKit.primitives;
  let view = 'status';
  let boards = [];
  const surface = createSurface({ label: t('work_views.title', 'Work items'), className: 'work-views-surface' });
  const root = el('div', 'wv');
  const toggle = createAction({ size: 'compact', className: 'wv-toggle', action: () => { view = view === 'status' ? 'board' : 'status'; paint(); } });
  const notice = el('p', 'wi-notice'); notice.setAttribute('role', 'status');
  const head = el('div', 'wv-head');
  head.append(toggle.el, notice);
  const row = el('div', 'wv-row');
  root.append(head, row);
  surface.content.append(root);

  // The overlay: one at a time, over the lists; what it writes is said and re-read.
  const lift = () => root.querySelector(':scope > .work-overlay')?.remove();
  const changed = (sentence) => { notice.textContent = sentence || ''; void refresh(); };
  const openItem = (item) => {
    lift();
    const team = holderTeam(String(item.holder || ''));
    itemOverlay(root, item, {
      through: team ? [createAction({ label: t('work.open_team', 'Open {team}', { team }), size: 'compact', action: () => openTeam(team) })] : [],
      context: () => ({ stage: item.stage, parent: item.parent || item.id }), changed,
    });
  };
  const openStatus = (stage, board, items) => {
    lift();
    listOverlay(root, {
      title: board ? `${stageName(stage)} · ${board.title}` : stageName(stage),
      about: board ? t('work_views.status_in_board', 'Items under {board} at {stage}.', { board: board.title, stage: stageName(stage) })
        : t('work_views.status_all', 'Items under every board at {stage}.', { stage: stageName(stage) }),
      items,
    }, { context: () => ({ stage, parent: board?.id || '' }), changed });
  };

  const press = (className, label, secondary, action) => {
    const button = el('button', className);
    button.type = 'button';
    button.append(el('span', 'wv-label', label));
    if (secondary) button.append(el('small', 'wv-secondary', secondary));
    button.addEventListener('click', action);
    return button;
  };
  const itemRect = (item) => press('wv-item', item.title, item.holder ? `@${holderName(item.holder)}` : '', () => openItem(item));
  /** A container rectangle with its items under it, inside one frame. */
  const group = (label, items, action) => {
    const box = el('div', 'wv-group');
    const under = el('div', 'wv-items');
    under.append(...items.map(itemRect));
    box.append(press('wv-container', label, count(items.length), action), under);
    return box;
  };
  const list = (label, action, groups) => {
    const column = el('section', 'tk-column wv-list');
    const heading = el('h3');
    heading.append(press('wv-list-head', label, '', action));
    const body = el('div', 'tk-cards');
    body.append(...(groups.length ? groups : [el('p', 'tk-empty', t('team_kanban.empty', 'nothing here'))]));
    column.append(heading, body);
    return column;
  };

  const paint = () => {
    lift();
    root.dataset.view = view;
    row.scrollLeft = 0;
    toggle.el.textContent = view === 'status' ? t('work_views.status', 'Status') : t('work_views.board', 'Board');
    toggle.el.title = view === 'status' ? t('work_views.to_board', 'Showing Status. Press for Board.') : t('work_views.to_status', 'Showing Board. Press for Status.');
    if (view === 'status') row.replaceChildren(...STAGE_KEYS.map((stage) => {
      const here = boards.map((entry) => ({ board: entry.board, items: entry.stages.find((row) => row.stage === stage)?.items || [] })).filter((entry) => entry.items.length);
      const all = here.flatMap((entry) => entry.items);
      return list(stageName(stage), () => openStatus(stage, null, all),
        here.map((entry) => group(entry.board.title, entry.items, () => openItem(entry.board))));
    }));
    else row.replaceChildren(...boards.map((entry) => list(entry.board.title, () => openItem(entry.board),
      entry.stages.map((row) => group(stageName(row.stage), row.items, () => openStatus(row.stage, entry.board, row.items))))));
  };

  async function refresh() {
    const read = await request('/api/work-items', { cache: 'no-store' });
    if (!read.ok) { notice.textContent = t('work.failed', 'Could not read the work items.'); return; }
    boards = boardStages(read.data.items || [], STAGE_KEYS);
    paint();
  }
  paint();
  return {
    el: surface.el,
    show: () => void refresh(),
  };
}
