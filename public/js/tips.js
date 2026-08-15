/* part of the tmux-ronin client — see js/README.md */
/**
 * THE HOUSE TOOLTIP — one box, one size, for every `title` in the app.
 *
 * A native `title` tooltip cannot be styled. Not "is hard to style" — no CSS reaches it
 * at all: the browser draws it in the OS layer, sizes it to its own text, places it near
 * the cursor with its own delay, and none of that is ours to set. So the ninety-odd
 * labels across this client each popped up at a different size in a different spot, and
 * moving along one row of buttons made a box jump around and change shape under your
 * hand. The owner's word: "quite unnerving and not great spacing".
 *
 * The dial already worked around this with its own badge, noting that "native title
 * tooltips proved flaky here". That was the right instinct applied in one place; this is
 * it applied once, everywhere.
 *
 * ONE DELEGATED LISTENER, NOT NINETY-SIX EDITS. Nothing that sets a `title` has to know
 * this exists: the listener sits on `document`, finds the nearest element carrying one,
 * and takes it over on the way past. Call sites keep writing `el.title = ...` — including
 * the ones that rewrite it every refresh, like the tile's 🏷 and 📝 — because the takeover
 * re-reads on every hover rather than caching once.
 *
 * THE TAKEOVER, and why the attribute is moved rather than copied: leaving `title` in
 * place would show the native tooltip TOO, so there would be two boxes. It is moved to
 * `data-tip`, and `aria-label` is set from it in the same breath — an icon-only button
 * whose `title` was its accessible name must not go silent to a screen reader just
 * because we took the attribute away.
 *
 * NOT ON TOUCH. There is no hover to speak of, a long-press is the OS's gesture, and a
 * box that appears under a finger covers the thing it describes.
 */
import { IS_TOUCH } from './state.js';

/** How long the pointer must rest before the box appears. Roughly the native delay:
 *  short enough not to feel laggy, long enough that crossing a button row is silent. */
const DELAY_MS = 350;

/** Clear of the control, and clear of the viewport edge. */
const GAP = 6;
const EDGE = 8;

let box = null;
let timer = null;
let showing = null; // the element the visible box belongs to

function ensureBox() {
  if (box) return box;
  box = document.createElement('div');
  box.className = 'tip';
  box.setAttribute('role', 'tooltip');
  document.body.appendChild(box);
  return box;
}

/**
 * The text for an element, taking over its `title` the first time we see it.
 *
 * Re-reads `title` on every call: a live `title` means the value changed since we last
 * looked (the tile rewrites 🏷 and 📝 on every session refresh), and the fresh one wins.
 */
function tipFor(el) {
  if (el.title) {
    el.dataset.tip = el.title;
    // The accessible name follows the text, not the attribute it happens to live in.
    // Only when there is nothing better already: a real aria-label is somebody's
    // deliberate choice and outranks a title written for sighted hover.
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.title);
    el.title = '';
  }
  return el.dataset.tip || '';
}

function hide() {
  clearTimeout(timer);
  timer = null;
  showing = null;
  if (box) box.classList.remove('show');
}

function place(el) {
  const a = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  // Left-aligned to the control, then pulled inside the viewport — a button at the right
  // edge of a four-up grid would otherwise open its box off the screen.
  const left = Math.max(EDGE, Math.min(a.left, window.innerWidth - b.width - EDGE));
  // Under it by default, above when there is no room — the tile row nearest the bottom
  // of the window has none, and a box hanging off the end is worse than a box above.
  const below = a.bottom + GAP;
  const top = below + b.height > window.innerHeight - EDGE ? Math.max(EDGE, a.top - b.height - GAP) : below;
  box.style.left = `${Math.round(left)}px`;
  box.style.top = `${Math.round(top)}px`;
}

function show(el) {
  const text = tipFor(el);
  if (!text) return;
  ensureBox();
  box.textContent = text;
  showing = el;
  // Placed AFTER the text is in, because the box has to have been laid out before its
  // height can be measured — and its height is what decides above-or-below.
  box.classList.add('show');
  place(el);
}

function arm(el) {
  if (!el || el === showing) return;
  clearTimeout(timer);
  // A box already up means you are moving ALONG a row, and the next label should follow
  // the pointer without a second wait. That is what makes the row read as one strip of
  // help rather than as a series of pop-ups.
  const wait = showing ? 0 : DELAY_MS;
  hide();
  timer = setTimeout(() => show(el), wait);
}

/** Wire the whole document once. Safe to call before the grid exists. */
export function installTips() {
  if (IS_TOUCH) return;
  const target = (e) => {
    const el = e.target?.closest?.('[title], [data-tip]');
    // An empty data-tip is a control that never had a title — do not open a blank box.
    return el && (el.title || el.dataset.tip) ? el : null;
  };
  document.addEventListener('pointerover', (e) => {
    const el = target(e);
    if (el) arm(el);
    else if (showing && !showing.contains(e.target)) hide();
  });
  document.addEventListener('pointerout', (e) => {
    if (showing && !e.relatedTarget) hide();
  });
  // Keyboard reaches the same help: tab to a control and it explains itself.
  document.addEventListener('focusin', (e) => {
    const el = target(e);
    if (el) arm(el);
  });
  document.addEventListener('focusout', hide);
  // Anything that moves the page moves the anchor out from under the box, and a box
  // pointing at nothing is worse than no box. Cheapest correct answer: drop it.
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
}
