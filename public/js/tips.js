/* part of the tmux-ronin client — see js/README.md */
/**
 * THE HELP BOX — one panel, one size, one place. Hovering a control fills it.
 *
 * WHAT WENT WRONG BEFORE, because the shape of this file is a reaction to it. The tile
 * header had grown three separate ways of explaining itself: a native `title` (drawn by
 * the OS, unstyleable, sized and placed however the browser liked), the dial's own
 * `.dial-badge`, and the gauge's own `.gauge-badge` — and then a fourth was added on top
 * in the name of consistency. Hovering the dial put TWO boxes on screen at once, 297x18
 * at one spot and 280x86 at another, with a third flashing when the value changed.
 * Owner: "it's total insanity on the hover".
 *
 * So this replaces all of them rather than joining them. The badges' hover reveals are
 * gone from the stylesheet; their text moved INTO this box as its status line.
 *
 * THE RULES, and they are the whole design:
 *
 *   ONE BOX          a single element, reused. Never two on screen.
 *   ONE SIZE         fixed width AND height. It does not grow for long text and does
 *                    not shrink for short — every label is written to fit, and the
 *                    check that they do is `scripts/check-tips.mjs`.
 *   ONE PLACE        docked under the header of the tile that owns the control. The
 *                    SAME coordinates for every control in that tile, so crossing the
 *                    button row changes the words and moves nothing. Never anchored to
 *                    the cursor, never flipped above, never nudged off an edge.
 *   TWO ZONES        a STATUS line — what this control currently reads, for the ones
 *                    that have a value — and WHAT IS THIS underneath. The status line
 *                    holds its height even when empty, so the box does not reflow
 *                    between a control that has one and a control that does not.
 *
 * Controls outside any tile (the top bar) dock under the top bar by the same rule.
 *
 * NOT FOR A FINGER — decided per EVENT, not per device. A finger has no hover, and a box
 * under a fingertip covers what it describes. `IS_TOUCH` is the wrong test: it is true
 * whenever a machine merely HAS a touchscreen, which is most laptops, and gating on it
 * silently switched help off for a mouse. `pointerType` answers per input instead, so a
 * hybrid machine gets it right either way round.
 */

/** Rest before it opens. Long enough that crossing a row is silent, short enough not to feel broken. */
const DELAY_MS = 300;

let box = null;
let statusEl = null;
let whatEl = null;
let timer = null;
let showing = null;

function ensureBox() {
  if (box) return box;
  box = document.createElement('div');
  box.className = 'helpbox';
  box.setAttribute('role', 'tooltip');
  statusEl = document.createElement('div');
  statusEl.className = 'helpbox-status';
  whatEl = document.createElement('div');
  whatEl.className = 'helpbox-what';
  box.append(statusEl, whatEl);
  document.body.appendChild(box);
  return box;
}

/**
 * The explanation, taking over the element's `title` the first time we see it.
 *
 * Re-reads `title` every time: a live one means the value changed since we last looked
 * (the tile rewrites 🏷 and 📝 on every session refresh), and the fresh one wins. The
 * attribute is MOVED, not copied — leaving it would let the OS draw its box too, which
 * is exactly the pile-up this file exists to end. `aria-label` takes over the accessible
 * name so an icon-only button does not go silent to a screen reader.
 */
function whatIsThis(el) {
  if (el.title) {
    el.dataset.tip = el.title;
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.title);
    el.title = '';
  }
  return el.dataset.tip || '';
}

/**
 * What this control currently READS, or '' when it has no value to report.
 *
 * Two sources, in order: an explicit `data-status`, or the text of the control's own
 * badge. The badge elements stay in the DOM — the dial still flashes its position when
 * you turn it, which is feedback about an action rather than hover help — but their
 * hover reveal is gone from the stylesheet, so the only way that text reaches you on
 * hover is here, inside the one box.
 */
function statusOf(el) {
  if (el.dataset.status) return el.dataset.status;
  const badge = el.querySelector('.gauge-badge, .dial-badge');
  return badge ? badge.textContent.trim() : '';
}

/**
 * WHERE THE BOX GOES — from the owning TILE, never from the control.
 *
 * This is the rule the owner asked for, and the reason the box no longer wanders: every
 * control in a tile produces the identical rectangle, so moving along the header row
 * cannot move or resize it. Controls in the top bar dock under the top bar.
 */
function dockFor(el) {
  const tile = el.closest('.tile');
  const anchor = tile ? tile.querySelector('.tile-head') : document.getElementById('bar');
  if (!anchor) return null;
  const a = anchor.getBoundingClientRect();
  const host = (tile || anchor).getBoundingClientRect();
  return { left: Math.round(host.left + 8), top: Math.round(a.bottom + 6) };
}

function hide() {
  clearTimeout(timer);
  timer = null;
  showing = null;
  if (box) box.classList.remove('show');
}

function show(el) {
  const what = whatIsThis(el);
  if (!what) return;
  const at = dockFor(el);
  if (!at) return;
  ensureBox();
  statusEl.textContent = statusOf(el);
  whatEl.textContent = what;
  box.style.left = `${at.left}px`;
  box.style.top = `${at.top}px`;
  box.classList.add('show');
  showing = el;
}

function arm(el) {
  if (!el || el === showing) return;
  clearTimeout(timer);
  // Already open means you are moving ALONG a row: swap the words with no second wait,
  // which is what makes the row read as one panel rather than a series of pop-ups.
  const wait = showing ? 0 : DELAY_MS;
  const wasShowing = showing;
  if (!wasShowing) hide();
  timer = setTimeout(() => show(el), wait);
}

/** Wire the document once. Safe to call before the grid exists. */
export function installTips() {
  const target = (e) => {
    const el = e.target?.closest?.('[title], [data-tip]');
    return el && (el.title || el.dataset.tip) ? el : null;
  };
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return hide();
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
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  // Anything that moves the dock moves the box off its anchor. Cheapest correct answer.
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
}
