/* part of the ronin-cowork client — see js/README.md */
/** Rest before it opens. Long enough that crossing a row is silent, short enough not to feel broken. */
const DELAY_MS = 300;

// over menus and controls far more often than it supplied useful information. Keep the
// title takeover below: without it, disabling our panel merely resurrects the browser's
// native hover bubbles. This one switch preserves the implementation for reconsideration
// without allowing either kind of popup onto the screen.
const HELP_BOX_ENABLED = false;

let box = null;
let statusEl = null;
let whatEl = null;
let timer = null;
let showing = null;
// A control whose help has been dismissed by clicking it, until the pointer leaves.
let muted = null;

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

const CHORD = /^([⌃⇧⌥⌘]+[A-Za-z0-9↑↓←→]{0,5})\s+—\s+/;

function keysOf(el) {
  if (el.dataset.keys) return el.dataset.keys.trim();
  const m = CHORD.exec(el.dataset.tip || '');
  return m ? m[1] : '';
}

function whatIsThis(el) {
  takeOver(el); // belt and braces; the observer has almost certainly beaten us here
  // The chord comes off the front: it is being shown in the header, and printing it in
  // both zones is how you get a bubble that says the same thing twice in 92 pixels.
  return (el.dataset.tip || '').replace(CHORD, '');
}

/**
 * What this control currently READS, or '' when it has no value to report.
 *
 * Two sources, in order: an explicit `data-status`, or the text of the control's own
 * badge. The badge elements stay in the DOM — the dial still flashes its position when
 * you turn it, which is feedback about an action rather than hover help — but their
 * hover reveal is gone from the stylesheet, so the only way that text reaches you on
 * hover is here, inside the one box.
 *
 * TRIMMED AT THE SOURCE, both branches. A badge that is momentarily whitespace, or a
 * `data-status=" "`, is not a reading — and left untrimmed it is a non-empty text node,
 * which is enough to defeat `.helpbox-status:empty` and put the rule back over a control
 * that has nothing to report. Blank means '' here so the stylesheet's one rule holds.
 */
function statusOf(el) {
  if (el.dataset.status) return el.dataset.status.trim();
  const badge = el.querySelector('.gauge-badge, .dial-badge');
  return badge ? badge.textContent.trim() : '';
}

/**
 * The header line: the shortcut, the live reading, or nothing at all.
 *
 * ONE RULE, ONE PLACE — every caller goes through here, so "header exists iff it has
 * content" is not something a caller can get wrong. Writing '' leaves the element with no
 * child nodes at all, which is what `.helpbox-status:empty` in the stylesheet keys off to
 * take the block AND its rule out of the box entirely.
 *
 * Both at once is not a case that exists today (the controls with a reading are the dial
 * and the gauges; the ones with a chord are in the top bar), but joining beats picking a
 * winner and silently dropping the other.
 */
function setHeader(el) {
  statusEl.textContent = [keysOf(el), statusOf(el)].filter(Boolean).join(' · ');
}

function dockFor(el, boxWidth) {
  const tile = el.closest('.tile');
  const head = tile ? tile.querySelector('.tile-head') : document.getElementById('bar');
  if (!head) return null;
  // The thing to clear: whatever the control is inside that already hangs below the
  // header (メ's drop, the Commons tab strip), else the header itself.
  const anchor = el.closest('.tmore, .home-tabs') || head;
  // THE DIVIDER between the anchor's two groups, in DOM order. The header's is its
  // `.grow` spacer; the tab strip's is the ✕, which carries `margin-left: auto` and so
  // IS that strip's spacer — which puts a tab's help under the tabs and ✕'s help under
  // ✕, each on its own end. メ's drop has no divider of its own and falls back to the
  // header's, because メ is one of the right-hand group whatever it contains.
  const split = anchor.querySelector('.grow, .home-x') || head.querySelector('.grow');
  const onLeft = split ? !!(split.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) : true;
  const a = anchor.getBoundingClientRect();
  const host = (tile || head).getBoundingClientRect();
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
  setHeader(el);
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

export function refreshTipStatus(el) {
  if (!box || !showing || !el || (showing !== el && !el.contains(showing))) return;
  // Through `setHeader` and not `statusOf` directly, so a control whose reading arrives
  // late grows its rule at that moment instead of never having one.
  setHeader(showing);
}

function arm(el) {
  // Muted: you clicked this control, so its help got out of the way — and must STAY out
  // of the way. Opening a menu re-fires `pointerover` on the button underneath it (the
  // DOM changed under a resting pointer), so without this the box hid on the click and
  // came straight back a moment later, on top of the menu it had just opened. Measured:
  // show=0 at 200ms, show=1 at 1.1s.
  if (!el || el === showing || el === muted) return;
  clearTimeout(timer);
  // Already open means you are moving ALONG a row: swap the words with no second wait,
  // which is what makes the row read as one panel rather than a series of pop-ups.
  const wait = showing ? 0 : DELAY_MS;
  const wasShowing = showing;
  if (!wasShowing) hide();
  timer = setTimeout(() => show(el), wait);
}

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
  if (!HELP_BOX_ENABLED) return;
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
    // Leaving the control un-mutes it: come back to ⚡ later and it explains itself again.
    if (muted && !muted.contains(e.relatedTarget)) muted = null;
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
      // A click on an INSTRUMENT the box is describing is not a dismissal — it is you
      // operating it. The dial is turned by clicking the very thing you are hovering, so
      // a blanket hide destroyed the readout at the moment it changed, which is the hole
      // the old 1400ms flash was plugging. Those controls mark themselves `holdsHelp`
      // (the `holds` column in tilehead.js's table); the box stays and
      // `refreshTipStatus` rewrites its status line in place.
      //
      // Everything else OPENS something, and there the opposite is true: a box left up
      // sits on top of the menu it just opened — measured, with ⚡'s macro list behind it.
      if (showing?.dataset.holdsHelp && showing.contains(e.target)) return;
      muted = e.target?.closest?.('[title], [data-tip]') || null;
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
