/* part of the ronin-cowork client — see js/README.md */
import { makeGauge, setInert } from './widgets.js';
import { insertMention } from './tilementions.js';
import { pickFile } from './tilefiles.js';
import { S, serviceMissing } from './state.js';
import { OUTPUTS } from './output.js';
import { createMenuButton } from './menu.js';
import { buildWorkRecord, heldAttachments } from './work-record.js';
import { readDesks } from './desks.js';
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

  { grow: true },

  { key: 'transcriptBtn', cls: 'transcript-toggle', text: t('transcript.toggle', 'Transcript'), needs: 'session',
    help: t('transcript.toggle_help', 'Each press shows more of the record; past the last one it returns to the terminal'),
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

  // THE MENU (owner, 2026-10-07: "an overlay of sorts itself … include most buttons from
  // the current tile header", and "also to be included in your menu view is the work
  // record"). Everything about this Agent that is not the reading toggle or the window
  // lives in it: see tileMenu below. One control, the same on a desk, a tablet and a phone.
  { key: 'menuBtn', needs: 'session',
    widget: (tile) => createMenuButton({
      title: t('me.agent_title', 'This Agent — work record, docs, file, mention, output, delete'),
      host: () => tile.el, groups: () => tileMenu(tile) }),
    help: t('me.agent_title', 'This Agent — work record, docs, file, mention, output, delete'),
    quiet: t('head.menu_quiet', 'Menu — no Agent in this workspace') },

  // The window control terminates the header at its outside edge: minus stops viewing.
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
    // The gauge and the menu are built by their own modules and come back as {el}; the rest
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
  }
  return out;
}

/**
 * THE TILE'S MENU, top to bottom: what you do to this Agent, its work record, its
 * configuration and docs, and Delete or archive held at the foot. Read at each press, so it
 * is never stale.
 */
export function tileMenu(tile) {
  const outputs = OUTPUTS().filter(([value]) => !S.streamOff || value === 'locked');
  return [
    { items: [
      { glyph: '📎', label: t('me.attach', 'Send a file'), hint: t('me.attach_hint', 'or drag one onto the tile'),
        run: () => pickFile(tile) },
      { glyph: '@', label: t('me.mention', 'Mention a session'), kind: 'list',
        list: () => S.sessions.filter((row) => row.name !== tile.session)
          .map((row) => ({ label: row.name, run: () => insertMention(tile, row.name) })) },
    ] },
    // Without Services there is nothing to choose: every unlocked view is RIREKI's.
    tile.servicesOff() || outputs.length < 2 ? null : {
      items: outputs.map(([value, label]) => ({ kind: 'radio', label, checked: tile.output === value,
        run: () => tile.setOutput(value) })) },
    { items: [
      { glyph: '☰', label: t('me.work_record', 'Work record'), run: () => void openWorkRecord(tile) },
      { glyph: '⚙', label: t('me.configuration', 'Configuration'), hint: t('me.configuration_hint', 'mandate, Behaviors'),
        run: () => void openConfiguration(tile) },
      // The held items' attachments, the same ones the work record lists: one opens over the tile.
      { glyph: '📄', label: t('me.docs', 'Docs'), kind: 'list', hint: String(heldAttachments(tile.tegami).length || ''),
        empty: t('me.docs_none', 'No attachments on the items this Agent holds.'),
        list: () => heldAttachments(tile.tegami).map((path) => {
          const parts = path.split('/');
          return { label: parts.pop(), hint: parts.slice(-2).join('/'), run: () => tile.openDoc(path) };
        }) },
    ] },
    { foot: true, items: [
      { glyph: '×', label: t('me.kill', 'Delete or archive…'), run: () => tile.kill() },
    ] },
  ];
}

/**
 * A READ OVER THE TILE: the full overlay (work-details.js fullOverlay) over the tile's body,
 * with a head of its title and Close; the terminal stays as it was beneath it (owner,
 * 2026-10-07: "a full overlay and not mess with the content underneath"). `fill(layer)`
 * draws the rest. Loaded on first open: the overlay's module draws the kit.
 */
async function overTile(tile, title, fill, options = {}) {
  const { fullOverlay } = await import('./work-details.js');
  tile.body.querySelector(':scope > .work-overlay')?.remove();
  const layer = fullOverlay(tile.body, (box, through) => {
    const head = document.createElement('div');
    head.className = 'tile-record-head';
    const tools = document.createElement('div');
    tools.className = 'wk-surface-header-actions';
    // The overlay's one action row: the reader's own acts first (Update), then Close.
    tools.append(...(options.actions ?? []).map((item) => item?.el ?? item), ...through.map((item) => item?.el ?? item));
    head.append(Object.assign(document.createElement('h2'), { textContent: title }), tools);
    box.append(head);
  }, options);
  fill(layer);
  return layer;
}

/** The work record: this session's desks read once, as it opens; an attachment pressed
 *  opens over the tile in the record's place. */
async function openWorkRecord(tile) {
  const desks = tile.tegami ? await readDesks(tile.session) : null;
  const layer = await overTile(tile, t('me.work_record', 'Work record'), (box) => box.append(tile.tegami
    ? buildWorkRecord(tile.tegami, desks, { openDoc: (path) => { layer.remove(); tile.openDoc(path); } })
    : Object.assign(document.createElement('p'), { className: 'menu-empty',
      textContent: t('me.no_record', 'This Agent has not written a work record yet.') })));
}

/** The Agent's configuration: the composition reader the Team profile already shows —
 *  mandate, Behaviors, and the birth record — over the tile. */
async function openConfiguration(tile) {
  const { createAgentCompositionReader } = await import('./agent-composition.js');
  const reader = createAgentCompositionReader(tile.session);
  await overTile(tile, t('me.configuration', 'Configuration'), (box) => box.append(reader.el),
    { closed: reader.destroy, actions: [reader.action] });
  void reader.show();
}
