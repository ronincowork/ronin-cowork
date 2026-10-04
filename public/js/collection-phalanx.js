/* part of the ronin-cowork client — see js/README.md */
/**
 * THE COLLECTION PHALANX — the phalanx forked for the collection doors (Who, What, Where;
 * owner ruling 2026-10-03), built ON createPhalanx: the same stones, rail, detail and one way
 * back, nothing copied. What the fork adds is the look of a collection at rest: each stone's
 * children stacked under it as one-line bars a space below it, the blocks centred at wide
 * spacing, and grandchildren folded away. Children and grandchildren are not stones: a bar
 * with a hairline, distinct but light (owner: the stone format on everything is too heavy;
 * never count what is visible).
 *
 * A BAR PRESSED EXPANDS IN PLACE (owner, 2026-10-04: one structure for every door). It never
 * goes a level down or selects: the fork stops the phalanx's own press and draws `expand(item,
 * host)` under the bar, two or three lines in one format; pressed again, it folds. What is
 * expanded survives a repaint. The fork marks each nested item's depth (`data-cph-depth`)
 * through the phalanx's own `attrs`; its root wears `.cph` and its host `.cph-host`, and every
 * one of its rules lives under that prefix, so the phalanx's own consumers (Settings, Presets,
 * Workspace Folders, Model Providers, Team Chart) see none of it.
 */
import { createPhalanx } from './phalanx.js';

const element = (tag, className = '') => { const node = document.createElement(tag); if (className) node.className = className; return node; };

/** The same rows with each nested item's depth on it: a child is 1, a grandchild 2, and so on. */
export const markDepth = (items, depth = 0) => (items || []).map((item) => ({
  ...item,
  ...(depth > 0 ? { attrs: { ...(item.attrs || {}), 'data-cph-depth': String(depth) } } : {}),
  ...(Array.isArray(item.items) ? { items: markDepth(item.items, depth + 1) } : {}),
}));

export function createCollectionPhalanx({ className = '', branches = 'column', items = [], expand = null, ...options } = {}) {
  const expanded = new Set(); // ids of bars open in place
  const disposers = new Map(); // id -> what the expansion returned, to dispose
  /** Every nested row presses to expand, not to select or go down. */
  const pressable = (rows, depth = 0) => rows.map((row) => ({
    ...row,
    ...(depth > 0 && expand ? { events: { ...(row.events || {}), click: (event, item) => {
      event.stopImmediatePropagation();
      event.preventDefault();
      row.events?.click?.(event, item);
      if (expanded.has(String(item.id))) expanded.delete(String(item.id)); else expanded.add(String(item.id));
      paintExpansions();
    } } } : {}),
    ...(Array.isArray(row.items) ? { items: pressable(row.items, depth + 1) } : {}),
  }));
  const phalanx = createPhalanx({ ...options, branches, items: markDepth(pressable(items)), className: `cph ${className}`.trim() });
  const { mount, setItems } = phalanx;
  let rows = items;
  const find = (list, id) => { for (const row of list || []) { if (String(row.id) === id) return row; const deep = find(row.items, id); if (deep) return deep; } return null; };
  /** Draw every open bar's read under it; remove the ones whose bar is gone or folded. */
  const paintExpansions = () => {
    for (const node of phalanx.el.querySelectorAll('.cph-expand')) {
      const id = node.dataset.cphFor;
      if (!expanded.has(id) || !node.previousElementSibling || node.previousElementSibling.dataset.swsId !== id) { disposers.get(id)?.(); disposers.delete(id); node.remove(); }
    }
    for (const bar of phalanx.el.querySelectorAll('.sws-stone[data-cph-depth]')) {
      const id = bar.dataset.swsId;
      bar.setAttribute('aria-expanded', String(expanded.has(id)));
      if (!expanded.has(id) || bar.nextElementSibling?.dataset?.cphFor === id) continue;
      const item = find(rows, id);
      if (!item) continue;
      const host = element('div', 'cph-expand');
      host.dataset.cphFor = id;
      bar.after(host);
      disposers.set(id, expand(item, host, { fold: () => { expanded.delete(id); paintExpansions(); } }) || null);
    }
  };
  phalanx.mount = (host, placement) => {
    mount.call(phalanx, host, placement);
    if (!String(host.className || '').split(/\s+/).includes('cph-host')) host.className = `${host.className || ''} cph-host`.trim();
    paintExpansions();
    return phalanx;
  };
  phalanx.setItems = (next) => { rows = next; setItems.call(phalanx, markDepth(pressable(next))); paintExpansions(); return phalanx; };
  for (const name of ['select', 'down', 'top', 'setDensity', 'refreshDetail']) {
    const method = phalanx[name];
    phalanx[name] = (...args) => { method.apply(phalanx, args); paintExpansions(); return phalanx; };
  }
  /** Folded, the grandchildren under each child stay out of the rest view; the rail always has them. */
  phalanx.setFold = (on = true) => { phalanx.el.dataset.cphFold = String(Boolean(on)); return phalanx; };
  phalanx.setFold(true);
  phalanx.expanded = () => [...expanded];
  return phalanx;
}
