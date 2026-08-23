/* part of the tmux-ronin client — see js/README.md */
/**
 * THE COMMONS SHELL — buildHome() is the control plane's frame, and only the frame.
 *
 * It used to be three things in one 781-line file: the shell, the ⌂ Roster and the
 * ＋ New session workflow. The two rooms moved out (js/roster.js, js/launcher.js) the
 * way Wipeboard, Docs and the rest were extracted before them, so what is left is the
 * one job nothing else can own: the tab strip, the pane elements, which pane shows,
 * and handing each room its mount point.
 *
 * IT SHRANK AGAIN ON 2026-08-18, and this time the rooms did not move into their own
 * files — they moved to their own SURFACE. Six of the ten were about the install rather
 * than about sessions, and the strip that held all ten measured 871px against a 609px
 * tile. They are the admin_desk's now (js/desk.js); the registry says which surface owns
 * a row (`surface`), and this file reads only its own. What is left is four tabs and the
 * frame around them.
 *
 * The strip reads the pane registry (js/panes.js), filtered to `surface: 'commons'`. It
 * was one of two readers — the bar's き Commons menu was the other, and the registry exists
 * because those two lists drifted; since 2026-08-17 the menu is gone (⛩ Commons is one
 * press to ⌂ Roster) and the strip is THE way to a session room. The desk is the second
 * reader now, and the filter is why that cannot drift the way the menu did: one list, two
 * readers, and a row states which one it belongs to. A tab owned by a service that is not registered is visible but
 * opaque-and-inert, the same treatment as the lock button on a build with no record service.
 */
import { refreshHome } from './home.js';
import { serviceOff } from './state.js';
import { tabs as makeTabs } from './ui.js';
import { PANES } from './panes.js';
import { buildRoster } from './roster.js';
import { buildLauncher } from './launcher.js';
import { buildWipeboard } from './wipeboard.js';
import { buildDocs } from './docs.js';

export function buildHome(tile) {
  const el = document.createElement('div');
  el.className = 'home';
  // Which admin pane is showing. The pane is named rather than toggled (CSS matches
  // on [data-pane]). Default = the session list, as always.
  el.dataset.pane = 'sessions';
  // The admin panes live behind a tab strip, so you can get back to any of them at
  // any time — including while a session is connected. Before this, spawning a
  // session replaced the home panel and there was no way back to it.
  const tabs = document.createElement('div');
  tabs.className = 'home-tabs';
  // The tablist proper — display:contents, so the strip's flex layout is untouched.
  // It exists because ✕ lives in the strip but is NOT a tab, and a tablist may hold
  // only tabs (axe: aria-required-children).
  const tabRow = document.createElement('div');
  tabRow.className = 'home-tabrow';
  tabs.appendChild(tabRow);
  // One tab per registry row, in registry order. The 402px phone strip takes the
  // compact label where a row carries one.
  //
  // NO HOVER HELP ON A TAB, and nothing relocated — owner's ruling, 2026-08-18: "we
  // don't need a pop-up. There doesn't need to be anything on hover. Just get rid of
  // it." A tab already says what its room is, in the one place the eye is: its own
  // label. A 300px panel restating that in a sentence was cost with no reader, and it
  // was landing over the strip it described. `title` is the thing tips.js takes over,
  // so the way to have no box is to set none — and the registry's `hint` column went
  // with this line, which was its only reader (js/panes.js).
  for (const p of PANES.filter((p) => p.surface === 'commons')) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.pane = p.id;
    b.textContent = p.compact || p.label;
    // A tab owned by an absent service is visible but opaque-and-inert.
    if (serviceOff(p.id)) {
      b.classList.add('off');
      b.disabled = true;
      // The reason rides as the ACCESSIBLE NAME rather than a `title`, because a title
      // is a pop-up waiting to happen and this strip is now to have none. Nothing is
      // lost either way: a disabled button fires no pointer events, so this one never
      // opened a box — it was a label only a screen reader could ever reach, and that
      // is what it now is. The visible text leads the name so the name still contains
      // it (WCAG 2.5.3, label in name).
      b.setAttribute('aria-label', `${b.textContent} — off, this service is not installed.`);
    } else b.addEventListener('click', () => showPane(p.id));
    tabRow.appendChild(b);
  }
  const homeTab = tabs.querySelector('button[data-pane="sessions"]');
  homeTab.classList.add('on'); // matches the panel's default pane (see el.dataset.pane)
  const closeTab = document.createElement('button');
  closeTab.className = 'home-x';
  const closeMark = document.createElement('span');
  closeMark.className = 'close-hex';
  closeMark.textContent = '×';
  closeTab.appendChild(closeMark);
  closeTab.title = 'Back to the terminal';
  tabs.appendChild(closeTab);

  /* WHICH ENDS OF THE STRIP HAVE MORE ON THEM. Ten rooms plus the ✕ is 831px against
   * a 599px desktop tile, so a third of the strip is off-screen at any moment and
   * something has to say so. That used to be the scrollbar, which drew across the
   * bottom of the tabs on overflow ("it looks awful", owner, 2026-08-18) and is now off
   * at every width; the strip fades at whichever end still has tabs behind it instead,
   * and this is the half that knows when. CSS owns the look, `data-edge` is the fact. */
  const markEdges = () => {
    const more = tabs.scrollWidth - tabs.clientWidth;
    // 2px of slack at both ends, because neither number is an integer: the labels are
    // glyphs, so scrollWidth lands on a fraction and a strip scrolled fully right sits
    // a hair short of `more`. A fade stuck on at a dead end is exactly the smudge the
    // gate in the stylesheet exists to prevent.
    const left = tabs.scrollLeft > 2;
    const right = more > 2 && tabs.scrollLeft < more - 2;
    tabs.dataset.edge = left && right ? 'both' : left ? 'left' : right ? 'right' : 'none';
  };
  tabs.addEventListener('scroll', markEdges, { passive: true });
  // The overflow is a function of the TILE, not the window — a room is narrow because it
  // is on a phone or because it is one cell of a 4-up grid — so the strip is measured
  // when the strip resizes. This also covers the first measurement: the observer fires
  // once on observe, by which time the panel has a width.
  new ResizeObserver(markEdges).observe(tabs);

  /* Put a tab back on the strip when it becomes the one showing. A pane can be entered
   * from somewhere other than its own tab — ⚙ Configuration from first-run, ▧ Docs from the
   * tile's 📄 route, ＋ New from gbrain handing off a prompt — and with a third of the
   * strip off-screen the tab that just went `on` was regularly not visible at all, so
   * the strip disagreed with the pane. Horizontal only, and computed rather than
   * `scrollIntoView({inline:'nearest'})`: that is free to scroll the panel's own
   * vertical scroller too, and the tab is never the thing that is off-screen vertically.
   */
  const revealTab = (b) => {
    const s = tabs.getBoundingClientRect();
    if (!b || !s.width) return; // built but not shown yet — nothing has a rect
    const r = b.getBoundingClientRect();
    const pad = 12;
    // The ✕ sits over the right end, so the room to aim for stops short of it.
    const right = s.right - closeTab.getBoundingClientRect().width - pad;
    if (r.left < s.left + pad) tabs.scrollLeft -= s.left + pad - r.left;
    else if (r.right > right) tabs.scrollLeft += r.right - right;
  };

  // One element per room, one showing at a time (CSS matches [data-pane]).
  const nullPane = document.createElement('div');
  nullPane.className = 'home-null';
  const mainPane = document.createElement('div');
  mainPane.className = 'home-main';
  const wipePane = document.createElement('div');
  wipePane.className = 'home-wipe';
  const docsPane = document.createElement('div');
  docsPane.className = 'home-docs';
  el.append(tabs, nullPane, mainPane, wipePane, docsPane);
  // Real tab semantics over the strip that already exists (ui.tabs): tablist/tab roles,
  // aria-selected, roving tabindex, arrow keys. Activation stays a click — entering a
  // room starts its fetches, and focus must not do that on its own.
  const paneEl = { sessions: mainPane, new: nullPane, wipe: wipePane, docs: docsPane };
  const tabBtns = [...tabs.querySelectorAll('button[data-pane]')];
  const strip = makeTabs(tabRow, tabBtns, (b) => paneEl[b.dataset.pane]);
  strip.select(homeTab); // matches the default pane
  const showPane = (which) => {
    if (serviceOff(which)) return; // an inert tab's pane, asked for by any other route
    el.dataset.pane = which;
    tabs.querySelectorAll('button[data-pane]').forEach((b) => b.classList.toggle('on', b.dataset.pane === which));
    const tab = tabs.querySelector(`button[data-pane="${which}"]`);
    strip.select(tab);
    revealTab(tab);
    if (which === 'sessions') render();
    if (which === 'wipe') wipe.enter();
    if (which === 'docs') docs.enter();
  };
  // ✕ only makes sense once a session is showing behind the panel.
  closeTab.addEventListener('click', () => tile.hideHome());

  // The ⌂ Roster room: the session list under one column. The section wrapper and
  // heading stay the shell's (they are the pane's composition); the list is the room's.
  const colL = document.createElement('div');
  colL.className = 'home-col';
  mainPane.append(colL);
  const secList = document.createElement('div');
  secList.className = 'home-sec';
  const h = document.createElement('div');
  h.className = 'home-h';
  h.textContent = 'sessions';
  secList.appendChild(h);
  colL.appendChild(secList);
  const roster = buildRoster(tile, secList);

  // The ＋ New session room — the koshidashi board, in the null pane.
  const launcher = buildLauncher(tile, nullPane);

  // The rooms already extracted before the shell was. Each is built with a predicate
  // answering "is this the pane on screen", so its polling costs nothing while hidden.
  const wipe = buildWipeboard(tile, wipePane, () => tile.homeVisible() && el.dataset.pane === 'wipe');
  const docs = buildDocs(tile, docsPane, () => tile.homeVisible() && el.dataset.pane === 'docs');

  // Re-render the LIVE parts (roster, launcher board); open forms keep their state.
  const render = () => {
    if (!el.classList.contains('show')) return;
    launcher.render();
    roster.render();
  };

  // `openDoc` — ▧ Docs, opened straight onto one file. The tile's 📄 route (2026-08-18,
  // js/tiledocs.js): the room, then the file, in the order the shell has to do them.
  return {
    el,
    render,
    showPane,
    openDoc: (p) => { showPane('docs'); docs.open(p); },
    /* THE GBRAIN HAND-OFF, which now arrives from another surface. gbrain moved to the
     * admin_desk (js/desk.js) and its "ask this of a PersonalAssistant" button still has
     * to land in ＋ New — which is the commons', and stays the commons'. So the desk asks
     * the tile, the tile asks here, and the launcher never learns it has two callers.
     *
     * IT NAMES THE session_role TOKEN. `PersonalAssistant` was a kind on the combined
     * catalog, spent a day as a `job_role`, and is a TASK again in the `assistant` family
     * (KOTOBA R34) — every former session_job is a session_role. The launcher resolves the
     * name against the live definitions rather than by hunting the board, and launches it
     * on the family that holds it. Awaited because that resolution asks the server what
     * the pick resolves to. */
    askPersonalAssistant: (prompt) => { showPane('new'); void launcher.open('PersonalAssistant', prompt); },
  };
}

/* ---------- KOSHI_DASHI — the receipt for a spawn ----------
 * A launch goes straight through with no confirm screen, which is only honest if
 * the result is visible and undoable at the same speed it fired. So the receipt
 * names what the session was actually born with — role, project, session_launch_spec, dial —
 * and carries a kill next to it. See home.js showReceipt and js/launcher.js.
 */
