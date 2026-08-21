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
import { clampTip, makeChip } from './shingo.js';
import { buildTileMacros } from './tilemacros.js';
import { buildTileMore } from './tilemore.js';
import { buildTileDocs } from './tiledocs.js';
import { isCoarse } from './tiledrop.js';
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
  '🔒 LOCKED — attached live, in lockstep.  ⚠ TO COPY: hold ' +
  SELECT_MOD +
  ' and drag, then ⌘C / Ctrl-C. A plain drag goes to tmux; 🔓 selects like a web page.';

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

  // THE CHECKOUTS — branch first, because it is the fact that changes while work moves.
  // Both open the ladder, where every branch/repo pair is written out. With one checkout
  // the button says the value; with several it says the count rather than picking one and
  // falsely presenting it as THE branch or repository.
  { key: 'branchBtn', cls: 'checkout branch', needs: 'session michi',
    help: 'Branches this session is working on',
    quiet: { session: 'Branches — no session in this tile yet',
      michi: 'Branches — michi is not installed, so TEGAMI checkout data is unavailable' },
    on: (t) => t.toggleLadder(),
    read: (t, el) => {
      const repos = t.tegami?.repos || [];
      const branches = repos.map((x) => x.branch).filter(Boolean);
      const unique = [...new Set(branches)];
      // Show the branch NAMES, not merely how many there are. Two repos on `dev` are one
      // useful reading; two different branches are both useful readings and CSS trims the
      // far edge only if the tile is genuinely out of room.
      el.textContent = unique.length ? '⑂ ' + unique.join(' · ') : '⑂ ?';
      el.classList.toggle('unset', !branches.length);
      return branches.length
        ? clampTip('Branches: ' + repos.map((x) => `${x.branch || '(detached)'} — ${x.repo}`).join(' · ')) + '. Opens the ladder.'
        : 'No branch listed yet. The session keeps its repos list current in TEGAMI.';
    } },

  { key: 'repoBtn', cls: 'checkout repo', needs: 'session michi',
    help: 'Repositories this session is working in',
    quiet: { session: 'Repositories — no session in this tile yet',
      michi: 'Repositories — michi is not installed, so TEGAMI checkout data is unavailable' },
    on: (t) => t.toggleLadder(),
    read: (t, el) => {
      const repos = t.tegami?.repos || [];
      const short = (v) => v.replace(/^.*[/:]([^/]+\/[^/]+?)(\.git)?$/, '$1');
      el.textContent = repos.length === 1 ? short(repos[0].repo) : repos.length ? `▣ ${repos.length}` : '▣ ?';
      el.classList.toggle('unset', !repos.length);
      return repos.length
        ? clampTip('Repositories: ' + repos.map((x) => short(x.repo)).join(' · ')) + '. Opens the ladder.'
        : 'No repository listed yet. The session keeps its repos list current in TEGAMI.';
    } },

  { grow: true },

  // ⛩ IS THE COMMONS, EVERYWHERE (owner's ruling 2026-08-17). It was メ here and き in
  // the bar, for the same act, while ⛩ meant "the letter" on this very header — one
  // glyph for two things and two glyphs for one. Now the torii means exactly one thing
  // wherever it appears: the way in to the Commons. The bar's button changed in the same
  // pass; the tegami torii that used to sit beside this one is gone (see below).
  //
  // A way in AND a way back out since 2026-08-17: pressing ⛩ again puts the Commons away
  // (`toggleHome`, tile.js). It only opened for a day, and a button that goes dead on the
  // second press is one you stop trusting. The session keeps streaming behind the panel
  // either way, and ✕ on the tab strip still works. It needs no session — it is the way to
  // GET one — which is why it is the only button on the right with no `needs`, and also
  // why an EMPTY tile keeps the one-way behaviour: there is nothing behind the panel to
  // give back.
  { key: 'menuBtn', cls: 'menu', text: '⛩',
    help: '⌃⇧C — the CoWorking Commons: roster, new session, wipeboard, docs, roots, hotwords. Opens over this tile; ✕ comes back.',
    on: (t) => t.toggleHome('sessions') },

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
    widget: (t) => { const m = buildTileMacros(t); return { el: m.btn, menu: m.menu }; },
    help: "Macros — drop one into this session's input",
    quiet: 'Macros — no session in this tile yet' },

  // メ — AND EVERY ROW BELOW IT IS INSIDE ITS DROP (owner's ruling 2026-08-17). Eight
  // controls ended this row and a session picker has to fit a name; at four tiles up
  // there was not room for both. Three stay on top — ⛩ ⚡ メ — and the six that were
  // left drop out of メ in one horizontal strip, unchanged. See tilemore.js for the
  // glyph's history (it was the Commons button here until ⛩ took that everywhere) and
  // for why this follows ⚡'s dismissal grammar rather than the retired `ui.popover`.
  //
  // NO `needs`. It is a container, not an act: it holds 🔒, which works with no session
  // at all, and dimming it would hide the six explanations of why its contents are dim.
  { key: 'moreBtn', hosts: true,
    widget: () => buildTileMore(),
    help: "This session's other controls — 🔒 lock, 🏷 groups, ⛽ context, 🎛 control, 📄 docs, 📝 note, 🗑 kill" },

  { key: 'lockEl', cls: 'lock', text: '🔒', drop: true, help: lockedTitle,
    on: (t) => t.flipLock() },

  { key: 'tagBtn', cls: 'tags', text: '🏷', drop: true, modal: true, needs: 'session',
    help: 'Groups this session belongs to',
    quiet: 'Groups — no session in this tile yet',
    on: (t) => t.openTags(),
    read: (t, el) => {
      const tags = S.sessions.find((x) => x.name === t.session)?.tags || [];
      el.classList.toggle('has-tags', !!tags.length);
      return tags.length ? 'Groups: ' + tags.join(', ') : 'Groups (none yet)';
    } },

  // Hidden until there is a reading — a plain shell pane has no context, and that is fine.
  //
  // A LIVE READING BEHIND A CLICK, which is normally the wrong trade — a gauge you have
  // to open is a gauge you stop watching. The owner was asked about exactly this and
  // ruled it anyway: "the context viewer is also visible at the bottom of all of the
  // Claude sessions anyway, so we're showing it twice." The pane already prints the
  // number; this was the second copy, and the second copy is what pays for the header.
  { key: 'gauge', drop: true, holds: true,
    widget: () => makeGauge('ctx'),
    help: "Context gauge — how full this session's context window is, read off the pane's own status line. Hidden until there is a reading." },

  // On BOTH surfaces — cockpit dials are the motif everywhere (an explicit override of
  // the desktop-freeze rule for this control).
  { key: 'dial', drop: true, needs: 'session', holds: true,
    widget: (t) => makeDial(CONTROL_POSITIONS, (v) => t.pickControl(v)),
    help: DIAL_TITLE, quiet: 'Control dial — no session in this tile yet' },

  // 📄 — THIS session's listed docs, one press from the tile that already knows them
  // (owner, 2026-08-18). Beside 📝 because they are the two things a session keeps in
  // writing: the post-it it wrote for you, and the documents it is working in.
  //
  // `session michi` — the list is TEGAMI data and TEGAMI is michi's, exactly as the
  // SHINGO chip is. No michi, no doc list, and the honest answer is a dimmed button
  // saying which of the two is missing rather than an empty drop.
  //
  // The list itself is already ON the tile (`tile.tegami.docs`, from `refreshTegami`),
  // so this fetches nothing — see js/tiledocs.js, which also records why narrowing the
  // ▧ Docs list to one session is not the file browser the owner ruled out.
  { key: 'docsBtn', drop: true, needs: 'session michi',
    widget: (t) => buildTileDocs(t),
    help: "This session's docs — open one over this tile",
    quiet: {
      session: "This session's docs — no session in this tile yet",
      michi: "This session's docs — michi is not installed, so no session keeps a doc list",
    },
    // Lit when there is something behind it, the same reading 🏷 and 📝 carry: a control
    // you must open to find out it is empty is one you stop opening.
    read: (t, el) => {
      // `t.session &&` because `detach` syncs the header BEFORE it clears the letter, so
      // reading `tegami` alone leaves a detached tile lit for the docs of the session that
      // just left it. The session is the truth about whether there is anything to count.
      const n = ((t.session && t.tegami?.docs) || []).length;
      el.classList.toggle('has-docs', !!n);
      return n
        ? `Docs — ${n} listed by this session. Opens one over this tile; ✕ comes back.`
        : 'Docs — this session has listed none yet. An agent lists one with write_tegami --doc';
    } },

  { key: 'noteBtn', cls: 'note', text: '📝', drop: true, modal: true, needs: 'session',
    help: 'Session note (post-it)',
    quiet: 'Session note — no session in this tile yet',
    on: (t) => t.openNote(),
    read: (t, el) => {
      const has = !!S.sessions.find((x) => x.name === t.session)?.hasNote;
      el.classList.toggle('has-note', has);
      return has ? 'Session note (has notes)' : 'Session note (empty)';
    } },

  { key: 'killBtn', cls: 'kill', text: '🗑', drop: true, needs: 'session',
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
  // THE メ DROP IS DESKTOP-ONLY, and that is not a taste call — it is what keeps touch
  // from ending up with a drop inside a drop. `collapseTileHead` hoists this header into
  // the phone's app bar behind its OWN メ, snapshotting `[...head.children]` to put back
  // later; a control nested one level down in a desktop drop is not in that snapshot, so
  // the restore would leave it inside a sheet that is then removed, taking the control
  // with it. Gated on `isCoarse()`, the same test `collapseTileHead` gates on, so the two
  // are exactly complementary: coarse pointer gets the phone's row and this never builds;
  // fine pointer gets this and the phone's collapse never runs.
  const dropped = !isCoarse();
  let host = null; // the `hosts` row's widget, once it has been built
  for (const row of HEADER()) {
    if (row.grow) {
      head.append(Object.assign(document.createElement('span'), { className: 'grow' }));
      continue;
    }
    // Touch builds no メ AND no drop: `host` stays null, so every `drop` row falls back
    // into the row it always sat in and `collapseTileHead` finds the header it expects.
    // A メ built here and left empty would also be a second メ in a bar that already has
    // one, meaning two different things two inches apart.
    if (row.hosts && !dropped) continue;
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
    if (row.hosts) host = made; // only reached when `dropped` — see the skip above
  }
  return out;
}
