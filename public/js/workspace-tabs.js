/**
 * THE TAB SET — the one tab strip in the coworkspace. A surface hands it an ordered list
 * of tabs and their panels; it owns the shape, the selection, the scrolling and the
 * lifecycle, and nothing outside the Kit ever touches a tab node.
 *
 * SELECTED IS A SHAPE, NOT A LINE (owner, 2026-09-19). The selected tab takes the panel's
 * own plane and drops its bottom border, so the tab and its panel read as one continuous
 * surface: it is the only tab with no line under it. Never mark a selection with an
 * underline.
 *
 * A panel is a Node, a service `{ el, mount, enter, leave, destroy, watch }`, or a
 * factory `() => service` built the first time its tab is shown — four workspaces'
 * worth of wipeboards and cron rooms no longer build themselves on a page load.
 *
 * `watch(report)` is how a tab that is NOT on screen feeds its own badge: it starts when
 * the surface is entered, stops when it leaves, and calls `report({ badge, attention })`.
 * It exists so the surface never has to enter every panel to keep two counters truthful.
 */
import { createSurface } from './workspace-primitives.js';
import { t } from './lexicon.js';

const node = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text !== undefined && text !== null) out.textContent = String(text);
  return out;
};

let tabSequence = 0;

/** A scroll step that always leaves a whole tab in view rather than landing mid-label. */
const SCROLL_SHARE = 0.8;

/**
 * WHICH EDGE IS CUT. Pure, so it is the same answer whether a scroll, a splitter drag or
 * a layout-map toggle asked. One pixel of slack is rounding, not a cut edge.
 */
export function tabEdge({ scrollLeft = 0, scrollWidth = 0, clientWidth = 0 } = {}) {
  const slack = scrollWidth - clientWidth;
  if (slack <= 1) return 'none';
  const left = scrollLeft > 1;
  const right = scrollLeft < slack - 1;
  return left && right ? 'both' : left ? 'left' : right ? 'right' : 'none';
}

/**
 * WHICH TAB IS SHOWN. A hidden, disabled or unknown id falls back to the first tab that
 * can be chosen, so the surface is never left blank; with nothing selectable it says so.
 */
export function chooseTab(requested, tabs = []) {
  const open = tabs.filter((tab) => tab && !tab.hidden && !tab.disabled);
  const wanted = String(requested ?? '');
  const hit = open.find((tab) => String(tab.id) === wanted);
  return String((hit ?? open[0])?.id ?? '');
}

/** WHERE AN ARROW GOES. Wraps at both ends; a key that is not navigation moves nothing. */
export function nextTabIndex(key, at, count) {
  if (!Number.isInteger(count) || count < 1 || at < 0) return -1;
  const last = count - 1;
  if (key === 'ArrowRight') return at === last ? 0 : at + 1;
  if (key === 'ArrowLeft') return at === 0 ? last : at - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  return -1;
}

export function createTabbedSurface(options = {}) {
  const surface = createSurface({ label: options.label, className: `wk-tabset${options.className ? ` ${options.className}` : ''}`, header: false });
  const seq = ++tabSequence;

  /* ---------- the bar: the word, the tabs, the actions ---------- */
  // NO SURFACE NAME IN THE BAR (owner, 2026-09-19): you launch the Commons and what you
  // get is its tabs. `label` stays the tablist's accessible name and the surface's
  // aria-label; it is never drawn.
  const bar = node('div', 'wk-tabset-bar');
  const scroll = node('div', 'wk-tabset-scroll');
  const row = node('div', 'wk-tabset-row');
  row.setAttribute('role', 'tablist');
  if (options.label) row.setAttribute('aria-label', options.label);
  scroll.append(row);
  // The masks are overlays, not flex items: they must not take layout width, and the
  // chevron inside each one has to stay clickable while the gradient does not.
  const edge = (side) => {
    const el = node('div', 'wk-tabset-edge');
    el.dataset.side = side;
    const button = node('button', 'wk-tabset-chevron', side === 'left' ? '‹' : '›');
    button.type = 'button';
    button.tabIndex = -1; // a pointer affordance; the keyboard has arrow keys
    button.setAttribute('aria-hidden', 'true');
    button.addEventListener('click', () => {
      const step = Math.max(1, Math.round(scroll.clientWidth * SCROLL_SHARE));
      scroll.scrollBy({ left: side === 'left' ? -step : step, behavior: 'smooth' });
    });
    el.append(button);
    return el;
  };
  const scroller = node('div', 'wk-tabset-scroller');
  scroller.append(scroll, edge('left'), edge('right'));
  const actions = node('div', 'wk-tabset-actions');
  bar.append(scroller, actions);
  for (const action of options.actions || []) {
    const el = action?.el ?? action;
    if (el instanceof Node) actions.append(el);
  }

  /* ---------- the tabs ---------- */
  const entries = new Map(); // id -> { id, button, panel, label, dot, badge, declared, service, built }
  const order = [];
  for (const declared of Array.isArray(options.tabs) ? options.tabs : []) {
    if (!declared || declared.id == null) continue;
    const id = String(declared.id);
    if (entries.has(id)) continue;
    const button = node('button', 'wk-tabset-tab');
    button.type = 'button';
    button.id = `wk-tab-${seq}-${id}`;
    button.dataset.tab = id;
    button.setAttribute('role', 'tab');
    const dot = node('span', 'wk-tabset-dot');
    dot.setAttribute('aria-hidden', 'true');
    const label = node('span', 'wk-tabset-label', declared.label ?? id);
    const badge = node('span', 'wk-tabset-badge');
    badge.setAttribute('aria-hidden', 'true');
    // A tab with nothing to count has no badge at all. Left visible, an empty one paints
    // its fill and padding as a small pill after the label — a dash nobody asked for.
    badge.hidden = true;
    button.append(dot, label, badge);
    if (declared.title) button.title = declared.title;
    const panel = node('div', 'wk-tabset-panel');
    panel.id = `wk-tabpanel-${seq}-${id}`;
    panel.dataset.tab = id;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    button.setAttribute('aria-controls', panel.id);
    if (declared.flush) panel.dataset.flush = 'true';
    panel.hidden = true;
    const entry = { id, button, panel, label, dot, badge, declared, service: null, built: false, stopWatch: null };
    button.addEventListener('click', () => select(id));
    entries.set(id, entry);
    order.push(entry);
    row.append(button);
    surface.content.append(panel);
    // Set the declared flags directly: the setters below reconcile selection, and there
    // is no selection yet while the row is still being built.
    button.hidden = !!declared.hidden;
    button.disabled = !!declared.disabled;
  }
  surface.el.prepend(bar);

  /* ---------- which tab may be chosen ---------- */
  const selectable = () => order.filter((entry) => !entry.button.hidden && !entry.button.disabled);
  const firstSelectable = () => selectable()[0]?.id ?? '';
  let current = '';
  let context = null;
  let entered = false;

  /** Build a panel's service the first time its tab is shown; a throw leaves the surface usable. */
  const build = (entry) => {
    if (entry.built) return entry.service;
    entry.built = true;
    const declared = entry.declared.panel;
    try {
      const made = typeof declared === 'function' ? declared() : declared;
      if (made instanceof Node) entry.service = { el: made };
      else entry.service = made || null;
      const el = entry.service?.el;
      if (el instanceof Node) entry.panel.append(el);
      entry.service?.mount?.(entry.panel, context);
    } catch (error) {
      entry.service = null;
      entry.panel.dataset.failed = 'true';
      surface.setState('failed', t('workspace.tab_failed', 'This tab could not be opened.'));
      console.error(`tabset: ${entry.id} failed to build`, error);
    }
    return entry.service;
  };

  /* ---------- selection: one path for click, keyboard and code ---------- */
  const select = (requested) => {
    const usable = chooseTab(requested, order.map((entry) => ({ id: entry.id, hidden: entry.button.hidden, disabled: entry.button.disabled })));
    if (!usable) { current = ''; paint(); return ''; }
    const previous = current;
    if (usable !== previous) entries.get(previous)?.service?.leave?.();
    current = usable;
    paint();
    const chosen = entries.get(usable);
    build(chosen);
    if (entered) chosen.service?.enter?.(context);
    chosen.button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (usable !== previous) options.onSelect?.(usable, previous);
    return usable;
  };

  const paint = () => {
    for (const entry of order) {
      const on = entry.id === current;
      entry.button.setAttribute('aria-selected', String(on));
      entry.button.tabIndex = on ? 0 : -1;
      entry.panel.hidden = !on;
    }
    // No selectable tab can still take focus, so the strip never becomes a keyboard trap.
    if (!current && selectable()[0]) selectable()[0].button.tabIndex = 0;
  };

  /* ---------- state a consumer may change, all through here ---------- */
  function setAvailable(id, state = {}) {
    const entry = entries.get(String(id));
    if (!entry) return;
    const on = state.on !== false;
    entry.button.disabled = !on;
    // The tab keeps its place whether or not it is available, so the row never re-orders
    // under the pointer when something finishes installing.
    if (state.title !== undefined) {
      if (state.title) entry.button.title = state.title;
      else entry.button.removeAttribute('title');
    }
    if (!on && entry.id === current) select(firstSelectable());
    else paint();
  }

  /** A count beside the label. Its box is always present, so arriving shifts nothing. */
  const setBadge = (id, text, title) => {
    const entry = entries.get(String(id));
    if (!entry) return;
    const value = text == null ? '' : String(text);
    entry.badge.textContent = value;
    entry.badge.hidden = !value;
    if (title !== undefined) {
      if (title) entry.button.title = title;
      else entry.button.removeAttribute('title');
    }
    measure();
  };

  /** A dot, never a weight change: bolding the label widened it and shoved the row. */
  const setAttention = (id, on = true) => {
    const entry = entries.get(String(id));
    if (!entry) return;
    entry.button.dataset.attention = String(!!on);
  };

  /* ---------- scrolling: which edge is cut, and by what ---------- */
  const measure = () => { scroller.dataset.edge = tabEdge(scroll); };
  scroll.addEventListener('scroll', measure, { passive: true });
  // A splitter drag or a layout-map toggle changes what is cut without any scrolling,
  // so the edges are observed as well as listened for.
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
  observer?.observe(scroll);
  observer?.observe(row);
  measure();

  /* ---------- keyboard: focus moves, activation stays deliberate ---------- */
  row.addEventListener('keydown', (event) => {
    const list = selectable();
    if (!list.length) return;
    const at = list.findIndex((entry) => entry.button === document.activeElement);
    const to = list[nextTabIndex(event.key, at, list.length)];
    if (!to) return;
    event.preventDefault();
    // Focus scrolls a cut-off tab back into view; Enter or Space is what opens it,
    // because entering a panel does work.
    to.button.focus();
    to.button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  /* ---------- lifecycle ---------- */
  const startWatches = () => {
    for (const entry of order) {
      if (entry.stopWatch || typeof entry.declared.watch !== 'function') continue;
      const report = (reading = {}) => {
        if (reading.badge !== undefined) setBadge(entry.id, reading.badge, reading.title);
        if (reading.attention !== undefined) setAttention(entry.id, reading.attention);
      };
      try {
        const stop = entry.declared.watch(report, context);
        entry.stopWatch = typeof stop === 'function' ? stop : () => {};
      } catch (error) {
        entry.stopWatch = () => {};
        console.error(`tabset: ${entry.id} watch failed`, error);
      }
    }
  };
  const stopWatches = () => {
    for (const entry of order) {
      entry.stopWatch?.();
      entry.stopWatch = null;
    }
  };

  const api = {
    ...surface,
    el: surface.el,
    select,
    current: () => current,
    setBadge,
    setAttention,
    setAvailable,
    mount: (ctx) => { context = ctx ?? context; },
    enter: (ctx) => {
      context = ctx ?? context;
      entered = true;
      if (!current) select(options.selected ?? firstSelectable());
      else entries.get(current)?.service?.enter?.(context);
      startWatches();
      measure();
    },
    leave: () => {
      entered = false;
      entries.get(current)?.service?.leave?.();
      stopWatches();
    },
    destroy: () => {
      stopWatches();
      observer?.disconnect();
      scroll.removeEventListener('scroll', measure);
      for (const entry of order) if (entry.built) entry.service?.destroy?.();
    },
  };
  select(options.selected ?? firstSelectable());
  return api;
}
