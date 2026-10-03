/* part of the ronin-cowork client — see js/README.md */
/**
 * TRELLO VIEW — every board's items read two ways, off GET /api/work-items. No phalanx. The
 * button at the top left reads "View by: Status" or "View by: Board"; pressing it switches.
 *
 *   Status   one list per stage across the top; in each, every board with items at that
 *            stage as a subtitle, that board's items at that stage under it
 *   Board    one list per board across the top; in each, every stage the board has items
 *            at as a subtitle, the board's items at that stage under it
 *
 * Laid out the way a Trello board is: each list one fixed-width panel as tall as what it
 * holds, its name and count at the head, Add at the foot; in Board view, Add board after
 * the last board. A board is a root item and its items are every item under it. In Board
 * view an item drags onto another board's list (it moves there) or onto empty space (it
 * becomes a board of its own). Press a list head, a subtitle or an item and its overlay
 * lies over the lists (the item overlay for a board or an item, the status's items in their
 * context for a status). Close or Escape lifts it.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { el } from './form-steps.js';
import { PROJECT_STAGES } from './team-kanban.js';
import { NEW_BOARD, draftOverlay, itemOverlay, listOverlay } from './work-details.js';
import { request } from './request.js';
import { boardStages, holderName } from './work-readings.js';
import { t } from './lexicon.js';

export const WORK_VIEWS_TYPE = 'work.views';

const STAGE_KEYS = PROJECT_STAGES.map((stage) => stage.key);
const firstLine = (text) => String(text || '').split('\n')[0];
const stageName = (key) => PROJECT_STAGES.find((stage) => stage.key === key)?.label || key;

/** `holderTeam(holder)` names the Team a holder works in; `openTeam(team)` opens its workbench;
 * `team`, on a Team's workbench, reads that Team's boards from the server and holds new boards. */
export function createWorkViewsSurface({ holderTeam = () => '', openTeam = () => {}, team = '' } = {}) {
  const { createSurface, createAction } = WorkspaceKit.primitives;
  let view = 'status';
  let boards = [];
  const surface = createSurface({ label: t('work_views.title', 'Trello view'), className: 'work-views-surface' });
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
    const holding = holderTeam(String(item.holder || ''));
    itemOverlay(root, item, {
      through: holding ? [createAction({ label: t('work.open_team', 'Open {team}', { team: holding }), size: 'compact', action: () => openTeam(holding) })] : [],
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

  const press = (className, parts, action) => {
    const button = el('button', className);
    button.type = 'button';
    button.append(...parts);
    button.addEventListener('click', action);
    return button;
  };
  /** An item: its title, and the initial of whoever holds it. */
  const card = (item) => {
    const who = holderName(item.holder);
    const mark = who ? el('span', 'wv-holder', who.slice(0, 1).toUpperCase()) : null;
    if (mark) mark.title = who;
    const button = press('wv-item', [el('span', 'wv-label', item.title), mark].filter(Boolean), () => openItem(item));
    if (view === 'board') {
      button.draggable = true;
      button.addEventListener('dragstart', (event) => event.dataTransfer?.setData('text/plain', item.id));
    }
    return button;
  };
  /** A group inside a list: a plain underlined subtitle, its items under it. */
  const group = (label, items, action) => {
    const box = el('div', 'wv-group');
    box.append(press('wv-sub', [el('span', 'wv-label', label)], action), ...items.map(card));
    return box;
  };
  /** A list: its name and count, its groups, and Add at the foot, starting where it sits. */
  const list = (label, n, action, groups, context) => {
    const column = el('section', 'wv-list');
    const add = press('wv-add', [el('i', 'wv-add-mark', '+'), el('span', null, t('work_views.add', 'Add a work item'))],
      () => { lift(); draftOverlay(root, { ...context, changed }); });
    column.append(press('wv-list-head', [el('span', 'wv-label', label), el('span', 'wv-count', String(n))], action), ...groups, add);
    // Board view: an item dropped on another board's list moves under that board.
    if (view === 'board') {
      column.addEventListener('dragover', (event) => { event.preventDefault(); column.classList.add('over'); });
      column.addEventListener('dragleave', () => column.classList.remove('over'));
      column.addEventListener('drop', (event) => {
        event.preventDefault(); event.stopPropagation(); column.classList.remove('over');
        const id = event.dataTransfer?.getData('text/plain') || '';
        if (id && boardOf.get(id) !== context.parent) void move(id, context.parent);
      });
    }
    return column;
  };

  /* DRAG IN BOARD VIEW. Onto another board's list: the item (its children with it) moves
   * under that board. Onto empty space: it becomes a board of its own; on a Team's workbench
   * the Team then holds it when nobody does, so it stays in view. One reparent call each,
   * through the store's route, which writes the trail line. */
  const boardOf = new Map(); // item id → the board it is on
  const itemsById = new Map();
  const move = async (id, parent) => {
    const moved = await request(`/api/work-items/${encodeURIComponent(id)}/reparent`, { method: 'POST', json: { parent: parent || '' } });
    let said = moved.ok ? firstLine(moved.data.acknowledgement) : moved.message;
    if (moved.ok && !parent && team && !itemsById.get(id)?.holder) {
      const held = await request(`/api/work-items/${encodeURIComponent(id)}/assign`, { method: 'POST', json: { team } });
      said = held.ok ? firstLine(held.data.acknowledgement) : held.message;
    }
    changed(said);
  };
  row.addEventListener('dragover', (event) => { if (view === 'board') event.preventDefault(); });
  row.addEventListener('drop', (event) => {
    if (view !== 'board' || event.target.closest?.('.wv-list')) return;
    event.preventDefault();
    const id = event.dataTransfer?.getData('text/plain') || '';
    if (id && itemsById.get(id)?.parent) void move(id, '');
  });

  const paint = () => {
    lift();
    root.dataset.view = view;
    row.scrollLeft = 0;
    toggle.el.textContent = t('work_views.view_by', 'View by: {view}', { view: view === 'status' ? t('work_views.status', 'Status') : t('work_views.board', 'Board') });
    boardOf.clear(); itemsById.clear();
    for (const entry of boards) for (const stage of entry.stages) for (const item of stage.items) { boardOf.set(item.id, entry.board.id); itemsById.set(item.id, item); }
    toggle.el.title = view === 'status' ? t('work_views.to_board', 'Showing Status. Press for Board.') : t('work_views.to_status', 'Showing Board. Press for Status.');
    if (view === 'status') row.replaceChildren(...STAGE_KEYS.map((stage) => {
      const here = boards.map((entry) => ({ board: entry.board, items: entry.stages.find((row) => row.stage === stage)?.items || [] })).filter((entry) => entry.items.length);
      const all = here.flatMap((entry) => entry.items);
      return list(stageName(stage), all.length, () => openStatus(stage, null, all),
        here.map((entry) => group(entry.board.title, entry.items, () => openItem(entry.board))), { stage });
    }));
    else row.replaceChildren(...boards.map((entry) => list(entry.board.title, entry.size, () => openItem(entry.board),
      entry.stages.map((row) => group(stageName(row.stage), row.items, () => openStatus(row.stage, entry.board, row.items))), { parent: entry.board.id })),
    // Add board, after the last board: the Add form with New board chosen, held by this Team on a Team's workbench.
    press('wv-add-board', [el('i', 'wv-add-mark', '+'), el('span', null, t('work_views.add_board', 'Add board'))],
      () => { lift(); draftOverlay(root, { parent: NEW_BOARD, team, changed }); }));
  };

  async function refresh() {
    // A Team reads its boards from the server (its team reading's `boards`); Cowork/Desk read every item.
    const read = await request(team ? `/api/work-items?team=${encodeURIComponent(team)}` : '/api/work-items', { cache: 'no-store' });
    if (!read.ok) { notice.textContent = t('work.failed', 'Could not read the work items.'); return; }
    boards = boardStages((team ? read.data.boards : read.data.items) || [], STAGE_KEYS);
    paint();
  }
  paint();
  return {
    el: surface.el,
    show: () => void refresh(),
  };
}
