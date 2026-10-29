/* part of the ronin-cowork client — see js/README.md */
/**
 * THE MENU — the location "menu" (PATTERNS.md), and its one owner (owner, 2026-10-07: "an
 * overlay of sorts itself … more pro"). One control, メ, opens an overlay hung off it, over
 * the surface that control heads: right-aligned under the control, never wider or taller
 * than its host. One menu on the page at a time. A row that opens a read or a form opens
 * it in the full overlay (work-details.js fullOverlay), never inside the menu.
 *
 * The menu draws its own rows from data; it never borrows the head's buttons. A group is
 * `{ items?, foot? }`, divided from the next by a hairline only, never a word:
 *   items  rows: { glyph, label, hint, run, kind, checked, quiet, list, empty }
 *          kind 'action' (default) runs and closes · 'radio' one of the group, aria-checked ·
 *          'check' a tick box: a press flips it, calls run(checked), and the menu stays up ·
 *          'list' drills in: its rows replace the menu's, with a Back row; never a flyout.
 *          `quiet` is the reason a row cannot run; it is shown, and the row does nothing.
 *   foot   the group stays at the bottom while the rest scrolls (Delete or archive).
 * It closes on a row, a press outside, Escape (focus back to the control), or the control.
 */
import { t } from './lexicon.js';

const el = (tag, cls = '', text = '') => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text) out.textContent = text;
  return out;
};

let current = null;

/** Whether a menu is up — the terminal's key handler asks before it lets a key through. */
export const menuOpen = () => !!current;
export function closeMenu() { current?.close(); }

/** The メ control. `groups` is read at each press, so the menu is never stale. */
export function createMenuButton({ glyph = 'メ', title = '', host, groups }) {
  const btn = el('button', 'menu-btn', glyph);
  btn.type = 'button';
  btn.title = title;
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (current?.anchor === btn) { closeMenu(); return; }
    if (btn.getAttribute('aria-disabled') === 'true') return;
    openMenu({ anchor: btn, host: host(), title, groups: groups() });
  });
  return { el: btn };
}

export function openMenu({ anchor, host, title = '', groups = [], onClose = () => {} }) {
  closeMenu();
  const panel = el('div', 'menu');
  panel.setAttribute('role', 'menu');
  if (title) panel.setAttribute('aria-label', title);
  const body = el('div', 'menu-body');
  const foot = el('div', 'menu-foot');
  panel.append(body, foot);

  const row = (item, { radio = false } = {}) => {
    const button = el('button', 'menu-item');
    button.type = 'button';
    const check = item.kind === 'check';
    button.setAttribute('role', check ? 'menuitemcheckbox' : radio ? 'menuitemradio' : 'menuitem');
    if (radio || check) button.setAttribute('aria-checked', String(!!item.checked));
    if (item.kind === 'list') button.setAttribute('aria-haspopup', 'menu');
    const hint = item.quiet || item.hint || '';
    button.append(el('span', 'menu-glyph', item.glyph || (radio && item.checked ? '●' : '')),
      el('span', 'menu-label', item.label), el('span', 'menu-hint', hint));
    if (item.kind === 'list') button.append(el('span', 'menu-more', '›'));
    if (item.quiet) { button.setAttribute('aria-disabled', 'true'); button.title = item.quiet; }
    button.addEventListener('click', () => {
      if (item.quiet) return;
      if (item.kind === 'list') { drill(item); return; }
      if (item.kind === 'back') { paint(); first(); return; }
      if (check) { item.checked = !item.checked; button.setAttribute('aria-checked', String(item.checked)); item.run?.(item.checked); return; }
      close();
      item.run?.();
    });
    return button;
  };

  const group = (spec, into) => {
    const box = el('div', 'menu-group');
    const radio = spec.items?.some((item) => item.kind === 'radio');
    for (const item of spec.items || []) box.append(row(item, { radio }));
    into.append(box);
  };

  const paint = () => {
    body.replaceChildren();
    foot.replaceChildren();
    for (const spec of groups.filter(Boolean)) group(spec, spec.foot ? foot : body);
    foot.hidden = !foot.childElementCount;
  };

  const drill = (item) => {
    body.replaceChildren();
    foot.hidden = true;
    const back = row({ kind: 'back', glyph: '‹', label: item.label });
    back.classList.add('menu-back');
    const box = el('div', 'menu-group');
    const rows = item.list?.() || [];
    box.append(...rows.map((each) => row(each)));
    if (!rows.length) box.append(el('div', 'menu-empty', item.empty || t('menu.empty', 'Nothing here yet.')));
    body.append(back, box);
    first();
  };

  const items = () => [...panel.querySelectorAll('.menu-item:not([aria-disabled="true"])')]
    .filter((node) => node.getClientRects().length);
  const first = () => (items()[0] || panel).focus();

  const onKey = (event) => {
    const list = items();
    const at = list.indexOf(document.activeElement);
    const go = (index) => { event.preventDefault(); list[(index + list.length) % list.length]?.focus(); };
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); anchor?.focus(); }
    else if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at < 0 ? -1 : at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(-1);
    else if (event.key === 'Tab') close();
  };
  const outside = (event) => {
    if (panel.contains(event.target) || anchor?.contains(event.target)) return;
    close();
  };

  function close() {
    current = null;
    document.removeEventListener('pointerdown', outside, true);
    panel.remove();
    anchor?.setAttribute('aria-expanded', 'false');
    onClose();
  }

  paint();
  host.append(panel);
  // Under the control, right edges aligned, inside the host. A control outside the host
  // (the phone's bar over its tile) hangs the menu from the host's top edge.
  const box = host.getBoundingClientRect();
  const at = anchor ? anchor.getBoundingClientRect() : box;
  const top = Math.max(0, Math.round(at.bottom - box.top + 4));
  panel.style.top = `${top}px`;
  panel.style.right = `${Math.max(6, Math.round(box.right - at.right))}px`;
  panel.style.maxHeight = `${Math.max(160, host.clientHeight - top - 6)}px`;

  current = { panel, anchor, close };
  anchor?.setAttribute('aria-expanded', 'true');
  panel.tabIndex = -1;
  panel.addEventListener('keydown', onKey);
  panel.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('pointerdown', outside, true);
  first();
  return { el: panel, close };
}
