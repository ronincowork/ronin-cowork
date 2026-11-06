/* part of the ronin-cowork client — see js/README.md */
/**
 * THE ITEM ISLAND (owner, 2026-11-04; w271 under KAN-32): a pill in the tile header for every
 * work item the Agent holds, gathered in one capsule like a phone's dynamic island.
 *
 * A pill carries no text: its kind's symbol (Jira's own: Epic, Story, Task, Bug, Feature,
 * Subtask), a dot for its status, and ⚑ when it is flagged. Its words (id, kind, status,
 * title) are its accessible name and its hover help. Pressed, the item's description opens in
 * the full overlay over the tile (tilehead.js openItem → work-items-surface.js renderItemDetail).
 *
 * The island rests in the header and moves only when asked (owner, 2026-11-04, w272: "this
 * assumes people are watching. they are not"): nothing drops or pulses on a change. The bar
 * brings it down under the header with the pills in a column, each one expanded to read
 * <kind symbol> <status> <dot> <flag> — the flag solid when flagged, its outline when not
 * (owner, 2026-11-04, KAN-238) — so the colours explain themselves. The bar again, or a
 * pill, puts it back. A pill pressed again closes its item.
 *
 * THE WIDE LIST (owner, 2026-11-06, w322): the fourth layer. Down, "More detail" turns the
 * column into bars across the tile, only as tall as the items: each bar the pill's head (symbol,
 * key, title, status, flag, hand-in), then the item's description, its last comment and a line
 * of facts (barFacts). A Subtask under its Task is a slimmer bar after it. A bar opens its item.
 *
 * THE HAND-IN MARK (docs/using-ronin/project-management.md, Three signals): beside the dot and the flag, an item In
 * Review carries the latest of its signals, "handed in" or "on dev", with how long ago, so a
 * tile says what its Agent just handed in. At rest it is the mark alone; down, its words.
 *
 * The items are the tile's `tegami.items` — the work record on the pushed home row, which the
 * tile re-reads on every push (tile.js refreshTegami). Nothing here asks the server.
 */
import { t } from './lexicon.js';
import { humanAge } from './work-record.js';

const SVG = 'http://www.w3.org/2000/svg';
const FLAG_MARK = '⚑'; // work-items-surface.js's mark; not imported: that module reaches the kit, which reaches the tile
const FLAG_OUTLINE = '⚐'; // the flag's silhouette: an expanded pill's, when its item is not flagged

/** The kind's name, as Jira spells its types, folded to one of the symbols below. */
export function kindKey(kind) {
  const k = String(kind || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (k === 'newfeature') return 'feature';
  return ['epic', 'story', 'task', 'bug', 'feature', 'subtask'].includes(k) ? k : 'other';
}

/** The status's family, which picks the dot's colour: Jira's three, plus In Review. */
export function statusKey(status) {
  const s = String(status || '').toLowerCase();
  if (/done|closed|resolved|complete/.test(s)) return 'done';
  if (/review/.test(s)) return 'review';
  if (/progress|doing|active/.test(s)) return 'progress';
  return 'todo';
}

/** Jira's type symbols: a rounded square in the kind's colour with its white mark. */
const MARKS = {
  epic: [['path', { d: 'M9.2 2.6 4.6 9h3.1l-1 4.4 4.7-6.5H8.3z', class: 'ink' }]],
  story: [['path', { d: 'M5 3.4h6v9.2L8 10.4l-3 2.2z', class: 'ink' }]],
  task: [['path', { d: 'm4.4 8.2 2.5 2.5 4.7-5', class: 'stroke' }]],
  bug: [['circle', { cx: 8, cy: 8, r: 3.2, class: 'ink' }]],
  feature: [['path', { d: 'M8 4.2v7.6M4.2 8h7.6', class: 'stroke' }]],
  subtask: [['rect', { x: 3.6, y: 3.6, width: 5.6, height: 5.6, rx: 0.8, class: 'stroke thin' }], ['rect', { x: 6.8, y: 6.8, width: 5.6, height: 5.6, rx: 0.8, class: 'ink' }]],
  other: [['circle', { cx: 8, cy: 8, r: 2, class: 'ink' }]],
};

export function kindMark(kind) {
  const key = kindKey(kind);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'item-kind');
  svg.dataset.kind = key;
  const ground = document.createElementNS(SVG, 'rect');
  for (const [name, value] of Object.entries({ x: 0, y: 0, width: 16, height: 16, rx: 3, class: 'ground' })) ground.setAttribute(name, String(value));
  svg.append(ground);
  for (const [tag, attrs] of MARKS[key]) {
    const part = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attrs)) part.setAttribute(name, String(value));
    svg.append(part);
  }
  return svg;
}

const HANDIN_MARK = '↑';

/** An item In Review's latest signal (6a): 'handed' at its last hand-in, or 'dev' once a
 * promotion put that hand-in on dev; null when it is not In Review or was never handed in. */
export function handInSignal(item) {
  if (statusKey(item?.status) !== 'review') return null;
  const last = (Array.isArray(item.hand_ins) && item.hand_ins.at(-1)) || item.handed_in || null;
  if (!last?.at) return null;
  return item.on_dev?.at && item.on_dev.at >= last.at ? { kind: 'dev', at: item.on_dev.at } : { kind: 'handed', at: last.at };
}

/** The mark's words: "handed in 2h", "on dev 5m". */
export function handInWords(signal, now = Date.now()) {
  if (!signal) return '';
  const ago = humanAge(Math.max(0, now - Date.parse(signal.at) || 0));
  return `${signal.kind === 'dev' ? t('island.on_dev', 'on dev') : t('island.handed_in', 'handed in')} ${ago}`;
}

/** "1 subtask", "3 subtasks" (w323): the bar's facts and the pill's hover say it the same. */
export const subtaskWords = (n) => (n === 1 ? t('island.subtask', '1 subtask') : t('island.subtasks', '{n} subtasks', { n }));

/** An item's newest comment, or null. */
export const lastComment = (item) => (Array.isArray(item?.comments) && item.comments.at(-1)) || null;

/** A wide bar's facts line (owner, 2026-11-06, w322): what sizes the item up at a glance, the
 *  empty ones left out — its kind in words, the Task it is under, its open Subtasks here, attachments,
 *  how many comments, and when it last moved. Ages are worked out when the bar is drawn. */
export function barFacts(item, subtasks = 0, now = Date.now()) {
  const age = (at) => humanAge(Math.max(0, now - Date.parse(at) || 0));
  const comments = Array.isArray(item?.comments) ? item.comments.length : 0;
  const attachments = Array.isArray(item?.attachments) ? item.attachments.length : 0;
  const moved = (Array.isArray(item?.trail) && item.trail.at(-1)?.at) || item?.created?.at || '';
  return [
    item?.kind || '', // owner, 2026-11-06 (w325): its kind in words, the symbols not yet known; priority is rarely set
    item?.parent ? t('island.under', 'under {id}', { id: item.parent }) : '',
    subtasks ? subtaskWords(subtasks) : '',
    attachments ? t('island.attachments', '{n} attached', { n: attachments }) : '',
    comments === 1 ? t('island.comment', '1 comment') : comments ? t('island.comments', '{n} comments', { n: comments }) : '',
    moved ? t('island.moved', 'moved {age} ago', { age: age(moved) }) : '',
  ].filter(Boolean);
}

/** What a pill says when read aloud or hovered: its words, since it shows none. */
export const pillWords = (item) => [item.id, item.kind, item.status, item.flagged ? t('work_items.flagged', 'flagged') : '', handInWords(handInSignal(item)), item.title]
  .filter(Boolean).join(' · ');

/**
 * The island for one tile. `open(item)` opens an item over the tile and `shut(id)` closes it;
 * `isOpen(id)` says whether that item is the one open. `update(session, items)` is called on
 * every reading of the work record and redraws only when what it shows moved.
 */
export function createItemIsland({ open, shut, isOpen }) {
  const el = document.createElement('div');
  el.className = 'item-island';
  el.hidden = true;
  el.dataset.state = 'rest';
  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'item-island-grip';
  const pills = document.createElement('div');
  pills.className = 'item-island-pills';
  pills.setAttribute('role', 'group');
  pills.setAttribute('aria-label', t('island.items', 'Work items held'));
  // THE WIDE LIST (owner, 2026-11-06, w322): the fourth layer, between the dropped list and one
  // item's reading. The tile's width, only as tall as its items: a bar per item saying what it
  // is — its description, its last comment, its facts — in the dropped list's style.
  const bars = document.createElement('div');
  bars.className = 'item-island-bars';
  bars.setAttribute('role', 'group');
  bars.setAttribute('aria-label', t('island.items', 'Work items held'));
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'item-island-more';
  el.append(grip, pills, bars, more);

  let session = null;
  let drawn = '';
  let items = [];

  /** 'rest' in the header, 'down' the column of pills, 'wide' the bars. */
  const place = (state) => {
    const to = state === true ? 'down' : state || 'rest';
    el.dataset.state = to;
    grip.setAttribute('aria-expanded', String(to !== 'rest'));
    grip.title = to !== 'rest' ? t('island.up', 'Put the work items back in the header') : t('island.down', 'Show the work items with their status');
    grip.setAttribute('aria-label', grip.title);
    more.textContent = to === 'wide' ? t('island.narrow', 'Less detail') : t('island.wide', 'More detail');
    // Wide, it stops short of the tile's foot and scrolls past that.
    const body = el.closest('.tile')?.querySelector('.tile-body');
    el.style.maxHeight = to === 'wide' && body ? `${Math.max(120, body.clientHeight - 16)}px` : '';
  };
  place('rest');
  grip.addEventListener('click', () => place(el.dataset.state === 'rest' ? 'down' : 'rest'));
  more.addEventListener('click', () => place(el.dataset.state === 'wide' ? 'down' : 'wide'));
  el.addEventListener('keydown', (event) => { if (event.key === 'Escape' && el.dataset.state !== 'rest') { place('rest'); grip.focus(); } });

  /** A Subtask whose Task is also on the island is not a pill of its own: it is under its
   *  Task (owner, 2026-11-05), whose pill carries the Subtask mark and their count, and whose
   *  reading lists them. */
  const folded = (list) => {
    const shown = new Set(list.map((item) => item.id));
    const under = new Map();
    const top = [];
    for (const item of list) {
      if (kindKey(item.kind) === 'subtask' && item.parent && shown.has(item.parent)) under.set(item.parent, (under.get(item.parent) || 0) + 1);
      else top.push(item);
    }
    return { top, under };
  };
  let under = new Map();

  function pill(item) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'item-pill';
    node.dataset.item = item.id;
    node.dataset.status = statusKey(item.status);
    if (item.flagged) node.dataset.flagged = 'true';
    node.title = pillWords(item);
    node.setAttribute('aria-label', node.title);
    // Every part is drawn; the words, and the flag's outline, show only when the island is down.
    const words = Object.assign(document.createElement('span'), { className: 'item-pill-words', textContent: item.status || '' });
    const dot = document.createElement('span');
    dot.className = 'item-pill-status';
    const flag = Object.assign(document.createElement('span'), { className: 'item-pill-flag', textContent: item.flagged ? FLAG_MARK : FLAG_OUTLINE });
    node.append(kindMark(item.kind), words, dot, flag);
    const signal = handInSignal(item);
    if (signal) {
      node.dataset.handin = signal.kind;
      const handin = Object.assign(document.createElement('span'), { className: 'item-pill-handin' });
      handin.title = new Date(signal.at).toLocaleString();
      handin.append(HANDIN_MARK, Object.assign(document.createElement('span'), { className: 'item-pill-handin-words', textContent: ` ${handInWords(signal)}` }));
      node.append(handin);
    }
    const count = under.get(item.id) || 0;
    if (count) {
      const mark = Object.assign(document.createElement('span'), { className: 'item-pill-subtasks' });
      mark.append(kindMark('Subtask'), String(count));
      node.dataset.subtasks = String(count);
      node.title = `${node.title} · ${subtaskWords(count)}`;
      node.setAttribute('aria-label', node.title);
      node.append(mark);
    }
    node.addEventListener('click', () => press(item));
    return node;
  }

  /** One press opens the item, the same press again closes it; either puts the island back. */
  function press(item) {
    place('rest');
    if (isOpen(item.id)) shut(item.id);
    else open(items.find((one) => one.id === item.id) || item);
  }

  const span = (className, textContent = '') => Object.assign(document.createElement('span'), { className, textContent });

  /** A wide bar: the pill's head (symbol, key, title, status, flag, hand-in), then what the item
   *  is, its last comment, and its facts. A Subtask under a Task here is a slimmer bar after it. */
  function bar(item, sub = false) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = sub ? 'item-bar item-bar-sub' : 'item-bar';
    node.dataset.item = item.id;
    node.dataset.status = statusKey(item.status);
    if (item.flagged) node.dataset.flagged = 'true';
    node.setAttribute('aria-label', pillWords(item));
    const head = span('item-bar-head');
    const state = span('item-bar-state');
    state.append(span('item-pill-status'), span('item-bar-status', item.status || ''));
    if (item.flagged) state.append(span('item-pill-flag', FLAG_MARK));
    const signal = handInSignal(item);
    if (signal) { node.dataset.handin = signal.kind; state.append(span('item-bar-handin', `${HANDIN_MARK} ${handInWords(signal)}`)); }
    head.append(kindMark(item.kind), span('item-bar-id', item.id), span('item-bar-title', item.title || ''), state);
    node.append(head);
    if (!sub && item.objective) node.append(span('item-bar-objective', item.objective));
    const said = !sub && lastComment(item);
    if (said) {
      const line = span('item-bar-comment');
      line.append(span('item-bar-who', `@${said.by} · ${humanAge(Math.max(0, Date.now() - Date.parse(said.at) || 0))}`), ` ${said.text}`);
      node.append(line);
    }
    const facts = barFacts(item, sub ? 0 : under.get(item.id) || 0);
    if (!sub && facts.length) node.append(span('item-bar-facts', facts.join(' · ')));
    node.addEventListener('click', () => press(item));
    return node;
  }

  function update(name, list) {
    const next = Array.isArray(list) ? list : [];
    if (name !== session) { session = name; drawn = ''; place(false); }
    items = next;
    el.hidden = !session || !next.length;
    const signature = JSON.stringify(next.map((item) => [item.id, item.kind, item.status, !!item.flagged, item.title, item.parent, handInSignal(item),
      item.objective, item.priority, lastComment(item)?.at, item.comments?.length, item.attachments?.length, item.trail?.length]));
    if (signature === drawn) return;
    drawn = signature;
    const shape = folded(next);
    under = shape.under;
    pills.replaceChildren(...shape.top.map(pill));
    bars.replaceChildren(...shape.top.flatMap((item) => [bar(item),
      ...(under.get(item.id) ? next.filter((one) => one.parent === item.id && kindKey(one.kind) === 'subtask').map((one) => bar(one, true)) : [])]));
  }

  return { el, update };
}
