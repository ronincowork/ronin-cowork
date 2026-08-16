/* part of the tmux-ronin client — see js/README.md */
/**
 * THE TILE HEADER — one table, and a loop that builds it.
 *
 * A control used to be defined in up to five places: its markup in an HTML string OR in
 * hand-written JS, its hover text next to whichever of those it was, its click in
 * `tile.js`'s constructor, and its inert rule in a fourth spot. Nothing held the set
 * together, so the set drifted — three controls never went inert because nobody had
 * written them a line, and adding a button meant remembering four unrelated edits.
 *
 * Now a control is ONE ROW of `HEADER`, and everything about it is on that row: where it
 * sits, what it looks like, what it says, what it does, and when it goes quiet. Adding
 * one is adding a row. Nothing can be half-wired, because there is no second place left
 * to forget.
 *
 * WHAT A ROW CAN SAY
 *   key      the name it is returned under, and what `tile.js` calls it
 *   cls      its class — also its handle for `tiledrop.js`, which RELOCATES these exact
 *            nodes into the phone's app bar rather than cloning them
 *   text     the glyph, for a plain button
 *   tag      for the two that are not buttons (the dot, the picker)
 *   widget   for the four that are built by someone else and come back as {el, set}
 *   help     the hover text. A function when it has to be computed at build time.
 *   on       the click. Given (tile, el) — the tile owns what any of it means.
 *   needs    what must be true for it to be live: 'session', or a service name. Absent
 *            means always live, which is a claim about the control, not an oversight.
 *   quiet    what to say while it is not. The reason, never the label repeated.
 *   holds    keep the help box open when this control is clicked. For the two INSTRUMENTS
 *            whose value changes in place (the dial, the gauge): you turn the dial by
 *            clicking the thing you are hovering, so dismissing would destroy the reading
 *            at the moment it changed. Everything else OPENS something, and a help box
 *            left up would sit on top of the menu it just opened.
 *   read     for a control whose help is a READING rather than a fixed sentence — the
 *            groups it is in, whether it has a note, what job it is doing. Returns the
 *            live help and may paint the element; called on every refresh.
 *
 * The order of the rows IS the order on screen, `grow` and all, so reading the table is
 * reading the header left to right.
 */
import { CONTROL_POSITIONS, makeDial, makeGauge, setInert } from './widgets.js';
import { makeChip } from './shingo.js';
import { buildTileMacros } from './tilemacros.js';
import { S, SELECT_MOD, serviceMissing } from './state.js';
import { jobIcon } from './home.js';

export const DIAL_TITLE =
  'Who may touch this session: 👤 owner only · 👁 outside agents watch · 🤖 outside agents type. Yours to turn; agents never flip it.';

/**
 * A FUNCTION, not a const — rule 3 in js/README.md: never reference an imported binding at
 * module top level. It also HAS to be one now: the sentence names a key, and the key is not
 * the same on every machine. This said "On a Mac, Option+drag" and said nothing at all to a
 * Windows or Linux laptop, where the key is Shift (see SELECT_MOD in state.js).
 *
 * It also used to send people to 🔓 as the way to copy. That is still true and still the
 * nicest answer, but it is not the FIRST one: holding the modifier copies in place out of a
 * live TUI, and a reader who does not know the key is exactly who is reading this tooltip.
 */
export const lockedTitle = () =>
  '🔒 LOCKED — this view is attached to the live tmux session. You see the terminal painting in lockstep, so scrolling has to go back to the server and back.  ⚠ TO COPY TEXT: hold ' +
  SELECT_MOD +
  ' while you drag, then ⌘C / Ctrl-C — a plain drag goes to tmux, not to your clipboard. (Switching to 🔓 unlocked also works: there the text selects like any web page.)';

/**
 * THE HEADER, left to right. One row per control; see the file header for the columns.
 *
 * A FUNCTION, not a const — rule 3 in js/README.md: nothing cross-module is touched at
 * module top level, and four of these rows name an imported builder. Called once and
 * cached, so the table is still built exactly once however many tiles ask for it.
 */
let rows = null;
const HEADER = () => (rows ??= [
  { key: 'dot', tag: 'span', cls: 'dot off',
    help: 'Connection: green = attached, grey = disconnected' },

  { key: 'select', tag: 'select', cls: 'sess',
    help: 'Pick / switch the session shown in this tile' },

  // SHINGO 信号 — beside the name, because it answers "where is this session", which
  // belongs with "which session is this" and not among the controls on the right.
  { key: 'chip',
    widget: (t) => makeChip(() => t.toggleLadder()),
    help: 'Where this session is on its ladder, and how long it has been there. Opens the ladder.' },

  // THE MARK — what the session is doing, off its letter. `?` when it has not said.
  { key: 'jobBtn', cls: 'job', needs: 'session',
    help: 'What this session is doing',
    quiet: 'What a session is doing — no session in this tile yet',
    on: (t, el) => t.pickJob(el),
    // `?` when nothing has been said, not blank: an empty button among eight others is
    // invisible, and the owner could not find the control at all. `?` is not a guessed
    // mark — it is the honest reading, drawn so it can be seen and pressed.
    read: (t, el) => {
      const s = S.sessions.find((x) => x.name === t.session);
      const job = (s && s.session_job) || '';
      // The job NAME on the element, so style can reach ONE mark: glyphs differ in how
      // heavily their font draws them (style.css, `[data-job=…]`).
      el.dataset.job = job;
      el.textContent = jobIcon(s) || '?';
      el.classList.toggle('unset', !job);
      return job ? `${job} — click to change what this session is doing`
                 : 'Not marked — click to say what this session is doing';
    } },

  { grow: true },

  // メ is a way IN to the commons, not a close: the session keeps streaming behind the
  // panel and ✕ on the tab strip brings you back. It needs no session — it is the way
  // to GET one — which is why it is the only button on the right with no `needs`.
  { key: 'menuBtn', cls: 'menu', text: 'メ',
    help: '⌃⇧C — the CoWorking Commons: roster, new session, wipeboard, docs, roots, hotwords. Opens over this tile; ✕ comes back.',
    on: (t) => t.showHome('sessions') },

  // ⛩ opens the letter itself — the file as the agent left it — because the chip's
  // readout is an interpretation and sometimes you want the source. Its route is michi's.
  { key: 'torii', cls: 'torii', text: '⛩', needs: 'session michi',
    help: "Read this session's TEGAMI — the letter as the agent left it",
    quiet: { session: 'The session letter — no session in this tile yet',
             michi: 'The session letter — no ladder service is installed' },
    on: (t) => t.toggleLetter() },

  // ⚡ session_macros for THIS session: prefills the input you are typing in and stops.
  // It never runs anything. The reference is the commons' macros tab, deliberately elsewhere.
  { key: 'tmacBtn', needs: 'session',
    // Normalised to the {el, …} shape every other widget returns, rather than teaching
    // the loop a second convention for one control.
    widget: (t) => { const m = buildTileMacros(t); return { el: m.btn, menu: m.menu }; },
    help: "Macros — drop one into this session's input",
    quiet: 'Macros — no session in this tile yet' },

  { key: 'lockEl', cls: 'lock', text: '🔒', help: lockedTitle,
    on: (t) => t.flipLock() },

  { key: 'tagBtn', cls: 'tags', text: '🏷', needs: 'session',
    help: 'Groups this session belongs to',
    quiet: 'Groups — no session in this tile yet',
    on: (t) => t.openTags(),
    read: (t, el) => {
      const tags = S.sessions.find((x) => x.name === t.session)?.tags || [];
      el.classList.toggle('has-tags', !!tags.length);
      return tags.length ? 'Groups: ' + tags.join(', ') : 'Groups (none yet)';
    } },

  // Hidden until there is a reading — a plain shell pane has no context, and that is fine.
  { key: 'gauge', holds: true,
    widget: () => makeGauge('ctx'),
    help: "Context gauge — how full this session's context window is, read off the pane's own status line. Hidden until there is a reading." },

  // On BOTH surfaces — cockpit dials are the motif everywhere (an explicit override of
  // the desktop-freeze rule for this control).
  { key: 'dial', needs: 'session', holds: true,
    widget: (t) => makeDial(CONTROL_POSITIONS, (v) => t.pickControl(v)),
    help: DIAL_TITLE, quiet: 'Control dial — no session in this tile yet' },

  { key: 'noteBtn', cls: 'note', text: '📝', needs: 'session',
    help: 'Session note (post-it)',
    quiet: 'Session note — no session in this tile yet',
    on: (t) => t.openNote(),
    read: (t, el) => {
      const has = !!S.sessions.find((x) => x.name === t.session)?.hasNote;
      el.classList.toggle('has-note', has);
      return has ? 'Session note (has notes)' : 'Session note (empty)';
    } },

  { key: 'killBtn', cls: 'kill', text: '🗑', needs: 'session',
    help: 'Kill session (ends it + its viewers)',
    quiet: 'Kill session — no session in this tile yet',
    on: (t) => t.kill() },
]);

/** Is this row live, and if not, why not? '' when live. */
function quietReason(row, tile) {
  for (const need of (row.needs || '').split(' ').filter(Boolean)) {
    const missing = need === 'session' ? !tile.session : serviceMissing(need);
    if (missing) return (typeof row.quiet === 'object' ? row.quiet[need] : row.quiet) || '';
  }
  return '';
}

/**
 * Bring the whole header up to date — every control's live/quiet state in one pass.
 *
 * Driven by the same table that built it, so a control cannot be built and then left out
 * of the state pass: that is precisely how ⛩ ⚡ 🗑 stayed lit with no session while their
 * four neighbours dimmed. The rows carrying their own reading (the mark, 🏷, 📝, the
 * dial) are refreshed by the tile first — this decides only whether they are reachable.
 */
export function syncTileHead(tile) {
  for (const row of HEADER()) {
    const node = tile[row.key]?.el ?? tile[row.key];
    if (!node) continue;
    if (row.read) tile.headHelp[row.key] = row.read(tile, node);
    if (row.needs) {
      const why = quietReason(row, tile);
      setInert(node, !!why, why, tile.headHelp[row.key]);
    }
  }
}

/**
 * @param {object} tile  the cell this header belongs to — its methods are the callbacks
 * @returns {object} one entry per row key, plus el / body / headHelp
 */
export function buildTileHead(tile) {
  const el = document.createElement('section');
  el.className = 'tile';
  const head = document.createElement('div');
  head.className = 'tile-head';
  const body = document.createElement('div');
  body.className = 'tile-body';
  el.append(head, body);

  const out = { el, body, headHelp: {} };
  for (const row of HEADER()) {
    if (row.grow) {
      head.append(Object.assign(document.createElement('span'), { className: 'grow' }));
      continue;
    }
    // Four controls are built by their own module and come back as {el, set}; the rest
    // are a tag and a glyph. Either way what lands in `out` is what tile.js already
    // expects — the widget object where there is one, the element where there is not.
    const made = row.widget ? row.widget(tile) : null;
    const node = made ? made.el : document.createElement(row.tag || 'button');
    if (!made) {
      node.className = row.cls;
      if (node.tagName === 'BUTTON') node.type = 'button';
      // A non-interactive indicator (the dot) carries an accessible name via its
      // help text, and a bare <span> may not hold one — role=img is the lamp's role.
      if (node.tagName === 'SPAN') node.setAttribute('role', 'img');
      if (row.text) node.textContent = row.text;
    }
    if (row.holds) node.dataset.holdsHelp = '1';
    const help = typeof row.help === 'function' ? row.help() : row.help;
    if (help) node.title = help;
    out.headHelp[row.key] = help;
    // The click is the row's, and the row hands it straight back to the tile. Guarded on
    // the same condition that dims it — an inert control here stays HOVERABLE so it can
    // say why (see setInert), so the refusal has to live in the handler.
    if (row.on) node.addEventListener('click', () => !quietReason(row, tile) && row.on(tile, node));
    head.append(node);
    out[row.key] = made ?? node;
    // ⚡ carries a menu that hangs off the header rather than sitting in the row.
    if (made?.menu) head.append(made.menu);
  }
  return out;
}
