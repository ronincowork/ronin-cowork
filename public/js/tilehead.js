/* part of the tmux-ronin client — see js/README.md */
/**
 * THE TILE HEADER — the cell's chrome, built in one place.
 *
 * The picker, the connection dot, the control dial, the context gauge, the SHINGO
 * chip and torii, the ⚡ macros and the row of buttons. Construction only: every
 * callback lands back on the tile, which owns what any of it means.
 *
 * Split out because a thin cell should read as composition — mount a header, mount a
 * view, wire a socket — and sixty lines of element building in the middle of that is
 * the thing that made the old constructor hard to read. Order still matters: the body
 * element must exist before anything mounts into it, which is why this returns the
 * pieces rather than mounting views itself.
 */
import { CONTROL_POSITIONS, makeDial, makeGauge, setInert } from './widgets.js';
import { makeChip } from './shingo.js';
import { buildTileMacros } from './tilemacros.js';

export const DIAL_TITLE =
  'Who may touch this session: 👤 owner only · 👁 outside agents watch · 🤖 outside agents type. Yours to turn; agents never flip it.';

export const LOCKED_TITLE =
  '🔒 LOCKED — this view is attached to the live tmux session. You see the terminal painting in lockstep, so scrolling has to go back to the server and back.  ⚠ TO COPY TEXT, SWITCH TO UNLOCKED — this is a drawn screen, not selectable text. (On a Mac, Option+drag then ⌘C also works here.)';

/**
 * @param {object} tile  the cell this header belongs to — its methods are the callbacks
 * @returns {{el, select, jobBtn, body, dot, dial, gauge, torii, chip, lockEl, noteBtn, tagBtn}}
 */
export function buildTileHead(tile) {
  const el = document.createElement('section');
  el.className = 'tile';
  el.innerHTML = `
      <div class="tile-head">
        <span class="dot off" title="Connection: green = attached, grey = disconnected"></span>
        <select class="sess" title="Pick / switch the session shown in this tile"></select>
        <button class="job" title="What this session is doing"></button>
        <span class="grow"></span>
        <button class="menu" title="⌃⇧C — the CoWorking Commons: roster, new session, wipeboard, docs, roots, hotwords. Opens over this tile; ✕ comes back.">メ</button>
        <button class="lock" title="${LOCKED_TITLE}">🔒</button>
        <button class="tags" title="Groups this session belongs to">🏷</button>
        <button class="note" title="Session note (post-it)">📝</button>
        <button class="kill" title="Kill session (ends it + its viewers)">🗑</button>
      </div>
      <div class="tile-body"></div>`;

  // Control dial (@ronin-control): 👤 owner only / 👁 outside agents watch /
  // 🤖 outside agents type. On BOTH surfaces — Glen wants cockpit dials as the motif
  // everywhere (explicit override of the desktop-freeze rule for this control).
  const dial = makeDial(CONTROL_POSITIONS, (v) => tile.pickControl(v));
  // EVERY control in this header says what it is on hover — including while it is
  // greyed out, which is when you are most likely to be asking. That is why the inert
  // ones dim with a class rather than with `disabled`: a disabled element fires no
  // hover events, so its `title` never appears. See `setInert` in js/widgets.js.
  dial.el.title = DIAL_TITLE;
  setInert(dial.el, true, 'Control dial — no session in this tile yet');
  el.querySelector('.note').before(dial.el);

  // Context gauge ⛽: how full the session's context window is (scraped from the
  // pane's own status line server-side). Hidden until a reading exists.
  const gauge = makeGauge('ctx');
  gauge.el.title = "Context gauge — how full this session's context window is, read off the pane's own status line. Hidden until there is a reading.";
  dial.el.before(gauge.el);

  // The torii button: on EVERY session, ladder or not. Opens the letter itself — the
  // file as the agent left it — because the readout is an interpretation and sometimes
  // you want the source.
  const torii = document.createElement('button');
  torii.className = 'torii';
  torii.textContent = '⛩';
  torii.title = "Read this session's TEGAMI — the letter as the agent left it";
  torii.addEventListener('click', () => tile.toggleLetter());
  el.querySelector('.lock').before(torii);

  // ⚡ session_macros for THIS session: the fast path. Prefills the input you are
  // typing in and stops — it never runs anything. Sits with the controls, beside
  // the torii. The reference (browse everything, read the instructions) is the commons'
  // macros tab, deliberately elsewhere.
  const tmac = buildTileMacros(tile);
  el.querySelector('.lock').before(tmac.btn);
  el.querySelector('.tile-head').appendChild(tmac.menu);

  // SHINGO 信号: the ladder chip. LEFT of the row, beside the session name — it belongs
  // with "which session is this", not among the controls on the right. Before .grow, so
  // the spacer still pushes every button to the far edge.
  const select = el.querySelector('.sess');
  const chip = makeChip(() => tile.toggleLadder());
  select.after(chip.el);

  // THE MARK: what this session is doing, beside the name it belongs to and before the
  // ladder chip — "who is this" then "where are they", never among the controls on the
  // right. `?` when the session has not said (js/tile.js): it was drawn blank first, and
  // an empty button among six others is invisible.
  const jobBtn = el.querySelector('.job');
  jobBtn.addEventListener('click', () => tile.pickJob(jobBtn));

  return {
    el,
    select,
    jobBtn,
    body: el.querySelector('.tile-body'),
    dot: el.querySelector('.dot'),
    dial,
    gauge,
    torii,
    chip,
    lockEl: el.querySelector('.lock'),
    // Held as references, not re-queried later. On touch these two are RELOCATED out
    // of `tile.el` into the app bar (js/tiledrop.js), and an `el.querySelector` run
    // after that returns null — which, guarded with `if (!btn) return`, is a button
    // that silently stops reflecting whether the session has a note.
    noteBtn: el.querySelector('.note'),
    tagBtn: el.querySelector('.tags'),
  };
}
