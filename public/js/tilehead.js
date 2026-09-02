/* part of the ronin-cowork client — see js/README.md */
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
 *   tag      for an element that is not a button (the session name)
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
 *   hosts    this control DROPS the rows that follow it (メ, and only メ). Its widget
 *            returns a `menu` and a `close`; see `drop` and `tilemore.js`.
 *   drop     build me into the nearest preceding `hosts` control's menu instead of into
 *            the row. Everything else about the row is unchanged — the point is that the
 *            control is the SAME element wherever it is appended.
 *   modal    this control raises a MODAL sheet (`ui.sheet`), so メ's drop stays UP behind
 *            it. A `drop` row otherwise shuts the strip when clicked, so the panel it
 *            raised is not covered — but a modal sheet holds the whole viewport behind a
 *            scrim at a z-index far above the strip and CANNOT be covered by it. Closing
 *            bought nothing there and cost the opener: a control inside a `display:none`
 *            drop cannot take focus back when the sheet closes, so the keyboard fell to
 *            `<body>` and the next Tab restarted the page (measured 2026-08-18; ui.js
 *            `restore` now catches the general case, and this stops causing it). 📄 is the
 *            counter-example, and the reason this is a column rather than a rule: the docs
 *            pane is an in-tile surface the strip really would sit on top of, so 📄 still
 *            closes the drop.
 *
 * The order of the rows IS the order on screen, `grow` and all, so reading the table is
 * reading the header left to right — and then, past メ, left to right inside its drop.
 */
import { CONTROL_POSITIONS, makeDial, makeGauge, setInert } from './widgets.js';
import { clampTip } from './shingo.js';
import { buildTileMacros } from './tilemacros.js';
import { buildTileMore } from './tilemore.js';
import { buildTileDocs } from './tiledocs.js';
import { buildTileMentions } from './tilementions.js';
import { isCoarse } from './tiledrop.js';
import { S, serviceMissing } from './state.js';
import { makeOutput } from './output.js';
import { t } from './lexicon.js';

/** The dial's help. A function: the lexicon loads after this module is evaluated. */
export function dialTitle() {
  return t('head.dial_help', 'Who may touch this session: 👤 owner only · 👁 outside agents watch · 🤖 outside agents type. Yours to turn; agents never flip it.');
}

/**
 * THE HEADER, left to right. One row per control; see the file header for the columns.
 *
 * A FUNCTION, not a const — rule 3 in js/README.md: nothing cross-module is touched at
 * module top level, and four of these rows name an imported builder. Called once and
 * cached, so the table is still built exactly once however many tiles ask for it.
 */
let rows = null;
const HEADER = () => {
  if (rows) return rows;
  rows = [
  // The Torii stays as a house mark, but the dead embedded Commons does not. It is the
  // first control, immediately before the session name, and renames that session.
  { key: 'renameBtn', cls: 'torii rename', text: '⛩', needs: 'session',
    help: t('head.rename_help', 'Edit this Agent title'),
    quiet: t('head.rename_quiet', 'Rename session — no session in this tile yet'),
    on: (tile) => void tile.rename() },

  // A workspace owns which Agent it holds. The tile only names that session; switching
  // happens by placing or dragging a roster card into the workspace, never in its head.
  { key: 'sessionName', tag: 'span', cls: 'sess' },

  { key: 'workRecordBtn', cls: 'work-record',
    text: t('head.view_work_record', 'View Work Record'), needs: 'session',
    help: t('head.work_record_help', 'View repositories, current action, and the work record'),
    quiet: t('head.work_record_quiet', 'View Work Record — no Agent in this workspace'),
    on: (tile) => tile.toggleLadder() },

  { grow: true },

  // THE OUTPUT SELECTOR IS ON THE ROW, not in メ's drop (owner, 2026-08-26: "add the
  // rireki choices to the terminal header … I want to be able to switch between locked
  // and the different versions of unlocked to see how this looks"). Ugly for now by his
  // own word — a select with a word in it among glyph buttons — and the trade is that
  // the RIREKI flavours are one click away on every tile while they are being judged.
  { key: 'outputEl', widget: (tile) => makeOutput(tile),
    help: t('head.output_help', 'Output — live terminal or one of RIREKI’s unlocked views') },

  { key: 'mentionBtn', needs: 'session',
    widget: (tile) => buildTileMentions(tile),
    help: t('head.mention_help', 'Mention another session — choose a name to add it to the message box'),
    quiet: t('head.mention_quiet', 'Mentions — no session in this tile yet') },

  // THE TEGAMI TORII IS GONE (owner's ruling 2026-08-17, reaffirmed after the objection
  // below was put to him). It opened `/tegami/raw` — the letter verbatim — and it was the
  // only client route to that endpoint. The objection: the shingo chip opens the PARSED
  // ladder, not the file, and shingo.js hides the chip entirely when there is no ladder,
  // so a session with a letter and no ladder up now has no route to its own letter. The
  // owner's call is that the button costs more header width than that case is worth. If
  // the raw view comes back it belongs INSIDE the ladder panel, where the reader already
  // is, not as a second glyph competing with the first.

  // ⚡ session_macros for THIS session: prefills the input you are typing in and stops.
  // It never runs anything. The reference is the commons' macros tab, deliberately elsewhere.
  { key: 'tmacBtn', needs: 'session',
    // Normalised to the {el, …} shape every other widget returns, rather than teaching
    // the loop a second convention for one control.
    widget: (tile) => { const m = buildTileMacros(tile); return { el: m.btn, menu: m.menu }; },
    help: t('macros.button_title', "Macros — drop one into this session's input"),
    quiet: t('head.macros_quiet', 'Macros — no session in this tile yet') },

  // メ — AND EVERY ROW BELOW IT IS INSIDE ITS DROP (owner's ruling 2026-08-17). Eight
  // controls ended this row and the session name has to remain readable; at four tiles up
  // there was not room for both. Three stay on top — ⛩ ⚡ メ — and the six that were
  // left drop out of メ in one horizontal strip, unchanged. See tilemore.js for the
  // glyph's history (it was the Commons button here until ⛩ took that everywhere) and
  // for why this follows ⚡'s dismissal grammar rather than the retired `ui.popover`.
  //
  // NO `needs`. It is a container, not an act: it holds 🔒, which works with no session
  // at all, and dimming it would hide the six explanations of why its contents are dim.
  { key: 'moreBtn', hosts: true,
    // No hover help: the fixed help box covered the drop this button exists to reveal.
    // メ explains itself by opening; every control inside carries its own words.
    widget: () => buildTileMore() },

  // Hidden until there is a reading — a plain shell pane has no context, and that is fine.
  //
  // A LIVE READING BEHIND A CLICK, which is normally the wrong trade — a gauge you have
  // to open is a gauge you stop watching. The owner was asked about exactly this and
  // ruled it anyway: "the context viewer is also visible at the bottom of all of the
  // Claude sessions anyway, so we're showing it twice." The pane already prints the
  // number; this was the second copy, and the second copy is what pays for the header.
  { key: 'gauge', drop: true, holds: true,
    widget: () => makeGauge('ctx'),
    help: t('head.gauge_help', "Context gauge — how full this session's context window is, read off the pane's own status line. Hidden until there is a reading.") },

  // On BOTH surfaces — cockpit dials are the motif everywhere (an explicit override of
  // the desktop-freeze rule for this control).
  { key: 'dial', drop: true, needs: 'session', holds: true,
    widget: (tile) => makeDial(CONTROL_POSITIONS(), (v) => tile.pickControl(v)),
    help: dialTitle(), quiet: t('head.dial_quiet', 'Control dial — no session in this tile yet') },

  { key: 'docsBtn', drop: true, needs: 'session',
    widget: (tile) => buildTileDocs(tile),
    help: t('head.docs_help', "This Agent's tracked docs — open one over this tile"),
    quiet: t('head.docs_quiet', "This Agent's docs — no Agent in this workspace"),
    read: (tile, el) => {
      const n = ((tile.session && tile.tegami?.docs) || []).length;
      el.classList.toggle('has-docs', !!n);
      return n
        ? t('head.docs_read', 'Docs — {n} tracked by this Agent. Open one over this tile.', { n })
        : t('head.docs_none', 'Docs — this Agent is tracking none yet.');
    } },

  { key: 'noteBtn', cls: 'note', text: '📝', drop: true, modal: true, needs: 'session',
    help: t('head.note_help', 'Session note (post-it)'),
    quiet: t('head.note_quiet', 'Session note — no session in this tile yet'),
    on: (tile) => tile.openNote(),
    read: (tile, el) => {
      const has = !!S.sessions.find((x) => x.name === tile.session)?.hasNote;
      el.classList.toggle('has-note', has);
      return has ? t('head.note_has', 'Session note (has notes)') : t('head.note_empty', 'Session note (empty)');
    } },

  { key: 'killBtn', cls: 'kill', text: '🗑', drop: true, needs: 'session',
    help: t('head.kill_help', 'Kill session (ends it + its viewers)'),
    quiet: t('head.kill_quiet', 'Kill session — no session in this tile yet'),
    on: (tile) => tile.kill() },

  ];
  return rows;
};

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
  // メ BUILDS ON BOTH SURFACES now. It was desktop-only while the phone hoisted this
  // header into the app bar behind its own メ — a control nested in a desktop drop
  // would have been lost by that hoist's snapshot. The hoist is gone: a phone never
  // builds this header at all (js/phone.js), and an iPad head with every drop row
  // exposed inline was exactly the clutter the owner asked bundled (2026-09-01) —
  // gauge, dial, note and kill sat loose on the row.
  const coarse = isCoarse();
  let host = null; // the `hosts` row's widget, once it has been built
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
    // A `drop` row goes INTO メ's strip; everything else goes in the row. Same element,
    // same handlers, same title — only the parent differs, which is the whole trick.
    const nest = row.drop && host;
    (nest ? host.menu : head).append(node);
    // A control in the strip that OPENS something shuts the strip behind it, so the
    // panel it just raised is not covered by the drop it came out of. The INSTRUMENTS
    // (⛽ and 🎛 — the `holds` rows, whose value changes in place under your finger) leave
    // it up, exactly as `tiledrop.js` gives the dial its 'stay' mode on the phone. So do
    // the `modal` rows (🏷 and 📝), and for a reason that is the same sentence read the
    // other way: their sheet is over a full-viewport scrim, so there is nothing for the
    // strip to cover, and shutting it took the OPENER out of the document's flow —
    // `ui.sheet` then had nowhere to hand the keyboard back to (2026-08-18; see the
    // `modal` column in the header comment for the whole incident).
    // Skipped while the control is inert: you clicked a dimmed 🗑 to find out why, and
    // closing the drop under you is the opposite of an answer.
    if (nest && !row.holds && !row.modal) {
      node.addEventListener('click', () => !quietReason(row, tile) && host.close());
    }
    out[row.key] = made ?? node;
    // ⚡ and メ carry a menu that hangs off the header rather than sitting in the row.
    if (made?.menu) head.append(made.menu);
    if (row.hosts) host = made;
  }
  // COARSE ONLY: the Output select joins メ's strip too (owner's header cleanup,
  // 2026-09-01). Its row sits BEFORE メ's in the table — the desktop keeps it on the
  // row per the 2026-08-26 ruling — so the move happens here, after メ exists. The
  // same element, relocated: every handler and the syncOutput wiring come along, and
  // no close-on-click is added because a select is an instrument you adjust in place.
  if (coarse && host && out.outputEl) host.menu.prepend(out.outputEl.el ?? out.outputEl);
  return out;
}
