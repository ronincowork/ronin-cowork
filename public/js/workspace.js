/* part of the ronin-cowork client — see js/README.md */
import { WorkspacePrimitives } from './workspace-primitives.js';

export const WORKSPACE_STATE_KEY = 'ronin.workspace.v2';
/**
 * VERSION 3 (2026-08-29) — the Campaign cut. Two things changed that a stored v2 record
 * cannot be read correctly without knowing about:
 *
 *   1. `campaign` is a REAL destination again (Campaign select/create/manage). It briefly
 *      named the Cowork collection, and v2 carried `views.campaign` forward into
 *      `views.cowork` for that reason. Run that carry-forward for v2 and older ONLY —
 *      applied to a v3 record it would eat the reclaimed namespace.
 *   2. `campaignSelection` joins the top level, because the home, Coworks and Agents
 *      doors share ONE selection. It is per tab on purpose (never SETTEI), so two tabs
 *      may inspect different Campaigns without fighting.
 */
export const WORKSPACE_STATE_VERSION = 3;
const PREVIOUS_WORKSPACE_STATE_KEY = 'ronin.workspace.v1';

const text = (value) => (typeof value === 'string' ? value : '');

export const defaultWorkspaceState = () => ({
  version: WORKSPACE_STATE_VERSION,
  // The three-door home is the install's root arrival (owner, 2026-08-29): Campaign,
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
/**
 * THE TAB'S NAME, SPELLED IN ONE PLACE (owner, 2026-08-23).
 *
 * `tmux ronin` was the name of the thing this grew out of, and because `index.html` shipped
 * it as a literal `<title>` it went into every tab and — the way the owner found it — into
 * every bookmark saved from the app. It is not the product's name and no surface should be
 * able to spell the house name for itself again.
 *
 * A view now says only WHAT IT IS — a team's name, `League`, a session — or says nothing at
 * all. The house half is added here, and it is one word: `Ronin`, with the capital it
 * carries everywhere else. Nothing, and the tab is just the house.
 *
 * THE NAME COMES FIRST AND THE HOUSE COMES LAST (owner, 2026-08-23), because a browser
 * truncates a tab from the END. Whatever the owner opened this tab FOR therefore survives
 * at every width, and `Ronin` — the part every tab shares, and so the part that
 * distinguishes nothing — is the first thing given up when the strip is tight.
 *
 * NO MARK IN THE TEXT. The mark is the favicon (`public/brand/nin-mark.svg`), which is
 * where a tab, a bookmark bar and a home screen all already look for one. Spelling a
 * SECOND mark in the title beside it — the ⛩ this briefly carried — puts two different
 * house marks an inch apart and spends the leading characters, the ones truncation never
 * reaches, on something that identifies nothing.
 */
const HOUSE = 'Ronin';
/**
 * A NAMED TAB DROPS THE HOUSE (owner, 2026-08-26: "we don't need Ronin in there unless
 * it's the default"). A view hands back a string — what it is — and the house is added;
 * or `{ bare: text }` — a title the owner composed, spelled whole, with nothing added.
 * The Team page uses the second when its tab has been named: `<name> · <team>`.
 */
export const tabTitle = (what) => {
  if (what && typeof what === 'object' && what.bare) return String(what.bare);
  return what ? `${what} · ${HOUSE}` : HOUSE;
};

const setTabGlyph = (glyph = '') => {
  const icon = document.getElementById('tabicon');
  if (!icon) return;
  if (!glyph) { icon.href = '/brand/nin-mark.svg'; return; }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="49" text-anchor="middle" font-size="48" font-family="sans-serif">${glyph}</text></svg>`;
  icon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
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
    setTabGlyph(next.glyph);
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
