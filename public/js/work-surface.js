/* part of the ronin-cowork client — see js/README.md */
/**
 * WORK — Surface 2 of the work-item surfaces: the boards (root items) and everything under
 * them, read off GET /api/work-items (every item with its holder). The phalanx draws the
 * boards; the work navigation bar sits under them with its fourth stone, request update.
 *
 *            nothing selected                    a stone selected
 * compact    the boards as stones                 every board in the rail; the selected
 *                                                 one's title, description and items
 * expanded   every board as an org chart: one
 *            column per child, grandchildren
 *            stacked, the row scrolls sideways
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createPhalanx } from './phalanx.js';
import { el } from './form-steps.js';
import { createWorkNav, dragItem } from './work-nav.js';
import { densityControl, draftItem, listDetail } from './work-details.js';
import { request } from './request.js';
import { boardChoices, boardTree } from './work-readings.js';
import { t } from './lexicon.js';

export const WORK_TYPE = 'work.boards';

const firstLine = (text) => String(text || '').split('\n')[0];

/** `leadOf(team)` names a Team's lead, the one a Team-held item's update request goes to. */
export function createWorkSurface({ leadOf = () => '' } = {}) {
  const { createSurface } = WorkspaceKit.primitives;
  let items = [];
  const notice = el('p', 'wi-notice'); notice.setAttribute('role', 'status');
  const say = (text) => { notice.textContent = text || ''; };
  const density = densityControl('compact', (next) => phalanx.setDensity(next));
  const surface = createSurface({ label: t('work.title', 'Work'), className: 'work-surface', actions: [density] });
  const byId = (id) => items.find((item) => item.id === id);

  const renderDetail = (row, host) => {
    if (row.draft) return draftItem(host, { heading: t('work.draft', 'New item'), save: async (fields) => {
      const made = await request('/api/work-items', { method: 'POST', json: { ...fields, ...(row.parent ? { parent: row.parent } : {}) } });
      if (!made.ok) return made.message;
      say(firstLine(made.data.acknowledgement));
      phalanx.select('');
      await refresh();
    } });
    // A board: its title, its description, and a simple list of everything under it.
    const under = [];
    const walk = (branch) => { for (const child of branch.items || []) { under.push(child.item); walk(child); } };
    walk(row);
    listDetail(host, { title: row.item.title, about: row.item.objective, items: under, empty: t('work.board_empty', 'Nothing under this board yet.') });
  };
  const phalanx = createPhalanx({ density: 'compact', branches: 'chart', className: 'wk-boards', renderDetail });

  const open = () => phalanx.level()?.id || phalanx.selected() || '';
  const nav = createWorkNav({
    add: () => phalanx.openDetail({ id: 'new', draft: true, parent: open() }),
    autoAssign: (id) => say(t('work_nav.no_triage', 'No triage agent is configured; {id} stays where it is.', { id })),
    manualAssign: {
      choices: (id) => boardChoices(items, id),
      pick: async (id, board) => {
        const moved = await request(`/api/work-items/${encodeURIComponent(id)}/reparent`, { method: 'POST', json: { parent: board.id } });
        say(moved.ok ? firstLine(moved.data.acknowledgement) : moved.message);
        await refresh();
      },
    },
    requestUpdate: async (id) => {
      const item = byId(id);
      const holder = String(item?.holder || '');
      const target = holder.startsWith('agent:') ? holder.slice(6) : holder.startsWith('team:') ? leadOf(holder.slice(5)) : '';
      if (!target) return say(t('work.nobody_to_ask', '{id} has no holder to ask.', { id }));
      const text = t('work.update_request', 'Please bring the ladder of {id} "{title}" current.', { id, title: item.title });
      const sent = await request('/api/messages', { method: 'POST', json: { target, text } });
      say(sent.ok ? t('work.update_queued', 'Queued for @{name}: bring {id} current.', { name: target, id }) : sent.message);
    },
  });
  phalanx.mount(surface.content, { after: [nav.el, notice] });

  const count = (n) => n === 1 ? t('new_work.count_one', '1 item') : n ? t('new_work.count', '{n} items', { n }) : t('new_work.empty', 'empty');
  const stone = (branch) => ({
    id: branch.item.id, label: branch.item.title, item: branch.item, ...dragItem(branch.item.id),
    ...(branch.items.length || branch.item.parent === null ? { items: branch.items.map(stone) } : {}),
  });
  const paint = () => phalanx.setItems(boardTree(items).map((board) => ({ ...stone(board), secondary: count(board.size) })));

  async function refresh() {
    const read = await request('/api/work-items', { cache: 'no-store' });
    if (!read.ok) { say(t('work.failed', 'Could not read the work items.')); return; }
    items = read.data.items || [];
    paint();
  }
  paint();
  return {
    el: surface.el,
    show: () => void refresh(),
    destroy: () => phalanx.destroy(),
  };
}
