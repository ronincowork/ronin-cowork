/* part of the tmux-ronin client — see js/README.md */
/**
 * THE ADMIN DESK — what a tile shows when you ask it for the machine, not a session.
 *
 * WHY IT EXISTS. The Commons strip held ten rooms and two kinds of thing: four about
 * SESSIONS (⌂ Roster · ＋ New · ▤ Wipeboard · ▧ Docs) and six about THE INSTALL. Ten tabs
 * measured 871px against a 609px tile, so a third of the strip was always off-screen —
 * and on 2026-08-18 the ⚙ Configuration rename (67px → 107px) pushed even a 1920 display
 * 10px over, which meant the strip scrolled at every width there is.
 *
 * Length was the symptom. The defect was that the six were drawn in EVERY sessionless
 * tile, four copies of facts that have one value, each polling on its own — and the house
 * had already ruled on exactly this line once, for the gear: *release, update, appearance
 * and log out are the install's, not a tile's, and a room for them meant four copies, one
 * per tile.* The six were on the wrong side of that line. This is the surface on the right
 * side of it.
 *
 * IT IS A TILE, NOT A PAGE-LEVEL SHEET (owner, 2026-08-18: *"page level surface? cant it
 * just be a tile?"*). The four copies were never about a surface being *able* to live in a
 * tile; they were about six rooms being drawn in every empty one whether or not anyone
 * wanted them. A desk is drawn where you press ⚙. And a tile is a full PANE — which is the
 * very reason ⚙ Configuration was made a room instead of staying in the gear's sheet, so
 * putting it back in a sheet would have re-lost the thing that move was for.
 *
 * SO THERE IS ALMOST NOTHING NEW HERE, and that is the point. This file is the same shape
 * as js/commons.js — a frame that owns which room shows and hands each room its mount
 * point — and every room it mounts is unchanged. All six were already written as
 * `build*(mountElement, isShowing)` and not one of them reaches for `.home`, `dataset.pane`
 * or the strip; the word "commons" appears in those files only in comments. So the desk
 * hands the same builders a different element and a different predicate, and the six
 * modules did not change a line.
 *
 * NO TILE HEADER (owner: *"it should be a clean tile top to bottom"*). Every control up
 * there acts on a session — the picker chooses one, ⚡ sends macros to one, ⌗ and メ act on
 * one — and a row of controls that do nothing is worse than no row. The desk draws over
 * the whole tile body, and owns exactly one control of its own: ✕.
 *
 * ✕ IS UNDO. It returns the tile to whatever it was showing before ⚙ — the terminal when
 * the tile has a session, the commons when it does not. That is the tile's own memory
 * (js/tile.js `deskBase`), not a guess made here.
 */
import { PANES } from './panes.js';
import { S, serviceOff } from './state.js';
import { buildProjectRoots } from './projectroots.js';
import { buildHotwords } from './hotwords.js';
import { buildKoshi } from './koshi.js';
import { buildGbrain } from './gbrain.js';
import { buildSettei } from './settei.js';
import { buildStats } from './stats.js';
import { buildSystemPanel } from './system.js';
import { t } from './lexicon.js';

/** The app's own rows, under the six. Not registry rows — they are not rooms. */
// A function, not a table: the lexicon loads after this module is evaluated.
function appRows() {
  return [
    // く KEYPAD — the Work Louder pad panel, a row here since 2026-08-27 (owner: off the
    // bar, onto the desk). It is an ACTION, not a pane: the panel is its own sheet
    // (js/pad.js) and opening it from here is exactly what the bar's button did.
    { id: 'keypad', label: t('desk.row_keypad', 'Keypad'), glyph: 'く', action: () => S.padPanel?.open() },
    { id: 'appearance', label: t('desk.row_appearance', 'Appearance'), glyph: '◐' },
    { id: 'release', label: t('desk.row_release', 'Release & update'), glyph: '↑' },
    { id: 'account', label: t('desk.log_out', 'Log out'), glyph: '⏻' },
  ];
}

export function buildDesk(tile) {
  const el = document.createElement('div');
  el.className = 'desk';
  el.dataset.room = 'settei'; // where the desk lands, and the row the nav starts on

  // ---- the rail ----------------------------------------------------------------
  // A nav, not a tab strip. The strip is what the six just left, and putting six back on
  // one would rebuild the row this whole change exists to shorten.
  const nav = document.createElement('div');
  nav.className = 'desk-nav';
  const railTop = document.createElement('div');
  railTop.className = 'desk-railtop';
  /* ✕ AND « ARE THE DESK'S CHROME, so they live in the rail and not over the content.
   * ✕ floated at the top-right of the content pane for one run on 2026-08-18 and sat on
   * top of whatever the room drew there — `↻ Restart Koshi`, `＋ include`, gbrain's
   * status button — swallowing their clicks, because a transparent overlay still takes
   * the pointer. The rail is chrome and the content is content; the only reliable way to
   * keep a floating control off a room's controls is not to float it over them.
   * Top of the rail, which is also as far from "Log out" as the rail goes. */
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'desk-x';
  const closeMark = document.createElement('span');
  closeMark.className = 'close-hex';
  closeMark.textContent = '×';
  closeBtn.appendChild(closeMark);
  closeBtn.title = t('desk.close_title', 'Back to what this tile was showing');
  closeBtn.addEventListener('click', () => tile.hideDesk());
  railTop.appendChild(closeBtn);
  const railBtn = document.createElement('button');
  railBtn.type = 'button';
  railBtn.className = 'desk-railbtn';
  railBtn.textContent = '«';
  railBtn.title = t('desk.rail_collapse', 'Collapse the rail');
  railTop.appendChild(railBtn);
  nav.appendChild(railTop);

  // NAMED BY DEFAULT (owner: "glyphs & labels"), and collapsible by hand. The container
  // query in style.css decides how a name LAYS OUT — beside its glyph in a wide tile,
  // stacked under it in a 4-up — and this button decides whether names show at all. Two
  // layouts of one idea; never a second nav.
  railBtn.addEventListener('click', () => {
    const railed = nav.classList.toggle('railed');
    railBtn.textContent = railed ? '»' : '«';
    railBtn.title = railed ? t('desk.rail_expand', 'Expand the rail') : t('desk.rail_collapse', 'Collapse the rail');
  });

  const rowEls = {};
  const addGroup = (title, rows) => {
    const sep = document.createElement('div');
    sep.className = 'desk-sep';
    sep.textContent = title;
    nav.appendChild(sep);
    for (const r of rows) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'desk-row';
      b.dataset.room = r.id;
      const g = document.createElement('b');
      g.textContent = r.glyph;
      const name = document.createElement('span');
      name.textContent = r.label;
      b.append(g, name);
      // A row whose service is absent is visible but opaque-and-inert — the same
      // treatment the strip gives an absent room, so the desk does not invent a second
      // way of saying "not plugged in". The name rides as the accessible name rather
      // than a `title`, because a title is a pop-up and this surface has none.
      if (serviceOff(r.id)) {
        b.classList.add('off');
        b.disabled = true;
        b.setAttribute('aria-label', t('commons.tab_off', '{tab} — off, this service is not installed.', { tab: r.label }));
      } else b.addEventListener('click', () => (r.action ? r.action() : show(r.id)));
      rowEls[r.id] = b;
      nav.appendChild(b);
    }
  };

  const deskPanes = PANES().filter((p) => p.surface === 'desk');
  addGroup(t('desk.group_install', 'This install'), deskPanes);
  const APP_ROWS = appRows();
  addGroup(t('desk.group_app', 'This app'), APP_ROWS);

  // ---- the content -------------------------------------------------------------
  const content = document.createElement('div');
  content.className = 'desk-content';

  const paneEl = {};
  for (const id of [...deskPanes.map((p) => p.id), ...APP_ROWS.filter((r) => !r.action).map((r) => r.id)]) {
    const d = document.createElement('div');
    // `desk-<id>` is the room's own layout rule — the `.home-<id>` rule renamed and
    // otherwise untouched when the six moved. The app's three have no such rule and
    // take the shared padding instead (style.css).
    d.className = `desk-pane desk-${id}`;
    d.dataset.room = id;
    paneEl[id] = d;
    content.appendChild(d);
  }
  el.append(nav, content);

  // ---- the rooms ---------------------------------------------------------------
  // Each is handed its mount point and a predicate answering "am I on screen", which is
  // the whole contract every one of them already had. `deskVisible()` replaces
  // `homeVisible()` and nothing else moved.
  const showing = (id) => () => tile.deskVisible() && el.dataset.room === id;
  const rooms = {
    settei: buildSettei(paneEl.settei, showing('settei')),
    proj: buildProjectRoots(paneEl.proj, showing('proj'), tile),
    hotwords: buildHotwords(paneEl.hotwords, showing('hotwords')),
    koshi: buildKoshi(paneEl.koshi, showing('koshi')),
    gbrain: buildGbrain(paneEl.gbrain, showing('gbrain'), (prompt) => tile.askPersonalAssistant(prompt)),
    stats: buildStats(paneEl.stats),
  };

  // The app's three share one closure (js/system.js), so they are built once and their
  // three elements hang in three panes. `enter` refreshes all of them — it is the old
  // sheet's `open()` with the sheet taken off the front.
  const app = buildSystemPanel();
  paneEl.appearance.appendChild(app.appearance);
  paneEl.release.appendChild(app.release);
  paneEl.account.appendChild(app.account);

  const show = (which) => {
    if (serviceOff(which)) return; // an inert row's pane, asked for by any other route
    el.dataset.room = which;
    for (const [id, b] of Object.entries(rowEls)) b.classList.toggle('on', id === which);
    rooms[which]?.enter?.();
    if (APP_ROWS.some((r) => r.id === which && !r.action)) app.enter();
  };
  show('settei');

  return {
    el,
    show,
    /** Re-entering the desk re-enters the room that is showing — nothing polls while hidden. */
    enter: () => show(el.dataset.room),
  };
}
