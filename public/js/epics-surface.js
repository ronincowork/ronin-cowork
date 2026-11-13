/* part of the ronin-cowork client — see js/README.md */
/**
 * THE EPICS WORKBENCH'S SURFACES (owner, 2026-11-02; KAN-187). Epics are work items, the level-1
 * parents (work-items.ts); every Epic is also a selector card.
 *
 * THE BOARD (owner, 2026-11-06, w334, w340): every Epic surface is `createEpicBoard`, borrowed
 * from the phalanx but its own: a row of stones across the top, one per Epic; the pressed one is
 * the Epic shown below (where it comes from and its holder, then its own details as the island's
 * bar, pressed open to its reading like any bar, its Status moved there: KAN-309, KAN-310), under
 * three ERABI questions, Assigned (Yes / No), Flagged (Yes / No; w409) and Status (the open ones on arrival); its items as the item island's bars
 * (tile-island.js itemBar) grouped by status. A stone switches the Epic on the same surface;
 * nothing opens another. The Epics workbench's Tilespace 1 starts on none picked; an Epic's
 * selector card, a dragged stone (`createEpicRecord`) and a Team's Epics card start on theirs.
 *
 * The Epics and their items are the store's pushed `epics` and `epicItems` (js/store.js;
 * KAN-190), narrowed to the Campaign this tab looks at (`createEpicsRead`). Nothing asks the
 * server on a push: the only request is an opened bar's whole reading (its status moves there),
 * the Epic's own bar included.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { request } from './request.js';
import { subscribe as hear } from './store.js';
import { SURFACE_DRAG } from './workbench.js';
import { WORKBENCH_TYPES } from './workbench-catalog.js';
import { openWorkspaceTab, reserveWorkspaceTab } from './workspace.js';
import { ask } from './ask.js';
import { holderWords } from './work-items-surface.js';
import { itemBar } from './tile-island.js';

/** The statuses in workflow order (Jira's, the store's default); a space's own extra names follow. */
export const STATUSES = ['To Do', 'In Progress', 'In Review', 'Done'];
export const statusesOf = (items) => [...STATUSES, ...new Set((items || []).map((item) => item.status).filter((status) => status && !STATUSES.includes(status)))];

/** The Epics of a reading: its level-1 items, by title. */
export const epicsOf = (items) => (items || []).filter((item) => item.level === 1)
  .sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id)));

/** Assigned: an Agent holds it. Unassigned: only a Team holds it, or nobody does. */
export const isAssigned = (item) => holderOfItem(item)?.kind === 'agent';

/** Who works an item: { kind: 'agent' | 'team', name }, or null when nobody holds it. */
export function holderOfItem(item) {
  const [kind, ...rest] = String(item?.holder || '').split(':');
  const name = rest.join(':');
  return (kind === 'agent' || kind === 'team') && name ? { kind, name } : null;
}

/** The bench's Epics and their items: the pushed `epics` and `epicItems` of the Campaign this
 * tab looks at (all, when none). Each `subscribe` hears them now and on every push that moved them. */
export function createEpicsRead(campaignId) {
  let pushed = [];
  let under = [];
  const mine = (item) => !campaignId() || item.campaign_id === campaignId();
  return {
    list: () => epicsOf(pushed.filter(mine)),
    items: (epicId) => under.filter((item) => item.epic === epicId)
      .sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id))),
    subscribe: (listener) => {
      const stopItems = hear('epicItems', (next) => { under = Array.isArray(next) ? next : []; listener(); });
      const stopEpics = hear('epics', (next) => { pushed = Array.isArray(next) ? next : []; listener(); });
      return () => { stopItems(); stopEpics(); };
    },
  };
}

/** The selector's Epics: one card each, drawn onto a tile as that Epic. */
export const epicOffers = (epicsRead) => epicsRead.list().map((epic) => ({ key: epic.id, label: epic.title || epic.id }));

const el = (tag, cls = '', text = '') => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text) out.textContent = text;
  return out;
};

/** Open the holder's own workbench in a new tab: an Agent's, or a Team's. */
function openHolder({ kind, name }) {
  const tab = reserveWorkspaceTab();
  return openWorkspaceTab(kind === 'team' ? 'team' : 'agent', name, tab);
}

/** An item's holder as a button that opens that Agent (or Team); a quiet word when nobody holds it. */
export function holderButton(item) {
  // Held by a Workspace (its Icebox, KAN-352): parked, not waiting to be given out; a quiet word.
  if (String(item?.holder || '').startsWith('workspace:')) return el('span', 'epic-holder is-none', holderWords(item.holder));
  const holder = holderOfItem(item);
  if (!holder) return el('span', 'epic-holder is-none', t('epics.unassigned', 'Unassigned'));
  const button = el('button', 'epic-holder', holderWords(holder)); // the one wording (w299): label only
  button.type = 'button';
  button.title = holder.kind === 'team' ? t('epics.open_team', 'Open this Team') : t('epics.open_agent', 'Open this Agent');
  button.addEventListener('click', () => openHolder(holder));
  return button;
}

/** The statuses the Status question picks on arrival: the open ones (owner, 2026-11-06, w334). */
export const OPEN_STATUSES = ['To Do', 'In Progress', 'In Review'];
/** Assigned, as the question asks it: 'yes', 'no', both or nothing picked (all). */
export const byAssigned = (items, picked = []) => (!picked.length || picked.length === 2 ? items
  : items.filter((item) => isAssigned(item) === picked.includes('yes')));
/** Flagged, as the question asks it (owner, 2026-11-11, w409): 'yes', 'no', both or nothing picked (all). */
export const byFlagged = (items, picked = []) => (!picked.length || picked.length === 2 ? items
  : items.filter((item) => Boolean(item.flagged) === picked.includes('yes')));
/** The Status question's pick: nothing picked is every status. */
export const byStatus = (items, picked = []) => (picked.length ? items.filter((item) => picked.includes(item.status)) : items);

/**
 * ONE EPIC'S ITEMS (owner, 2026-11-06, w334): three questions in ERABI (ask.js) — Assigned (Yes /
 * No), Flagged (Yes / No; w409) and Status, the open ones picked on arrival — under the Epic's own bar (KAN-309), which
 * opens to its reading as any bar does (KAN-310) — then the items as the island's bars
 * (tile-island.js itemBar) going down the page, grouped by status in workflow order. A Subtask
 * whose Task is shown follows it as a slimmer bar. A bar pressed opens the item's reading under
 * it (work-items-surface.js renderItemDetail: its status to move, comments, a box to comment);
 * pressed again it folds. Built once; a push repaints only the bars it moved (KAN-412) and leaves the questions alone.
 */
function epicItems(epicId, { epicsRead }) {
  return createItemBoard({
    head: () => epicsRead.list().find((row) => row.id === epicId),
    every: () => epicsRead.items(epicId),
    cards: () => request(`/api/work-items/${encodeURIComponent(epicId)}/cards`, { cache: 'no-store' }).then((result) => (result.ok ? result.data.cards || [] : null)),
    empty: t('epics.no_items', 'No work items under this Epic yet.'),
  });
}

/**
 * THE ITEMS BOARD (KAN-459): one Epic's items above, and the same board for any other set of
 * items — a tile's More detail (tilehead.js openItemsBoard) shows its Agent's on it. `every()`
 * is the items now; `head()` an item whose own bar heads them (the Epic), or none; `cards()` the
 * bars' words (objective, last comment), a promise of rows or null, asked again when an item moves.
 */
export function createItemBoard({ every: everyNow, head = () => null, cards: readCards = null, empty = '' }) {
  let assigned = [];
  let flagged = [];
  let statuses = [...OPEN_STATUSES];
  const open = new Set();
  const root = el('div', 'epic-items');
  const questions = ask([{ fields: [
    { key: 'assigned', label: t('epics.assigned', 'Assigned'), blank: t('epics.all', 'All'), many: true, options: [
      { v: 'yes', l: t('epics.yes', 'Yes') }, { v: 'no', l: t('epics.no', 'No') },
    ] },
    { key: 'flagged', label: t('epics.flagged', 'Flagged'), blank: t('epics.all', 'All'), many: true, options: [
      { v: 'yes', l: t('epics.yes', 'Yes') }, { v: 'no', l: t('epics.no', 'No') },
    ] },
    { key: 'status', label: t('epics.status', 'Status'), blank: t('epics.all', 'All'), many: true,
      options: STATUSES.map((status) => ({ v: status, l: status })) },
  ] }], { value: { assigned, flagged, status: statuses }, density: 'tight', onChange: ({ assigned: a, flagged: f, status: st }) => {
    assigned = (a || []).map(String);
    flagged = (f || []).map(String);
    statuses = (st || []).map(String);
    paint();
  } });
  const groups = el('div', 'epic-groups');
  // The Epic's own bar (KAN-309, KAN-310): its details as the island's bar reads any item; pressed,
  // it opens its reading under it as an item's bar does, its Status to move there.
  const detail = el('div', 'epic-detail');
  root.append(detail, questions.el, groups);

  // What a bar says beyond its row (w418): the objective cut short; on this board nothing more (KAN-429).
  // The push is rows only; the picked Epic's bodies are read once it shows, and again when a push
  // moves any of its items.
  let cards = new Map();
  let asked = '';
  const withCard = (item) => ({ ...item, ...(cards.get(item.id) || {}) });
  function askCards(epic, every) {
    if (!readCards) return;
    const sig = [epic, ...every].filter(Boolean).map((item) => `${item.id}@${item.moved || ''}`).join(' ');
    if (sig === asked) return;
    asked = sig;
    void readCards(every).then((rows) => {
      if (!rows || asked !== sig || !root.isConnected) return;
      cards = new Map(rows.map((card) => [card.id, card]));
      paint();
    });
  }

  /** An opened bar's reading, from the item's whole read (the push is slim). */
  function reading(item, { children = true, onClose = null } = {}) {
    const host = el('div', 'epic-reading');
    host.dataset.item = item.id;
    void request(`/api/work-items/${encodeURIComponent(item.id)}`, { cache: 'no-store' }).then(async (result) => {
      if (!host.isConnected) return;
      if (!result.ok) { host.append(el('p', 'epic-empty', result.message || '')); return; }
      const { renderItemDetail, holderOf } = await import('./work-items-surface.js');
      const whole = result.data.item;
      renderItemDetail(host, whole, { holder: holderOf({ ...whole, held_by: result.data.held_by }), heldBy: result.data.held_by, history: false,
        children: children && Array.isArray(result.data.children) ? result.data.children : [], // an Epic's are the board below
        openChild: (child) => { open.add(child.id); paint(); }, onClose });
    });
    return host;
  }

  // ONE ITEM MOVES, ONE BAR CHANGES (owner, 2026-11-12, KAN-412): the kit's keyed list
  // (WorkspacePrimitives.createKeyedList). One bar per item, kept between pushes, repaints only
  // itself; a bar moves between groups only when its status moves; an opened reading is never
  // rebuilt, and nothing is touched when nothing under this Epic moved.
  const { createKeyedList } = WorkspaceKit.primitives;
  const bars = createKeyedList({ create: (first) => {
    let node = null;
    let host = null;
    let shown = '';
    const update = ({ item, sub, subtasks, children }) => {
      const holder = holderOfItem(item);
      const card = withCard(item);
      const now = JSON.stringify([card, sub, subtasks, holder]);
      if (now !== shown) {
        shown = now;
        const fresh = itemBar(card, { sub, subtasks, lean: true, extra: [holder ? holderWords(holder) : t('epics.unassigned', 'Unassigned')],
          onPress: () => { if (!open.delete(item.id)) open.add(item.id); paint(); } });
        node?.replaceWith(fresh);
        node = fresh;
      }
      // Open, the reading takes the bar's place (KAN-431): the bar hides, the reading's head closes it.
      const isOpen = open.has(item.id);
      node.setAttribute('aria-expanded', String(isOpen));
      node.hidden = isOpen;
      if (isOpen) host ??= reading(item, { children, onClose: () => { open.delete(item.id); paint(); if (node.isConnected) node.focus(); } });
      else { host?.remove(); host = null; }
    };
    update(first);
    return { nodes: () => (host ? [node, host] : [node]), update };
  } });
  const groupList = createKeyedList({ key: (row) => row.status, create: (first) => {
    if (first.empty) { const word = el('p', 'epic-empty', first.empty); return { nodes: () => [word], update() {} }; }
    const section = el('section', 'epic-group');
    section.dataset.status = first.status;
    const heading = el('h3', 'epic-group-heading');
    const list = el('div', 'epic-bars');
    section.append(heading, list);
    const update = ({ status, count, rows }) => {
      const words = t('epics.group', '{status} · {n}', { status, n: count });
      if (heading.textContent !== words) heading.textContent = words;
      bars.place(list, rows);
    };
    update(first);
    return { nodes: () => [section], update };
  } });

  function paint() {
    const epic = head();
    bars.place(detail, epic ? [{ id: epic.id, item: epic, children: false }] : []); // reading(epic, { children: false }): its children are the board below
    const every = everyNow();
    askCards(epic, every);
    const items = byStatus(byFlagged(byAssigned(every, assigned), flagged), statuses);
    const shown = new Set(items.map((item) => item.id));
    const folded = (item) => item.level === -1 && item.parent && shown.has(item.parent);
    const subsOf = (item) => items.filter((one) => one.level === -1 && one.parent === item.id);
    const sections = [];
    for (const status of statusesOf(items)) {
      const at = items.filter((item) => item.status === status && !folded(item));
      if (!at.length) continue;
      const count = at.reduce((n, item) => n + 1 + subsOf(item).length, 0); // what this group draws: a Subtask counts under its Task
      sections.push({ status, count, rows: at.flatMap((item) => [{ id: item.id, item, subtasks: subsOf(item).length },
        ...subsOf(item).map((one) => ({ id: one.id, item: one, sub: true }))]) });
    }
    if (!every.length) sections.push({ status: '!none', empty });
    else if (!items.length) sections.push({ status: '!picked', empty: t('epics.none_picked', 'No items for what Assigned, Flagged and Status pick.') });
    groupList.set(groups, sections);
    bars.sweep();
  }
  return { el: root, paint, destroy: () => { questions.destroy(); bars.destroy(); groupList.destroy(); } };
}

/**
 * THE EPICS BOARD (owner, 2026-11-06, w334, w340): every Epic surface. A row of stones across
 * the top, one per Epic (its title, its Jira key or Ronin only, how many of its items are open);
 * the pressed one is the Epic below: its source line, then its items (epicItems). Another stone
 * pressed switches to that Epic here. `initial` is the Epic it starts on; with one Epic, that one.
 * A stone dragged into another tilespace places a board starting on that Epic (createEpicRecord).
 */
export function createEpicBoard({ epicsRead, header = true, initial = '' }) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('epics.title', 'Epics'), className: 'setup-surface epics-board', header });
  const strip = el('div', 'epic-strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', t('epics.title', 'Epics'));
  const below = el('div', 'epic-board-body');
  const board = el('div', 'epic-board');
  board.append(strip, below);
  out.content.append(board);
  let selected = initial;
  let view = null;
  let source = null;
  let drawn = '';
  let sourceSaid = '';

  function stone(epic) {
    const label = epic.title || epic.id;
    const openCount = epicsRead.items(epic.id).filter((item) => !STATUSES.slice(-1).includes(item.status)).length;
    const node = el('button', 'epic-stone');
    node.type = 'button';
    node.dataset.epic = epic.id;
    node.setAttribute('aria-pressed', String(epic.id === selected));
    node.append(el('span', 'epic-stone-label', label),
      el('span', 'epic-stone-meta', `${epic.external?.jira?.key || t('epics.ronin_only', 'Ronin only')} · ${t('epics.open_n', '{n} open', { n: openCount })}`));
    node.title = label;
    node.draggable = true;
    node.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type: WORKBENCH_TYPES.epicRecord, detail: { key: epic.id } }));
      event.dataTransfer.setData('text/plain', label);
      event.dataTransfer.effectAllowed = 'copy';
    });
    node.addEventListener('click', () => { if (epic.id !== selected) select(epic.id); });
    return node;
  }

  function select(id) {
    selected = id;
    view?.destroy();
    view = null;
    drawn = '';
    paint();
  }

  function paint() {
    const epics = epicsRead.list();
    // An Epic gone from a push that has Epics is let go; before the first push, the one to start on is kept.
    if (selected && epics.length && !epics.some((epic) => epic.id === selected)) { selected = ''; view?.destroy(); view = null; }
    if (!selected && epics.length === 1) selected = epics[0].id;
    const epic = epics.find((row) => row.id === selected);
    if (out.header) out.header.title.textContent = epic ? (epic.title || epic.id) : t('epics.title', 'Epics');
    const signature = JSON.stringify([selected, epics.map((epic) => [epic.id, epic.title, epic.external?.jira?.key,
      epicsRead.items(epic.id).filter((item) => item.status !== 'Done').length])]);
    if (signature !== drawn) {
      drawn = signature;
      strip.replaceChildren(...(epics.length ? epics.map(stone) : [el('p', 'epic-empty', t('epics.none', 'No Epics yet.'))]));
    }
    if (!epic) { below.replaceChildren(...(epics.length ? [el('p', 'epic-empty', t('epics.pick_epic', 'Pick an Epic to see its work items.'))] : [])); return; }
    if (!view) { source = el('div', 'epic-source'); sourceSaid = ''; view = epicItems(selected, { epicsRead }); below.replaceChildren(source, view.el); }
    const said = JSON.stringify([selected, epic.external?.jira?.key, epic.holder]);
    if (said !== sourceSaid) {
      sourceSaid = said;
      source.replaceChildren(el('span', '', epic.external?.jira?.key ? `Jira ${epic.external.jira.key}` : t('epics.ronin_only', 'Ronin only')), holderButton(epic));
    }
    view.paint();
  }
  let stop = null;
  return {
    el: out.el,
    show: () => { stop ??= epicsRead.subscribe(paint); paint(); },
    destroy: () => { stop?.(); stop = null; view?.destroy(); },
  };
}

/** One Epic's worksurface (its selector card, a dragged stone): the board, starting on that Epic. */
export const createEpicRecord = (key, options) => createEpicBoard({ ...options, initial: key });
