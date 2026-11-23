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
import { createPhalanx } from './phalanx.js';
import { S } from './state.js';
import { epicAttention, epicMoved, isOpenEpic, orderEpics } from './epic-stage.js';
import { attentionWords } from './item-lifecycle.js';
import { createProgress } from './epic-progress.js';
import { humanAge } from './work-record.js';
import { teamsFromState } from './team-controller.js';
import { splitItemTitle } from './item-title.js';

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
export const epicOffers = (epicsRead) => epicsRead.list().filter(isOpenEpic).map((epic) => {
  const title = epic.title || epic.id;
  return { key: epic.id, label: splitItemTitle(title).shortTitle, title };
}); // no Done Epics, no Icebox (owner, 2026-11-22)

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

/** An opened bar's reading, from the item's whole read (the push is slim): its status to move,
 * comments, a box to comment. `children` false leaves out its children (an Epic's are the board). */
export function itemReading(item, { children = true, onClose = null, openChild = null } = {}) {
  const host = el('div', 'epic-reading');
  host.dataset.item = item.id;
  void request(`/api/work-items/${encodeURIComponent(item.id)}`, { cache: 'no-store' }).then(async (result) => {
    if (!host.isConnected) return;
    if (!result.ok) { host.append(el('p', 'epic-empty', result.message || '')); return; }
    const { renderItemDetail, holderOf } = await import('./work-items-surface.js');
    const whole = result.data.item;
    renderItemDetail(host, whole, { holder: holderOf({ ...whole, held_by: result.data.held_by }), heldBy: result.data.held_by, history: false,
      children: children && Array.isArray(result.data.children) ? result.data.children : [], openChild, onClose });
  });
  return host;
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

  const reading = (item, { children = true, onClose = null } = {}) => itemReading(item, { children, onClose, openChild: (child) => { open.add(child.id); paint(); } });

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

/** Launch (w899): one Epic's own page, `#/epic/<id>`, in this tab; Ctrl/Cmd/Shift in another. */
function launchAction(epicId) {
  return WorkspaceKit.primitives.createAction({ label: t('epics.launch', 'Launch'), launch: true, size: 'compact', className: 'epic-launch', action: (event) => {
    if (event?.metaKey || event?.ctrlKey || event?.shiftKey || !S.workspace) window.open(epicAddress(epicId), '_blank', 'noopener');
    else S.workspace.navigate('epic', { param: epicId });
  } }).el;
}

/**
 * THE EPICS BOARD (owner, 2026-11-06, w334, w340): every Epic surface. A row of stones across
 * the top, one per Epic (its title, its Jira key or Ronin only, how many of its items are open);
 * the pressed one is the Epic below: its source line, then its items (epicItems). Another stone
 * pressed switches to that Epic here. `initial` is the Epic it starts on; with one Epic, that one.
 * A stone dragged into another tilespace places a board starting on that Epic (createEpicRecord).
 *
 * ONE EPIC (owner, 2026-11-23; w899) is this same board without the strip (`strip: false`): the
 * Epics phalanx's pressed stone, a dragged stone (createEpicRecord) and `#/epic/<id>` all show
 * it, the first two with Launch in the source line to the Epic's own page.
 */
export function createEpicBoard({ epicsRead, header = true, initial = '', strip: withStrip = true, launch = false, holder = true, onTitle = () => {} }) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('epics.title', 'Epics'), className: 'setup-surface epics-board', header });
  const strip = el('div', 'epic-strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', t('epics.title', 'Epics'));
  const below = el('div', 'epic-board-body');
  const board = el('div', 'epic-board');
  board.append(...(withStrip ? [strip] : []), below);
  out.content.append(board);
  let selected = initial;
  let view = null;
  let source = null;
  const continuation = el('p', 'item-title-continuation');
  let drawn = '';
  let sourceSaid = '';

  function stone(epic) {
    const label = epic.title || epic.id;
    const openCount = epicsRead.items(epic.id).filter((item) => !STATUSES.slice(-1).includes(item.status)).length;
    const node = el('button', 'epic-stone');
    node.type = 'button';
    node.dataset.epic = epic.id;
    node.setAttribute('aria-pressed', String(epic.id === selected));
    node.append(el('span', 'epic-stone-label', splitItemTitle(label).shortTitle),
      el('span', 'epic-stone-meta', [epic.external?.jira?.key, t('epics.open_n', '{n} open', { n: openCount })].filter(Boolean).join(' · ')));
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
    if (withStrip && selected && epics.length && !epics.some((epic) => epic.id === selected)) { selected = ''; view?.destroy(); view = null; }
    if (withStrip && !selected && epics.length === 1) selected = epics[0].id;
    const epic = epics.find((row) => row.id === selected);
    const { shortTitle, longTitle } = splitItemTitle(epic ? (epic.title || epic.id) : '');
    if (out.header) out.header.title.textContent = epic ? shortTitle : t('epics.title', 'Epics');
    if (epic) onTitle(shortTitle);
    const signature = JSON.stringify([selected, epics.map((epic) => [epic.id, epic.title, epic.external?.jira?.key,
      epicsRead.items(epic.id).filter((item) => item.status !== 'Done').length])]);
    if (withStrip && signature !== drawn) {
      drawn = signature;
      strip.replaceChildren(...(epics.length ? epics.map(stone) : [el('p', 'epic-empty', t('epics.none', 'No Epics yet.'))]));
    }
    if (!epic && !withStrip) { view?.destroy(); view = null; below.replaceChildren(el('p', 'epic-empty', t('epics.not_found', 'This Epic is not open here.'))); return; }
    if (!epic) { below.replaceChildren(...(epics.length ? [el('p', 'epic-empty', t('epics.pick_epic', 'Pick an Epic to see its work items.'))] : [])); return; }
    if (!view) { source = el('div', 'epic-source'); sourceSaid = ''; view = epicItems(selected, { epicsRead }); below.replaceChildren(continuation, source, view.el); }
    if (continuation.textContent !== longTitle) continuation.textContent = longTitle;
    continuation.hidden = !longTitle;
    const said = JSON.stringify([selected, epic.external?.jira?.key, epic.holder]);
    if (said !== sourceSaid) {
      sourceSaid = said;
      // The Jira key only when it has one; the holder only outside its own Team (owner, 23 Nov).
      source.replaceChildren(...(epic.external?.jira?.key ? [el('span', '', `Jira ${epic.external.jira.key}`)] : []),
        ...(holder ? [holderButton(epic)] : []), ...(launch ? [launchAction(selected)] : []));
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

/** One Epic's worksurface (its selector card, a dragged stone): that Epic alone, with Launch (w899). */
export const createEpicRecord = (key, { epicsRead }) => createEpicBoard({ epicsRead, initial: key, strip: false, launch: true });

/** The Epic's own route (w899): `#/epic/<id>`; Launch follows it in this tab, Ctrl/Cmd/Shift in another. */
export const epicAddress = (id) => `#/epic/${encodeURIComponent(id)}`;
const dragEpic = (epic, label) => ({ dragstart: (event) => {
  event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type: WORKBENCH_TYPES.epicRecord, detail: { key: epic.id } }));
  event.dataTransfer.setData('text/plain', label);
  event.dataTransfer.effectAllowed = 'copy';
} });

/** A stone's last line: its Jira key (when it has one) and when it last moved. */
function movedWords(epic, moved) {
  const ms = Date.now() - Date.parse(moved);
  const when = Number.isFinite(ms) ? t('epics.moved_ago', 'moved {age} ago', { age: humanAge(Math.max(0, ms)) }) : '';
  return [epic.external?.jira?.key || '', when].filter(Boolean).join(' · ');
}

const NEW_EPIC = '!new-epic';

/**
 * THE EPICS PHALANX (owner, 2026-11-22; w897): Layer 1. Every open Epic a stone (no Done Epics, no
 * Icebox): its title, what needs the person (Needs review, Flagged, Work to assign; absent when
 * none), its Jira key and when it last moved, its progress a colour line along the bottom edge
 * (epic-progress.js), pressed for the epic-stage and the counts. Ordered by orderEpics: those
 * needing the person first, then the most progressed. A pressed stone shows that Epic beside the
 * rail (createEpicOne, with Launch); a dragged one places it whole in another tilespace. The last
 * stone, New Epic, opens an Epic's own shape to fill in (createNewEpic).
 */
export function createEpicStones({ epicsRead, workbench = null, bare = false, emptyWords = '', newEpic = true }) {
  const { createSurface } = WorkspaceKit.primitives;
  // AN EMBEDDED CONSUMER (w900): a Team's Epics view inside its own surface takes the stones bare (no
  // surface head), its own line when it has no Epics, and no New Epic stone (one Team never makes an
  // Epic for another from here).
  const out = bare ? (() => { const node = el('div', 'epics-records epics-records-bare wk-surface-content'); return { el: node, content: node }; })()
    : createSurface({ label: t('epics.title', 'Epics'), className: 'setup-surface epics-records' });
  const lines = new Map();
  const lineFor = (id) => { if (!lines.has(id)) lines.set(id, createProgress('line')); return lines.get(id); };
  let made = '';
  const stones = createPhalanx({
    className: 'epic-record-stones',
    renderDetail: (item, host) => {
      const one = item.id === NEW_EPIC
        ? createNewEpic({ onMade: (id) => { made = id; paint(); } })
        : createEpicBoard({ epicsRead, initial: item.id, strip: false, launch: true, header: false, holder: !bare });
      host.append(one.el);
      one.show();
      return () => one.destroy();
    },
  });
  stones.mount(out.content);
  const empty = el('p', 'epic-empty', emptyWords);
  empty.hidden = true;
  if (emptyWords) out.content.append(empty);
  function paint() {
    const rows = orderEpics(epicsRead.list().filter(isOpenEpic).map((epic) => {
      const items = epicsRead.items(epic.id);
      const { score } = lineFor(epic.id).update(epic, items);
      return { epic, score, attention: epicAttention(items), moved: epicMoved(epic, items) };
    }));
    stones.setItems([...rows.map(({ epic, attention, moved }) => {
      const label = epic.title || epic.id;
      const needs = attentionWords(attention);
      return { id: epic.id, label: splitItemTitle(label).shortTitle, ...(needs ? { secondary: needs } : {}), state: movedWords(epic, moved), marker: lineFor(epic.id).el,
        className: 'epic-record-stone', attrs: { title: label }, draggable: true, events: dragEpic(epic, label) };
    }), ...(newEpic ? [{ id: NEW_EPIC, glyph: '+', label: t('epics.new', 'New Epic'), className: 'epic-record-new' }] : [])]);
    empty.hidden = rows.length > 0;
    // The Epic just made opens in New Epic's place once its push has it.
    if (made && rows.some((row) => row.epic.id === made)) { const id = made; made = ''; stones.select(id); }
    workbench?.refreshSelector?.(); // the selector's Epic cards follow the push
  }
  let stop = null;
  return {
    el: out.el,
    show: () => { stop ??= epicsRead.subscribe(paint); paint(); },
    destroy: () => { stop?.(); stop = null; stones.destroy?.(); },
  };
}

/**
 * NEW EPIC (owner, 2026-11-22; w897): an Epic's own shape, its bar, to fill in: the title, what done
 * looks like, and one ERABI question, who holds it (a Team or an Agent). Create makes the Epic
 * (POST /api/work-items, kind Epic) and `onMade(id)` opens it.
 */
export function createNewEpic({ onMade = () => {} } = {}) {
  const bar = el('section', 'team-bar epic-bar epic-new');
  const head = el('div', 'team-bar-head');
  const title = el('input', 'epic-new-title');
  title.type = 'text';
  title.placeholder = t('epics.new_title', 'Epic title');
  title.setAttribute('aria-label', t('epics.new_title', 'Epic title'));
  const create = WorkspaceKit.primitives.createAction({ label: t('epics.create', 'Create'), size: 'compact', className: 'epic-new-create' }).el;
  const actions = el('div', 'team-bar-actions');
  actions.append(create);
  head.append(title, actions);
  const goal = el('textarea', 'epic-new-goal');
  goal.rows = 3;
  goal.placeholder = t('epics.new_goal', 'What done looks like, in your words');
  goal.setAttribute('aria-label', t('epics.new_goal', 'What done looks like, in your words'));
  let holder = '';
  const holders = () => [
    ...teamsFromState().filter((team) => team.durable !== false && team.name).map((team) => ({ v: `team:${team.name}`, l: team.title || team.name, word: t('epics.team', 'Team') })),
    ...(S.sessions || []).filter((one) => one.name).map((one) => ({ v: `agent:${one.name}`, l: one.name, word: t('epics.agent', 'Agent') })),
  ];
  const question = ask([{ fields: [{ key: 'holder', label: t('epics.assign_to', 'Assign to'), blank: t('epics.pick', 'Pick'), options: holders() }] }],
    { value: { holder }, density: 'tight', onChange: ({ holder: next }) => { holder = String(next || ''); } });
  const said = el('p', 'epic-bar-said');
  said.hidden = true;
  bar.append(head, goal, question.el, said);
  create.addEventListener('click', async () => {
    const [kind, ...rest] = holder.split(':');
    const name = rest.join(':');
    const missing = !title.value.trim() ? t('epics.need_title', 'Give the Epic a title.') : !name ? t('epics.need_holder', 'Pick who holds it.') : '';
    said.hidden = !missing;
    said.textContent = missing;
    if (missing) return;
    create.disabled = true;
    const result = await request('/api/work-items', { method: 'POST', json: { kind: 'Epic', title: title.value.trim(), objective: goal.value.trim(),
      ...(kind === 'team' ? { team: name } : { session: name }) } });
    create.disabled = false;
    if (!result.ok) { said.hidden = false; said.textContent = result.message || t('epics.not_made', 'The Epic was not made.'); return; }
    onMade(result.data.item?.id || '');
  });
  const root = el('div', 'epic-new-page');
  root.append(bar);
  return { el: root, show: () => title.focus(), destroy: () => question.destroy() };
}

/** The Epic's own route (w899): one Epic filling the page, under the Epics appearance. */
export function createEpicRoute() {
  const host = el('div', 'epic-route');
  const epicsRead = createEpicsRead(() => '');
  let one = null;
  let id = '';
  let words = '';
  const retitle = (next) => {
    if (next === words) return;
    words = next;
    S.refreshWorkspaceHeader?.();
    S.workspace?.refreshTitle?.();
  };
  return {
    el: host,
    title: () => words || id,
    place: () => words || id,
    enter: (context) => {
      if (context.param !== id || !one) {
        one?.destroy();
        id = context.param;
        words = '';
        one = createEpicBoard({ epicsRead, initial: id, strip: false, onTitle: retitle });
        host.replaceChildren(one.el);
      }
      one.show();
    },
    leave: () => {},
    destroy: () => { one?.destroy(); one = null; },
  };
}
