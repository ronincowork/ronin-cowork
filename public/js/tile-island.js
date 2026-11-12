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
import { WorkspacePrimitives } from './workspace-primitives.js';

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

/** One 16×16 mark: a ground and its white parts. The kinds stand on a rounded square, the
 *  Agent's stance on a circle, so the Agent never reads as one of its items (w331). */
function mark(cls, data, ground, parts) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', cls);
  Object.assign(svg.dataset, data);
  for (const [tag, attrs] of [ground, ...parts]) {
    const part = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attrs)) part.setAttribute(name, String(value));
    svg.append(part);
  }
  return svg;
}

export function kindMark(kind) {
  const key = kindKey(kind);
  return mark('item-kind', { kind: key }, ['rect', { x: 0, y: 0, width: 16, height: 16, rx: 3, class: 'ground' }], MARKS[key]);
}

/**
 * THE STANCE MARK (owner, 2026-11-06, w331, with cmux and chat_read): left of the island's bar,
 * only what the owner would act on. The home row's stance (rireki's reading, per harness)
 * folds to three: a dialog is open (question), the turn ended (your turn), it stopped on an
 * interruption or a failed tool (stopped). Working, replying and unknown show nothing: the
 * transcript's dots already say busy.
 */
export function stanceKey(stance) {
  if (stance === 'asking') return 'question';
  if (stance === 'awaiting_you') return 'turn';
  if (stance === 'interrupted' || stance === 'error') return 'stopped';
  return '';
}

const STANCE_MARKS = {
  question: [['path', { d: 'M6 6.2a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.3v.5', class: 'stroke thin' }], ['circle', { cx: 8, cy: 11.8, r: 0.9, class: 'ink' }]],
  turn: [['path', { d: 'M6 4.6 9.4 8 6 11.4', class: 'stroke' }]],
  stopped: [['path', { d: 'M8 4.2v4.6', class: 'stroke' }], ['circle', { cx: 8, cy: 11.6, r: 1, class: 'ink' }]],
};

export function stanceMark(stance) {
  const key = stanceKey(stance);
  return key ? mark('item-stance', { stance: key }, ['circle', { cx: 8, cy: 8, r: 8, class: 'ground' }], STANCE_MARKS[key]) : null;
}

/** The stance in words: the row's when down, the mark's name and hover help at rest. */
export function stanceWords(stance) {
  return {
    asking: t('island.stance_asking', 'Question: a dialog is waiting for you'),
    awaiting_you: t('island.stance_awaiting_you', 'Your turn: the turn ended'),
    interrupted: t('island.stance_interrupted', 'Stopped: interrupted'),
    error: t('island.stance_error', 'Stopped: a tool failed'),
  }[stance] || '';
}

/** What this harness cannot report, from the home row's `stance_reports` (the stances its
 *  adapter supplies); '' when the row does not say. */
export function stanceGaps(reports) {
  if (!Array.isArray(reports)) return '';
  const names = { asking: t('island.gap_question', 'a question'), awaiting_you: t('island.gap_turn', 'the end of a turn'),
    interrupted: t('island.gap_interrupted', 'an interruption'), error: t('island.gap_error', 'a failed tool') };
  const missing = Object.keys(names).filter((one) => !reports.includes(one)).map((one) => names[one]);
  return missing.length ? t('island.stance_gaps', 'This harness cannot report {list}', { list: missing.join(', ') }) : '';
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
export const lastComment = (item) => (Array.isArray(item?.comments) && item.comments.at(-1)) || item?.said || null;

/** A wide bar's facts line (owner, 2026-11-06, w322): what sizes the item up at a glance, the
 *  empty ones left out — its kind in words, the Task it is under, its open Subtasks here, attachments,
 *  how many comments, and when it last moved. Ages are worked out when the bar is drawn. */
export function barFacts(item, subtasks = 0, now = Date.now()) {
  const age = (at) => humanAge(Math.max(0, now - Date.parse(at) || 0));
  const comments = Array.isArray(item?.comments) ? item.comments.length : Number(item?.comment_count) || 0;
  const attachments = Array.isArray(item?.attachments) ? item.attachments.length : 0;
  const moved = (Array.isArray(item?.trail) && item.trail.at(-1)?.at) || item?.moved || item?.created?.at || '';
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

const span = (className, textContent = '') => Object.assign(document.createElement('span'), { className, textContent });

/**
 * AN ITEM BAR (w322; shared with the Epics worksurface, w334): the pill's head (symbol, key,
 * title, status, flag, hand-in), then what the item is: its description, its last comment and
 * a line of facts. A slim item (the Epics push) carries `said`, `comment_count` and `moved` in
 * place of its comments and trail. `sub` draws a Subtask's slimmer bar; `extra` adds facts
 * (the Epics worksurface's holder) after the kind; `onPress` is what the bar opens.
 */
/* `lean` (owner, 2026-11-12, KAN-429; the Epics board): the objective only — no hand-in mark, no
 * comment line; everything else is in the opened item. Every line wraps in full, never "…". */
export function itemBar(item, { sub = false, subtasks = 0, extra = [], onPress, lean = false } = {}) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = [sub ? 'item-bar item-bar-sub' : 'item-bar', lean ? 'item-bar-lean' : ''].filter(Boolean).join(' ');
  node.dataset.item = item.id;
  node.dataset.status = statusKey(item.status);
  if (item.flagged) node.dataset.flagged = 'true';
  node.setAttribute('aria-label', pillWords(item));
  const head = span('item-bar-head');
  const state = span('item-bar-state');
  state.append(span('item-pill-status'), span('item-bar-status', item.status || ''));
  if (item.flagged) state.append(span('item-pill-flag', FLAG_MARK));
  const signal = !lean && handInSignal(item);
  if (signal) { node.dataset.handin = signal.kind; state.append(span('item-bar-handin', `${HANDIN_MARK} ${handInWords(signal)}`)); }
  head.append(kindMark(item.kind), span('item-bar-id', item.jira || item.id), span('item-bar-title', item.title || ''), state);
  node.append(head);
  if (!sub && item.objective) node.append(span('item-bar-objective', item.objective));
  const said = !sub && !lean && lastComment(item);
  if (said) {
    const line = span('item-bar-comment');
    line.append(span('item-bar-who', `@${said.by} · ${humanAge(Math.max(0, Date.now() - Date.parse(said.at) || 0))}`), ` ${said.text}`);
    node.append(line);
  }
  const facts = barFacts(item, subtasks);
  if (extra.length) facts.splice(facts.length && item?.kind ? 1 : 0, 0, ...extra.filter(Boolean));
  if (!sub && facts.length) node.append(span('item-bar-facts', facts.join(' · ')));
  if (onPress) node.addEventListener('click', onPress);
  return node;
}

/**
 * The island for one tile. `open(item)` opens an item over the tile (a promise, settled once it
 * shows: the pill is busy until then, w416) and `shut(id)` closes it;
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
  // The Agent's stance (w331): its mark left of the bar at rest; down or wide, the top row in words.
  const stance = document.createElement('span');
  stance.className = 'item-island-stance';
  stance.hidden = true;
  el.append(stance, grip, pills, bars, more);

  let session = null;
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
    node.addEventListener('click', () => void press(item));
    return markBusy(node, item.id);
  }

  /** One press opens the item, the same press again closes it; either puts the island back.
   *  THE PRESS ANSWERS AT ONCE (w416): while the item is on its way (its read, ~0.1 s) its pill and
   *  bar are busy, greyed with a progress cursor, and further presses on it are ignored. */
  const loading = new Set();
  const markBusy = (node, id) => { if (loading.has(id)) node.setAttribute('aria-busy', 'true'); else node.removeAttribute('aria-busy'); return node; };
  const busy = (id) => { for (const node of el.querySelectorAll('[data-item]')) if (node.dataset.item === id) markBusy(node, id); };
  async function press(item) {
    if (loading.has(item.id)) return;
    place('rest');
    if (isOpen(item.id)) { shut(item.id); return; }
    loading.add(item.id);
    busy(item.id);
    try { await open(items.find((one) => one.id === item.id) || item); } finally { loading.delete(item.id); busy(item.id); }
  }

  /** A wide bar: the pill's head (symbol, key, title, status, flag, hand-in), then what the item
   *  is, its last comment, and its facts. A Subtask under a Task here is a slimmer bar after it. */
  const bar = (item, sub = false) => markBusy(itemBar(item, { sub, subtasks: sub ? 0 : under.get(item.id) || 0, onPress: () => void press(item) }), item.id);

  /** What one item's pill and bar show: a row redraws only when this moves. */
  const shows = ({ item, count = 0, sub = false }) => JSON.stringify([item.id, item.kind, item.status, !!item.flagged, item.title, item.parent, handInSignal(item),
    item.objective, item.priority, lastComment(item)?.at, item.comments?.length, item.attachments?.length, item.trail?.length, count, sub]);
  const { createKeyedList } = WorkspacePrimitives;
  const pillList = createKeyedList({ shows, draw: ({ item }) => pill(item) });
  const barList = createKeyedList({ shows, draw: ({ item, sub }) => bar(item, !!sub) });

  let stanceDrawn = '';
  /** The stance, redrawn only when it or what the harness reports moved. */
  function drawStance({ stance: now = '', reports } = {}) {
    const sig = JSON.stringify([now, reports]);
    if (sig === stanceDrawn) return;
    stanceDrawn = sig;
    const shown = stanceMark(now);
    stance.hidden = !shown;
    stance.dataset.stance = stanceKey(now);
    if (!shown) { stance.replaceChildren(); stance.removeAttribute('title'); stance.removeAttribute('aria-label'); return; }
    const words = stanceWords(now);
    stance.title = [words, stanceGaps(reports)].filter(Boolean).join(' · ');
    stance.setAttribute('aria-label', stance.title);
    stance.replaceChildren(shown, Object.assign(document.createElement('span'), { className: 'item-island-stance-words', textContent: words }));
  }

  /** `live` is the home row's { stance, reports } (tilehead.js), read off the same push. */
  function update(name, list, live = {}) {
    const next = Array.isArray(list) ? list : [];
    if (name !== session) { session = name; stanceDrawn = ''; place(false); }
    items = next;
    drawStance(live);
    // An Agent holding nothing still shows its island when it needs you.
    el.hidden = !session || (!next.length && stance.hidden);
    more.hidden = !next.length;
    // ONE ITEM MOVES, ONE PILL AND ONE BAR CHANGE (KAN-413): the kit's keyed list. Each pill and
    // bar compares what it shows and redraws only itself; the rest stay the nodes they were.
    const shape = folded(next);
    under = shape.under;
    pillList.set(pills, shape.top.map((item) => ({ id: item.id, item, count: under.get(item.id) || 0 })));
    barList.set(bars, shape.top.flatMap((item) => [{ id: item.id, item, count: under.get(item.id) || 0 },
      ...(under.get(item.id) ? next.filter((one) => one.parent === item.id && kindKey(one.kind) === 'subtask').map((one) => ({ id: one.id, item: one, sub: true })) : [])]));
  }

  return { el, update };
}
