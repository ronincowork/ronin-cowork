/* part of the ronin-cowork client — see js/README.md */
import { WorkspacePrimitives } from './workspace-primitives.js';
import { WORKBENCH_APPEARANCES } from './workspace-contract.js';

export const WORKSPACE_STATE_KEY = 'ronin.workspace.v2';
export const WORKSPACE_STATE_VERSION = 4;
const PREVIOUS_WORKSPACE_STATE_KEY = 'ronin.workspace.v1';
const WORKBENCH_LAUNCH_PARAM = 'ronin-launch';
const WORKBENCH_TAB_PARAM = 'ronin-tab';

const text = (value) => (typeof value === 'string' ? value : '');
const workbenchViews = new Set(WORKBENCH_APPEARANCES);
const tenantViews = new Set(['team', 'agent']);
const validTabId = (value) => /^[a-f0-9]{32}$/.test(text(value));
const newWorkbenchTabId = () => {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** One open-request shape for every Workbench door, including default doors. */
export function completeWorkbenchRequest({ destination, param = '', mode = 'overlay', state = {} } = {}) {
  if (!workbenchViews.has(destination) || tenantViews.has(destination) && !text(param)
    || !['replace', 'overlay'].includes(mode) || !state || typeof state !== 'object' || Array.isArray(state)) return null;
  const count = state.count === 4 ? 4 : 2;
  const allowed = count === 4 ? ['workspace1', 'workspace2', 'workspace3', 'workspace4'] : ['workspace1', 'workspace2'];
  return { destination, param: text(param), mode, state: {
    ...state, count, selected: allowed.includes(state.selected) ? state.selected : 'workspace1',
    seats: state.seats && typeof state.seats === 'object' && !Array.isArray(state.seats) ? { ...state.seats } : {},
  } };
}

export const defaultWorkspaceState = () => ({
  version: WORKSPACE_STATE_VERSION,
  // Teams and Agents. The Teams collection is one of the three doors, not the landing.
  view: 'home',
  team: '',
  teamMode: 'team',
  focusedSession: '',
  surfaces: { terminalTile: false, kanban: false, channels: false },
  widths: { left: null, right: null },
  // Which Campaigns this TAB is looking at — `{ mode, campaign_ids[], primary_campaign_id }`.
  // Shared by the home and the doors it opens; healed on read against what exists
  // (js/campaigns.js `normalizeSelection`), so a stale or archived id cannot strand a tab.
  campaignSelection: null,
  // A Workbench snapshot belongs to a browser-tab instance, not a destination or tenant.
  // `views` remains for non-Workbench state and old records, never for Workbench recall.
  views: { home: {}, 'new-team': { draft: null } },
  workbenchTabs: {},
  returnTo: null,
});

/** Normalize is deliberately forgiving: null, empty and older partial records are valid. */
export function migrateWorkspaceState(candidate) {
  const base = defaultWorkspaceState();
  const parsed = candidate && typeof candidate === 'object' ? candidate : {};
  // `panes` is the serialized v1 key only. Normalize its left/right geometry into the
  // corrected Surface/Tile taxonomy; no current API exposes that retired spelling.
  const storedSurfaces = parsed.surfaces && typeof parsed.surfaces === 'object'
    ? parsed.surfaces
    : parsed.panes && typeof parsed.panes === 'object'
      ? { terminalTile: parsed.panes.left, kanban: parsed.panes.kanban, channels: parsed.panes.right }
      : {};
  const storedViews = parsed.views && typeof parsed.views === 'object' && !Array.isArray(parsed.views)
    ? parsed.views
    : {};
  const views = { ...base.views, ...storedViews };
  // Old per-view and per-tenant Workbench snapshots cannot identify a tab instance.
  // Keep non-Workbench drafts, but never migrate an old seat map into a new open.
  for (const key of Object.keys(views)) {
    if (workbenchViews.has(key) || key.startsWith('team:') || key.startsWith('agent:')) delete views[key];
  }
  return {
    ...base,
    // Only `league-workspace` is still a legacy spelling of the collection. `campaign` is
    // a real destination again and resolves to itself.
    view: text(parsed.view) === 'league-workspace' ? 'cowork' : text(parsed.view) || base.view,
    campaignSelection: parsed.campaignSelection && typeof parsed.campaignSelection === 'object'
      ? parsed.campaignSelection
      : base.campaignSelection,
    team: text(parsed.team),
    teamMode: parsed.teamMode === 'sessions' ? 'sessions' : 'team',
    focusedSession: text(parsed.focusedSession),
    surfaces: { ...base.surfaces, ...storedSurfaces },
    widths: { ...base.widths, ...(parsed.widths && typeof parsed.widths === 'object' ? parsed.widths : {}) },
    views,
    workbenchTabs: parsed.workbenchTabs && typeof parsed.workbenchTabs === 'object' && !Array.isArray(parsed.workbenchTabs)
      ? parsed.workbenchTabs : {},
    returnTo: parsed.returnTo && typeof parsed.returnTo === 'object' ? parsed.returnTo : null,
    version: WORKSPACE_STATE_VERSION,
  };
}

function readState() {
  try {
    const raw = sessionStorage.getItem(WORKSPACE_STATE_KEY) ?? sessionStorage.getItem(PREVIOUS_WORKSPACE_STATE_KEY);
    return migrateWorkspaceState(JSON.parse(raw || 'null'));
  } catch (_) {
    return migrateWorkspaceState(null);
  }
}

function writeState(state) {
  try {
    sessionStorage.setItem(WORKSPACE_STATE_KEY, JSON.stringify(state));
  } catch (_) {
    // Storage denied: navigation still works for this page lifetime.
  }
}

export function routeFromHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  if (!raw) return null;
  try {
    const [view, ...rest] = raw.split('/').map(decodeURIComponent);
    // `#/campaign` is the Campaign destination and no longer an alias; only the retired
    // `#/league-workspace` still resolves to the Cowork collection.
    return view ? { view: view === 'league-workspace' ? 'cowork' : view, param: rest.join('/') } : null;
  } catch (_) {
    return null;
  }
}

export function hashFor(view, param = '') {
  return '#/' + [view, param].filter(Boolean).map(encodeURIComponent).join('/');
}

/** Open one destination in a fresh browser-tab Workbench instance. */
export function reserveWorkspaceTab() {
  const tab = window.open('about:blank', '_blank');
  if (tab) tab.opener = null;
  return tab;
}

export function closeWorkspaceTab(tab) {
  try { tab?.close(); } catch (_) { /* a blocked popup needs no cleanup */ }
}

export function openWorkspaceTab(view, param = '', reserved = null) {
  const requestedUrl = workbenchViews.has(view) ? workbenchLaunchUrl({ destination: view, param, mode: 'overlay' }) : location.href;
  if (!requestedUrl) return null;
  const url = new URL(requestedUrl);
  if (!workbenchViews.has(view)) {
    url.searchParams.delete(WORKBENCH_TAB_PARAM);
    url.searchParams.delete(WORKBENCH_LAUNCH_PARAM);
    url.hash = hashFor(view, param);
  }
  if (reserved) {
    reserved.location.replace(url.href);
    return reserved;
  }
  return window.open(url.href, '_blank', 'noopener');
}

/**
 * Build a destination URL with a fresh instance id and one-shot open request.
 * `replace` replaces default seats; `overlay` changes named defaults.
 */
export function workbenchLaunchUrl({ destination, param = '', mode = 'replace', state = {} } = {}) {
  const request = completeWorkbenchRequest({ destination, param, mode, state });
  if (!request) return null;
  const url = new URL(location.href);
  url.searchParams.set(WORKBENCH_TAB_PARAM, newWorkbenchTabId());
  url.searchParams.set(WORKBENCH_LAUNCH_PARAM, JSON.stringify(request));
  url.hash = hashFor(destination, param);
  return url.href;
}

export function openWorkbenchTab(spec = {}, reserved = null) {
  const url = workbenchLaunchUrl(spec);
  if (!url) return null;
  if (reserved) {
    reserved.location.replace(url);
    return reserved;
  }
  return window.open(url, '_blank', 'noopener');
}

/** Use the normal view transition to open the shared Workspace Folders work surface. */
export function navigateToWorkspaceFolders(context, detail = {}) {
  if (!context?.navigate || detail?.origin?.kind !== 'preset') return false;
  context.patchState?.({ returnTo: { view: context.id, param: context.param || '', tabId: context.tabId || '', origin: detail.origin } });
  return context.navigate('campaign', { workbenchRequest: { mode: 'replace', state: {
    count: 2, selected: 'workspace2',
    seats: { workspace1: 'campaign.defaults', workspace2: 'campaign.project-roots' },
  } } });
}

/** Return to the Preset view recorded by navigateToWorkspaceFolders. */
export function returnFromWorkspaceFolders(context) {
  const destination = context?.state?.returnTo;
  if (!destination || destination.origin?.kind !== 'preset') return false;
  context.patchState?.({ returnTo: null });
  return context.navigate(destination.view, { param: destination.param || '', resumeTabId: destination.tabId || '' });
}

/** Claim and remove the initial request. Refresh reads only this instance's snapshot. */
export function consumeWorkbenchLaunch(destination, param = '') {
  const url = new URL(location.href);
  const raw = url.searchParams.get(WORKBENCH_LAUNCH_PARAM) || '';
  if (!raw) return null;
  url.searchParams.delete(WORKBENCH_LAUNCH_PARAM);
  history.replaceState(history.state, '', url.href);
  try {
    const launch = JSON.parse(raw);
    if (launch?.destination !== destination || text(launch?.param) !== text(param)) return null;
    if (!['replace', 'overlay'].includes(launch?.mode) || !launch.state || typeof launch.state !== 'object') return null;
    return Object.freeze({ mode: launch.mode, state: launch.state });
  } catch (_) { return null; }
}

/** Resolve a new open from its request and the destination's declared floor only. */
export function resolveWorkbenchState(launch = null, defaults = {}) {
  const floor = defaults && typeof defaults === 'object' ? defaults : {};
  const base = { ...floor, seats: { ...(floor.seats || {}) } };
  if (!launch?.state || !['replace', 'overlay'].includes(launch.mode)) return base;
  const patch = launch.state;
  const seats = launch.mode === 'replace'
    ? { ...(patch.seats || {}) }
    : { ...(base.seats || {}), ...(patch.seats || {}) };
  return { ...base, ...patch, seats };
}

const matchingWorkbenchTab = (record, destination, param) => record?.destination === destination
  && record?.param === text(param) && record.state && typeof record.state === 'object' && !Array.isArray(record.state);

/** A matching instance snapshot is refresh. Otherwise this is a new open request. */
export function resolveWorkbenchEntry(tabs, tabId, destination, param, launch, defaults) {
  const record = tabs?.[tabId];
  if (matchingWorkbenchTab(record, destination, param)) return record.state;
  return resolveWorkbenchState(launch, defaults);
}

/** Persist only this tab's Workbench; cloned storage for another tab is never recalled. */
export function patchWorkbenchTabState(tabs, tabId, destination, param, patch) {
  const before = tabs?.[tabId];
  const state = matchingWorkbenchTab(before, destination, param) ? before.state : {};
  return { ...(tabs || {}), [tabId]: {
    destination, param: text(param), state: { ...(state && typeof state === 'object' ? state : {}), ...patch },
  } };
}

/**
 * The one ViewHost owner. Views may be empty and may carry no classification; only a
 * registered id and an element are structural. Lifecycle failures are contained to the
 * destination and reported without taking the compatibility Sessions view down.
 */
export const tabTitle = (what) => {
  if (what && typeof what === 'object' && what.bare) return String(what.bare);
  return what ? String(what) : '';
};

export function createWorkspace(host, options = {}) {
  const views = new Map();
  const state = readState();
  const onError = options.onError || (() => {});
  const onNavigate = options.onNavigate || (() => {});
  const safeView = options.safeView || 'home';
  let active = null;
  let started = false;
  let destroyed = false;

  const report = (where, error) => {
    try { onError(where, error); } catch (_) { /* reporter failure stays contained */ }
  };
  const invoke = (id, hook, fn) => {
    try { return fn?.(); } catch (error) { report(`${id} ${hook}`, error); return undefined; }
  };

  // THE LAYOUT MAP IN THE BAR. A view that exposes `arrangement` (a managed Workbench's
  // slot controller) gets the Kit's map drawn into the bar's one slot while it is active;
  // every other view leaves the slot empty. The ViewHost does the drawing so no feature
  // ever touches the header, and the map knows only slot names — never what they hold.
  const mapSlot = options.mapSlot instanceof Element ? options.mapSlot : null;
  let map = null;
  const showMap = (id, view) => {
    map?.destroy();
    map = null;
    if (!mapSlot) return;
    mapSlot.replaceChildren();
    if (!view.arrangement) return;
    map = invoke(id, 'map', () => WorkspacePrimitives.createLayoutMap(view.arrangement)) || null;
    if (map) mapSlot.append(map.el);
  };
  // HEADER CAPABILITIES. A view declares only what it owns: controls before the island,
  // compact actions after it, pane count, machine telemetry, Services state, and Feedback.
  // The ViewHost seats them and defaults every undeclared capability to absent, so a
  // static page cannot inherit workbench chrome.
  const seatHeaderItems = (slot, items) => {
    if (!slot) return;
    slot.replaceChildren();
    for (const item of Array.isArray(items) ? items : []) {
      const el = item?.el ?? item;
      if (el instanceof Node) slot.append(el);
    }
  };
  const leadingSlot = options.leadingSlot instanceof Element ? options.leadingSlot : null;
  const actionsSlot = options.actionsSlot instanceof Element ? options.actionsSlot : null;
  // THE TAB NAME rides beside the map, for a view that offers one (`tabName`). Redrawn on
  // every navigation, not only on a view change: the same view on another param has
  // another default. A commit retitles the tab at once.
  const nameSlot = options.nameSlot instanceof Element ? options.nameSlot : null;
  let name = null;
  const showName = (id, view) => {
    name?.destroy();
    name = null;
    if (!nameSlot) return;
    nameSlot.replaceChildren();
    if (!view.tabName) return;
    const facet = view.tabName;
    name = invoke(id, 'tabName', () => WorkspacePrimitives.createTabName({
      get: () => facet.get?.(),
      placeholder: () => facet.placeholder?.(),
      set: (value) => { facet.set?.(value); refreshTitle(); },
    })) || null;
    if (name) nameSlot.append(name.el);
  };

  const register = (id, view) => {
    if (destroyed) throw new Error('workspace is destroyed');
    if (!id || views.has(id)) throw new Error(`workspace view already registered: ${id}`);
    if (!(view?.el instanceof Element)) throw new Error(`workspace view has no element: ${id}`);
    view.el.dataset.workspaceView = id;
    view.el.hidden = true;
    host.append(view.el);
    views.set(id, { ...view, mounted: false });
    return () => unregister(id);
  };

  const unregister = (id) => {
    const view = views.get(id);
    if (!view) return false;
    if (active?.id === id) navigate(safeView, { replace: true });
    invoke(id, 'destroy', () => view.destroy?.());
    view.el.hidden = true;
    view.el.remove();
    views.delete(id);
    return true;
  };

  const navigate = (requested, nav = {}) => {
    if (destroyed) return false;
    const target = (requested === 'team' || requested === 'agent') && !text(nav.param) ? 'cowork' : requested;
    const id = views.has(target) ? target : safeView;
    const next = views.get(id);
    if (!next) throw new Error(`workspace has no safe ${safeView} view`);
    const param = text(nav.param);
    const workbench = workbenchViews.has(id);
    const address = new URL(location.href);
    const same = active?.id === id && active?.param === param;
    const fromAddress = nav.initial === true || nav.fromHistory === true;
    const addressTab = address.searchParams.get(WORKBENCH_TAB_PARAM);
    const addressRecord = state.workbenchTabs?.[addressTab];
    const canResumeAddress = fromAddress && validTabId(addressTab)
      && matchingWorkbenchTab(addressRecord, id, param);
    const resumeRecord = state.workbenchTabs?.[nav.resumeTabId];
    const canResumeReturn = validTabId(nav.resumeTabId)
      && matchingWorkbenchTab(resumeRecord, id, param);
    const tabId = workbench
      ? canResumeReturn ? nav.resumeTabId
        : canResumeAddress ? addressTab
          : same && !nav.workbenchRequest && !fromAddress ? active.tabId
            : fromAddress && validTabId(addressTab) && !addressRecord ? addressTab
              : newWorkbenchTabId()
      : '';
    address.hash = hashFor(id, param);
    if (workbench) {
      address.searchParams.set(WORKBENCH_TAB_PARAM, tabId);
      const tabRecord = state.workbenchTabs?.[tabId];
      const opening = !matchingWorkbenchTab(tabRecord, id, param);
      const explicitRequest = nav.workbenchRequest && completeWorkbenchRequest({
        destination: id, param, mode: nav.workbenchRequest.mode || 'overlay', state: nav.workbenchRequest.state || {},
      });
      if (explicitRequest) address.searchParams.set(WORKBENCH_LAUNCH_PARAM, JSON.stringify(explicitRequest));
      else if (!fromAddress) address.searchParams.delete(WORKBENCH_LAUNCH_PARAM);
      if (opening && !address.searchParams.has(WORKBENCH_LAUNCH_PARAM)) address.searchParams.set(WORKBENCH_LAUNCH_PARAM,
        JSON.stringify(completeWorkbenchRequest({ destination: id, param })));
    } else {
      address.searchParams.delete(WORKBENCH_TAB_PARAM);
      address.searchParams.delete(WORKBENCH_LAUNCH_PARAM);
    }
    if (address.href !== location.href) history[nav.fromHistory || nav.replace ? 'replaceState' : 'pushState'](null, '', address.href);
    let launchClaimed = false, launch = null;
    const scopedViewState = (view) => viewState(view, view === id ? tabId : '');
    const scopedPatchViewState = (view, patch) => patchViewState(view, patch, view === id ? tabId : '');
    const workbenchEntry = (defaults = {}) => {
      if (!launchClaimed) { launch = consumeWorkbenchLaunch(id, param); launchClaimed = true; }
      const recorded = state.workbenchTabs?.[tabId];
      const refreshing = matchingWorkbenchTab(recorded, id, param);
      const entry = resolveWorkbenchEntry(state.workbenchTabs, tabId, id, param, launch, defaults);
      if (!refreshing) {
        state.workbenchTabs = patchWorkbenchTabState(state.workbenchTabs, tabId, id, param, entry);
        writeState(state);
      }
      return { state: entry, launched: !refreshing && launch !== null, refreshing };
    };
    const context = { id, param, tabId, state, navigate, patchState, viewState: scopedViewState, patchViewState: scopedPatchViewState, workbenchEntry };
    const changed = !same || active?.tabId !== tabId;
    if (active && changed) {
      invoke(active.id, 'leave', () => active.view.leave?.());
      if (active.view !== next) active.view.el.hidden = true;
    }
    if (!next.mounted) {
      invoke(id, 'mount', () => next.mount?.(host, context));
      next.mounted = true;
    }
    next.el.hidden = false;
    if (changed) invoke(id, 'enter', () => next.enter?.(context));
    if (active?.view !== next) {
      showMap(id, next);
      seatHeaderItems(leadingSlot, next.header?.leading);
      seatHeaderItems(actionsSlot, next.header?.actions);
    }
    showName(id, next);
    const feedback = document.getElementById('feedbackaction');
    if (feedback) feedback.hidden = next.header?.feedback !== true;
    const shapeControl = document.getElementById('shapecycle');
    if (shapeControl) shapeControl.hidden = next.header?.shape !== true;
    options.ramRpm?.setVisible(next.header?.ram === true);
    options.servicesStatus?.setVisible(next.header?.services === true);
    active = { id, view: next, param, tabId };
    state.view = id;
    if (id === 'team') state.team = param;
    writeState(state);
    try { onNavigate({ id, param, state }); } catch (error) { report('header navigation', error); }
    document.title = tabTitle(invoke(id, 'title', () => next.title?.(context)));
    return requested === id;
  };

  const onPopState = () => {
    const route = routeFromHash();
    navigate(route?.view || safeView, { param: route?.param || '', fromHistory: true });
  };
  const start = () => {
    if (started || destroyed) return;
    started = true;
    const route = routeFromHash();
    // A bare Ronin URL is HOME, every time. Workspace recall belongs inside an explicit
    // destination; it must not turn the product's front door into whichever room this
    // browser happened to leave last.
    const id = route?.view || safeView;
    navigate(id, { param: route?.param || '', replace: true, initial: true });
    window.addEventListener('popstate', onPopState);
  };

  function patchState(patch) {
    if (!patch || typeof patch !== 'object') return;
    Object.assign(state, patch, { version: WORKSPACE_STATE_VERSION });
    writeState(state);
  }

  const viewState = (id, tabId = '') => {
    if (workbenchViews.has(id)) {
      const record = state.workbenchTabs?.[tabId];
      return record?.destination === id ? record.state : null;
    }
    return state.views?.[id] ?? null;
  };
  const patchViewState = (id, patch, tabId = '') => {
    if (!id || !patch || typeof patch !== 'object') return;
    if (workbenchViews.has(id)) {
      const record = state.workbenchTabs?.[tabId];
      if (!validTabId(tabId) || record?.destination !== id) return;
      state.workbenchTabs = patchWorkbenchTabState(state.workbenchTabs, tabId, id, record.param, patch);
    } else {
      const before = state.views?.[id];
      state.views = { ...(state.views || {}), [id]: { ...(before || {}), ...patch } };
    }
    writeState(state);
  };
  const refreshTitle = () => {
    if (!active) return;
    const context = { id: active.id, param: active.param, state, navigate, patchState,
      viewState: (view) => viewState(view, view === active.id ? active.tabId : ''),
      patchViewState: (view, patch) => patchViewState(view, patch, view === active.id ? active.tabId : '') };
    document.title = tabTitle(invoke(active.id, 'title', () => active.view.title?.(context)));
  };

  const back = () => history.length > 1 ? history.back() : navigate(safeView, { replace: true });
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener('popstate', onPopState);
    if (active) invoke(active.id, 'leave', () => active.view.leave?.());
    for (const [id, view] of views) invoke(id, 'destroy', () => view.destroy?.());
    views.clear();
    active = null;
  };

  return { register, unregister, navigate, start, back, destroy, patchState, viewState, patchViewState, refreshTitle, state, get active() { return active; } };
}
