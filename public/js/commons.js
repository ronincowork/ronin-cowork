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
 * The strip reads the pane registry (js/panes.js) — the same list the き Commons menu
 * reads — so a room cannot exist on one surface and be missing from another. A tab
 * owned by a service that is not registered is visible but opaque-and-inert, the same
 * treatment as the lock button on a build with no record service.
 */
import { refreshHome } from './home.js';
import { serviceOff } from './state.js';
import { tabs as makeTabs } from './ui.js';
import { PANES } from './panes.js';
import { buildRoster } from './roster.js';
import { buildLauncher } from './launcher.js';
import { buildHotwords } from './hotwords.js';
import { buildKoshi } from './koshi.js';
import { buildProjectRoots } from './projectroots.js';
import { buildStats } from './stats.js';
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
  // compact label where a row carries one; the hint rides as hover help either way.
  for (const p of PANES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.pane = p.id;
    b.textContent = p.compact || p.label;
    b.title = p.hint;
    // A tab owned by an absent service is visible but opaque-and-inert.
    if (serviceOff(p.id)) {
      b.classList.add('off');
      b.disabled = true;
      b.title = 'Off — this service is not installed.';
    } else b.addEventListener('click', () => showPane(p.id));
    tabRow.appendChild(b);
  }
  const homeTab = tabs.querySelector('button[data-pane="sessions"]');
  homeTab.classList.add('on'); // matches the panel's default pane (see el.dataset.pane)
  const closeTab = document.createElement('button');
  closeTab.className = 'home-x';
  closeTab.textContent = '✕';
  closeTab.title = 'Back to the terminal';
  tabs.appendChild(closeTab);

  // One element per room, one showing at a time (CSS matches [data-pane]).
  const nullPane = document.createElement('div');
  nullPane.className = 'home-null';
  const mainPane = document.createElement('div');
  mainPane.className = 'home-main';
  const wipePane = document.createElement('div');
  wipePane.className = 'home-wipe';
  const docsPane = document.createElement('div');
  docsPane.className = 'home-docs';
  const projPane = document.createElement('div');
  projPane.className = 'home-proj';
  const hotwordsPane = document.createElement('div');
  hotwordsPane.className = 'home-hotwords';
  const statsPane = document.createElement('div');
  statsPane.className = 'home-stats';
  const koshiPane = document.createElement('div');
  koshiPane.className = 'home-koshi';
  el.append(tabs, nullPane, mainPane, wipePane, docsPane, projPane, hotwordsPane, statsPane, koshiPane);
  // Real tab semantics over the strip that already exists (ui.tabs): tablist/tab roles,
  // aria-selected, roving tabindex, arrow keys. Activation stays a click — entering a
  // room starts its fetches, and focus must not do that on its own.
  const paneEl = {
    sessions: mainPane, new: nullPane, wipe: wipePane, docs: docsPane, proj: projPane,
    hotwords: hotwordsPane, stats: statsPane, koshi: koshiPane,
  };
  const tabBtns = [...tabs.querySelectorAll('button[data-pane]')];
  const strip = makeTabs(tabRow, tabBtns, (b) => paneEl[b.dataset.pane]);
  strip.select(homeTab); // matches the default pane
  const showPane = (which) => {
    if (serviceOff(which)) return; // an inert tab's pane, asked for by any other route
    el.dataset.pane = which;
    tabs.querySelectorAll('button[data-pane]').forEach((b) => b.classList.toggle('on', b.dataset.pane === which));
    strip.select(tabs.querySelector(`button[data-pane="${which}"]`));
    if (which === 'sessions') render();
    if (which === 'wipe') wipe.enter();
    if (which === 'docs') docs.enter();
    if (which === 'proj') proj.enter();
    if (which === 'hotwords') words.enter();
    if (which === 'koshi') koshi.enter();
    if (which === 'stats') stats.enter();
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
  const proj = buildProjectRoots(projPane, () => tile.homeVisible() && el.dataset.pane === 'proj', tile);
  // 'hotwords', not 'words' — the pane key was renamed with the feature and this
  // predicate was missed once, so it answered false forever and the pane never counted
  // itself as showing.
  const words = buildHotwords(hotwordsPane, () => tile.homeVisible() && el.dataset.pane === 'hotwords');
  const koshi = buildKoshi(koshiPane, () => tile.homeVisible() && el.dataset.pane === 'koshi');
  const stats = buildStats(statsPane);

  // Re-render the LIVE parts (roster, launcher board); open forms keep their state.
  const render = () => {
    if (!el.classList.contains('show')) return;
    launcher.render();
    roster.render();
  };

  return { el, render, showPane };
}

/* ---------- KOSHI_DASHI — the receipt for a spawn ----------
 * A launch goes straight through with no confirm screen, which is only honest if
 * the result is visible and undoable at the same speed it fired. So the receipt
 * names what the session was actually born with — role, project, session_launch_spec, dial —
 * and carries a kill next to it. See home.js showReceipt and js/launcher.js.
 */
