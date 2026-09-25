/* part of the tmux-ronin client — see js/README.md */

const element = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
};
let nextDetailId = 0;

/**
 * The shared collection surface: a responsive phalanx at rest and a one-stone
 * rail beside the consumer's real detail when selected. Its top area starts empty;
 * consumers supply `before` content only when an explicit surface design calls for it.
 */
export function createPhalanx({ items = [], selectedId = '', renderDetail, onSelectionChange, className = '', grouped = false, density = 'full' } = {}) {
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
  root.dataset.grouped = String(Boolean(grouped));
  root.dataset.density = density;

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
    const groupOptions = typeof grouped === 'object' ? grouped : {};
    const declaredGroups = Array.isArray(groupOptions.groups) ? groupOptions.groups : [];
    const groups = grouped ? [...declaredGroups] : [];
    if (grouped) for (const item of rows) {
      const id = String(typeof item.group === 'object' ? item.group.id : item.group || '');
      if (id && !groups.some((entry) => String(entry.id ?? entry) === id)) groups.push(typeof item.group === 'object' ? item.group : { id, label: id });
    }
    const hosts = new Map();
    for (const entry of groups) {
      const group = typeof entry === 'object' ? entry : { id: entry, label: entry };
      const id = String(group.id || group.label || '');
      const section = element('section', 'sws-group'); section.dataset.swsGroup = id;
      const heading = element(group.action ? 'button' : 'h3', 'sws-group-heading', group.label || id);
      if (group.action) { heading.type = 'button'; heading.addEventListener('click', () => group.action(group)); }
      if (group.secondary) heading.append(element('small', 'sws-group-secondary', group.secondary));
      const hint = element('p', 'sws-group-hint');
      const stones = element('div', 'sws-group-stones');
      if (group.empty && !rows.some((item) => String(typeof item.group === 'object' ? item.group.id : item.group || '') === id)) stones.append(element('p', 'sws-group-empty', group.empty));
      section.append(heading, hint, stones);
      for (const [eventName, callback] of Object.entries(group.events || {})) section.addEventListener(eventName, (event) => callback(event, group, api));
      grid.append(section); hosts.set(id, stones);
    }
    let previousGroup = null;
    for (const item of rows) {
      // Existing consumers use inline group headings without declared group sections.
      if (!grouped && item.group && item.group !== previousGroup) {
        previousGroup = item.group;
        grid.append(element('h3', 'sws-group sws-group-heading', item.group));
      }
      const id = String(item.id);
      const button = element('button', `sws-stone ${item.className || ''}`.trim());
      button.type = 'button';
      button.dataset.swsId = id;
      button.hidden = item.hidden === true;
      if (typeof item.action !== 'function') {
        button.setAttribute('aria-pressed', String(id === selected));
        button.setAttribute('aria-expanded', String(id === selected));
        button.setAttribute('aria-controls', detailId);
      }
      if (item.disabled) button.disabled = true;
      if (item.draggable) button.draggable = true;
      for (const [name, value] of Object.entries(item.attrs || {})) button.setAttribute(name, String(value));
      for (const [eventName, callback] of Object.entries(item.events || {})) button.addEventListener(eventName, (event) => callback(event, item, api));
      if (item.glyph) {
        const glyph = item.glyph instanceof Node ? item.glyph : element('i', 'sws-glyph', String(item.glyph));
        glyph.setAttribute('aria-hidden', 'true');
        button.append(glyph);
      }
      button.append(element('b', 'sws-label', item.label || id));
      if (item.marker) button.append(item.marker);
      if (item.secondary) button.append(element('small', 'sws-secondary', item.secondary));
      if (item.state) button.append(element('small', 'sws-state', item.state));
      button.addEventListener('click', () => {
        if (typeof item.action === 'function') { item.action(item, api); return; }
        restoreId = id;
        restoreElement = null;
        externalDetail = null;
        selected = selected === id ? '' : id;
        paint();
        buttonFor(id)?.focus();
        notify();
      });
      const groupId = String(typeof item.group === 'object' ? item.group.id : item.group || '');
      (hosts.get(groupId) || grid).append(button);
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
    mount(host, { before = [], after = [] } = {}) {
      if (!String(host.className || '').split(/\s+/).includes('wk-surface-content')) throw new TypeError('Stone work surfaces mount directly in a work-surface content seat.');
      if (!String(host.className || '').split(/\s+/).includes('sws-host')) host.className = `${host.className || ''} sws-host`.trim();
      const header = element('div', 'sws-header');
      const footer = element('div', 'sws-footer');
      header.append(...before);
      footer.append(...after);
      footer.hidden = !after.length;
      host.replaceChildren(header, root, footer);
      return api;
    },
    setItems(next) { rows = [...(next || [])]; paint(); return api; },
    updateItems(next) {
      for (const patch of next || []) {
        const row = byId(patch.id);
        if (!row) continue;
        Object.assign(row, patch);
        const button = buttonFor(row.id);
        if (!button) continue;
        button.disabled = row.disabled === true;
        button.className = `sws-stone ${row.className || ''}`.trim();
        const state = button.querySelector('.sws-state');
        if (row.state && state) state.textContent = row.state;
        else if (row.state && !state) button.append(element('small', 'sws-state', row.state));
        else state?.remove();
      }
      return api;
    },
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
    setDensity(next) { root.dataset.density = next === 'compact' ? 'compact' : 'full'; return api; },
    destroy() { disposeDetail?.(); root.remove(); },
  };
  paint();
  return api;
}
