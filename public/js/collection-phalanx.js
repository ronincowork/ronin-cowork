/* part of the ronin-cowork client — see js/README.md */
/**
 * THE COLLECTION PHALANX — the phalanx forked for the collection doors (Who, What, Where;
 * owner ruling 2026-10-03), built ON createPhalanx: the same stones, rail, detail and one way
 * back, nothing copied. What the fork adds is the look of a collection at rest: chart branches
 * by default, wider spacing, the org chart's lines from a head stone across its columns, and
 * a grandchild inset under its parent in the chart and in the rail. The fork marks each
 * nested item's depth (`data-cph-depth`) through the phalanx's own `attrs`; its root wears
 * `.cph` and its host `.cph-host`, and every one of its rules lives under that prefix, so the
 * phalanx's own consumers (Settings, Presets, Workspace Folders, Model Providers, Team Chart)
 * see none of it.
 */
import { createPhalanx } from './phalanx.js';

/** The same rows with each nested item's depth on it: a child is 1, a grandchild 2, and so on. */
export const markDepth = (items, depth = 0) => (items || []).map((item) => ({
  ...item,
  ...(depth > 1 ? { attrs: { ...(item.attrs || {}), 'data-cph-depth': String(depth) } } : {}),
  ...(Array.isArray(item.items) ? { items: markDepth(item.items, depth + 1) } : {}),
}));

export function createCollectionPhalanx({ className = '', branches = 'chart', items = [], ...options } = {}) {
  const phalanx = createPhalanx({ ...options, branches, items: markDepth(items), className: `cph ${className}`.trim() });
  const { mount, setItems } = phalanx;
  phalanx.mount = (host, placement) => {
    mount.call(phalanx, host, placement);
    if (!String(host.className || '').split(/\s+/).includes('cph-host')) host.className = `${host.className || ''} cph-host`.trim();
    return phalanx;
  };
  phalanx.setItems = (next) => { setItems.call(phalanx, markDepth(next)); return phalanx; };
  return phalanx;
}
