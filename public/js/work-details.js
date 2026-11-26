/* part of the ronin-cowork client — see js/README.md */
/**
 * THE FULL OVERLAY — one layer over a host's content with the one Close, small at its top
 * right. The tile lays its work record and its Agent's configuration over its body with it
 * (tilehead.js). Escape is its Close; `closed()` hears it.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { el } from './form-steps.js';
import { t } from './lexicon.js';

function overlay(host, draw, { closed = () => {} } = {}) {
  const { createAction } = WorkspaceKit.primitives;
  const layer = el('div', 'work-overlay');
  const close = () => { layer.remove(); closed(); };
  const utility = el('div', 'work-overlay-utility');
  utility.append(createAction({ label: t('work.close_item', 'Close'), size: 'compact', action: close }).el);
  draw(layer, [utility], close);
  // Escape lifts this layer only: an overlay inside another leaves the outer one.
  layer.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
  host.append(layer);
  // Keys land in the overlay (Escape is its Close): in its first field, else on the layer.
  layer.tabIndex = -1;
  (layer.querySelector('input, textarea') || layer).focus();
  return layer;
}

/** THE FULL OVERLAY as a location (PATTERNS.md): any surface lays a reader or a form over itself with
 * the same chrome and the same Close. `draw(layer, through, close)` paints into the layer;
 * a reader with its own close (the item's −) calls `close` and leaves `through` out. */
export const fullOverlay = overlay;
