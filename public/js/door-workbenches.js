/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TWO WORKBENCHES HOME'S DOORS OPEN (owner, 2026-10-19; PATTERNS.md Home): Models and
 * Workspaces — each a destination of its own, opened in the same tab, the bar reading
 * RoninCowork • Home • <door>, Home the way back (the Teams door opens the Cowork workbench,
 * cowork-view.js; owner, 2026-10-20). One shape for the two: the Kit workbench
 * on a profile of the door's surfaces (workbench-catalog.js), the door's surface seated in
 * Workspace 1 on first open. Models seats its own stones of providers (models-surface.js), a
 * stone dragged into a workspace or a selector card placing that provider whole; Workspaces
 * seats its own stones of Workspaces (workspaces-surface.js) and GitHub CLI beside them, its admin doors
 * dotted selector cards. Help (owner, 2026-10-21) seats the help outline in Workspace 1 and Mika
 * in Workspace 2 (a page stone dragged into a workspace reads that page there), her ordinary tile opened on her reading: a chat, not a terminal. Help is outside
 * Home's provider gate; with no provider Mika's seat says so in one line instead of her tile.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { workbenchView } from './workspace-contract.js';
import { registerWorkbenchCatalog, WORKBENCH_PROFILES, WORKBENCH_TYPES } from './workbench-catalog.js';
import { createProviderSetupSessionMount } from './provider-setup-session.js';
import { loadProviderCatalog } from './form-steps.js';
import { createModelDefaults, createModelProvider, createModelRefresh, createModelStones, providerOffers } from './models-surface.js';
import { createGithubWorkspaceSetup } from './github-workspace-setup.js';
import { createFolderGithub, createRootsReading, createWorkspaceNew, createWorkspaceRecord, createWorkspacesRead, createWorkspaceStones, workspaceOffers } from './workspaces-surface.js';
import { campaignById, loadCampaigns, normalizeSelection } from './campaigns.js';
import { createHelpOutline, createHelpPage } from './help-outline.js';
import { createMikaTilePool, reportMikaView } from './mika.js';
import { readyMika } from './mika-ready.js';
import { S } from './state.js';
import { request } from './request.js';

const blank = (id) => WorkspaceKit.primitives.createBlankSurface(id.replace('workspace', 'Workspace ')).el;

/**
 * One door's workbench. `seat` is the type Workspace 1 holds on first open (`seats` names every
 * workspace's when there is more than one); `environment`
 * builds the surfaces' resident data over the bench; `cards` false leaves the selector
 * without cards; `loaded` is a read the seats are re-placed after (the folders need the
 * Campaign); `reading` names the Help page being read; `destroy` lets the surfaces go with the view.
 * Every change reports this tab's view for Mika's `owner_view`, as the other workbenches do.
 */
function doorWorkbench({ id, profile, label, seat, seats = { workspace1: seat }, environment, cards = true, loaded = null, reading = () => '', destroy = () => {} }) {
  registerWorkbenchCatalog();
  const { normalizeWorkbenchState } = WorkspaceKit.contract;
  let ctx = null, entered = false, bench = null;
  const report = () => {
    if (!entered) return;
    const shown = (workspace) => [bench.typeAt(workspace), bench.resourceAt(workspace)].filter(Boolean).join(':') || 'empty';
    void reportMikaView({ workbench: id, team: '', selected: bench.selected(), reading: reading(), workspaces: Object.fromEntries(bench.visibleIds().map((workspace) => [workspace, shown(workspace)])) });
  };
  const save = () => { ctx?.patchViewState(id, bench.snapshot()); report(); };
  const reseat = () => {
    for (const [workspace, held] of Object.entries(bench.snapshot().seats)) {
      const type = typeof held === 'object' ? held.type : held;
      if (type) bench.place(type, workspace, typeof held === 'object' ? held : {});
    }
  };
  bench = WorkspaceKit.workbench.create({
    profile, tenant: { kind: id }, environment: environment({ bench: () => bench, entered: () => entered, ctx: () => ctx, report }),
    defaultNode: blank, label, ...(cards ? {} : { selectorFilter: () => false }), onStateChange: save, onPlacement: save,
  });
  return {
    el: bench.host, ...workbenchView(id, { header: { feedback: false } }), arrangement: bench.arrangement,
    title: () => label, place: () => label,
    mount: (_host, context) => { ctx = context; },
    enter: (context) => {
      ctx = context; entered = true;
      const { state: entry } = context.workbenchEntry({
        count: 2, selected: 'workspace1',
        arrangement: normalizeWorkbenchState(null, bench.declaration).arrangement,
        seats,
      });
      const typed = normalizeWorkbenchState(entry, bench.declaration);
      bench.enter({ ...typed, ...entry });
      for (const workspace of bench.ids) {
        const held = typed.seats[workspace];
        const type = typeof held === 'object' ? held.type : held;
        if (WorkspaceKit.workbench.library.has(type)) bench.place(type, workspace, typeof held === 'object' ? held : {});
      }
      bench.refreshSelector(); save();
      if (loaded) void loaded().then(() => { if (entered) reseat(); });
    },
    leave: () => { entered = false; bench.leave(); },
    destroy: () => { entered = false; destroy(); bench.leave(); ctx = null; },
  };
}

/** Models: the stones of providers in Workspace 1, a provider whole where a stone is dropped or its card
 * placed, one card per provider; the sign-in tile mounted as on Setup. */
export function createModelsView() {
  const providerSessions = createProviderSetupSessionMount();
  const made = [];
  const keep = (surface) => { made.push(surface); return surface; };
  return doorWorkbench({
    id: 'models', profile: WORKBENCH_PROFILES.models, label: t('campaign_home.models', 'Models'), seat: WORKBENCH_TYPES.modelStones,
    loaded: loadProviderCatalog,
    environment: ({ bench }) => {
      const environment = {
        setupRuntime: null, mountProviderSetupSession: providerSessions.mountProviderSetupSession,
        providers: providerOffers,
        modelStones: (workspace) => keep(createModelStones({ workspace, detail: {}, environment, workbench: bench() })),
        modelRefresh: (workspace) => keep(createModelRefresh({ workspace, detail: {}, environment, workbench: bench() })),
        modelDefaults: () => createModelDefaults(),
        modelProvider: (workspace, detail) => keep(createModelProvider(detail.key, { workspace, detail, environment, workbench: bench() })),
      };
      return environment;
    },
    destroy: () => { for (const surface of made.splice(0)) surface.destroy?.(); providerSessions.destroyAll(); },
  });
}

/** Workspaces: the stones of Workspaces in Tilespace 1 over the Campaign this tab looks at, a pressed one's page
 * beside them; every Workspace a selector card, opened whole where a stone is dropped or its card placed; New
 * Workspace a dotted card (owner, 2026-11-02); GitHub CLI in Tilespace 2, the sign-in a private clone needs.
 * One read of the pinned folders and one of the Workspaces for the whole bench. */
export function createWorkspacesView() {
  const campaign = (ctx) => campaignById(normalizeSelection(ctx()?.state?.campaignSelection).primary_campaign_id);
  const providerSessions = createProviderSetupSessionMount();
  const reading = createRootsReading();
  const made = [];
  const keep = (surface) => { made.push(surface); return surface; };
  let github = null;
  return doorWorkbench({
    id: 'workspaces', profile: WORKBENCH_PROFILES.workspaces, label: t('campaign_home.workspaces', 'Workspaces'), seat: WORKBENCH_TYPES.workspaceRecords,
    seats: { workspace1: WORKBENCH_TYPES.workspaceRecords, workspace2: WORKBENCH_TYPES.folderGithub },
    loaded: loadCampaigns,
    environment: ({ bench, ctx }) => {
      const campaignId = () => campaign(ctx)?.id || '';
      const workspacesRead = createWorkspacesRead(campaignId);
      const environment = {
        mountProviderSetupSession: providerSessions.mountProviderSetupSession,
        workspaces: () => workspaceOffers(workspacesRead),
        workspaceRecords: () => keep(createWorkspaceStones({ reading, workspacesRead, campaignId, workbench: bench() })),
        workspaceRecord: (_workspace, detail) => keep(createWorkspaceRecord(detail.key, { reading, workspacesRead, campaignId })),
        workspaceNew: (workspace) => keep(createWorkspaceNew({ reading, workspacesRead, campaignId, place: (name) => bench().place(WORKBENCH_TYPES.workspaceRecord, workspace, { key: name }) })),
        folderGithub: () => keep(createFolderGithub(github ??= boxes())),
      };
      const boxes = () => createGithubWorkspaceSetup({
        environment, workspace: 'workspace2',
        onCloned: () => reading.read(),
      });
      return environment;
    },
    destroy: () => { for (const surface of made.splice(0)) surface.destroy?.(); github?.destroy(); github = null; providerSessions.destroyAll(); },
  });
}

/** Help: the help outline in Workspace 1, Mika in Workspace 2 opened on her reading; both solid cards.
 * Seating her starts her the way her Settings card does, once Home's fact says a provider is activated. */
export function createHelpView() {
  const MIKA = 'mika_agent';
  const { surface: mikaSurface, pool: mikaPool } = createMikaTilePool({ opensOn: 'reading' });
  const outlines = [];
  let reading = '';
  const none = document.createElement('p');
  none.className = 'help-mika-none';
  none.hidden = true;
  const setup = Object.assign(document.createElement('a'), { href: '#/setup', textContent: t('help_outline.mika_setup', 'Setup') });
  none.append(t('help_outline.mika_needs_provider', 'Mika needs a model provider. Activate one in '), setup, '.');
  mikaSurface.content.append(none);
  // A terminal seat carries a tile head from the moment it is placed; until the provider read
  // answers (or when it says none) that head is an unconnected tile, kept out of sight.
  let standIn = null;
  // Her tile is up at once. If she was not running, the tile is made again once she is, so it
  // asks her new record for the reading.
  const seatMika = () => {
    const born = S.sessions.some((session) => session.name === MIKA);
    mikaPool.sync([MIKA]);
    mikaPool.show(MIKA, false);
    void readyMika('help').then((ready) => {
      if (born || !ready || (!ready.ok && ready.data?.state !== 'action_required')) return;
      mikaPool.sync([]);
      mikaPool.sync([MIKA]);
      mikaPool.show(MIKA, false);
    });
  };
  return doorWorkbench({
    id: 'help', profile: WORKBENCH_PROFILES.help, label: t('campaign_home.help', 'Help'),
    seats: { workspace1: WORKBENCH_TYPES.helpOutline, workspace2: WORKBENCH_TYPES.helpMika },
    reading: () => reading,
    environment: ({ report }) => ({
      helpOutline: () => { const outline = createHelpOutline({ onRead: (label) => { if (label !== reading) { reading = label; report(); } } }); outlines.push(outline); return outline; },
      helpPage: (detail = {}) => createHelpPage(String(detail.key || '')),
      helpMika: () => ({ el: mikaSurface.el, show: () => {
        if (!standIn) { standIn = WorkspaceKit.adapters.createTerminalTileHost({ mode: 'full' }); mikaSurface.content.append(standIn.el); standIn.mount(''); standIn.hide(); }
        void request('/api/setup/runtime', { cache: 'no-store' }).then((result) => {
          const activated = result.ok && Number(result.data?.activated_count) > 0;
          none.hidden = activated;
          if (activated) seatMika();
        });
      } }),
    }),
    destroy: () => { for (const outline of outlines.splice(0)) outline.destroy(); mikaPool.destroyAll(); standIn?.destroy(); standIn = null; },
  });
}
