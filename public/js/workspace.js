/* part of the ronin-cowork client — see js/README.md */

const STATE_KEY = 'ronin.workspace.v1';
const VERSION = 1;

const defaults = () => ({
  version: VERSION,
  view: 'sessions',
  team: '',
  teamMode: 'team',
  focusedSession: '',
  panes: { left: false, kanban: false, right: false },
  widths: { left: null, right: null },
  sessions: { map: [], layout: 4 },
  returnTo: null,
});

function readState() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
    if (!parsed || parsed.version !== VERSION) return defaults();
    return {
      ...defaults(),
      ...parsed,
      panes: { ...defaults().panes, ...(parsed.panes || {}) },
      widths: { ...defaults().widths, ...(parsed.widths || {}) },
      sessions: { ...defaults().sessions, ...(parsed.sessions || {}) },
    };
  } catch (_) {
    return defaults();
  }
}

function writeState(state) {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (_) {
    // Storage denied: navigation still works for this page lifetime.
  }
}

function routeFromHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  if (!raw) return null;
  const [view, ...rest] = raw.split('/').map(decodeURIComponent);
  return { view, param: rest.join('/') };
}

function hashFor(view, param = '') {
  return '#/' + [view, param].filter(Boolean).map(encodeURIComponent).join('/');
}

/**
 * One owner for first-class destinations. A view supplies lifecycle hooks; the runtime
 * owns visibility, history, title and persisted location.
 */
export function createWorkspace(host) {
  const views = new Map();
  const state = readState();
  let active = null;

  const register = (id, view) => {
    if (!id || views.has(id)) throw new Error(`workspace view already registered: ${id}`);
    if (!(view.el instanceof Element)) throw new Error(`workspace view has no element: ${id}`);
    view.el.dataset.workspaceView = id;
    view.el.hidden = true;
    views.set(id, view);
  };

  const navigate = (id, options = {}) => {
    const next = views.get(id) || views.get('sessions');
    if (!next) throw new Error('workspace has no safe sessions view');
    const nextId = views.has(id) ? id : 'sessions';
    const param = options.param || '';
    if (active && active.view !== next) {
      active.view.leave?.();
      active.view.el.hidden = true;
    }
    if (!next.mounted) {
      next.mount?.(host);
      next.mounted = true;
    }
    next.el.hidden = false;
    next.enter?.({ param, state });
    active = { id: nextId, view: next, param };
    state.view = nextId;
    if (nextId === 'team') state.team = param;
    writeState(state);
    document.title = next.title?.({ param, state }) || 'ronin';
    const target = hashFor(nextId, param);
    if (location.hash !== target) history[options.replace ? 'replaceState' : 'pushState'](null, '', target);
  };

  const start = () => {
    const route = routeFromHash();
    const id = route?.view || state.view || 'sessions';
    navigate(id, { param: route?.param || (id === 'team' ? state.team : ''), replace: true });
    window.addEventListener('popstate', () => {
      const back = routeFromHash();
      navigate(back?.view || 'sessions', { param: back?.param || '', replace: true });
    });
  };

  const patchState = (patch) => {
    Object.assign(state, patch);
    writeState(state);
  };

  return { register, navigate, start, patchState, state };
}
