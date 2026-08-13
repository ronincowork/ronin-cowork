/* part of the tmux-ronin client — see js/README.md */
import { fetchSessions } from './api.js';
import { guard, showFailure } from './errors.js';
import { connectEvents } from './events.js';
import { loadMacros, loadPresets, loadProjects, loadSavedLaunches, refreshHome } from './home.js';
import { build } from './layout.js';
import { TILE_COUNT, loadState, tiles } from './state.js';
import { setLayout } from './viewport.js';

export async function init() {
  guard('build the grid', build);
  const saved = guard('read saved state', loadState, { map: [], layout: TILE_COUNT });
  // A phone shows ONE terminal, always — not just on first run. A 2x2 grid of tiny
  // terminals was never usable at 402px and the layout buttons are hidden there, so
  // a saved 2 or 4 was a state you could land in and not get out of. It is also what
  // makes the merged header honest: the tile's controls are hoisted into the app bar
  // (js/tiledrop.js), and a bar cannot say WHICH of two tiles it means.
  // iPad and desktop keep the saved/4 default.
  const phone = window.matchMedia('(max-width: 680px)').matches;
  guard('set layout', () => setLayout(phone ? 1 : saved.layout));
  // The session list is the one step worth reporting loudly: without it every tile
  // is an empty picker, which reads as "broken" rather than "server unreachable".
  try {
    await fetchSessions();
  } catch (e) {
    showFailure('could not load the session list', e);
  }
  guard('reattach saved sessions', () => {
    saved.map.forEach((s, i) => {
      if (s && tiles[i]) tiles[i].connect(s);
    });
  });
  guard('session event stream', connectEvents); // births & deaths push over this
  guard('load macros', loadMacros); // macro forms for the home panels
  guard('load projects', loadProjects); // PROJECT_ROOTS.md — WHERE a spawn happens
  guard('load presets', loadPresets); // SESSION_JOBS.md — what a session is for, and who it is
  guard('load saved launches', loadSavedLaunches); // SAVED_LAUNCHES.md — user scope, often empty
  guard('refresh home panels', refreshHome);
  // Mark the first tile active but don't grab the keyboard on load (avoids the
  // iOS on-screen keyboard popping up before you've picked a session).
  guard('activate first tile', () => {
    if (tiles[0]) tiles[0].activate();
  });
}

// Boot inside a guard too: if init throws before its own guards are reached, the
// header must still be usable and the reason must be on screen.
init().catch((e) => showFailure('startup', e));

