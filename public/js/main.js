/* part of the ronin-cowork client — see js/README.md */
import { trackAppHeight } from './appheight.js';
import { mountRamRpm } from './ramrpm.js';
import { request } from './request.js';
import { guard, showFailure } from './errors.js';
import { applyTheme } from './theme.js';
import { restoreSkin } from './skins.js';
import { activeProfile, loadDeskProfile } from './desk-profile.js';
import { sayWhenUnreachable } from './events.js';
import { connect } from './store.js';
import { loadProjects } from './home.js';
import { build } from './layout.js';
import { S, tiles } from './state.js';
import { installTips } from './tips.js';
import { createWorkspace } from './workspace.js';
import { createCoworkView } from './cowork-view.js';
import { createAgentView } from './agent-view.js';
import { createCampaignHome } from './campaign-home.js';
import { createEpicsView, createHelpView, createWorkspacesView } from './door-workbenches.js';
import { createWorkspaceRoute } from './workspaces-surface.js';
import { createSettingsV2View } from './settings-v2-view.js';
import { createSetupView } from './setup-view.js';
import { loadFolderWorkbenches, shownWorkbenches } from './folder-workbenches.js';
import { createLaunchView } from './launch-view.js';
import { installWorkspaceHeader } from './workspace-header.js';
import { WorkspaceKit } from './workspace-kit.js';
import { installCustomize } from './customize.js';
import { t } from './lexicon.js';
import { applyPageWords } from './pagewords.js';
import { installFeedbackButton } from './feedback.js';
import { createThemeToggle } from './theme-toggle.js';

async function init() {
  const reveal = () => document.documentElement.classList.remove('boot-pending');
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
  const ramRpm = guard('mount RAM_RPM', mountRamRpm, { setVisible() {} });

  // HOW TALL THE APPLICATION IS, before anything lays itself out inside it: every surface
  // below is measured against this, so it has to be right for the first paint, not the
  // second (js/appheight.js).
  guard('app height', trackAppHeight);
  // The theme before the grid: tiles are born reading the resolved terminal palette.
  guard('apply theme', applyTheme);
  // THE DESK PROFILE before the grid (R38): its lexicon is what every t() reads, and its
  // RIREKI view is the Output a new tile is born with — so it has to be known before a
  // tile is built. One request; a box that cannot answer gets stock, not a failure.
  void loadDeskProfile().then(() => applyPageWords()).catch((e) => console.warn('desk profile', e));
  guard('page words', applyPageWords); // index.html's static words, through the lexicon
  // Resolve the root palette before mounting the chosen surface. A profile skin is not
  // a second paint: it is the one root token set this boot uses. The boot veil stays up
  // the static desktop bar (including its "2" shape control) before the phone decision.
  void restoreSkin(activeProfile()?.skin || '').catch((e) => console.warn('restore skin', e));

  // THE DESKTOP DOCUMENT. A phone never loads this page: the server sends mobile.html to a
  // phone-class User-Agent (src/index.ts), and /m is that document's own address. Nothing
  // below decides "phone"; an iPad (coarse but wide) and a desktop get this workbench.

  const viewhost = document.getElementById('viewhost');
  if (!viewhost) throw new Error('workspace ViewHost is missing');
  let refreshWorkspaceHeader = () => {};
  const workspace = createWorkspace(viewhost, {
    onError: (where, error) => showFailure(`workspace ${where}`, error),
    // The bar's slots for the tab name and the layout map; the ViewHost fills them per active view.
    // The dynamic island owns the workbench label editor. The former right-header
    // field is gone; this changes a tab/workbench label only, never a Team or Agent.
    nameSlot: document.getElementById('viewplace'),
    mapSlot: document.getElementById('viewmap'),
    leadingSlot: document.getElementById('viewleading'),
    actionsSlot: document.getElementById('viewactions'),
    ramRpm,
    onNavigate: () => refreshWorkspaceHeader(),
  });
  workspace.kit = WorkspaceKit;
  S.workspace = workspace;
  installFeedbackButton(workspace);
  // Light/dark, one button on every page (owner, 25 Nov; KAN-866). Phone keeps its own.
  document.getElementById('themeaction')?.replaceChildren(createThemeToggle());
  refreshWorkspaceHeader = installWorkspaceHeader(workspace);
  S.refreshWorkspaceHeader = refreshWorkspaceHeader;
  // The Team destination. Registered beside the compatibility Sessions grid, not over it:
  // this preview is geometry and readings only — no terminal host, no sockets, no Sessions
  // mode — so the existing coworkspace stays the working surface until those gates land.
  guard('register the Team destination', () => workspace.register('team', createCoworkView({ kind: 'team' })));
  // Customize is a first-class destination on the frozen Kit. Registration failure is
  // contained here rather than taking the compatibility Sessions grid down with it —
  // a preview destination must never cost the owner their terminals.
  guard('register the Customize destination', () => installCustomize(workspace));
  // Cowork collection and Team detail are two scopes of the same discovery workbench.
  guard('register the Cowork destination', () => workspace.register('cowork', createCoworkView({ kind: 'cowork' })));
  // A standalone Agent is a first-class Workbench tenant. Launch handoff opens this
  // destination; Setup does not own a private redirect or seating path.
  guard('register the Agent destination', () => workspace.register('agent', createAgentView()));
  // over one Campaign selection the other two inherit. Registered after Cowork because
  // its Campaign door opens that Campaign's Cowork collection, and guarded like every other: the landing
  // page failing must cost the owner a page, never their terminals. `safeView` is this
  // one, so its own failure is reported rather than looping.
  guard('register the Ronin Home destination', () => workspace.register('home', createCampaignHome()));
  // Home's Models and Workspaces doors, each a workbench of its own in the same tab (owner, 2026-10-19).
  guard('register the Workspaces destination', () => workspace.register('workspaces', createWorkspacesView()));
  guard('register the Epics destination', () => workspace.register('epics', createEpicsView()));
  // One Epic on its own page (w899): Layer 2, under the Epics appearance; not a tilespace workbench.
  // One Workspace on its own page (KAN-784): Layer 2, under the Workspaces appearance.
  guard('register the Workspace destination', () => workspace.register('workspace', { ...createWorkspaceRoute(), appearance: 'workspaces', header: { ram: true } }));
  guard('register the Help destination', () => workspace.register('help', createHelpView()));
  // the same workbench, selector column, persistence, recall and drag/drop as the Cowork
  // space, offering a Campaign's own configuration instead of its Coworks and Agents.
  // Settings: the one (owner, 26 Nov); the route keeps its code name settings2.
  guard('register the Settings destination', () => workspace.register('settings2', createSettingsV2View()));
  // Setup opens at #/setup on every office; only hosted Home has its stone (KAN-856, w997).
  guard('register the Setup destination', () => workspace.register('setup', createSetupView()));
  guard('register the Launch destination', () => workspace.register('launch', createLaunchView()));
  // Workbenches from the office's custom/workbenches/ folder (KAN-954), each at #/<name>; known
  // before the first route is read, so a link to one opens it.
  await loadFolderWorkbenches(workspace).catch((e) => console.warn('folder workbenches', e));
  // A bare address goes Home; a member shown a list of workbenches (KAN-955) lands on its first,
  // from any address not on the list.
  const shown = shownWorkbenches();
  const asked = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (shown && !shown.includes(asked)) history.replaceState(null, '', `${location.pathname}${location.search}#/${encodeURIComponent(shown[0])}`);
  workspace.start(shown ? shown[0] : '');

  // THE DESKTOP FIRST PAINT ends here: the route's real workspace is mounted and the
  // header now belongs to it. Session discovery, event wiring and home catalogs below
  // enrich that workspace; none decides which surface the person is looking at. Keeping
  // the veil over those reads exposed only the bare canvas (--surface) on
  // every reload, sometimes for seconds on a busy box. The desktop must not make
  // network readiness a paint boundary.
  reveal();

  guard('install workspace controls', build);
  guard('say when Ronin is unreachable', () => sayWhenUnreachable(document.getElementById('connectionstate')));
  guard('session event stream', connect); // the store's socket: rows, sessions, births & deaths
  guard('load projects', loadProjects); // every Workspace's folders, by name
  // Mark the first tile active but don't grab the keyboard on load (avoids the
  // iOS on-screen keyboard popping up before you've picked a session).
  guard('activate first tile', () => {
    if (tiles[0]) tiles[0].activate();
  });
  // Titles are seized once, document-wide, so neither the retired house panel nor native
  // browser hover bubbles cover the controls. Their text remains as accessible labels.
  guard('house tooltips', installTips);
}

// Boot inside a guard too: if init throws before its own guards are reached, the
// header must still be usable and the reason must be on screen.
init().catch((e) => {
  document.documentElement.classList.remove('boot-pending');
  showFailure('startup', e);
});
