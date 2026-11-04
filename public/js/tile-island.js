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
 * The items are the tile's `tegami.items` — the work record on the pushed home row, which the
 * tile re-reads on every push (tile.js refreshTegami). Nothing here asks the server.
 */
import { t } from './lexicon.js';

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

/** What a pill says when read aloud or hovered: its words, since it shows none. */
export const pillWords = (item) => [item.id, item.kind, item.status, item.flagged ? t('work_items.flagged', 'flagged') : '', item.title]
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
  el.append(grip, pills);

  let session = null;
  let drawn = '';
  let items = [];

  const place = (down) => {
    el.dataset.state = down ? 'down' : 'rest';
    grip.setAttribute('aria-expanded', String(down));
    grip.title = down ? t('island.up', 'Put the work items back in the header') : t('island.down', 'Show the work items with their status');
    grip.setAttribute('aria-label', grip.title);
  };
  place(false);
  grip.addEventListener('click', () => place(el.dataset.state !== 'down'));

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
    // One press opens the item, the same press again closes it.
    node.addEventListener('click', () => {
      place(false);
      if (isOpen(item.id)) shut(item.id);
      else open(items.find((one) => one.id === item.id) || item);
    });
    return node;
  }

  function update(name, list) {
    const next = Array.isArray(list) ? list : [];
    if (name !== session) { session = name; drawn = ''; place(false); }
    items = next;
    el.hidden = !session || !next.length;
    const signature = JSON.stringify(next.map((item) => [item.id, item.kind, item.status, !!item.flagged, item.title]));
    if (signature === drawn) return;
    drawn = signature;
    pills.replaceChildren(...next.map(pill));
  }

  return { el, update };
}
