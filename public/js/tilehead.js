/* part of the ronin-cowork client — see js/README.md */
import { makeGauge, setInert } from './widgets.js';
import { clampTip } from './shingo.js';
import { buildTileDocs } from './tiledocs.js';
import { buildTileMentions } from './tilementions.js';
import { serviceMissing } from './state.js';
import { makeOutput } from './output.js';
import { t } from './lexicon.js';

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
    text: t('head.work_record', 'Work Record'), needs: 'session',
    help: t('head.work_record_help', 'Repositories, current action, and work record'),
    quiet: t('head.work_record_quiet', 'Work Record — no Agent in this workspace'),
    on: (tile) => tile.toggleLadder() },

  { grow: true },

  { key: 'transcriptBtn', cls: 'transcript-toggle', text: t('transcript.toggle', 'Transcript'), needs: 'session',
    help: t('transcript.toggle_help', 'Term → Chat → Notes → Work → All → Term: each press shows more of the record'),
    quiet: t('transcript.no_session', 'Transcript — no Agent in this tile'),
    // Opaque when the route says this Agent has nothing to show — any reason, any CLI.
    state: (tile) => (typeof tile.transcriptQuiet === 'function' ? tile.transcriptQuiet() : ''),
    pressWhenQuiet: true,
    read: (tile, el) => {
      el.hidden = !tile.transcriptAvailable();
      el.setAttribute('aria-pressed', String(!!tile.transcriptOn));
      el.textContent = typeof tile.transcriptLabel === 'function' ? tile.transcriptLabel()
        : (tile.transcriptOn ? t('transcript.terminal', 'Term') : t('transcript.toggle', 'Transcript'));
    },
    on: (tile) => tile.toggleTranscript() },

  // rireki choices to the terminal header … I want to be able to switch between locked
  // and the different versions of unlocked to see how this looks"). Ugly for now by his
  // own word — a select with a word in it among glyph buttons — and the trade is that
  // the RIREKI flavours are one click away on every tile while they are being judged.
  { key: 'outputEl', widget: (tile) => makeOutput(tile),
    help: t('head.output_help', 'Output — live terminal or one of RIREKI’s unlocked views') },

  // below was put to him). It opened `/tegami/raw` — the letter verbatim — and it was the
  // only client route to that endpoint. The objection: the shingo chip opens the PARSED
  // ladder, not the file, and shingo.js hides the chip entirely when there is no ladder,
  // so a session with a letter and no ladder up now has no route to its own letter. The
  // owner's call is that the button costs more header width than that case is worth. If
  // the raw view comes back it belongs INSIDE the ladder panel, where the reader already
  // is, not as a second glyph competing with the first.

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

  { key: 'mentionBtn', needs: 'session',
    widget: (tile) => buildTileMentions(tile),
    help: t('head.mention_help', 'Mention another session — choose a name to add it to the message box'),
    quiet: t('head.mention_quiet', 'Mentions — no session in this tile yet') },

  { key: 'docsBtn', needs: 'session',
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

  // Window acts terminate the header at its outside edge: times opens the existing
  // retirement sheet and minus stops viewing. Killing is not reimplemented here.
  { key: 'killBtn', cls: 'window-control kill', text: '×', needs: 'session',
    help: t('head.kill_help', 'Delete or archive this Agent'),
    quiet: t('head.kill_quiet', 'Delete or archive Agent — no Agent in this workspace'),
    on: (tile) => tile.kill() },

  { key: 'minimizeBtn', cls: 'window-control minimize', text: '−', needs: 'session',
    help: t('head.minimize_help', 'Close this view — the Agent keeps running'),
    quiet: t('head.minimize_quiet', 'Close view — no Agent in this workspace'),
    on: (tile) => tile.minimize() },

  ];
  return rows;
};

/** Is this row live, and if not, why not? '' when live. */
function quietReason(row, tile) {
  for (const need of (row.needs || '').split(' ').filter(Boolean)) {
    const missing = need === 'session' ? !tile.session : serviceMissing(need);
    if (missing) return (typeof row.quiet === 'object' ? row.quiet[need] : row.quiet) || '';
  }
  // A row may also go quiet on what it learned about this Agent, with its own reason.
  return typeof row.state === 'function' ? row.state(tile) || '' : '';
}

/**
 * Bring the whole header up to date — every control's live/quiet state in one pass.
 *
 * Driven by the same table that built it, so a control cannot be built and then left out
 * of the state pass: that is precisely how ⛩ ⚡ 🗑 stayed lit with no session while their
 * four neighbours dimmed. Rows carrying their own reading are refreshed by the tile
 * first — this decides only whether they are reachable.
 */
/**
 * Whether a press does anything. A quiet control does not — unless the row says its quiet
 * state is itself worth opening: the transcript button is opaque when there is nothing to
 * show, and pressing it opens the view that says why in full.
 */
export function pressable(row, tile) {
  return !!row.pressWhenQuiet || !quietReason(row, tile);
}

/** One header row by key, for a test that wants the real row and not a copy of it. */
export function headerRow(key) {
  return HEADER().find((row) => row.key === key) ?? null;
}

export function syncTileHead(tile) {
  for (const row of HEADER()) {
    const node = tile[row.key]?.el ?? tile[row.key];
    if (!node) continue;
    if (row.read) tile.headHelp[row.key] = row.read(tile, node);
    if (row.needs) {
      const why = quietReason(row, tile);
      setInert(node, !!why, why, tile.headHelp[row.key]);
      // Quiet to the eye, operable to assistive tech: the press opens the reason in full.
      if (why && row.pressWhenQuiet) node.setAttribute('aria-disabled', 'false');
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
      if (row.text) node.textContent = row.text;
    }
    if (row.holds) node.dataset.holdsHelp = '1';
    const help = typeof row.help === 'function' ? row.help() : row.help;
    if (help) node.title = help;
    out.headHelp[row.key] = help;
    // The click is the row's, and the row hands it straight back to the tile. Guarded on
    // the same condition that dims it — an inert control here stays HOVERABLE so it can
    // say why (see setInert), so the refusal has to live in the handler.
    if (row.on) node.addEventListener('click', () => pressable(row, tile) && row.on(tile, node));
    head.append(node);
    out[row.key] = made ?? node;
    // Controls with a menu hang it off the header rather than inside the button.
    if (made?.menu) head.append(made.menu);
  }
  return out;
}
