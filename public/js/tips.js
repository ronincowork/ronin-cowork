/* part of the ronin-cowork client — see js/README.md */
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
 *   TWO ZONES        a HEADER line — a keyboard shortcut, or what this control currently
 *                    reads, for the ones that have either — and WHAT IS THIS underneath,
 *                    separated by a rule. THE HEADER EXISTS IF AND ONLY IF IT HAS
 *                    CONTENT: no shortcut and no reading means no header and no rule, and
 *                    the explanation starts at the top of the box.
 *
 * THE HEADER USED TO BE UNCONDITIONAL and that was the bug (owner, 2026-08-17). It held
 * its height when empty — `min-height` on `.helpbox-status` — on the argument that the
 * box would otherwise reflow between a control that has a reading and one that does not.
 * That argument was already covered: `.helpbox` is a FIXED width AND height, so nothing
 * reflows either way; the reserved line bought nothing and cost the majority case. Every
 * control without a reading — which is most of them, and ALL of the macro rows — drew an
 * empty block and a rule above two lines of text. Owner, scrolling the macro list: "it's
 * very convoluted because of the way that it has that header. You barely see the text,
 * and there's this big white block head at the top." So the rule is content, not caller:
 * one `:empty` in the stylesheet, and every blank source normalised to '' here so that
 * a whitespace-only reading cannot sneak a rule back in.
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

// OWNER, 2026-09-02: the docked help panel is disabled system-wide. It was appearing
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

/**
 * A KEYBOARD SHORTCUT, lifted out of the label it is already written in.
 *
 * There is no shortcut registry and this deliberately does not start one (owner's KISS
 * ruling, 2026-08-17). The chords that exist are owned where they are handled — the
 * Ctrl+Shift / Ctrl+Alt block in `layout.js` — and the two controls that HAVE one already
 * announce it the only way they ever could: at the front of their own title, as
 * `"⌃⇧C — the CoWorking Commons: …"` (`index.html`, き Commons and か New). That prefix is
 * the data. Reading it here is what puts the chord above the rule instead of buried in
 * the middle of a sentence, and costs nothing new to maintain: write the chord at the
 * front of the label, as those two already do, and it lands in the header.
 *
 * THE PATTERN IS DELIBERATELY NARROW. It must not fire on prose, and prose in this client
 * uses the same ` — ` join freely (`padpanel.js` builds `widget — what it does`). So it
 * demands a leading MODIFIER GLYPH — ⌃⇧⌥⌘, which no sentence starts with — then a short
 * key, then the em dash. "Ctrl-C (interrupt)" on ^C is not a shortcut FOR that button, it
 * is what the button sends, and it correctly does not match.
 *
 * `data-keys` is the explicit door for a control built in JS that would rather say so
 * than encode it in prose. Nothing sets it today; it costs one line to honour.
 */
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

/**
 * WHERE THE BOX GOES — from the owning TILE and the control's SIDE, never from the
 * control's own position.
 *
 * TWO COORDINATES, not one. The header is two groups either side of a `.grow` spacer:
 * the session picker and the mark sit left, the controls sit right. Docking everything
 * left meant the whole right-hand cluster threw its box across to the far side of the
 * tile, so the answer appeared nowhere near the question. Each side now docks to its
 * own edge.
 *
 * Within a side the rectangle is still a CONSTANT — that is the property worth keeping.
 * Crossing the right-hand buttons cannot move or resize the box; only stepping between
 * the two groups does, and those are two different places on the header.
 *
 * The side is read from DOM ORDER against the spacer rather than from coordinates:
 * position depends on how wide the tile is and which buttons are hidden, whereas the
 * order in the markup is what actually defines the two groups.
 *
 * TWO EXCEPTIONS TO "below the header", and they are the same exception twice: a control
 * that lives in something which ITSELF hangs below the header cannot have its help docked
 * to the header, because the header's bottom edge is where that thing already is.
 *
 *   メ'S DROP (`tilemore.js`), earned in a browser on 2026-08-17. Six header controls
 *   moved into the drop, and docking to the header laid the box straight over the drop —
 *   covering all six while you read about one.
 *
 *   THE COMMONS TAB STRIP (`commons.js`), 2026-08-18. The strip sits immediately below
 *   the header, so anything in it that docked to the header's bottom edge landed ON the
 *   strip: hovering ▣ Roots laid a 300px box across SEVEN of the ten rooms, and since a
 *   tab is not in the header it also failed the spacer test and docked to the tile's far
 *   RIGHT, putting the answer at the opposite end of the strip from the question. Owner:
 *   "the helpful hints are dropping in front of the tabs and hard to find."
 *
 *   THE TABS THEN LOST THEIR HELP OUTRIGHT, which was the owner's second ruling that day
 *   and the better one — a tab's label already says what its room is, so there was never
 *   anything for a box to add (`panes.js`). That does NOT retire this anchor. What is
 *   still in the strip is the ✕, a bare glyph with no label of its own, which is exactly
 *   the case help exists for; and its box would cover the tabs from the header just as
 *   readily. One control is enough to keep the rule honest.
 *
 * So the anchor is "the nearest thing below the header that the control is inside, else
 * the header", and the SIDE is read off whatever divides THAT anchor's two groups.
 */
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
