/* part of the ronin-cowork client — see js/README.md */
/**
 * THE COLLECTION PHALANX — the phalanx forked for the collection doors (Who, What, Where;
 * owner ruling 2026-10-03), built ON createPhalanx: the same stones, rail, detail and one way
 * back, nothing copied. What the fork adds is the look of a collection at rest: each stone's
 * children stacked under it as one-line bars, joined by a line, the blocks centred at wide
 * spacing, and grandchildren folded away (`setFold`) or shown under their parent; in the rail
 * they always stand inset under it. Children and grandchildren are not stones: a bar with a hairline,
 * distinct but light (owner, 2026-10-03: the stone format on everything is too heavy; never
 * count what is visible). The fork marks each
 * nested item's depth (`data-cph-depth`) through the phalanx's own `attrs`; its root wears
 * `.cph` and its host `.cph-host`, and every one of its rules lives under that prefix, so the
 * phalanx's own consumers (Settings, Presets, Workspace Folders, Model Providers, Team Chart)
 * see none of it.
 */
import { createPhalanx } from './phalanx.js';

/** The same rows with each nested item's depth on it: a child is 1, a grandchild 2, and so on. */
export const markDepth = (items, depth = 0) => (items || []).map((item) => ({
  ...item,
  ...(depth > 0 ? { attrs: { ...(item.attrs || {}), 'data-cph-depth': String(depth) } } : {}),
  ...(Array.isArray(item.items) ? { items: markDepth(item.items, depth + 1) } : {}),
}));

export function createCollectionPhalanx({ className = '', branches = 'column', items = [], ...options } = {}) {
  const phalanx = createPhalanx({ ...options, branches, items: markDepth(items), className: `cph ${className}`.trim() });
  const { mount, setItems } = phalanx;
  phalanx.mount = (host, placement) => {
    mount.call(phalanx, host, placement);
    if (!String(host.className || '').split(/\s+/).includes('cph-host')) host.className = `${host.className || ''} cph-host`.trim();
    return phalanx;
  };
  phalanx.setItems = (next) => { setItems.call(phalanx, markDepth(next)); return phalanx; };
  /** Folded, the grandchildren under each child stay out of the rest view; the rail always has them. */
  phalanx.setFold = (on = true) => { phalanx.el.dataset.cphFold = String(Boolean(on)); return phalanx; };
  phalanx.setFold(true);
  return phalanx;
}
