/* part of the ronin-cowork client — see js/README.md */
/**
 * NEW WORK — Surface 1 of the work-item surfaces: four group stones read off the common
 * board. Ideas and Plan are its unheld items by stage; Parked are its unheld items that
 * left a holder (a release, or the holder ended); Open issues come from the issue source,
 * and there is none yet, so that stone shows and is empty. The phalanx draws the stones;
 * the work navigation bar sits under them.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createPhalanx } from './phalanx.js';
import { createWorkNav, draftItem } from './work-nav.js';
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
  const draft = () => ({ id: 'new', draft: true, stage: groupOf(phalanx.selected())?.stage || 'IDEA' });
  const renderDetail = (row, host) => {
    if (row.draft) return draftItem(host, { heading: t('new_work.draft', 'New item'), save: async (fields) => {
      const made = await request('/api/work-items', { method: 'POST', json: { ...fields, stage: row.stage } });
      if (!made.ok) return made.message;
      say(made.data.acknowledgement?.split('\n')[0] || '');
      phalanx.select('');
      await refresh();
    } });
  };
  const phalanx = createPhalanx({ density: 'compact', className: 'nw-phalanx', renderDetail });
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

  const paint = () => phalanx.setItems(newWorkGroups(items).map((group) => ({
    id: group.id, label: t(`new_work.group_${group.id}`, group.label),
    secondary: group.items.length ? t('new_work.count', '{n} items', { n: group.items.length }) : t('new_work.empty', 'empty'),
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
