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
 *   TWO PLACES       docked under the header of the tile that owns the control, on the
 *                    control's OWN SIDE of it — the header is two groups either side of
 *                    a spacer, and throwing the right-hand cluster's box across to the
 *                    left edge put the answer nowhere near the question. Within a side
 *                    the rectangle is a constant, so crossing the eight right-hand
 *                    buttons changes the words and moves nothing. Never anchored to the
 *                    cursor, never flipped above, never nudged off an edge.
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
 * Move a `title` to `data-tip` — the takeover, and it has to be TOTAL.
 *
 * The attribute is moved rather than copied because leaving it lets the OS draw its own
 * box as well, which is the pile-up this file exists to end. `aria-label` takes over the
 * accessible name so an icon-only button does not go silent to a screen reader.
 *
 * DOING THIS LAZILY ON HOVER WAS A BUG, and a nasty one to chase because it needed the
 * pointer to be standing still. Several controls REWRITE their title on every refresh —
 * `updateNoteBtn`, `updateTagBtn`, `updateJobBtn`, `setInert` — and the roster pushes a
 * refresh every couple of seconds. Rest the pointer on 🏷 and the sequence is: we cleared
 * the title on the way in, the refresh put a fresh one back, no new `pointerover` fires
 * because nothing moved, nobody clears it, and a second later the OS draws the old-style
 * tooltip on top of our box. The owner saw it as a flash of the old dialog on some
 * buttons and could not reproduce it on demand. That is why.
 *
 * So the takeover is not a hover-time job. It is a sweep at install plus an observer,
 * below, and a title cannot survive being set no matter who sets it or when.
 */
function takeOver(el) {
  const t = el.getAttribute('title');
  if (!t) return;
  el.dataset.tip = t;
  if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', t);
  el.removeAttribute('title');
}

function whatIsThis(el) {
  takeOver(el); // belt and braces; the observer has almost certainly beaten us here
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
 * WHERE THE BOX GOES — from the owning TILE and the control's SIDE, never from the
 * control's own position.
 *
 * TWO COORDINATES, not one. The header is two groups either side of a `.grow` spacer:
 * the session picker and the mark sit left, the eight controls sit right. Docking
 * everything left meant the whole right-hand cluster threw its box across to the far
 * side of the tile, so the answer appeared nowhere near the question. Each side now
 * docks to its own edge.
 *
 * Within a side the rectangle is still a CONSTANT — that is the property worth keeping.
 * Crossing the eight right-hand buttons cannot move or resize the box; only stepping
 * between the two groups does, and those are two different places on the header.
 *
 * The side is read from DOM ORDER against the spacer rather than from coordinates:
 * position depends on how wide the tile is and which buttons are hidden, whereas the
 * order in the markup is what actually defines the two groups.
 */
function dockFor(el, boxWidth) {
  const tile = el.closest('.tile');
  const anchor = tile ? tile.querySelector('.tile-head') : document.getElementById('bar');
  if (!anchor) return null;
  const grow = anchor.querySelector('.grow');
  const onLeft = grow ? !!(grow.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) : true;
  const a = anchor.getBoundingClientRect();
  const host = (tile || anchor).getBoundingClientRect();
  return {
    left: Math.round(onLeft ? host.left + 8 : host.right - boxWidth - 8),
    top: Math.round(a.bottom + 6),
  };
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
  ensureBox();
  statusEl.textContent = statusOf(el);
  whatEl.textContent = what;
  // Shown BEFORE it is measured: a hidden element has no width, and the right-hand dock
  // is `tile.right - width`. All of this runs in one turn, so nothing paints at the old
  // position on the way past.
  box.classList.add('show');
  const at = dockFor(el, box.offsetWidth);
  if (!at) return hide();
  box.style.left = `${at.left}px`;
  box.style.top = `${at.top}px`;
  showing = el;
}

/**
 * Re-read the status line of the box that is already open.
 *
 * For an instrument whose value changes while you are looking at it — turning the dial
 * is the case that matters, because you turn it by clicking the thing you are hovering.
 * Both the dial and the gauge used to flash a bubble of their own at that moment, which
 * put a second panel on top of the one already reading their value. Now the reading
 * simply changes where it is being read.
 *
 * A no-op unless the box is open for that very control, so a background refresh cannot
 * make a panel appear that nobody asked for.
 */
export function refreshTipStatus(el) {
  if (!box || !showing || !el || (showing !== el && !el.contains(showing))) return;
  statusEl.textContent = statusOf(showing);
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

/**
 * Take every title in the document, now and forever after.
 *
 * The sweep catches what is already on the page (index.html's own, and anything built
 * before this ran). The observer catches the rest: a title set by ANY code at ANY time —
 * a refresh rewriting 🏷, a tile built later, a panel opened for the first time — is
 * moved before the OS gets a chance to draw it. Cheap: one attribute filter, and the
 * callback does nothing at all unless a title actually appeared.
 */
function seizeTitles() {
  const sweep = (node) => {
    if (node.nodeType !== 1) return;
    takeOver(node);
    for (const el of node.querySelectorAll('[title]')) takeOver(el);
  };
  sweep(document.documentElement);
  new MutationObserver((records) => {
    for (const r of records) {
      // Two ways a title arrives, and watching only the first missed 44 of them.
      // ATTRIBUTES covers a title set on an element already in the page — a refresh
      // rewriting 🏷. But the roster and the launcher board BUILD their rows detached,
      // set the title, and append afterwards: the attribute changed while the element
      // was outside the observed tree, so no attribute record is ever emitted, and the
      // childList record that follows names the PARENT rather than the new node. Those
      // rows kept their native tooltips. So added subtrees are swept too.
      if (r.type === 'attributes') takeOver(r.target);
      else for (const n of r.addedNodes) sweep(n);
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['title'],
  });
}

/** Wire the document once. Safe to call before the grid exists. */
export function installTips() {
  seizeTitles();
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
  document.addEventListener(
    'pointerdown',
    (e) => {
      // A click on the control the box is DESCRIBING is not a dismissal — it is you
      // operating it. The dial is turned by clicking the very thing you are hovering, so
      // a blanket hide destroyed the readout at the moment it changed, which is the hole
      // the old 1400ms flash was plugging. Keep the box; `refreshTipStatus` rewrites its
      // status line in place. A click anywhere else still dismisses.
      if (showing && showing.contains(e.target)) return;
      hide();
    },
    true,
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  // Anything that moves the dock moves the box off its anchor. Cheapest correct answer.
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
}
