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
import { workbenchLaunchUrl } from './workspace.js';
import { ask } from './ask.js';
import { holderWords } from './work-items-surface.js';
import { itemBar } from './tile-island.js';
import { createPhalanx } from './phalanx.js';
import { S } from './state.js';
import { epicAttention, epicMoved, isOpenEpic, orderEpics } from './epic-stage.js';
import { counted, statusKey } from './item-lifecycle.js';
import { createProgress } from './epic-progress.js';
import { humanAge } from './work-record.js';
import { membersOfTeam, subscribe as hearTeams, teamsFromState } from './team-controller.js';
import { workspaces } from './teams-surface-rows.js';
import { createStep, readingRows } from './form-steps.js';
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

/**
 * LAUNCH (owner, 2026-11-23): an Epic's one Launch opens the Team working it in a new tab: the Agent
 * holding the Epic in tilespace 1 (the Team's lead when the Team itself holds it), this Epic in
 * tilespace 2. Nobody holding it, or an Agent in no Team: no Launch; the Epic's bar assigns it.
 */
function launchTeam(epic) {
  const holder = holderOfItem(epic);
  const team = holder?.kind === 'team' ? holder.name
    : holder ? teamsFromState().find((one) => one.name && membersOfTeam(one.name).some((member) => member.name === holder.name))?.name : '';
  if (!team) return null;
  const seats = { workspace2: { type: WORKBENCH_TYPES.epicRecord, key: epic.id },
    ...(holder.kind === 'agent' ? { workspace1: { type: WORKBENCH_TYPES.terminal, key: holder.name } } : {}) };
  return WorkspaceKit.primitives.createAction({ label: t('epics.launch', 'Launch'), launch: true, size: 'compact', className: 'epic-launch', action: () => {
    const url = workbenchLaunchUrl({ destination: 'team', param: team, mode: 'replace', state: { count: 2, selected: 'workspace1', seats } });
    if (url) window.open(url, '_blank', 'noopener');
  } }).el;
}

/**
 * THE EPICS BOARD (owner, 2026-11-06, w334, w340): every Epic surface. A row of stones across
 * the top, one per Epic (its title, its Jira key or Ronin only, how many of its items are open);
 * the pressed one is the Epic below: its source line, then its items (epicItems). Another stone
 * pressed switches to that Epic here. `initial` is the Epic it starts on; with one Epic, that one.
 * A stone dragged into another tilespace places a board starting on that Epic (createEpicRecord).
 *
 * ONE EPIC (owner, 2026-11-23) is this same board without the strip (`strip: false`): the Epics
 * phalanx's pressed stone and a placed Epic (createEpicRecord). An Epic has no page of its own; with
 * `launch`, its top line is the Launch to the Team working it (launchTeam), or nothing.
 */
export function createEpicBoard({ epicsRead, header = true, initial = '', strip: withStrip = true, launch = false }) {
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
  let drawn = '';
  let sourceSaid = '';
  // Each stone's progress: the same lifecycle line as the Epics phalanx's stones (KAN-785).
  const lines = new Map();
  const lineFor = (id) => { if (!lines.has(id)) lines.set(id, createProgress('line')); return lines.get(id); };

  function stone(epic) {
    const label = epic.title || epic.id;
    const openCount = epicsRead.items(epic.id).filter((item) => !STATUSES.slice(-1).includes(item.status)).length;
    const node = el('button', 'epic-stone');
    node.type = 'button';
    node.dataset.epic = epic.id;
    node.setAttribute('aria-pressed', String(epic.id === selected));
    node.append(el('span', 'epic-stone-label', splitItemTitle(label).shortTitle),
      el('span', 'epic-stone-meta', [epic.external?.jira?.key, t('epics.open_n', '{n} open', { n: openCount })].filter(Boolean).join(' · ')));
    const line = lineFor(epic.id);
    line.update(epic, epicsRead.items(epic.id));
    node.append(line.el);
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
    const { shortTitle } = splitItemTitle(epic ? (epic.title || epic.id) : '');
    if (out.header) out.header.title.textContent = epic ? shortTitle : t('epics.title', 'Epics');
    const signature = JSON.stringify([selected, epics.map((epic) => [epic.id, epic.title, epic.external?.jira?.key, epic.status, epic.holder,
      epicsRead.items(epic.id).map((item) => [item.status, item.level, item.flagged, item.holder])])]);
    if (withStrip && signature !== drawn) {
      drawn = signature;
      strip.replaceChildren(...(epics.length ? epics.map(stone) : [el('p', 'epic-empty', t('epics.none', 'No Epics yet.'))]));
    }
    if (!epic && !withStrip) { view?.destroy(); view = null; below.replaceChildren(el('p', 'epic-empty', t('epics.not_found', 'This Epic is not open here.'))); return; }
    if (!epic) { below.replaceChildren(...(epics.length ? [el('p', 'epic-empty', t('epics.pick_epic', 'Pick an Epic to see its work items.'))] : [])); return; }
    if (!view) { source = el('div', 'epic-source'); sourceSaid = ''; view = epicItems(selected, { epicsRead }); below.replaceChildren(source, view.el); }
    const said = JSON.stringify([selected, epic.holder, launch]);
    if (said !== sourceSaid) {
      sourceSaid = said;
      // Launch or nothing (owner, 23 Nov): no Jira key, no holder words here.
      const go = launch ? launchTeam(epic) : null;
      source.replaceChildren(...(go ? [go] : []));
      source.hidden = !go;
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

/** One Epic's worksurface (its selector card, a dragged stone): that Epic alone, with its Team's Launch
 * (none inside a Team's own workbench). */
export const createEpicRecord = (key, { epicsRead, launch = true }) => createEpicBoard({ epicsRead, initial: key, strip: false, launch });

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

/**
 * THE EPICS PHALANX (owner, 2026-11-22; w897): Layer 1. Every open Epic a stone (no Done Epics, no
 * Icebox): its title, its Jira key and when it last moved, ⚑ top right while anything in it is
 * flagged, its open item count small bottom right, its progress a colour line along the bottom edge
 * (epic-progress.js), pressed for the epic-stage and the counts. Ordered by orderEpics: flagged
 * first, then the most progressed; every stone the same height. A Workspace
 * question narrows them. A pressed stone shows that Epic's board beside the rail (createEpicBoard,
 * with its Team's Launch); a dragged one places it whole in another tilespace. New Epic is the
 * selector's pill (createNewEpic), not a stone.
 */
export function createEpicStones({ epicsRead, workbench = null, bare = false, emptyWords = '' }) {
  const { createSurface } = WorkspaceKit.primitives;
  // AN EMBEDDED CONSUMER (w900): a Team's or a Workspace's Epics take the stones bare (no surface
  // head, no Workspace question) and their own line when there are no Epics.
  const out = bare ? (() => { const node = el('div', 'epics-records epics-records-bare wk-surface-content'); return { el: node, content: node }; })()
    : createSurface({ label: t('epics.title', 'Epics'), className: 'setup-surface epics-records' });
  // ONE QUESTION, WORKSPACE (owner, 2026-11-23; the Teams stones' own, team-roster-surface.js): many-of,
  // blank All; it narrows the stones to the Epics the Teams of those Workspaces, or their Agents, hold.
  let roots = [];
  const filter = bare ? null : ask([{ fields: [
    { key: 'root', label: t('teams_surface.workspace', 'Workspace'), blank: t('teams_surface.all', 'All'), many: true, options: [] },
  ] }], { value: { root: roots }, density: 'tight', onChange: ({ root }) => { roots = (root || []).map(String); paint(); } });
  const inRoots = () => {
    if (!roots.length) return null;
    return new Set(teamsFromState().filter((team) => roots.includes(team.workspace)).flatMap((team) => (Array.isArray(team.epics) ? team.epics : [])));
  };
  const lines = new Map();
  const lineFor = (id) => { if (!lines.has(id)) lines.set(id, createProgress('line')); return lines.get(id); };
  // A STONE'S MARKS (owner, 2026-11-23): the lifecycle line along the bottom edge; ⚑ top right while
  // the Epic or anything under it is flagged and not Done (the Agent pill's flag); bottom right, small
  // and grey, how many of its items are not Done (the Epic's size). One node per Epic, kept (KAN-413).
  const marks = new Map();
  const marksFor = (epic, items) => {
    if (!marks.has(epic.id)) {
      const node = el('span', 'epic-stone-marks');
      const flag = el('span', 'epic-stone-flag', '⚑');
      flag.title = t('epics.flagged_title', 'Something here is flagged');
      const size = el('small', 'epic-stone-size');
      node.append(lineFor(epic.id).el, flag, size);
      marks.set(epic.id, { node, flag, size });
    }
    const one = marks.get(epic.id);
    const open = items.filter((item) => statusKey(item.status) !== 'done');
    one.flag.hidden = !(epic.flagged || open.some((item) => item.flagged));
    const n = String(open.filter(counted).length);
    if (one.size.textContent !== n) one.size.textContent = n;
    return one.node;
  };
  const stones = createPhalanx({
    className: 'epic-record-stones',
    renderDetail: (item, host) => {
      const one = createEpicBoard({ epicsRead, initial: item.id, strip: false, launch: true, header: false });
      host.append(one.el);
      one.show();
      return () => one.destroy();
    },
  });
  stones.mount(out.content, { before: filter ? [filter.el] : [] });
  const empty = el('p', 'epic-empty', emptyWords);
  empty.hidden = true;
  if (emptyWords) out.content.append(empty);
  function paint() {
    filter?.options('root', workspaces(teamsFromState()).map((root) => ({ v: root, l: root })));
    const picked = inRoots();
    const rows = orderEpics(epicsRead.list().filter((epic) => isOpenEpic(epic) && (!picked || picked.has(epic.id))).map((epic) => {
      const items = epicsRead.items(epic.id);
      const { score } = lineFor(epic.id).update(epic, items);
      // Flagged first, then the most progressed (orderEpics): the flag is what the stone shows.
      return { epic, items, score, attention: { flagged: epicAttention(items).flagged || Boolean(epic.flagged) }, moved: epicMoved(epic, items) };
    }));
    stones.setItems(rows.map(({ epic, items, moved }) => {
      const label = epic.title || epic.id;
      return { id: epic.id, label: splitItemTitle(label).shortTitle, state: movedWords(epic, moved), marker: marksFor(epic, items),
        className: 'epic-record-stone', draggable: true, events: dragEpic(epic, label) };
    }));
    empty.hidden = rows.length > 0;
    workbench?.refreshSelector?.(); // the selector's Epic cards follow the push
  }
  let stop = null;
  let stopTeams = null;
  return {
    el: out.el,
    show: () => { stop ??= epicsRead.subscribe(paint); stopTeams ??= hearTeams(paint); paint(); },
    destroy: () => { stop?.(); stop = null; stopTeams?.(); stopTeams = null; filter?.destroy(); stones.destroy?.(); },
  };
}

/** The priorities a new Epic may take: Jira's defaults (work-items.ts JIRA_NAMES), Medium the default. */
const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];

/**
 * NEW EPIC (owner, 2026-11-23): the New Epic pill's form, in the New Team and New Agent forms'
 * grammar (new-team-form.js): its head with Create, numbered steps under it. 1 Title and what done
 * looks like; 2 who holds it, a Team or one of its Agents, or nobody yet (the Epic's bar assigns it
 * later); 3 its details: Priority, and what it is (an Epic, with no Parent; its key the next
 * w-number on Create, or Jira's once paired). Create (or Ctrl/Cmd+Enter) makes it (POST
 * /api/work-items, kind Epic) and `onMade(id)` shows it in this tilespace.
 */
export function createNewEpic({ onMade = () => {} } = {}) {
  const { createSurface, createAction, createField, createNotice } = WorkspaceKit.primitives;
  const draft = { title: '', objective: '', holder: '', priority: 'Medium' };
  let busy = false;
  const create = createAction({ label: t('epics.create', 'Create'), size: 'compact', disabled: true, className: 'epic-new-create', action: () => void make() });
  const surface = createSurface({ label: t('epics.new', 'New Epic'), className: 'ntf-surface epic-new', actions: [create] });
  surface.header?.el.classList.add('launch-form-head');
  const notice = createNotice();
  const ready = () => create.setDisabled(busy || !draft.title.trim());

  // 1 · Title and goal.
  const stepTop = createStep({ n: 1, key: 'top', title: t('epics.new_title_goal', 'Title & goal') });
  const titleInput = el('input');
  titleInput.type = 'text';
  titleInput.placeholder = t('epics.new_title_placeholder', 'what this Epic delivers');
  titleInput.addEventListener('input', () => { draft.title = titleInput.value; ready(); });
  const goalInput = el('textarea');
  goalInput.rows = 4;
  goalInput.placeholder = t('epics.new_goal_placeholder', 'what done looks like, in your words');
  goalInput.addEventListener('input', () => { draft.objective = goalInput.value; });
  stepTop.body.append(createField({ label: t('epics.new_title', 'Title'), control: titleInput }).el,
    createField({ label: t('epics.new_goal', 'What done looks like'), control: goalInput }).el);

  // 2 · Who holds it: a Team first, then its Agents; nobody is fine.
  const stepWho = createStep({ n: 2, key: 'who', title: t('epics.assign_to', 'Assign to') });
  const holders = () => [
    ...teamsFromState().filter((team) => team.durable !== false && team.name && !team.holding).map((team) => ({ v: `team:${team.name}`, l: team.title || team.name, sub: t('epics.team', 'Team') })),
    ...(S.sessions || []).filter((one) => one.name).map((one) => ({ v: `agent:${one.name}`, l: one.name, sub: t('epics.agent', 'Agent') })),
  ];
  const who = ask([{ fields: [{ key: 'holder', label: t('epics.holder', 'Team or Agent'), blank: t('epics.nobody_yet', 'Nobody yet'), options: holders }] }],
    { value: { holder: draft.holder }, density: 'tight', onChange: ({ holder }) => { draft.holder = String(holder || ''); } });
  stepWho.body.append(who.el);

  // 3 · Details: its priority, and what it is.
  const stepDetails = createStep({ n: 3, key: 'details', title: t('epics.details', 'Details') });
  const priority = ask([{ fields: [{ key: 'priority', label: t('epics.priority', 'Priority'), options: PRIORITIES.map((v) => ({ v, l: v })) }] }],
    { value: { priority: draft.priority }, density: 'tight', onChange: ({ priority: next }) => { draft.priority = String(next || 'Medium'); } });
  stepDetails.body.append(priority.el, readingRows([
    [t('epics.kind', 'Kind'), t('epics.kind_epic', 'Epic')],
    [t('epics.key', 'Key'), t('epics.key_on_create', 'next w-number, given on Create')],
  ]));

  const form = el('div', 'ntf-form');
  form.append(stepTop.el, stepWho.el, stepDetails.el);
  form.addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void make(); } });
  surface.content.append(form, notice.el);

  async function make() {
    if (busy || !draft.title.trim()) return;
    busy = true;
    ready();
    const [kind, ...rest] = draft.holder.split(':');
    const name = rest.join(':');
    const result = await request('/api/work-items', { method: 'POST', json: { kind: 'Epic', title: draft.title.trim(), objective: draft.objective.trim(), priority: draft.priority,
      ...(kind === 'team' && name ? { team: name } : kind === 'agent' && name ? { session: name } : {}) } });
    busy = false;
    ready();
    notice.set(result.ok ? '' : 'failed', result.ok ? '' : result.message || t('epics.not_made', 'The Epic was not made.'));
    if (!result.ok) return;
    onMade(result.data.item?.id || '');
  }
  return { el: surface.el, show: () => { ready(); titleInput.focus(); }, destroy: () => { who.destroy(); priority.destroy(); } };
}
