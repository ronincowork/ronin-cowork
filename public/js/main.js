/* part of the ronin-cowork client — see js/README.md */
import { fetchSessions } from './api.js';
import { request } from './request.js';
import { guard, showFailure } from './errors.js';
import { applyTheme } from './theme.js';
import { restoreSkin } from './skins.js';
import { connectEvents } from './events.js';
import { loadMacros, loadPresets, loadProjects, loadSavedLaunches, refreshHome } from './home.js';
import { build } from './layout.js';
import { S, TILE_COUNT, loadState, tiles } from './state.js';
import { setLayout } from './viewport.js';
import { installTips } from './tips.js';
import { buildCoworkSetup } from './cowork-setup.js';
import { installServicesStatus } from './services-activation.js';

export async function init() {
  // Ask the operator which optional surfaces are plugged in BEFORE the grid is built,
  // so a tile is born knowing. `stream:false` = the 🔓 tape view is off (no record
  // service — the free build); every tile is 🔒 and the switch is inert. An operator
  // that predates the field, or a failed fetch, reads as "on": unchanged behavior,
  // and an unreachable server is reported by the session-list step below.
  {
    const v = await request('/api/version');
    if (v.ok && v.data.stream === false) {
      S.streamOff = true;
      S.locked = true;
    }
    if (v.ok && Array.isArray(v.data.services)) S.services = v.data.services;
    // A failed read means an old operator or an unreachable server — the first reads
    // as "everything on", the second is reported by the session-list step below.
  }
  // The theme before the grid: tiles are born reading the resolved terminal palette.
  guard('apply theme', applyTheme);
  // After the theme, because a skin outranks it for whatever it names (js/skins.js).
  guard('restore skin', restoreSkin);

  // FIRST LOAD. A fresh install lands here; everyone else never sees it.
  //
  // The test is the EXPLICIT birth key, never an inference. The first gate decided from
  // "nobody has said who they are", fired on a box with months of sessions whose owner
  // had simply never typed a name, and replaced the workspace at the workspace's own
  // URL. The lessons are structural now:
  //
  //   1. A PROXY IS NOT A FACT. `setup.pending` is stamped by stampFreshInstall() the
  //      moment ronin.json does not exist, cleared only by the page's own Save, and
  //      nothing can re-arm it over HTTP.
  //   2. ABSENCE MUST MEAN "DO NOT SHOW". A box that predates the key has no setup
  //      section and stays quiet forever — and so does a failed read, because a wrong
  //      answer must cost a missing page, never the product.
  //
  // `/cowork-setup` is the deliberate way back in: one surface, one route, one name.
  {
    const wants = location.pathname === '/cowork-setup';
    const s = wants ? null : await request('/api/settei/setup');
    if (wants || (s?.ok && s.data.pending === true)) {
      if (location.pathname !== '/cowork-setup') history.replaceState(null, '', '/cowork-setup');
      const host = document.createElement('div');
      document.body.replaceChildren(host);
      await buildCoworkSetup(host, (landing) => {
        // THE LANDING CHOOSES WHAT GREETS THEM. Exiting to a bare pathname handed the
        // person whatever localStorage happened to hold — on a fresh box, nothing, and
        // on a box with two tabs, some other tab's tiles. `?tiles=` is the one-shot
        // directive (js/state.js): honoured above both storages, written into this tab's
        // own memory, then stripped from the address so a refresh keeps it and a bookmark
        // never replays it. Empty is a real answer and means one empty tile — the commons,
        // where ＋ New lives.
        const q = new URLSearchParams({ tiles: (landing?.tiles ?? []).join(',') });
        location.href = '/?' + q;
      });
      return;
    }
  }


  guard('build the grid', build);
  guard('services activation status', installServicesStatus);
  const saved = guard('read saved state', loadState, { map: [], layout: TILE_COUNT });
  // A phone OPENS on one terminal, always — not just on first run. A 2x2 grid of tiny
  // terminals is not usable at 402px, and it is what makes the merged header honest:
  // the tile's controls are hoisted into the app bar (js/tiledrop.js), and a bar cannot
  // say WHICH of two tiles it means. It is a starting point, not a cage — the bar's
  // layout button (js/layout.js) cycles 1 / 2 / 4 on touch too, and at this width 2 and
  // 4 stack into a scroll column rather than shrinking. iPad and desktop keep saved/4.
  const phone = window.matchMedia('(max-width: 680px)').matches;
  guard('set layout', () => setLayout(phone ? 1 : saved.layout));
  // The session list is the one step worth reporting loudly: without it every tile
  // is an empty picker, which reads as "broken" rather than "server unreachable".
  {
    const r = await fetchSessions();
    if (!r.ok) showFailure('could not load the session list', new Error(r.message));
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
  // One box for every `title` in the client, styled and placed by us. Wired last and
  // wired ONCE, on the document: nothing that sets a title has to know it exists, so
  // this covers the whole app including the static titles in index.html.
  guard('house tooltips', installTips);
}

// Boot inside a guard too: if init throws before its own guards are reached, the
// header must still be usable and the reason must be on screen.
init().catch((e) => showFailure('startup', e));
