/* part of the ronin-cowork client — see js/README.md */
/**
 * THE JIRA PANEL — the Campaign's Jira space, over the bridge's own routes
 * (`/api/jira/:campaign`, owned by the `jira` Services part). Not connected, it is the
 * Connect walkthrough with its four fields; connected, it is the connection, Check,
 * the three switches, Sync now, the state, and for dev the pairs. How it runs heads both, and the
 * Desk's work items by level follow. A 404 means the part is not on. The token goes out
 * on Connect and is never read back. Every section folds and keeps its fold.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { request } from './request.js';
import { ask } from './ask.js';
import { createStep, el } from './form-steps.js';
import { itemStones } from './work-items-surface.js';
import { openMenu } from './menu.js';

const RENEW_DAYS = 14;
/** Ronin's items, narrowest first: a change up this list is a widening. */
const REACH = { off: 0, epics: 1, all: 2 };
const DAY = 86_400_000;

/** The folded groups of the items table, by epic id ('none' for no epic), shared by both hosts. */
const FOLDED = new Set();
/** The items table's header filters: per column, the values not shown, shared by both hosts. */
const HIDDEN = new Map();

/** Whether an item goes up under a choice of switches, as the bridge decides: one from Jira by
 * Assigned items; one made in Ronin by Ronin's items, where 'epics' takes an epic or anything under one. */
export function goesUp(item, byId, choice) {
  if (item.created?.by?.startsWith('jira:')) return !!choice.assigned;
  if (choice.ronin !== 'epics') return choice.ronin === 'all';
  for (let at = item, seen = new Set(); at && !seen.has(at.id); seen.add(at.id), at = byId.get(at.parent)) if (at.level === 1) return true;
  return false;
}

/** The pairs table's filter, shared by both hosts. */
let PAIRS_FILTER = '';

/** The open Jira worksurfaces (and the panel), repainted when one changes what is on Jira or what goes up. */
const SURFACES = new Set();
function repaintSurfaces(except = null) {
  for (const surface of SURFACES) if (!surface.el.isConnected) SURFACES.delete(surface); else if (surface.el !== except) void surface.load();
}
const when = (iso) => (iso ? new Date(iso).toLocaleString() : t('jira.never', 'never'));

/** The Jira link for a key, or the key alone when there is no site yet. */
function jiraKey(site, key) {
  if (!site) return document.createTextNode(key);
  const link = el('a', null, key);
  link.href = `${site}/browse/${key}`; link.target = '_blank'; link.rel = 'noopener';
  return link;
}

/**
 * THE JIRA ITEMS TABLE — one renderer, two hosts (the panel's section and its own
 * worksurface). Rows run in the Work Items surface's order (itemStones' walk: each epic, its
 * items, their subtasks; then the items with no epic). An epic row heads its group; the
 * items with no epic in the Desk get a head row of their own. Children carry a tree mark.
 * A head row folds its group; the fold is remembered per epic. The Jira column says where each
 * item stands under `conn`'s choice (site, assigned, ronin): its key, goes up, or stays in Ronin.
 * Level, Kind, Status, Created in and Jira filter from their header: a menu under it with a
 * tick box by each of the column's values, ticked when shown. A shown item keeps its parents on as its context.
 */
export function renderJiraItems(items, conn) {
  const site = conn.site || '';
  const byId = new Map(items.map((item) => [item.id, item]));
  const parentOf = (item) => byId.get(item.parent) || null;
  const ancestors = (item) => {
    const up = [];
    for (let at = parentOf(item), seen = new Set(); at && !seen.has(at.id); seen.add(at.id), at = parentOf(at)) up.unshift(at);
    return up;
  };
  // The group is the top of the item's chain when that is an epic in the Desk, else "no epic".
  const groupOf = (item) => { const top = ancestors(item)[0] ?? item; return top.level === 1 ? top.id : 'none'; };
  // What a filterable column says of an item: the value its menu shows or hides.
  const VALUE = {
    level: (item) => String(item.level),
    kind: (item) => item.kind,
    status: (item) => item.status || '—',
    created: (item) => (item.created?.by?.startsWith('jira:') ? 'Jira' : 'Ronin'),
    jira: (item) => (item.external?.jira ? t('jira.on_jira', 'on Jira') : goesUp(item, byId, conn) ? t('jira.goes_up', 'goes up') : t('jira.stays', 'stays in Ronin')),
  };
  const shows = (item) => Object.entries(VALUE).every(([key, value]) => !HIDDEN.get(key)?.has(value(item)));
  const kept = new Set();
  for (const item of items.filter(shows)) for (const at of [item, ...ancestors(item)]) kept.add(at.id);
  // In itemStones' order, each epic's rows together and every item with no epic after them, under one head.
  const stones = itemStones(items).map((stone) => stone.item);
  const order = [...stones.filter((item) => groupOf(item) !== 'none'), ...stones.filter((item) => groupOf(item) === 'none')].filter((item) => kept.has(item.id));
  // Last among its siblings in the order: no later row shares its parent.
  const last = (item) => !order.slice(order.indexOf(item) + 1).some((other) => other.parent === item.parent && byId.has(item.parent));
  const mark = (item) => {
    const up = ancestors(item);
    if (!up.length) return '';
    return up.slice(1).map((at) => (last(at) ? '    ' : '│   ')).join('') + (last(item) ? '└── ' : '├── ');
  };
  const COLUMNS = [['level', t('jira.col_level', 'Level')], ['kind', t('jira.col_kind_only', 'Kind')], [null, t('jira.col_id', 'Ronin')], [null, t('jira.col_title', 'Title')],
    ['status', t('jira.col_status_only', 'Status')], ['created', t('jira.col_created', 'Created in')], [null, t('jira.col_holders', 'Holders')], ['jira', t('jira.col_key', 'Jira')]];
  const wrap = el('div', 'tj-table-wrap');
  const table = el('table', 'tj-table jira-items');
  const head = el('tr');
  // A filter changes the rows in this host; the other host reads it on its next load.
  const repaint = () => host.replaceWith(renderJiraItems(items, conn));
  const filter = (key, word) => {
    const button = el('button', 'jira-filter', `${word} ▾`);
    button.type = 'button';
    const hidden = HIDDEN.get(key) ?? new Set();
    button.setAttribute('aria-pressed', String(hidden.size > 0));
    button.addEventListener('click', () => {
      const values = [...new Set(items.map(VALUE[key]))].sort();
      const toggle = (value, on) => { if (on) hidden.delete(value); else hidden.add(value); HIDDEN.set(key, hidden); repaint(); };
      const host = button.closest('.wk-surface') || document.body;
      const menu = openMenu({ anchor: button, host, title: word, groups: [
        { items: values.map((value) => ({ kind: 'check', label: value, checked: !hidden.has(value), run: (on) => toggle(value, on) })) },
      ] });
      // As narrow as its values, under the header's left edge.
      menu.el.classList.add('jira-filter-menu');
      menu.el.style.right = 'auto';
      menu.el.style.left = `${Math.max(6, Math.round(button.getBoundingClientRect().left - host.getBoundingClientRect().left))}px`;
    });
    return button;
  };
  for (const [key, word] of COLUMNS) { const th = el('th'); th.append(key ? filter(key, word) : word); head.append(th); }
  table.append(head);
  // A head row toggles its group's other rows; the chevron says which way.
  const heading = (row, id, first) => {
    const chev = el('span', 'jira-chev');
    const paint = () => {
      const folded = FOLDED.has(id);
      chev.textContent = folded ? '▸ ' : '▾ ';
      row.setAttribute('aria-expanded', String(!folded));
      for (const other of table.querySelectorAll(`tr[data-group="${CSS.escape(id)}"]:not(.jira-group)`)) other.hidden = folded;
    };
    const toggle = () => { if (FOLDED.has(id)) FOLDED.delete(id); else FOLDED.add(id); paint(); };
    first.prepend(chev);
    row.tabIndex = 0;
    row.addEventListener('click', (event) => { if (!event.target.closest('a')) toggle(); });
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
    return paint;
  };
  const heads = [];
  let group = null;
  for (const item of order) {
    const next = groupOf(item);
    // The items with no epic get one head row; an epic's own row heads its group.
    if (next === 'none' && group !== 'none') {
      const row = el('tr', 'jira-group');
      row.dataset.group = 'none';
      const cell = el('td', null, t('work_items.no_epic', 'No epic'));
      cell.colSpan = COLUMNS.length;
      row.append(cell);
      table.append(row);
      heads.push(heading(row, 'none', cell));
    }
    group = next;
    // An epic heads its group; a subtask reads quieter than the item it sits under.
    const row = el('tr', item.level === 1 ? 'jira-group' : item.level === -1 ? 'jira-sub' : '');
    row.dataset.group = next;
    const title = el('td', 'jira-title');
    title.append(el('span', 'jira-tree-mark', mark(item)), item.title || item.id);
    const holders = el('td');
    const [kind, name] = String(item.holder || '').split(':');
    if (kind === 'agent') { const agent = el('a', null, name); agent.href = `#/agent/${encodeURIComponent(name)}`; holders.append(agent); }
    else holders.textContent = item.holder || '—';
    const pair = item.external?.jira;
    const jira = el('td');
    jira.append(pair ? jiraKey(site, pair.key) : goesUp(item, byId, conn) ? t('jira.goes_up', 'goes up') : t('jira.stays', 'stays in Ronin'));
    row.append(el('td', null, String(item.level)), el('td', null, item.kind), el('td', null, item.id), title,
      el('td', null, item.status), el('td', null, item.created?.by?.startsWith('jira:') ? 'Jira' : 'Ronin'), holders, jira);
    table.append(row);
    if (item.level === 1) heads.push(heading(row, item.id, row.firstChild));
  }
  for (const paint of heads) paint();
  wrap.append(table);
  const on = items.filter((item) => item.external?.jira).length;
  const go = items.filter((item) => !item.external?.jira && goesUp(item, byId, conn)).length;
  const host = el('div', 'jira-items-host');
  const counts = t('jira.items_counts', '{on} on Jira · {go} to go · {stay} stay in Ronin', { on, go, stay: items.length - on - go });
  const filtered = items.length - kept.size;
  host.append(el('p', 'jira-read', filtered ? `${counts} · ${t('jira.items_filtered', '{n} hidden by a filter', { n: filtered })}` : counts), wrap);
  return host;
}

/** The table on its own worksurface, full width, placed from the panel's Open. */
export function createJiraItemsSurface(selected) {
  const { createSurface, createAction, createNotice } = WorkspaceKit.primitives;
  const label = t('jira.refresh', 'Refresh');
  const refresh = createAction({ label, size: 'compact', action: () => void load(true) });
  const surface = createSurface({ label: t('jira.items', 'Work items by level'), className: 'setup-surface jira-items-surface', actions: [refresh] });
  const notice = createNotice();
  /** Pressed, Refresh is busy at once and the line says it reads; on return, when it read or what failed. */
  async function load(pressed = false) {
    if (pressed) {
      refresh.el.textContent = t('jira.refreshing', 'Refreshing…'); refresh.setDisabled(true);
      notice.set('info', t('jira.refreshing_text', 'Reading the work items and the Jira connection again.'));
    }
    const campaign = encodeURIComponent(selected()?.id || '');
    const [conn, listed] = await Promise.all([
      request(`/api/jira/${campaign}`, { cache: 'no-store' }),
      request(`/api/work-items?campaign=${campaign}`, { cache: 'no-store' }),
    ]);
    if (pressed) {
      refresh.el.textContent = label; refresh.setDisabled(false);
      const failed = [conn, listed].find((result) => !result.ok);
      notice.set(failed ? 'failed' : 'success', failed ? failed.message : t('jira.refreshed', 'Refreshed at {at}.', { at: new Date().toLocaleTimeString() }));
    }
    // The same wrapper as the panel's, so the table reads at the same density in both hosts.
    const host = el('div', 'fs-steps jira-form');
    host.append(notice.el, renderJiraItems(listed.ok ? listed.data.items : [], conn.ok ? conn.data : {}));
    surface.content.replaceChildren(host);
  }
  return { el: surface.el, enter: () => { SURFACES.add({ el: surface.el, load }); void load(); } };
}

/**
 * THE JIRA PAIRS TABLE — one renderer, two hosts (the panel's Pairs section and its own
 * worksurface). One row per pair, filtered by key, id, title, status or holder; holders link
 * to their Agent; Re-sync calls `resync(id)` to read that pair in again.
 */
export function renderJiraPairs(snap, resync) {
  const { createAction, createField } = WorkspaceKit.primitives;
  const search = el('input');
  search.type = 'search'; search.placeholder = t('jira.filter', 'Filter: key, id, title, status, holder'); search.autocomplete = 'off'; search.spellcheck = false;
  search.value = PAIRS_FILTER;
  const wrap = el('div', 'tj-table-wrap');
  const table = el('table', 'tj-table jira-pairs');
  wrap.append(table);
  const paintRows = () => {
    const head = el('tr');
    for (const word of [t('jira.col_key', 'Jira'), t('jira.col_id', 'Ronin'), t('jira.col_title', 'Title'), t('jira.col_kind', 'Level · kind'), t('jira.col_started', 'Started in'), t('jira.col_status_only', 'Status'), t('jira.col_holders', 'Holders'), t('jira.col_flagged', 'Flagged'), t('jira.col_last_in', 'Last in'), t('jira.col_last_out', 'Last out'), t('jira.col_waiting', 'Waiting'), '']) head.append(el('th', null, word));
    table.replaceChildren(head);
    const needle = PAIRS_FILTER.toLowerCase();
    for (const pair of snap.pairs || []) {
      const text = [pair.key, pair.id, pair.title, pair.status, ...pair.holders].join(' ').toLowerCase();
      if (needle && !text.includes(needle)) continue;
      const row = el('tr');
      const holders = el('td');
      pair.holders.forEach((holder, i) => {
        if (i) holders.append(', ');
        const [kind, name] = holder.split(':');
        if (kind !== 'agent') { holders.append(holder); return; }
        const agent = el('a', null, name);
        agent.href = `#/agent/${encodeURIComponent(name)}`;
        holders.append(agent);
      });
      const again = createAction({ label: t('jira.resync', 'Re-sync'), size: 'compact', action: () => void resync(pair.id) });
      const cell = (content) => { const td = el('td'); td.append(content); return td; };
      row.append(cell(jiraKey(snap.site, pair.key)), el('td', null, pair.id), el('td', null, pair.title), el('td', null, `${pair.level} · ${pair.kind}`),
        el('td', null, pair.started === 'jira' ? 'Jira' : 'Ronin'), el('td', null, pair.status), holders,
        el('td', null, pair.flagged ? t('jira.flagged', 'Flagged') : ''), el('td', null, when(pair.lastIn)), el('td', null, when(pair.lastOut)), el('td', null, (pair.waiting || []).join(', ')), cell(again.el));
      table.append(row);
    }
  };
  search.addEventListener('input', () => { PAIRS_FILTER = search.value; paintRows(); });
  paintRows();
  const host = el('div', 'jira-pairs-host');
  host.append(createField({ label: t('jira.filter_label', 'Filter'), control: search }).el, wrap);
  return host;
}

/** The pairs table on its own worksurface, full width, placed from the panel's Open. */
export function createJiraPairsSurface(selected) {
  const { createSurface, createAction, createNotice } = WorkspaceKit.primitives;
  const refresh = createAction({ label: t('jira.refresh', 'Refresh'), size: 'compact', action: () => void load() });
  const surface = createSurface({ label: t('jira.pairs', 'Pairs'), className: 'setup-surface jira-pairs-surface', actions: [refresh] });
  const notice = createNotice();
  const api = (tail = '') => `/api/jira/${encodeURIComponent(selected()?.id || '')}${tail}`;
  const post = (tail) => request(api(tail), { method: 'POST' });
  async function resync(item) {
    notice.set('info', t('jira.syncing_one', 'Syncing {item} with Jira.', { item }));
    const result = await post(`/sync/${encodeURIComponent(item)}`);
    const problems = result.data?.problems ?? [];
    if (!result.ok && !problems.length) notice.set('failed', result.message);
    else notice.set(problems.length ? 'failed' : 'success', problems.length ? problems.join('\n') : t('jira.synced_one', '{item} synced.', { item }));
    await load();
    repaintSurfaces(surface.el);
  }
  async function load() {
    const conn = await request(api(), { cache: 'no-store' });
    // The same wrapper as the panel's, so the table reads at the same density in both hosts.
    const host = el('div', 'fs-steps jira-form');
    host.append(notice.el, renderJiraPairs(conn.ok ? conn.data : {}, resync));
    surface.content.replaceChildren(host);
  }
  return { el: surface.el, enter: () => { SURFACES.add({ el: surface.el, load }); void load(); } };
}

export function createJiraPanel(selected, { openItems = null, openPairs = null } = {}) {
  const { createSurface, createAction, createActionBar, createField, createMetadata, createNotice } = WorkspaceKit.primitives;
  const check = createAction({ label: t('jira.check', 'Check'), size: 'compact', action: () => void act('check') });
  const sync = createAction({ label: t('jira.sync_now', 'Sync now'), size: 'compact', kind: 'primary', action: () => void act('sync') });
  const surface = createSurface({ label: t('jira.title', 'Jira'), className: 'setup-surface jira-surface', actions: [check, sync] });
  surface.header?.el.classList.add('launch-form-head');
  const notice = createNotice();
  const form = el('div', 'fs-steps jira-form');
  surface.content.append(notice.el, form);

  /** The steps the user does in admin.atlassian.com and Jira (JIRA_CONNECT §2, steps 2–6), after finding the site and space. */
  const WALKTHROUGH = () => [
    t('jira.step_site', 'In Jira, open the space you want Ronin on. The address bar gives the Site URL (up to .atlassian.net); the space key is the short code before every work item number (KAN in KAN-1).'),
    t('jira.step_account', 'admin.atlassian.com › your organization › Directory › Service accounts › Create a service account. Any name, 6–30 characters. On Select app roles, give Jira the role User and leave every other app at None.'),
    t('jira.step_token', 'Open the account › Create credentials › API token. Any name; expiry up to 365 days. The Review page shows the expiry date: enter it below.'),
    t('jira.step_scopes', 'Scopes: read:jira-work, write:jira-work and read:jira-user. Create, copy, and paste the token below straight away. Scopes cannot be changed later; a missing one means a new token.'),
    t('jira.step_access', 'On a Free site, nothing to do. On a paid site, in the space: Space settings › Access, add the account as Member.'),
    t('jira.step_linking', 'In Jira: Settings › Work items › Work item linking › Activate, if it is off.'),
  ];
  let snap = null;
  let items = [];
  // Each section's fold, kept across repaints.
  const open = { how: true, before: true, connect: true, connection: true, renew: false, sync: true, items: false, pairs: false };
  /** A numbered section that folds; `meta` is the line it shows folded. */
  const section = (n, key, title, meta = '') => {
    const step = createStep({ n, key, title, onToggle: () => { open[key] = !open[key]; step.setCollapsed(!open[key], meta); } });
    step.setCollapsed(!open[key], meta);
    return step;
  };
  const read = (text) => el('p', 'jira-read', text);
  let renewShown = false;
  let paintItems = null;
  // The switches before Connect go out with it, as the bridge starts them: Ronin's items off,
  // so nothing made in Ronin goes up until the owner says the items are ready.
  const draft = { polling: true, assigned: true, ronin: 'off' };

  const campaign = () => selected()?.id || '';
  const api = (tail = '') => `/api/jira/${encodeURIComponent(campaign())}${tail}`;
  // A line where the owner pressed: what is running, then what came of it; it outlives the repaint.
  const said = {};
  const spots = {};
  const spot = (key) => {
    const line = createNotice();
    spots[key] = line;
    line.set(said[key]?.kind ?? '', said[key]?.text ?? '');
    return line.el;
  };
  const tell = (key, kind, text) => { said[key] = { kind, text }; spots[key]?.set(kind, text); };
  const byId = () => new Map(items.map((item) => [item.id, item]));
  /** How many items not on Jira go up under a choice. */
  const toGo = (choice) => { const map = byId(); return items.filter((item) => !item.external?.jira && goesUp(item, map, choice)).length; };

  const input = (type, placeholder = '') => {
    const node = el('input');
    node.type = type; node.placeholder = placeholder; node.autocomplete = 'off'; node.spellcheck = false;
    return node;
  };

  async function load() {
    if (!campaign()) return;
    const [result, listed] = await Promise.all([
      request(api(), { cache: 'no-store' }),
      request(`/api/work-items?campaign=${encodeURIComponent(campaign())}`, { cache: 'no-store' }),
    ]);
    snap = result.ok ? result.data : result.status === 404 ? { off: true } : { error: result.message };
    items = listed.ok ? listed.data.items : [];
    paint();
  }

  /** Busy at once where the owner pressed: the button says so, the line at `key` says what runs;
   *  on return the line says what came of it, and both hosts repaint. */
  async function run(key, action, busy, doing, call, done) {
    const label = action?.el.textContent;
    if (action) { action.el.textContent = busy; action.setDisabled(true); }
    tell(key, 'info', doing);
    const result = await call();
    const problems = result.data?.problems ?? [];
    if (!result.ok && !problems.length) tell(key, 'failed', result.message);
    else tell(key, problems.length ? 'failed' : 'success', problems.length ? problems.join('\n') : done);
    if (action) { action.el.textContent = label; action.setDisabled(false); }
    await load();
    repaintSurfaces(surface.el);
  }
  const post = (tail) => () => request(api(tail), { method: 'POST' });
  const put = (body) => () => request(api(), { method: 'PUT', json: body });

  function act(what, item = '') {
    if (what === 'check') {
      return run('sync', check, t('jira.checking', 'Checking…'), t('jira.checking_text', 'Checking the site, the account, the space and its permissions.'),
        post('/check'), t('jira.all_good', 'Every check passes.'));
    }
    if (item) return run('sync', null, '', t('jira.syncing_one', 'Syncing {item} with Jira.', { item }), post(`/sync/${encodeURIComponent(item)}`), t('jira.synced_one', '{item} synced.', { item }));
    return run('sync', sync, t('jira.syncing', 'Syncing…'), t('jira.syncing_text', 'Checking the space, reading Jira, sending what is waiting, then checking for deleted work items.'),
      post('/sync'), t('jira.synced', 'Synced.'));
  }

  /* ---- Not connected: the walkthrough, then the four fields ---- */
  function connectSteps() {
    const steps = section(2, 'before', t('jira.before', 'In Atlassian'));
    const list = el('ol', 'jira-walkthrough');
    for (const line of WALKTHROUGH()) list.append(el('li', 'jira-read', line));
    steps.body.append(read(t('jira.before_help', 'Keep this panel open while you make the account: the token goes straight into the field below.')), list);

    const fields = section(3, 'connect', t('jira.connect', 'Connect'));
    const site = input('text', 'https://your-site.atlassian.net');
    const space = input('text', 'KAN');
    const token = input('password');
    const expiry = input('date');
    // A Connect that stopped at Check keeps what was entered: the fields come back filled, the token aside.
    site.value = snap.site || ''; space.value = snap.space?.key || ''; expiry.value = snap.tokenExpiry || '';
    const go = createAction({ label: t('jira.connect', 'Connect'), size: 'compact', kind: 'primary', disabled: true, action: () => {
      void run('connect', go, t('jira.connecting', 'Connecting…'),
        t('jira.connecting_text', 'Checking the account, then sending {n} items, then the first read.', { n: toGo(draft) }),
        put({ site: site.value.trim(), space: space.value.trim(), token: token.value.trim(), expiry: expiry.value, ...draft }),
        t('jira.connected', 'Connected, and the first sync has run.'));
    } });
    const ready = () => go.setDisabled(![site, space, token, expiry].every((node) => node.value.trim()));
    for (const node of [site, space, token, expiry]) node.addEventListener('input', ready);
    if (snap.lastError) fields.body.append(createNotice({ kind: 'failed', message: snap.lastError }).el);
    fields.body.append(
      createField({ label: t('jira.site', 'Site URL'), control: site, description: t('jira.site_help', 'The address you open Jira at, up to .atlassian.net: https://your-site.atlassian.net. Copy it from any Jira page.') }).el,
      createField({ label: t('jira.space', 'Space key'), control: space, description: t('jira.space_help', 'The space’s short code, not its name: KAN in KAN-1. Also in Space settings › Details.') }).el,
      createField({ label: t('jira.token', 'API token'), control: token, description: t('jira.token_help', 'Kept by Ronin with Services; never shown again.') }).el,
      createField({ label: t('jira.expiry', 'Token expiry'), control: expiry, description: t('jira.expiry_help', 'No call returns it: the date from the Review page.') }).el,
      read(t('jira.connect_warning', 'Connect puts on the space, assigned to the account, what Ronin’s items says: nothing (Off), epics and everything under them, or every work item. Then, in Jira, assign one work item to the account and press Sync now.')),
      createActionBar({ actions: [go] }).el,
      spot('connect'),
    );
    return [steps.el, fields.el];
  }

  /* ---- Connected ---- */
  function connectionStep() {
    const step = section(2, 'connection', t('jira.connection', 'Connection'), `${snap.site} · ${snap.space?.key || ''}`);
    const days = snap.tokenExpiry ? Math.ceil((new Date(snap.tokenExpiry) - Date.now()) / DAY) : null;
    step.body.append(spot('connect'), createMetadata({ rows: [
      [t('jira.site', 'Site URL'), snap.site],
      [t('jira.space', 'Space key'), snap.space?.key],
      [t('jira.account', 'Account'), snap.account],
      [t('jira.expiry', 'Token expiry'), snap.tokenExpiry || '—'],
    ] }).el);
    const expiring = days !== null && days <= RENEW_DAYS;
    if (expiring) {
      step.body.append(createNotice({ kind: 'warning', message: t('jira.renew', 'The token expires in {n} days. Make a new one (steps 3–4), paste it here, then revoke the old one.', { n: Math.max(days, 0) }) }).el);
    }
    // Renewal: a new token and its date, and nothing else changes. Folded until it is due.
    // Due, it opens once; after that the owner's fold stands.
    if (expiring && !renewShown) { open.renew = true; renewShown = true; }
    const renewal = createStep({ key: 'renew', title: t('jira.replace_token', 'Replace token'), onToggle: () => { open.renew = !open.renew; renewal.setCollapsed(!open.renew, ''); } });
    const token = input('password');
    const expiry = input('date');
    const renew = createAction({ label: t('jira.replace_token', 'Replace token'), size: 'compact', disabled: true, action: () => void run('token', renew, t('jira.checking', 'Checking…'),
      t('jira.replacing_text', 'Checking the new token, then the first read.'), put({ token: token.value.trim(), expiry: expiry.value }), t('jira.token_replaced', 'Token replaced.')) });
    const ready = () => renew.setDisabled(!token.value.trim() || !expiry.value);
    token.addEventListener('input', ready); expiry.addEventListener('input', ready);
    renewal.body.append(
      createField({ label: t('jira.new_token', 'New API token'), control: token }).el,
      createField({ label: t('jira.expiry', 'Token expiry'), control: expiry }).el,
      createActionBar({ actions: [renew] }).el,
      spot('token'),
    );
    renewal.setCollapsed(!open.renew, '');
    const disconnect = createAction({ label: t('jira.disconnect', 'Disconnect'), size: 'compact', action: async () => {
      if (!confirm(t('jira.disconnect_confirm', 'Disconnect this Desk from Jira? Every pair drops; nothing is deleted on either side.'))) return;
      const result = await request(api(), { method: 'DELETE' });
      notice.set(result.ok ? 'success' : 'failed', result.ok ? t('jira.disconnected', 'Disconnected.') : result.message);
      await load();
      repaintSurfaces(surface.el);
    } });
    step.body.append(renewal.el, createActionBar({ actions: [disconnect] }).el);
    return step.el;
  }

  /** A failed sync says so in Jira's words, with what is waiting to go up; the next tick tries again. */
  function syncStep() {
    const step = section(3, 'sync', t('jira.sync', 'Sync'), `${t('jira.last_check', 'Last check')} · ${when(snap.lastCheck)}`);
    const waiting = (snap.pairs || []).filter((pair) => pair.waiting?.length);
    step.body.append(
      createMetadata({ rows: [
        [t('jira.last_check', 'Last check'), when(snap.lastCheck)],
        [t('jira.pair_count', 'Pairs'), String(snap.pairCount ?? 0)],
        [t('jira.waiting', 'Waiting to go up'), String(waiting.length)],
      ] }).el);
    step.body.append(spot('sync'));
    if (snap.lastError) step.body.append(createNotice({ kind: 'failed', message: `${t('jira.sync_failed', 'Sync failed')}: ${snap.lastError}` }).el);
    for (const pair of waiting) step.body.append(el('p', 'fs-step-help', `${pair.id} ${pair.key} · ${pair.waiting.join(', ')}`));
    return step.el;
  }

  /** For dev: the pairs table. Open places the same table on its own worksurface beside this one. */
  function pairsStep() {
    const step = section(5, 'pairs', t('jira.pairs', 'Pairs'), t('jira.pairs_n', '{n} pairs', { n: snap.pairCount ?? 0 }));
    if (openPairs) step.body.append(createActionBar({ actions: [createAction({ label: t('jira.open_pairs', 'Open'), size: 'compact', action: () => openPairs() })] }).el);
    step.body.append(renderJiraPairs(snap, (id) => act('sync', id)));
    return step.el;
  }

  /** What moves, and whether it is moving now. */
  function howStep() {
    const connected = snap.connected === true;
    const word = (on) => (on ? t('campaign_view.on', 'On') : t('campaign_view.off', 'Off'));
    const step = section(1, 'how', t('jira.how', 'How it runs'));
    const line = (name, state, text) => { const p = read(''); p.append(el('b', null, `${name} · ${state}`), ` — ${text}`); return p; };
    // How it runs is the three questions, always, each with its caption under it; the master
    // lives in Installations and stays a line. Before Connect they are a draft that rides the
    // Connect PUT; connected, a change PUTs.
    const both = [t('campaign_view.on', 'On'), t('campaign_view.off', 'Off')];
    const FIELDS = [
      { key: 'polling', label: t('jira.polling', 'Polling'), switch: both, text: t('jira.polling_text', 'Down, Jira → Ronin: Jira is read every minute while Ronin is open in a browser, hourly otherwise; off, only Sync now reads it.') },
      { key: 'assigned', label: t('jira.assigned', 'Assigned items'), switch: both, text: t('jira.assigned_text', 'Up, Ronin → Jira: changes to items that came from Jira go out to Jira; off, they stay in Ronin.') },
      // Ronin's items is a pick of three, not a switch: how much of what Ronin made goes up.
      { key: 'ronin', label: t('jira.ronin', 'Ronin’s items'), options: [
        { v: 'off', l: t('jira.ronin_off', 'Off'), sub: t('jira.ronin_off_sub', 'Nothing made in Ronin goes up.') },
        { v: 'epics', l: t('jira.ronin_epics', 'Under an epic'), sub: t('jira.ronin_epics_sub', 'Epics and everything under them go up; items with no epic stay in Ronin.') },
        { v: 'all', l: t('jira.ronin_all', 'All'), sub: t('jira.ronin_all_sub', 'Every item made in Ronin goes up.') },
      ], text: t('jira.ronin_text', 'Up, Ronin → Jira: items made in Ronin are created on Jira and their changes go out: none, those under an epic, or all. Widening it sends what newly qualifies, parents first.') },
    ];
    step.body.append(line(t('jira.how_master', 'Services › Jira'), word(!snap.off), t('jira.how_master_text', 'the master switch, in Installations; off, nothing moves.')));
    for (const { text, ...field } of FIELDS) {
      const one = ask([{ fields: [field] }], {
        value: { [field.key]: connected ? snap[field.key] : draft[field.key] }, density: 'tight',
        onChange: (value) => {
          const answer = field.switch ? value[field.key] === true : value[field.key];
          if (!connected) { draft[field.key] = answer; paintItems?.(); return; }
          // Widening Ronin's items sends what newly qualifies; the line says how many.
          const sends = field.key === 'ronin' && REACH[answer] > REACH[snap.ronin] ? toGo({ ...snap, ronin: answer }) : 0;
          void run(field.key, null, '', sends ? t('jira.widening_text', 'Saving, then sending {n} items.', { n: sends }) : t('jira.saving', 'Saving…'),
            put({ [field.key]: answer }), t('jira.saved', 'Saved.'));
        },
      });
      step.body.append(one.el, read(text), spot(field.key));
    }
    step.body.append(line(t('jira.how_sync', 'Sync now'), `${t('jira.last_check', 'Last check')} ${when(snap.lastCheck)}`, t('jira.how_sync_text', 'always reads: the space checked, one read, what is waiting sent, and the deleted-item check.')));
    return step.el;
  }

  /** The Desk's items by level. Not connected, what Connect will put on the space; connected,
   *  what is paired. Open places the same table on its own worksurface beside this one. */
  function itemsStep(n) {
    const paired = items.filter((item) => item.external?.jira).length;
    const step = section(n, 'items', t('jira.items', 'Work items by level'), t('jira.items_n', '{n} items · {p} paired', { n: items.length, p: paired }));
    step.body.append(read(snap.connected
      ? t('jira.items_connected', 'On Jira, the key; not yet, goes up if How it runs sends it, else stays in Ronin.')
      : t('jira.items_preview', 'What Connect will put on the space, assigned to the account, under How it runs as set now.')));
    if (openItems) step.body.append(createActionBar({ actions: [createAction({ label: t('jira.open_items', 'Open'), size: 'compact', action: () => openItems() })] }).el);
    // Before Connect the table follows the draft as it changes, without repainting the fields.
    const host = el('div');
    paintItems = () => host.replaceChildren(renderJiraItems(items, snap.connected ? snap : { site: snap.site, ...draft }));
    paintItems();
    step.body.append(host);
    return step.el;
  }

  function paint() {
    form.replaceChildren();
    const connected = snap?.connected === true;
    check.el.hidden = !connected; sync.el.hidden = !connected;
    check.setDisabled(false); sync.setDisabled(false);
    if (!snap) return;
    if (snap.off) {
      form.append(howStep(), read(t('jira.off', 'Services › Jira is off for this Desk. Turn it on in Installations › Ronin Services, then come back here.')));
      return;
    }
    if (snap.error) { notice.set('failed', snap.error); return; }
    // A file that has not passed Check keeps its switches; the draft starts from them.
    if (!connected && snap.ronin) Object.assign(draft, { polling: snap.polling, assigned: snap.assigned, ronin: snap.ronin });
    if (!connected) form.append(howStep(), ...connectSteps(), itemsStep(4));
    else form.append(howStep(), connectionStep(), syncStep(), itemsStep(4), pairsStep());
  }

  // The panel is a host too: a Re-sync on the pairs worksurface repaints it.
  return { el: surface.el, enter: () => { SURFACES.add({ el: surface.el, load }); notice.set('', ''); void load(); } };
}
