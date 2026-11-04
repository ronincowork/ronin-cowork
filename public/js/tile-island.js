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
 * The island rests in the header. When a held item arrives, moves status or is flagged, it
 * comes down over the top of the tile for a moment and goes back; a pointer on it holds it
 * down. The grip hides it and recalls it (remembered per Agent on this device); hidden, a
 * change lights the grip instead of dropping.
 *
 * The items are the tile's `tegami.items` — the work record on the pushed home row, which the
 * tile re-reads on every push (tile.js refreshTegami). Nothing here asks the server.
 */
import { t } from './lexicon.js';

const SVG = 'http://www.w3.org/2000/svg';
const FLAG_MARK = '⚑'; // work-items-surface.js's mark; not imported: that module reaches the kit, which reaches the tile
export const DROP_MS = 6000;
const HIDDEN_KEY = 'ronin.itemIsland.hidden';

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

/** What a pill says when read aloud or hovered: its words, since it shows none. */
export const pillWords = (item) => [item.id, item.kind, item.status, item.flagged ? t('work_items.flagged', 'flagged') : '', item.title]
  .filter(Boolean).join(' · ');

/** What moved between two readings: an item new to the Agent, a status moved, a flag raised. */
export function noticeable(before, items) {
  if (!before) return false;
  return items.some((item) => {
    const was = before.get(item.id);
    return !was || was.status !== item.status || (!was.flagged && item.flagged);
  });
}

const readHidden = () => { try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { return new Set(); } };
const writeHidden = (set) => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set])); } catch { /* a private window keeps it for this page only */ } };

/**
 * The island for one tile. `open(item)` is the press; `update(session, items)` is called on
 * every reading of the work record and redraws only when what it shows moved.
 */
export function createItemIsland({ open }) {
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
  el.append(grip, pills);

  let session = null;
  let before = null; // id -> { status, flagged }: the last reading, for what moved
  let drawn = '';
  let items = [];
  let timer = null;
  let holding = false;
  const hidden = () => readHidden().has(session);

  const settle = () => {
    const hide = hidden();
    if (hide) el.dataset.state = 'hidden';
    else if (el.dataset.state === 'hidden') el.dataset.state = 'rest';
    if (!hide) delete grip.dataset.notify;
    grip.setAttribute('aria-expanded', String(!hide));
    grip.title = hide ? t('island.recall', 'Show the work items this Agent holds') : t('island.hide', 'Hide the work items');
    grip.setAttribute('aria-label', grip.title);
  };
  const rise = () => { clearTimeout(timer); timer = null; if (el.dataset.state === 'down') el.dataset.state = 'rest'; };
  const later = () => { clearTimeout(timer); timer = setTimeout(() => { if (!holding) rise(); }, DROP_MS); };
  const drop = () => {
    if (hidden()) { grip.dataset.notify = 'true'; return; }
    el.dataset.state = 'down';
    later();
  };
  el.addEventListener('pointerenter', () => { holding = true; });
  el.addEventListener('pointerleave', () => { holding = false; if (el.dataset.state === 'down') later(); });
  grip.addEventListener('click', () => {
    const set = readHidden();
    if (set.has(session)) set.delete(session); else set.add(session);
    writeHidden(set);
    rise();
    settle();
  });

  function pill(item) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'item-pill';
    node.dataset.item = item.id;
    node.dataset.status = statusKey(item.status);
    if (item.flagged) node.dataset.flagged = 'true';
    node.title = pillWords(item);
    node.setAttribute('aria-label', node.title);
    const dot = document.createElement('span');
    dot.className = 'item-pill-status';
    node.append(kindMark(item.kind), dot);
    if (item.flagged) node.append(Object.assign(document.createElement('span'), { className: 'item-pill-flag', textContent: FLAG_MARK }));
    node.addEventListener('click', () => { rise(); open(items.find((one) => one.id === item.id) || item); });
    return node;
  }

  function update(name, list) {
    const next = Array.isArray(list) ? list : [];
    if (name !== session) { session = name; before = null; drawn = ''; rise(); }
    items = next;
    const signature = JSON.stringify(next.map((item) => [item.id, item.kind, item.status, !!item.flagged, item.title]));
    const moved = noticeable(before, next);
    before = new Map(next.map((item) => [item.id, { status: item.status, flagged: !!item.flagged }]));
    el.hidden = !session || !next.length;
    settle();
    if (signature !== drawn) {
      drawn = signature;
      pills.replaceChildren(...next.map(pill));
    }
    if (moved && !el.hidden) drop();
  }

  return { el, update, destroy: () => clearTimeout(timer) };
}
