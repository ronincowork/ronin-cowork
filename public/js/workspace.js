/* part of the ronin-cowork client — see js/README.md */
import { WorkspacePrimitives } from './workspace-primitives.js';

export const WORKSPACE_STATE_KEY = 'ronin.workspace.v2';
export const WORKSPACE_STATE_VERSION = 3;
const PREVIOUS_WORKSPACE_STATE_KEY = 'ronin.workspace.v1';

const text = (value) => (typeof value === 'string' ? value : '');

export const defaultWorkspaceState = () => ({
  version: WORKSPACE_STATE_VERSION,
  // Coworks, Agents. The Cowork collection is one of the three doors, not the landing.
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
  // Each destination owns one namespace inside this tab. Empty objects and null drafts
  // are valid; the shell stores state but never interprets a feature's workflow.
  views: { home: {}, cowork: {}, campaign: {}, launch: {}, 'new-team': { draft: null } },
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
  // `campaign` briefly named this same collection view, and v2 and older carried its
  // arrangement forward. From v3 `campaign` is a destination of its own, so this runs
  // for the old records only — applied to a v3 record it would eat the reclaimed
  // namespace and hand the Campaign surface someone's Cowork arrangement.
  const storedVersion = Number(parsed.version) || 0;
  const views = { ...base.views, ...storedViews };
  if (storedVersion < 3) {
    if (!storedViews.cowork && storedViews.campaign) views.cowork = storedViews.campaign;
    delete views.campaign;
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

/**
 * The one ViewHost owner. Views may be empty and may carry no classification; only a
 * registered id and an element are structural. Lifecycle failures are contained to the
 * destination and reported without taking the compatibility Sessions view down.
 */
const HOUSE = 'Ronin';
export const tabTitle = (what) => {
  if (what && typeof what === 'object' && what.bare) return String(what.bare);
  return what ? `${what} · ${HOUSE}` : HOUSE;
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
    const id = views.has(requested) ? requested : safeView;
    const next = views.get(id);
    if (!next) throw new Error(`workspace has no safe ${safeView} view`);
    const param = text(nav.param);
    const context = { id, param, state, navigate, patchState, viewState, patchViewState };
    const changed = !active || active.id !== id || active.param !== param;
    if (active && active.view !== next) {
      invoke(active.id, 'leave', () => active.view.leave?.());
      active.view.el.hidden = true;
    }
    if (!next.mounted) {
      invoke(id, 'mount', () => next.mount?.(host, context));
      next.mounted = true;
    }
    next.el.hidden = false;
    if (changed) invoke(id, 'enter', () => next.enter?.(context));
    if (active?.view !== next) showMap(id, next);
    showName(id, next);
    active = { id, view: next, param };
    state.view = id;
    if (id === 'team') state.team = param;
    writeState(state);
    try { onNavigate({ id, param, state }); } catch (error) { report('header navigation', error); }
    document.title = tabTitle(invoke(id, 'title', () => next.title?.(context)));
    const target = hashFor(id, param);
    if (!nav.fromHistory && location.hash !== target) history[nav.replace ? 'replaceState' : 'pushState'](null, '', target);
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
    navigate(id, { param: route?.param || (id === 'team' ? state.team : ''), replace: true, fromHistory: !route });
    window.addEventListener('popstate', onPopState);
  };

  function patchState(patch) {
    if (!patch || typeof patch !== 'object') return;
    Object.assign(state, patch, { version: WORKSPACE_STATE_VERSION });
    writeState(state);
  }

  const viewState = (id) => state.views?.[id] ?? null;
  const patchViewState = (id, patch) => {
    if (!id || !patch || typeof patch !== 'object') return;
    const before = state.views?.[id];
    state.views = {
      ...(state.views || {}),
      [id]: { ...(before && typeof before === 'object' ? before : {}), ...patch },
    };
    writeState(state);
  };
  const refreshTitle = () => {
    if (!active) return;
    const context = { id: active.id, param: active.param, state, navigate, patchState, viewState, patchViewState };
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
