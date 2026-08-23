/* part of the ronin-cowork client — see js/README.md */
/**
 * TAPEVIEW — RIREKI's client-side render. The 🔓 unlocked view.
 *
 * KOTOBA has RIREKI covering "capture, storage, render and the consumers". The server
 * half honours that (`src/services/rireki/`, `libexec/rireki/`); this is the client half,
 * and it lived inside `class Tile` until 2026-08-13 — the fold machine, the tape
 * append/prepend and the scroll anchoring, all squatting in the coworkspace. A tile is
 * one cell of the coworkspace; the render of a tape is RIREKI's. Now it is its own
 * module, and the tile merely mounts it.
 *
 * IT HOLDS NO TMUX CONNECTION. No attach, no viewer session, no pipe — tmux does not
 * know this view exists. Display comes from the tape; input goes back through the
 * socket the tile owns (`tilewire.js`), which is why nothing here touches a WebSocket.
 *
 * A plain scrollable element, not a terminal: a tape-fed stream is 100% plain text
 * (measured: zero cursor-move or erase sequences in a whole 796KB stream). Feeding
 * that to xterm.js buys nothing and costs everything that matters — it re-renders rows
 * on every scroll tick, so on a phone it never feels like a page. A div with
 * overflow-y:auto gets hardware-accelerated momentum scrolling for free.
 *
 * 🔒 Locked is the other view (`termview.js`) and must be an emulator: there the stream
 * is a live screen full of positioning.
 */
import { ANSI_RE } from './ansi.js';
import { groupRecs } from './tapefold.js';

const TRIM_HIGH = 4000000; // characters held before trimming kicks in
const TRIM_LOW = 3000000; // trim down to this

export class TapeView {
  /**
   * @param {HTMLElement} body  the tile body to mount into
   * @param {{onMore: () => void, onSummaryNow?: () => void, onSummaryPolicy?: (string) => void}} hooks
   */
  constructor(body, hooks) {
    this.onMore = hooks.onMore;
    this.active = false; // true only while this view is the tile's live surface
    this.lastFold = null; // the open fold new `result` lines extend
    this.tapeChars = 0;
    this.pagingBusy = false; // a chunk is in flight
    this.pagedOut = false; // nothing above — stop asking
    this.awaitBottom = false;
    this.decoder = new TextDecoder('utf-8');

    this.el = document.createElement('div');
    this.el.className = 'tape';
    // Two children: the append-only TRANSCRIPT, and beneath it the LIVE FRAME — the
    // pane's current screen, replaced wholesale when it changes. The frame is why a
    // send shows up within a tick: fresh exchanges live on the screen, unsettled.
    this.ttext = document.createElement('div');
    this.ttext.className = 'ttext';
    this.tframe = document.createElement('div');
    this.tframe.className = 'tframe';
    this.el.append(this.ttext, this.tframe);

    this.kakiControls = document.createElement('div');
    this.kakiControls.className = 'kaki-controls';
    const now = document.createElement('button');
    now.type = 'button'; now.textContent = 'Summarize now';
    now.addEventListener('click', () => hooks.onSummaryNow?.());
    this.kakiPolicy = document.createElement('select');
    this.kakiPolicy.setAttribute('aria-label', 'Summary production');
    this.kakiPolicy.add(new Option('On demand', 'on_demand'));
    this.kakiPolicy.add(new Option('Keep current', 'keep_current'));
    this.kakiPolicy.addEventListener('change', () => hooks.onSummaryPolicy?.(this.kakiPolicy.value));
    this.kakiControls.append(now, this.kakiPolicy);
    this.el.prepend(this.kakiControls);

    this.el.addEventListener('scroll', () => this.onScroll(), { passive: true });
    // At the LITERAL top, a further wheel-up changes nothing, so no scroll event fires
    // and paging would strand. The gesture itself is the signal there.
    this.el.addEventListener(
      'wheel',
      (e) => {
        if (this.active && !this.pagingBusy && !this.pagedOut && e.deltaY < 0 && this.el.scrollTop === 0) {
          this.pagingBusy = true;
          this.onMore();
        }
      },
      { passive: true },
    );

    // ↓ latest — the deterministic way back to the finish, whatever the scroll
    // physics of the day are doing. Shown only while scrolled up.
    this.jump = document.createElement('button');
    this.jump.className = 'tapejump';
    this.jump.title = 'Jump to the latest output — the deterministic way back to the bottom, whatever the scroll is doing.';
    this.jump.textContent = '↓ latest';
    this.jump.addEventListener('click', () => {
      this.el.scrollTop = this.el.scrollHeight;
      this.jump.classList.remove('show');
    });

    body.appendChild(this.el);
    body.appendChild(this.jump);
  }

  setMode(mode) {
    this.mode = mode;
    this.kakiControls.classList.toggle('show', mode === 'agent_summary');
  }

  setSummaryPolicy(policy) { this.kakiPolicy.value = policy === 'keep_current' ? 'keep_current' : 'on_demand'; }

  setSummary(text, note = '') {
    const wasAtBottom = this.atBottom();
    this.ttext.textContent = text || note || 'No summary has been written yet.';
    this.tframe.textContent = '';
    this.lastFold = null;
    this.tapeChars = this.ttext.textContent.length;
    this.follow(wasAtBottom);
  }

  /**
   * Start over for a fresh connection.
   *
   * The seed must LAND at the bottom, post-layout: the atBottom heuristic reads
   * geometry that may not exist yet on a freshly-shown div (a lock flip toggles
   * display in the same frame), and a seed that lands while clientHeight is 0 opens
   * the transcript at the TOP.
   */
  reset(active) {
    this.active = !!active;
    this.ttext.textContent = '';
    this.tframe.textContent = '';
    this.lastFold = null;
    this.tapeChars = 0;
    this.pagingBusy = false;
    this.pagedOut = false;
    this.awaitBottom = true;
    this.decoder = new TextDecoder('utf-8');
    this.jump.classList.remove('show');
  }

  atBottom() {
    const el = this.el;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }

  /** Bound memory on a long-lived tile without disturbing where you are reading. */
  trim() {
    if (this.tapeChars <= TRIM_HIGH) return;
    const el = this.ttext;
    while (el.childNodes.length > 1 && this.tapeChars > TRIM_LOW) {
      this.tapeChars -= el.firstChild.textContent.length;
      el.removeChild(el.firstChild);
    }
  }

  follow(wasAtBottom) {
    const el = this.el;
    if (this.awaitBottom) {
      // First content after a (re)connect: force the bottom after layout has really
      // happened, whatever the geometry said mid-flip.
      this.awaitBottom = false;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
      return;
    }
    if (wasAtBottom) el.scrollTop = el.scrollHeight;
  }

  scrollToBottom() {
    this.el.scrollTop = this.el.scrollHeight;
  }

  /** Page the transcript by a fraction of a screen — the pad's scroll encoder. */
  scrollByPages(frac) {
    this.el.scrollTop += frac * this.el.clientHeight;
  }

  /**
   * Chip on tape-fed tiles: the scrollback above the live screen is a reconstruction.
   *
   * Honest UI, and RIREKI's to say: the lines above the live frame were rebuilt from
   * the tape by collapsing repaints, not transcribed from what was on screen.
   */
  setAltNote(on, partial) {
    const text = (partial ? 'history begins mid-session · ' : '') + 'scrollback above is reconstructed from the tape';
    if (!this.altNote) {
      if (!on) return;
      const n = document.createElement('div');
      n.className = 'alt-note';
      n.textContent = text;
      this.el.parentNode.appendChild(n);
      this.altNote = n;
    }
    if (on) this.altNote.textContent = text;
    this.altNote.classList.toggle('show', on);
  }

  /**
   * Append text and follow the bottom — the whole behaviour of a log on a web page.
   *
   * Follow only when you are ALREADY at the bottom. Scrolled up, new lines land below
   * and nothing moves under you: append-only content cannot disturb a scroll position,
   * which is why nothing has to be held back or replayed.
   *
   * Legacy path: a server older than the structured-lines protocol. Plain text into
   * the transcript, no folds.
   */
  appendBytes(bytes) {
    const text = this.decoder.decode(bytes, { stream: true }).replace(ANSI_RE, '');
    if (!text) return;
    const wasAtBottom = this.atBottom();
    this.ttext.appendChild(document.createTextNode(text));
    this.tapeChars += text.length;
    this.trim();
    this.follow(wasAtBottom);
  }

  /**
   * Turn the fold rule's ops into DOM. The rule itself is `groupRecs` (tapefold.js);
   * nothing is decided here.
   */
  applyOps(frag, ops) {
    for (const op of ops) {
      if (op.t === 'text') {
        frag.appendChild(document.createTextNode(op.s));
        continue;
      }
      if (op.t === 'extend') {
        // The fold the previous call left open, still the last child of the
        // transcript. If it has moved or gone, the run starts its own fold instead.
        const fold = this.lastFold && this.lastFold.parentNode === this.ttext && this.ttext.lastChild === this.lastFold ? this.lastFold : null;
        if (fold) {
          this.fill(fold, op);
          continue;
        }
        op.label = '⌨ code';
      }
      const fold = document.createElement('details');
      fold.className = 'fold';
      const sum = document.createElement('summary');
      sum.textContent = op.label ?? '⎿';
      fold.appendChild(sum);
      fold.appendChild(document.createTextNode(''));
      fold._n = 0;
      frag.appendChild(fold);
      this.fill(fold, op);
      this.lastFold = fold;
    }
  }

  /** Pour a run of lines into a fold and keep its summary's count honest. */
  fill(fold, op) {
    for (const line of op.lines) fold.lastChild.textContent += line + '\n';
    fold._n += op.n;
    const sum = fold.firstChild;
    if (fold._n > 1) sum.textContent = (sum._head ?? (sum._head = sum.textContent)) + '  … ' + fold._n + ' lines';
  }

  /** Settled lines with kinds — `{t:'lines'}`. Appends; `reset` starts the transcript over. */
  appendRecs(recs, reset) {
    const wasAtBottom = this.atBottom();
    if (reset) {
      this.ttext.textContent = '';
      this.lastFold = null;
      this.tapeChars = this.tframe.textContent.length;
    }
    const frag = document.createDocumentFragment();
    const { ops, chars, keepFold } = groupRecs(recs, !reset);
    this.tapeChars += chars;
    this.applyOps(frag, ops);
    if (!keepFold) this.lastFold = null;
    this.ttext.appendChild(frag);
    this.trim();
    this.follow(wasAtBottom || reset);
  }

  /** The live frame — replaced wholesale, never appended. */
  setFrame(text) {
    const wasAtBottom = this.atBottom();
    this.tapeChars += text.length - this.tframe.textContent.length;
    this.tframe.textContent = text;
    this.follow(wasAtBottom);
  }

  /**
   * Ask for the chunk above, WELL BEFORE the top is reached.
   *
   * Firing at 1.5 screens of headroom means a decent connection has the next chunk
   * mounted before you get there and the reach is invisible. A bad one hits the boundary
   * and waits a beat, which is the honest cost of not holding the whole tape on the phone.
   */
  onScroll() {
    const el = this.el;
    // The way back down is a button, not a physics problem: show it while scrolled up.
    this.jump.classList.toggle('show', el.scrollHeight - el.scrollTop - el.clientHeight > 200);
    // Reach for older lines only while moving UP. Near the top every scroll event is in
    // fetch range, so a downward flick used to fire a fetch too — whose prepend then
    // re-anchored scrollTop and killed the flick's momentum a few pixels in. Trying to
    // leave the top of the transcript felt like scrolling through wet sand. (At the
    // literal top no scroll event fires at all — the wheel listener above covers that.)
    const goingUp = el.scrollTop < (this.lastTop ?? 0);
    this.lastTop = el.scrollTop;
    if (!this.active || this.pagingBusy || this.pagedOut || !goingUp) return;
    if (el.scrollTop > el.clientHeight * 1.5) return;
    this.pagingBusy = true;
    this.onMore();
  }

  /**
   * Older lines, prepended — and the scroll position ANCHORED across the insert.
   *
   * Prepending pushes everything down by the height of what was added, so without
   * correcting scrollTop by exactly that amount the page jumps under your thumb every
   * time a chunk lands. That jump is what makes reading back feel broken.
   */
  prepend(recs, atTop) {
    this.pagingBusy = false;
    if (atTop) this.pagedOut = true;
    if (!recs || !recs.length) return;
    const el = this.el;
    const before = el.scrollHeight;
    const keep = el.scrollTop;
    const frag = document.createDocumentFragment();
    // Folds in an older chunk are their own groups — never merged across the
    // chunk boundary; a seam beats a fold whose lines arrived out of order.
    const savedFold = this.lastFold;
    this.lastFold = null;
    const { ops, chars } = groupRecs(recs, false);
    this.tapeChars += chars;
    this.applyOps(frag, ops);
    this.lastFold = savedFold;
    this.ttext.insertBefore(frag, this.ttext.firstChild);
    // Modern engines anchor the scroll position across the insert on their own
    // (CSS scroll anchoring); assigning scrollTop on top of that is at best redundant
    // and at worst cancels a scroll in flight. Correct only when the browser didn't.
    if (el.scrollTop === keep) el.scrollTop = keep + (el.scrollHeight - before);
  }
}
