/* part of the tmux-ronin client — see js/README.md */
import { createKeyedList, editHold } from './workspace-primitives.js';

const element = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
};
let nextDetailId = 0;

/** What a row shows, as a string to compare: a function is only its presence, a Node is its
 * identity (the same marker node is the same marker), everything else by value. */
const nodeIds = new WeakMap();
let nextNodeId = 0;
const said = (value) => JSON.stringify(value, (_key, one) => {
  if (typeof one === 'function') return 'ƒ';
  if (typeof Node !== 'undefined' && one instanceof Node) {
    if (!nodeIds.has(one)) nodeIds.set(one, ++nextNodeId);
    return `#node${nodeIds.get(one)}`;
  }
  return one;
});

/** A chart whose child columns stack deeper than this folds its grandchildren into counts. */
export const CHART_DEPTH = 4;

/** The rows under a row: its `items`, or the rows of its `under` cells (a text cell holds none). */
const rowsUnder = (row) => Array.isArray(row.items) ? row.items : (row.under || []).flatMap((cell) => Array.isArray(cell) ? cell : []);
/** Every descendant of a row, depth first, as plain stones (a level is one level). */
const descendants = (row) => rowsUnder(row).flatMap((child) => [{ ...child, items: undefined, under: undefined }, ...descendants(child)]);
/** A row carries something under its stone: items, or `under` cells. */
const carries = (row) => Array.isArray(row.items) || Array.isArray(row.under);
/** What draws under a row's stone, cell by cell: a text cell (plain muted lines) or a rows cell. */
const cells = (row) => Array.isArray(row.under) ? row.under : Array.isArray(row.items) ? [descendants(row)] : [];

/**
 * The shared collection surface: a responsive phalanx at rest and a one-stone
 * rail beside the consumer's real detail when selected. Its top area starts empty;
 * consumers supply `before` content only when an explicit surface design calls for it.
 *
 * LEVELS. A row may carry `items` (rows, nested as deep as they go), or `under`: cells in
 * topic order, each a string (plain muted lines) or rows. In full density a stone with
 * rows under it does not select: the phalanx goes one level down, those rows (every
 * descendant) become the stones in the rail and the stone itself is the level's detail
 * until one of them is pressed. At rest in full density each such stone shows what it
 * carries under it (no row carrying anything, the ordinary grid), drawn as `branches`
 * says: 'column' lays the stones and their cells on one grid — one column per stone, one
 * grid row per cell, so the same topic starts at the same height under every stone
 * (owner, 2026-10-20); 'chart' lays one column per direct child with grandchildren
 * stacked under their parent (a chart deeper than CHART_DEPTH folds grandchildren into a
 * count until pressed).
 *
 * THE WAY BACK is one, from any depth: Escape, or the small Return stone at the head of a level,
 * returns to the top view with just the stones and nothing selected, in the density you
 * were in. Press-again still deselects where you are.
 */
export function createPhalanx({ items = [], selectedId = '', renderDetail, onSelectionChange, className = '', grouped = false, density = 'full', branches = '' } = {}) {
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
  if (branches) root.dataset.branches = branches;

  let rows = [...items];
  let path = []; // the ids gone down through, from the top rows
  let selected = String(selectedId || '');
  let externalDetail = null;
  let restoreId = '';
  let restoreElement = null;
  let disposeDetail = null;
  const unfolded = new Set(); // chart children whose folded grandchildren were pressed open
  let levelOpen = { owner: '', id: '' }; // the stone open at a level when density folded it

  const find = (list, id) => list.find((item) => String(item.id) === String(id));
  /** The level's owner and the rows it shows; a vanished owner is the top again. */
  const level = () => {
    let shown = rows, owner = null;
    for (const id of path) {
      const next = find(shown, id);
      if (!next) { path = []; return { owner: null, shown: rows }; }
      owner = next; shown = descendants(next);
    }
    return { owner, shown };
  };
  const byId = (id) => find(level().shown, id);
  const buttonFor = (id) => [...grid.querySelectorAll('[data-sws-id]')].find((button) => button.dataset.swsId === String(id));
  const notify = () => onSelectionChange?.(selected || null);
  const full = () => root.dataset.density === 'full';
  const atRest = () => !path.length && !selected && !externalDetail;

  const down = (id, { select = '' } = {}) => {
    path = [...path, String(id)];
    selected = select ? String(select) : '';
    restoreId = String(id);
    restoreElement = null;
    externalDetail = null;
    paint();
    (select ? buttonFor(select) : grid.querySelector('.sws-back'))?.focus?.();
    notify();
  };
  const top = () => {
    const focusId = path[0] || restoreId || selected;
    const focusElement = path.length ? null : restoreElement;
    path = [];
    selected = '';
    externalDetail = null;
    levelOpen = { owner: '', id: '' };
    paint();
    if (focusElement && focusElement.isConnected !== false) focusElement.focus();
    else buttonFor(focusId)?.focus();
    notify();
  };

  const stone = (item, { branch = false } = {}) => {
    const id = String(item.id);
    const button = element('button', `sws-stone ${branch ? 'sws-branch-stone ' : ''}${item.className || ''}`.trim());
    button.type = 'button';
    button.dataset.swsId = id;
    button.hidden = item.hidden === true;
    if (typeof item.action !== 'function' && !branch) {
      button.setAttribute('aria-pressed', String(id === selected));
      button.setAttribute('aria-expanded', String(id === selected));
      button.setAttribute('aria-controls', detailId);
    }
    if (item.disabled) button.disabled = true;
    if (item.draggable) button.draggable = true;
    for (const [name, value] of Object.entries(item.attrs || {})) button.setAttribute(name, String(value));
    for (const [eventName, callback] of Object.entries(item.events || {})) button.addEventListener(eventName, (event) => callback(event, item, api));
    if (item.glyph && !branch) {
      const glyph = item.glyph instanceof Node ? item.glyph : element('i', 'sws-glyph', String(item.glyph));
      glyph.setAttribute('aria-hidden', 'true');
      button.append(glyph);
    }
    button.append(element('b', 'sws-label', item.label || id));
    if (item.marker) button.append(item.marker);
    if (item.secondary && !branch) button.append(element('small', 'sws-secondary', item.secondary));
    if (item.state) button.append(element('small', 'sws-state', item.state));
    return button;
  };

  /** A top stone at rest in full density with its items under it. */
  const branchOf = (item, button) => {
    const box = element('div', 'sws-branch');
    box.append(button);
    const topId = String(item.id);
    const child = (row, { folded = 0 } = {}) => {
      const node = stone(row, { branch: true });
      if (folded) node.append(element('small', 'sws-branch-count', `+${folded}`));
      node.addEventListener('click', () => {
        if (folded) { unfolded.add(String(row.id)); paint({ force: false }); buttonFor(row.id)?.focus(); return; }
        down(topId, { select: row.id });
      });
      return node;
    };
    if (branches === 'chart') {
      const columns = element('div', 'sws-branch-row');
      const deep = rowsUnder(item).some((row) => descendants(row).length > CHART_DEPTH);
      for (const row of rowsUnder(item)) {
        const column = element('div', 'sws-branch-column');
        const below = descendants(row);
        const fold = deep && below.length && !unfolded.has(String(row.id));
        column.append(child(row, { folded: fold ? below.length : 0 }));
        if (!fold) for (const grand of below) column.append(child(grand));
        columns.append(column);
      }
      box.append(columns);
    } else {
      for (const cell of cells(item)) {
        if (!Array.isArray(cell)) { box.append(element('p', 'sws-branch-note', String(cell ?? ''))); continue; }
        const column = element('div', 'sws-branch-column');
        for (const row of descendants({ items: cell })) column.append(child(row));
        box.append(column);
      }
    }
    return box;
  };

  // ONE STONE MOVES, ONE STONE REPAINTS (owner, 2026-11-12, KAN-414): the kit's keyed list
  // (WorkspacePrimitives.createKeyedList). Every cell of the grid (the Return stone, a group's
  // section, an inline heading, a stone or its branch) is a row kept between paints; each
  // compares what it shows and repaints only itself, a stone moves only when its order or
  // group changes, and a push that moved nothing touches nothing. A drawn stone reads its row
  // at press time, so a kept stone always acts on what the last push said.
  const cellsList = createKeyedList({ key: (cell) => cell.key, shows: (cell) => cell.shows, draw: (cell) => cell.draw() });
  const hosts = new Map(); // a group's id → its stones' container, as last drawn
  const groupId = (item) => String(typeof item.group === 'object' ? item.group.id : item.group || '');
  const pressed = (id, item) => {
    const now = byId(id) || item;
    if (typeof now.action === 'function') { now.action(now, api); return; }
    if (full() && carries(now) && !path.length) { down(id); return; }
    restoreId = id;
    restoreElement = null;
    externalDetail = null;
    selected = selected === id ? '' : id;
    paint();
    buttonFor(id)?.focus();
    notify();
  };
  const backCell = (owner) => ({ key: '!back', shows: said([owner.label, owner.id]), draw: () => {
    // The way back is a small stone that says only Return, not another stone of the level.
    const back = element('button', 'sws-stone sws-back');
    back.type = 'button';
    back.append(element('b', 'sws-label', 'Return'));
    back.setAttribute('aria-label', `Return to all · ${owner.label || owner.id}`);
    back.addEventListener('click', top);
    return back;
  } });
  const groupCell = (group, id, empty) => ({ key: `!group:${id}`, shows: said([group, empty]), draw: () => {
    const section = element('section', 'sws-group'); section.dataset.swsGroup = id;
    const heading = element(group.action ? 'button' : 'h3', 'sws-group-heading', group.label || id);
    if (group.action) { heading.type = 'button'; heading.addEventListener('click', () => group.action(group)); }
    if (group.secondary) heading.append(element('small', 'sws-group-secondary', group.secondary));
    const hint = element('p', 'sws-group-hint');
    const stones = element('div', 'sws-group-stones');
    section.append(heading, hint, stones);
    for (const [eventName, callback] of Object.entries(group.events || {})) section.addEventListener(eventName, (event) => callback(event, group, api));
    hosts.set(id, stones);
    return section;
  } });
  const stoneCell = (item, branching) => {
    const id = String(item.id);
    const branch = branching && carries(item);
    const opened = branch ? [...unfolded].filter((one) => descendants(item).some((row) => String(row.id) === one)) : [];
    return { key: `!stone:${id}`, shows: said([{ ...item, group: undefined }, id === selected, branch, opened, root.dataset.density]), draw: () => {
      const button = stone(item);
      button.addEventListener('click', () => pressed(id, item));
      return branch ? branchOf(item, button) : button;
    } };
  };

  /** The open detail is drawn again only when what is open changes, or its own row does (or
   * refreshDetail asks): a push that moved another stone leaves it alone, and a push on its own
   * stone waits while the person has an unsent edit in it (the kit's editHold: it lands on
   * submit or reset). Pressing another stone is the person's own act and draws afresh. */
  let detailSaid = null;
  const detailHold = editHold();
  detailHold.watch([detail]);
  detailHold.onClear(() => paintDetail(false));
  const paintDetail = (force) => {
    const { owner } = level();
    const current = externalDetail || byId(selected) || owner;
    const now = current ? said([externalDetail ? 'external' : current === owner ? 'level' : 'stone', current]) : '';
    if (!force && now === detailSaid) return;
    if (!force && detailHold.held() && current && detailSaid) return;
    detailHold.release();
    detailSaid = now;
    disposeDetail?.();
    disposeDetail = null;
    detail.replaceChildren();
    detail.hidden = !current;
    if (current && typeof renderDetail === 'function') disposeDetail = renderDetail(current, detail) || null;
  };

  const paint = ({ force = true } = {}) => {
    const { owner, shown } = level();
    if (!find(shown, selected)) selected = '';
    root.dataset.open = String(Boolean(selected || externalDetail || owner));
    root.dataset.level = String(path.length);
    const groupOptions = typeof grouped === 'object' ? grouped : {};
    const declaredGroups = Array.isArray(groupOptions.groups) ? groupOptions.groups : [];
    const groups = grouped && !owner ? [...declaredGroups] : [];
    if (grouped && !owner) for (const item of shown) {
      const id = groupId(item);
      if (id && !groups.some((entry) => String(entry.id ?? entry) === id)) groups.push(typeof item.group === 'object' ? item.group : { id, label: id });
    }
    // Branches draw only while a shown row carries something: rows with nothing rest in the ordinary grid.
    const branching = Boolean(branches) && full() && atRest() && shown.some(carries);
    root.dataset.branching = String(branching);
    // The grid's rows: the stones, then one per cell, as many as the fullest stone carries.
    const gridRows = String(1 + Math.max(0, ...shown.map((item) => cells(item).length)));
    if (grid.style.getPropertyValue?.('--sws-rows') !== gridRows) grid.style.setProperty('--sws-rows', gridRows);
    const laid = owner ? [backCell(owner)] : [];
    const inGroup = new Map();
    for (const entry of groups) {
      const group = typeof entry === 'object' ? entry : { id: entry, label: entry };
      const id = String(group.id || group.label || '');
      const members = shown.filter((item) => groupId(item) === id);
      laid.push(groupCell(group, id, Boolean(group.empty && !members.length)));
      inGroup.set(id, members.length ? members.map((item) => stoneCell(item, branching))
        : group.empty ? [{ key: `!empty:${id}`, shows: group.empty, draw: () => element('p', 'sws-group-empty', group.empty) }] : []);
    }
    let previousGroup = null;
    let headings = 0;
    for (const item of shown) {
      if (inGroup.has(groupId(item)) && groupId(item)) continue;
      // Existing consumers use inline group headings without declared group sections.
      if (!grouped && item.group && item.group !== previousGroup) {
        previousGroup = item.group;
        const words = item.group;
        laid.push({ key: `!heading:${headings++}`, shows: said(words), draw: () => element('h3', 'sws-group sws-group-heading', words) });
      }
      laid.push(stoneCell(item, branching));
    }
    cellsList.place(grid, laid);
    for (const [id, members] of inGroup) cellsList.place(hosts.get(id), members);
    cellsList.sweep();
    for (const id of [...hosts.keys()]) if (!inGroup.has(id)) hosts.delete(id);
    paintDetail(force);
  };

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || atRest()) return;
    event.preventDefault();
    top();
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
    setItems(next) { rows = [...(next || [])]; paint({ force: false }); return api; },
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
    /** Go one level down into a top stone that carries items, optionally selecting one. */
    down(id, options) { if (find(rows, id)) down(id, options); return api; },
    /** The one way back: the top view, just the stones, nothing selected. */
    top() { top(); return api; },
    /** The stone whose level is showing, or null at the top. */
    level: () => level().owner,
    openDetail(item, { returnFocus = null } = {}) { selected = ''; externalDetail = item || null; restoreElement = returnFocus; paint(); notify(); return api; },
    refreshDetail() { paint(); return api; },
    selected: () => selected || null,
    /** Density switches the row and keeps the column: a selected stone with items becomes
     * its level in full density, a level becomes its selected stone in compact, and the
     * stone open at that level comes back when the level does. */
    setDensity(next) {
      const was = root.dataset.density;
      root.dataset.density = next === 'compact' ? 'compact' : 'full';
      if (was === root.dataset.density) return api;
      const owner = level().owner;
      if (owner) {
        levelOpen = { owner: String(owner.id), id: selected };
        path = [];
        selected = String(owner.id);
      } else if (full() && carries(find(rows, selected) || {})) {
        path = [selected];
        selected = levelOpen.owner === selected ? levelOpen.id : '';
      } else if (!(branches && atRest())) return api;
      paint();
      notify();
      return api;
    },
    destroy() { disposeDetail?.(); cellsList.destroy(); root.remove(); },
  };
  paint();
  return api;
}
