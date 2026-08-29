/* part of the ronin-cowork client — see js/README.md */
import { fetchSessions } from './api.js';
import { mountRamRpm } from './ramrpm.js';
import { request } from './request.js';
import { guard, showFailure } from './errors.js';
import { applyTheme } from './theme.js';
import { restoreSkin } from './skins.js';
import { activeProfile, loadDeskProfile } from './desk-profile.js';
import { connectEvents } from './events.js';
import { loadMacros, loadPresets, loadProjects, loadSavedLaunches, refreshHome } from './home.js';
import { build } from './layout.js';
import { S, tiles } from './state.js';
import { installTips } from './tips.js';
import { buildCoworkSetup } from './cowork-setup.js';
import { installServicesStatus } from './services-activation.js';
import { createWorkspace } from './workspace.js';
import { createCoworkView } from './cowork-view.js';
import { createCampaignHome } from './campaign-home.js';
import { createCampaignView } from './campaign-view.js';
import { WorkspaceKit } from './workspace-kit.js';
import { installCustomize } from './customize.js';
import { t } from './lexicon.js';
import { applyPageWords } from './pagewords.js';

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
      S.output = 'locked';
    }
    if (v.ok && Array.isArray(v.data.services)) S.services = v.data.services;
    // A failed read means an old operator or an unreachable server — the first reads
    // as "everything on", the second is reported by the session-list step below.
  }
  // RAM_RPM before the grid, so the header carries a real reading from the first paint
  // rather than appearing a minute in. Guarded like every other mount: a box that
  // cannot answer /api/machine must still get its coworkspace.
  guard('mount RAM_RPM', mountRamRpm);

  // The theme before the grid: tiles are born reading the resolved terminal palette.
  guard('apply theme', applyTheme);
  // THE DESK PROFILE before the grid (R38): its lexicon is what every t() reads, and its
  // RIREKI view is the Output a new tile is born with — so it has to be known before a
  // tile is built. One request; a box that cannot answer gets stock, not a failure.
  try { await loadDeskProfile(); } catch (e) { console.warn('desk profile', e); }
  guard('page words', applyPageWords); // index.html's static words, through the lexicon
  // After the theme, because a skin outranks it for whatever it names (js/skins.js).
  // The profile's skin is the default; a skin this device picked since still wins.
  guard('restore skin', () => restoreSkin(activeProfile()?.skin || ''));

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


  const viewhost = document.getElementById('viewhost');
  if (!viewhost) throw new Error('workspace ViewHost is missing');
  const workspace = createWorkspace(viewhost, {
    onError: (where, error) => showFailure(`workspace ${where}`, error),
    // The bar's slots for the tab name and the layout map; the ViewHost fills them per active view.
    nameSlot: document.getElementById('viewname'),
    mapSlot: document.getElementById('viewmap'),
  });
  workspace.kit = WorkspaceKit;
  S.workspace = workspace;
  // The Team destination. Registered beside the compatibility Sessions grid, not over it:
  // this preview is geometry and readings only — no terminal host, no sockets, no Sessions
  // mode — so the existing coworkspace stays the working surface until those gates land.
  guard('register the Team destination', () => workspace.register('team', createCoworkView({ kind: 'team' })));
  // Customize is a first-class destination on the frozen Kit. Registration failure is
  // contained here rather than taking the compatibility Sessions grid down with it —
  // a preview destination must never cost the owner their terminals.
  guard('register the Customize destination', () => installCustomize(workspace));
  // Cowork collection and Team detail are two contexts on the same cowork-space bedrock.
  guard('register the Cowork destination', () => workspace.register('cowork', createCoworkView({ kind: 'cowork' })));
  // THE ROOT ARRIVAL (owner, 2026-08-29): three doors — Campaign, Coworks, Agents —
  // over one Campaign selection the other two inherit. Registered after Cowork because
  // its Campaign door opens that destination, and guarded like every other: the landing
  // page failing must cost the owner a page, never their terminals. `safeView` is this
  // one, so its own failure is reported rather than looping.
  guard('register the Campaign Home destination', () => workspace.register('home', createCampaignHome()));
  // CAMPAIGN MANAGE — a Cowork Space whose surfaces are Campaign-level (owner, 2026-08-29):
  // the same workbench, selector column, persistence, recall and drag/drop as the Cowork
  // space, offering a Campaign's own configuration instead of its Coworks and Agents.
  guard('register the Campaign destination', () => workspace.register('campaign', createCampaignView()));
  workspace.start();

  guard('install workspace controls', build);
  guard('services activation status', installServicesStatus);
  // The session list is the one step worth reporting loudly: without it every tile
  // is an empty picker, which reads as "broken" rather than "server unreachable".
  {
    const r = await fetchSessions();
    if (!r.ok) showFailure(t('errors.no_session_list', 'could not load the session list'), new Error(r.message));
  }
  guard('session event stream', connectEvents); // births & deaths push over this
  guard('load macros', loadMacros); // macro forms for the home panels
  guard('load projects', loadProjects); // PROJECT_ROOTS.md — WHERE a spawn happens
  guard('load presets', loadPresets); // role_families/ + session_roles/ — who a session is, and what it is doing
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
