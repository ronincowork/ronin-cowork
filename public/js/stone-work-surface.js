/* part of the tmux-ronin client — see js/README.md */

const element = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
};
let nextDetailId = 0;

/**
 * The shared Setup work-surface: a responsive phalanx at rest and a one-stone
 * rail beside the consumer's real detail when selected.
 */
export function createStoneWorkSurface({ items = [], selectedId = '', renderDetail, onSelectionChange, className = '' } = {}) {
  const root = element('section', `sws ${className}`.trim());
  const rail = element('div', 'sws-rail');
  const grid = element('div', 'sws-grid');
  const detail = element('div', 'sws-detail');
  const detailId = `sws-detail-${++nextDetailId}`;
  detail.id = detailId;
  detail.setAttribute('role', 'region');
  detail.hidden = true;
  rail.append(grid);
  root.append(rail, detail);

  let rows = [...items];
  let selected = String(selectedId || '');
  let externalDetail = null;
  let restoreId = '';
  let restoreElement = null;
  let disposeDetail = null;

  const byId = (id) => rows.find((item) => String(item.id) === String(id));
  const buttonFor = (id) => [...grid.querySelectorAll('[data-sws-id]')].find((button) => button.dataset.swsId === String(id));
  const notify = () => onSelectionChange?.(selected || null);

  const paint = () => {
    disposeDetail?.();
    disposeDetail = null;
    grid.replaceChildren();
    const active = byId(selected);
    if (!active) selected = '';
    root.dataset.open = String(Boolean(selected || externalDetail));
    for (const item of rows) {
      const id = String(item.id);
      const button = element('button', `sws-stone ${item.className || ''}`.trim());
      button.type = 'button';
      button.dataset.swsId = id;
      button.setAttribute('aria-pressed', String(id === selected));
      button.setAttribute('aria-expanded', String(id === selected));
      button.setAttribute('aria-controls', detailId);
      if (item.disabled) button.disabled = true;
      for (const [name, value] of Object.entries(item.attrs || {})) button.setAttribute(name, String(value));
      if (item.glyph) {
        const glyph = element('i', 'sws-glyph');
        glyph.setAttribute('aria-hidden', 'true');
        glyph.append(item.glyph instanceof Node ? item.glyph : document.createTextNode(String(item.glyph)));
        button.append(glyph);
      }
      button.append(element('b', 'sws-label', item.label || id));
      if (item.secondary) button.append(element('small', 'sws-secondary', item.secondary));
      if (item.state) button.append(element('small', 'sws-state', item.state));
      button.addEventListener('click', () => {
        restoreId = id;
        restoreElement = null;
        externalDetail = null;
        selected = selected === id ? '' : id;
        paint();
        notify();
      });
      grid.append(button);
    }
    detail.replaceChildren();
    const current = externalDetail || byId(selected);
    detail.hidden = !current;
    if (current && typeof renderDetail === 'function') disposeDetail = renderDetail(current, detail) || null;
  };

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || (!selected && !externalDetail)) return;
    event.preventDefault();
    const focusId = restoreId || selected;
    const focusElement = restoreElement;
    selected = '';
    externalDetail = null;
    paint();
    if (focusElement && focusElement.isConnected !== false) focusElement.focus();
    else buttonFor(focusId)?.focus();
    notify();
  });

  const api = {
    el: root,
    setItems(next) { rows = [...(next || [])]; paint(); return api; },
    select(id, { focus = false } = {}) {
      const next = byId(id) ? String(id) : '';
      if (next) restoreId = next;
      restoreElement = null;
      selected = next;
      externalDetail = null;
      paint();
      if (focus && next) buttonFor(next)?.focus();
      notify();
      return api;
    },
    openDetail(item, { returnFocus = null } = {}) { selected = ''; externalDetail = item || null; restoreElement = returnFocus; paint(); notify(); return api; },
    refreshDetail() { paint(); return api; },
    selected: () => selected || null,
    destroy() { disposeDetail?.(); root.remove(); },
  };
  paint();
  return api;
}
