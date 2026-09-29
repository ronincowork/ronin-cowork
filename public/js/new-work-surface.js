/* part of the ronin-cowork client — see js/README.md */
/**
 * NEW WORK — Surface 1 of the work-item surfaces: four group stones read off the common
 * board. Ideas and Plan are its unheld items by stage; Parked are its unheld items that
 * left a holder (a release, or the holder ended); Open issues come from the issue source,
 * and there is none yet, so that stone shows and is empty. The phalanx draws the stones;
 * the work navigation bar sits under them.
 *
 *            nothing selected                    a stone selected
 * compact    the four group stones                the four in the rail; the group and its items
 * expanded   four columns, items under each       one level down: its items are the stones
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createPhalanx } from './phalanx.js';
import { createWorkNav, dragItem, draftItem } from './work-nav.js';
import { appendItemReading } from './project-reading.js';
import { itemLine, stageBar } from './team-kanban.js';
import { request } from './request.js';
import { boardChoices, newWorkGroups } from './work-readings.js';
import { t } from './lexicon.js';

export const NEW_WORK_TYPE = 'work.new';

const el = (tag, cls = '', text = '') => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text) out.textContent = text;
  return out;
};

/** The one-dash / two-dash density control the Team people surface uses. */
export function densityControl(start, onChange) {
  const { createAction } = WorkspaceKit.primitives;
  let density = start;
  const button = createAction({ label: '', size: 'compact', className: 'tw-agent-density' });
  const lines = el('span', 'tw-agent-density-lines'); lines.append(el('i'), el('i'));
  button.el.replaceChildren(lines);
  const paint = () => {
    button.el.dataset.lines = density === 'compact' ? 'two' : 'one';
    button.el.title = density === 'compact' ? t('work_nav.expand', 'More detail') : t('work_nav.compact', 'Less detail');
    button.el.setAttribute('aria-label', button.el.title);
    button.el.setAttribute('aria-pressed', String(density === 'full'));
  };
  button.el.addEventListener('click', () => { density = density === 'compact' ? 'full' : 'compact'; paint(); onChange(density); });
  paint();
  return button;
}

export function createNewWorkSurface() {
  const { createSurface } = WorkspaceKit.primitives;
  let items = [];
  const notice = el('p', 'wi-notice'); notice.setAttribute('role', 'status');
  const say = (text) => { notice.textContent = text || ''; };
  const density = densityControl('compact', (next) => phalanx.setDensity(next));
  const surface = createSurface({ label: t('new_work.title', 'New work'), className: 'new-work-surface', actions: [density] });

  const groupOf = (id) => newWorkGroups(items).find((group) => group.id === id);
  // Where the plus sits: the open group (selected, or the level it went down into).
  const draft = () => ({ id: 'new', draft: true, stage: groupOf(phalanx.level()?.id || phalanx.selected())?.stage || 'IDEA' });
  const renderDetail = (row, host) => {
    if (row.draft) return draftItem(host, { heading: t('new_work.draft', 'New item'), save: async (fields) => {
      const made = await request('/api/work-items', { method: 'POST', json: { ...fields, stage: row.stage } });
      if (!made.ok) return made.message;
      say(made.data.acknowledgement?.split('\n')[0] || '');
      phalanx.select('');
      await refresh();
    } });
    if (row.item) return appendItemReading(host, row.item, { bar: stageBar(row.item) });
    // A group: what it is, then its items, unless its items are the stones in the rail.
    host.append(el('h2', '', row.label), el('p', 'work-about', t(`new_work.about_${row.id}`, row.about)));
    if (phalanx.level()) return;
    const lines = el('div', 'work-lines');
    for (const stone of row.items) lines.append(itemLine(stone.item));
    if (row.items.length) host.append(lines);
  };
  const phalanx = createPhalanx({ density: 'compact', branches: 'column', className: 'nw-phalanx', renderDetail });
  const nav = createWorkNav({
    add: () => phalanx.openDetail(draft()),
    autoAssign: (id) => say(t('work_nav.no_triage', 'No triage agent is configured; {id} stays where it is.', { id })),
    manualAssign: {
      choices: async (id) => {
        const every = await request('/api/work-items', { cache: 'no-store' });
        return every.ok ? boardChoices(every.data.items || [], id) : [];
      },
      pick: async (id, board) => {
        const moved = await request(`/api/work-items/${encodeURIComponent(id)}/reparent`, { method: 'POST', json: { parent: board.id } });
        say(moved.ok ? moved.data.acknowledgement?.split('\n')[0] : moved.message);
        await refresh();
      },
    },
  });
  phalanx.mount(surface.content, { after: [nav.el, notice] });

  const count = (n) => n === 1 ? t('new_work.count_one', '1 item') : n ? t('new_work.count', '{n} items', { n }) : t('new_work.empty', 'empty');
  const paint = () => phalanx.setItems(newWorkGroups(items).map((group) => ({
    id: group.id, label: t(`new_work.group_${group.id}`, group.label), about: group.about,
    secondary: count(group.items.length),
    items: group.items.map((item) => ({ id: item.id, label: item.title, secondary: item.objective, item, ...dragItem(item.id) })),
  })));

  async function refresh() {
    const read = await request('/api/work-items?unassigned=1', { cache: 'no-store' });
    if (!read.ok) { say(t('new_work.failed', 'Could not read the work items.')); return; }
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
