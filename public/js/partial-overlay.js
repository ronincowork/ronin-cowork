/* part of the ronin-cowork client — see js/README.md */
/**
 * THE PARTIAL OVERLAY — a small window over part of a surface, anchored to the thing it is
 * about (owner, 2026-10-07: the location "partial overlay" in UI_STRUCTURE). One at a time per
 * host. It sits just under its anchor, inside the host, never wider than the host; Close, a
 * press outside it or Escape lifts it. The consumer draws the body; the overlay owns only the
 * frame, the title and the way out.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';

const el = (tag, cls = '', text = '') => { const out = document.createElement(tag); if (cls) out.className = cls; if (text) out.textContent = text; return out; };

export function openPartialOverlay(host, { anchor = null, title = '', draw = () => {}, onClose = () => {} } = {}) {
  host.querySelector(':scope > .partial-overlay')?.remove();
  const { createAction } = WorkspaceKit.primitives;
  const layer = el('div', 'partial-overlay');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-label', title);
  const head = el('div', 'partial-overlay-head');
  const close = createAction({ label: t('work.close_item', 'Close'), size: 'compact', action: () => lift() });
  head.append(el('b', 'partial-overlay-title', title), close.el);
  const body = el('div', 'partial-overlay-body');
  layer.append(head, body);
  host.append(layer);
  // Under the anchor, inside the host; the host is the positioning box.
  if (anchor) {
    const box = host.getBoundingClientRect(), at = anchor.getBoundingClientRect();
    const left = Math.max(0, Math.min(at.left - box.left + host.scrollLeft, host.clientWidth - layer.offsetWidth));
    layer.style.left = `${left}px`;
    layer.style.top = `${at.bottom - box.top + host.scrollTop + 6}px`;
  }
  const outside = (event) => { if (!layer.contains(event.target)) lift(); };
  const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); lift(); } };
  const lift = () => { document.removeEventListener('pointerdown', outside, true); layer.removeEventListener('keydown', onKey); layer.remove(); onClose(); };
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  layer.addEventListener('keydown', onKey);
  layer.tabIndex = -1;
  draw(body, { lift });
  (body.querySelector('input, textarea, button') || layer).focus();
  return { el: layer, lift };
}
