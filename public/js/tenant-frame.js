/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TENANT FRAME — the one workbench machinery every new tenant runs on (owner,
 * 2026-10-06: one common machinery, a thin layer per tenant). Underneath it the Kit frame
 * (js/workbench.js): selector, cells, placement, arrangement, refresh memory. On top of it a
 * thin tenant file (collections-view.js; team-next, board and workspace to follow) saying
 * which cards it offers, how each is made from the tenant's reading, and what it opens
 * with first.
 *
 * Lifted as a copy from cowork-view.js's seat machinery. That file is not edited: Desk,
 * Teams and Team keep running on it until the tenants replace them, then it goes.
 *
 * Here: the four terminal seats and their warm pools; placing a session or a surface into
 * a cell and remembering it for refresh; the common cards (terminal, document, feedback);
 * the bar name. Not here: Mika, the arranger, Commons. A tenant that needs one adds it.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createWarmTerminalPool } from './team-terminal-pool.js';
import { createDocumentWorkspaceAdapter } from './docs.js';
import { createFeedbackSurface } from './feedback.js';
import { acceptDrops as acceptSessionDrops } from './team-drag.js';
import { installBehaviourReader } from './behaviour-reader.js';
import { store } from './store.js';
import { S } from './state.js';
import { t } from './lexicon.js';
import { isCoarse } from './tiledrop.js';
import { workbenchView } from './workspace-contract.js';
import { registerWorkbenchCatalog, WORKBENCH_TYPES as WB_TYPES } from './workbench-catalog.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};
const SEATS = ['workspace1', 'workspace2', 'workspace3', 'workspace4'];
const OPPOSITE = { workspace1: 'workspace2', workspace2: 'workspace1', workspace3: 'workspace4', workspace4: 'workspace3' };

/**
 * A tenant says:
 *   key        the destination id, which is also its appearance ('collections')
 *   profile    the WORKBENCH_PROFILES word naming the cards it may place
 *   glyph      the bar glyph
 *   label()    the selector's title
 *   name(param) the bar name and tab title
 *   homeCard   the card Feedback returns to
 *   firstOpen(param)  the seats a fresh open gets
 *   cards(frame)      the environment entries its cards are made from
 *   sessions(param)?  the names whose tiles may seat here (none: no tiles)
 *   selectorFilter(type)?  which placeable types are offered as cards
 *   enter(frame, context)? / leave()? / destroy()?  the tenant's own lifecycle
 */
export function createTenantFrame(tenant) {
  registerWorkbenchCatalog();
  const { createSurface } = WorkspaceKit.primitives;
  const { createTerminalTileHost } = WorkspaceKit.adapters;
  const { DISMISSED_WORKSPACE, normalizeWorkbenchState, workspaceMaySeedDefault } = WorkspaceKit.contract;
  const root = el('main', 'tw-view');
  let ctx = null;
  let param = '';
  let entered = false;
  let lastSeat = 'workspace1'; // the workspace last touched — where the next card lands
  let remembered = {};
  let bench = null;

  /* ---------- the seats: four terminal surfaces, each with a warm pool ---------- */
  const makeSeat = (id, label) => {
    const surface = createSurface({ label, className: 'tw-terminal', flush: true, header: false });
    const pool = createWarmTerminalPool({
      createHost: (options) => createTerminalTileHost({ ...options, onMinimize: () => emptySeat(id) }),
      container: surface.content,
      streamCap: 2,
    });
    return { id, surface, pool, empty: null };
  };
  const seats = Object.fromEntries(SEATS.map((id, i) => [id, makeSeat(id, t(`team.workspace_${i + 1}`, `Workspace ${i + 1}`))]));
  const paintSeats = () => {
    for (const seat of Object.values(seats)) {
      if (seat.pool.active) seat.empty?.el.remove();
      else if (!seat.empty) {
        const blank = createSurface({ label: t('team.workspace_blank', 'Workspace'), className: 'tw-blank' });
        const mark = el('div', 'tile-empty-mark');
        mark.setAttribute('aria-hidden', 'true');
        mark.append(WorkspaceKit.primitives.ninMark());
        blank.content.append(mark);
        seat.empty = { el: blank.el, destroy: () => blank.el.remove() };
        seat.surface.content.append(seat.empty.el);
      } else if (!seat.empty.el.isConnected) seat.surface.content.append(seat.empty.el);
    }
  };
  const markSelected = (id) => {
    lastSeat = id;
    for (const seat of Object.values(seats)) {
      for (const tile of seat.surface.content.querySelectorAll('.tile')) tile.classList.toggle('active', seat.id === id);
    }
  };
  const touch = (id) => { bench?.select(id); };
  const liveSeats = () => bench?.visibleIds() || [];
  const oppositeSeat = (id) => OPPOSITE[id] || 'workspace1';

  /* ---------- what a cell holds, and remembering it ---------- */
  const tokenOf = (node) => node?.dataset?.workbenchSurface || '';
  const heldSurface = (id) => tokenOf(bench?.holding(id) ?? null);
  const surfaceIn = (id) => !bench?.isDefault(id);
  const holds = (id) => surfaceIn(id) ? heldSurface(id) : seats[id].pool.active;
  const surfaceRequest = (token) => token && typeof token === 'object'
    ? { type: token.type, detail: { key: token.key || '', root: token.root || '', path: token.path || '', ...(token.tab ? { tab: token.tab } : {}), ...(token.doc ? { doc: token.doc } : {}) } }
    : { type: token || '', detail: {} };
  const remember = () => {
    const snapshot = bench?.snapshot();
    const seatState = Object.fromEntries(SEATS.map((id) => [id,
      (surfaceIn(id) ? snapshot?.seats?.[id] : seats[id].pool.active) || remembered[id],
    ]).filter(([, value]) => value));
    remembered = { ...seatState };
    ctx?.patchViewState(tenant.key, { ...snapshot, seats: seatState });
  };

  /* ---------- sessions in and out of seats ---------- */
  const clearSeatMarks = (id) => {
    delete seats[id].surface.el.dataset.workbenchSurface;
    delete seats[id].surface.el.dataset.workbenchResource;
  };
  /** The seat back, with nothing in it. */
  const emptySeat = (id) => {
    seats[id].pool.destroyAll();
    remembered[id] = DISMISSED_WORKSPACE;
    bench.restoreDefault(id);
    clearSeatMarks(id);
    touch(id);
    paintSeats();
    remember();
  };
  /** A session in: the terminal seat comes back if a surface was there, then the tile shows it. */
  const putSession = (name, id, focus = true) => {
    if (!seats[id].pool.has(name)) return false;
    if (surfaceIn(id)) bench.placeNode(id, seats[id].surface.el);
    // Never steal keyboard focus on a coarse pointer: typing there is a deliberate tap.
    if (!seats[id].pool.show(name, focus && !isCoarse())) return false;
    touch(id);
    paintSeats();
    remember();
    return true;
  };
  const sessionNames = () => (tenant.sessions?.(param) || []).map((row) => (typeof row === 'string' ? row : row.name)).filter(Boolean);
  const syncPools = () => {
    const names = [...new Set(sessionNames())];
    for (const seat of Object.values(seats)) seat.pool.sync(names);
    paintSeats();
  };
  /** Any live session into a seat, member or not; it rides the pool until it leaves. */
  const connectSession = (name, id = lastSeat) => {
    if (!name) return false;
    syncPools();
    if (!seats[id].pool.has(name)) seats[id].pool.sync([...new Set([...sessionNames(), name])]);
    return putSession(name, id);
  };
  /** Fill each empty workspace from what is remembered. Runs on enter and when the sessions arrive. */
  const seatRemembered = () => {
    for (const id of liveSeats()) {
      if (holds(id)) continue;
      const wanted = remembered[id];
      if (!workspaceMaySeedDefault(wanted)) continue;
      const request = surfaceRequest(wanted);
      if (request.type === WB_TYPES.terminal) {
        if (seats[id].pool.has(request.detail.key)) putSession(request.detail.key, id, false);
        continue;
      }
      if (WorkspaceKit.workbench.library.has(request.type) && bench.place(request.type, id, request.detail)) continue;
      if (wanted && seats[id].pool.has(wanted)) putSession(wanted, id, false);
    }
  };

  /* ---------- the frame a tenant file builds its cards with ---------- */
  const frame = {
    place: (type, id, detail = {}) => bench.place(type, id, detail),
    opposite: oppositeSeat,
    selected: () => lastSeat,
    param: () => param,
    context: () => ctx,
    connectSession,
    emptySeat,
    refreshSelector: () => bench.refreshSelector(),
    remember,
  };
  const environment = {
    terminal: (id, detail) => ({ el: seats[id].surface.el, show: () => putSession(detail.key, id) }),
    sessions: () => sessionNames().map((name) => ({ key: name, label: name, className: 'team-agent-card' })),
    document: (detail = {}) => createDocumentWorkspaceAdapter({ root: detail.root, path: detail.path || detail.key }),
    feedback: (id) => createFeedbackSurface(() => bench.place(tenant.homeCard, id)),
    ...tenant.cards(frame),
  };
  bench = WorkspaceKit.workbench.create({
    profile: tenant.profile,
    tenant: { kind: tenant.key, param: () => param },
    environment,
    defaultNode: (id) => seats[id].surface.el,
    label: tenant.label(),
    title: () => tenant.label(),
    deferSelector: true,
    ...(tenant.selectorFilter ? { selectorFilter: tenant.selectorFilter } : {}),
    installDrop: (cell, id) => acceptSessionDrops(cell, () => id, (name, at) => connectSession(name, at)),
    onSelect: markSelected,
    onStateChange: () => remember(),
    onPlacement: (_snapshot, change) => {
      if (change?.dismissed) remembered[change.dismissed] = DISMISSED_WORKSPACE;
      remember();
    },
  });
  installBehaviourReader(bench, WB_TYPES.document);
  root.append(bench.host);
  let hearSessions = null;

  const name = (p = param) => tenant.name(p);
  return {
    el: root,
    glyph: tenant.glyph,
    ...workbenchView(tenant.key),
    arrangement: bench.arrangement,
    title: ({ param: p, viewState }) => {
      const own = viewState?.(tenant.key)?.tabName;
      return own ? { bare: own } : name(p || param);
    },
    tabName: {
      get: () => ctx?.viewState(tenant.key)?.tabName || name(),
      placeholder: () => name(),
      set: (value) => { ctx?.patchViewState(tenant.key, { tabName: String(value || '').trim() }); },
    },
    placeFeedback: () => bench.place(WB_TYPES.feedback, bench.selected()),
    mount: (_host, context) => { ctx = context; },
    enter: (context) => {
      ctx = context;
      entered = true;
      param = context.param || '';
      for (const seat of Object.values(seats)) seat.pool.destroyAll();
      const { state: entry } = context.workbenchEntry({ count: 2, selected: 'workspace1',
        arrangement: normalizeWorkbenchState(null, bench.declaration).arrangement,
        seats: tenant.firstOpen(param) });
      const typed = normalizeWorkbenchState(entry, bench.declaration);
      remembered = { ...typed.seats };
      bench.enter({ arrangement: typed.arrangement, count: entry.count, selected: entry.selected, selectorDensity: entry.selectorDensity });
      syncPools();
      seatRemembered();
      paintSeats();
      touch(liveSeats().find((id) => !heldSurface(id)) || 'workspace1');
      S.connectSession = (session) => connectSession(session);
      hearSessions?.();
      hearSessions = tenant.sessions ? store.subscribe('sessions', () => { if (entered) { syncPools(); seatRemembered(); } }) : null;
      S.refreshWorkspaceHeader?.();
      tenant.enter?.(frame, context);
    },
    leave: () => {
      entered = false;
      hearSessions?.();
      hearSessions = null;
      for (const seat of Object.values(seats)) { seat.pool.destroyAll(); seat.empty?.destroy(); seat.empty = null; }
      S.connectSession = null;
      tenant.leave?.();
      bench.leave();
      S.refreshWorkspaceHeader?.();
    },
    destroy: () => {
      entered = false;
      hearSessions?.();
      for (const seat of Object.values(seats)) { seat.pool.destroyAll(); seat.empty?.destroy(); }
      tenant.destroy?.();
    },
  };
}
