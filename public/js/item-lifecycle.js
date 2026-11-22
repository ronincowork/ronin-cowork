/* part of the ronin-cowork client — see js/README.md */
/**
 * THE ITEM LIFECYCLE (owner, 2026-11-22; KAN-785): the one contract every summary of work items
 * uses — an Epic's, a Team's, an Agent's, a Workspace's. It owns all of it: a status's family
 * (To Do, In Progress, In Review, Done), its number (1, 2, 3, 4), the counts over level-0 items,
 * their mean and band, each family's share, and the drawing — a line along a stone's bottom edge or
 * a bar — with its reading (a press, Enter or Space opens the four counts; a press elsewhere or
 * Escape closes it). A consumer passes items and chooses line or bar; it may name the band in the
 * reading's heading (an Epic's epic-stage, epic-stage.js) and never counts or draws on its own.
 *
 * Counted from the rows in hand when a view is drawn: no counters, nothing stored.
 */
import { t } from './lexicon.js';

/** The four families in workflow order, which is also the drawing's order. */
export const LIFECYCLE = ['todo', 'progress', 'review', 'done'];
/** Each family's number: the mean of these is where a set of items is in its life. */
export const LIFECYCLE_SCORE = Object.freeze({ todo: 1, progress: 2, review: 3, done: 4 });

/** A status's family: Jira's three, plus In Review. Anything else is To Do. */
export function statusKey(status) {
  const s = String(status || '').toLowerCase();
  if (/done|closed|resolved|complete/.test(s)) return 'done';
  if (/review/.test(s)) return 'review';
  if (/progress|doing|active/.test(s)) return 'progress';
  return 'todo';
}

/** What is counted: level-0 items (a Task, Story, Bug, Feature). An Epic is the summary, not a part
 * of it, and a Subtask is a step of its Task; an item with no level is counted. */
export const counted = (item) => item?.level === undefined || item?.level === null || item.level === 0;

/**
 * The lifecycle of a set of items: `counts` per family, `n` counted, `score` their mean (0 when
 * none), `band` 0 (none), 1 (under 1.5), 2 (under 2.5), 3 (under 3.25) or 4 (3.25 to 4: the work is
 * in), and `shares`, each family's fraction of `n` (all 0 when none). Bands do not overlap.
 */
export function lifecycle(items) {
  const counts = { todo: 0, progress: 0, review: 0, done: 0 };
  for (const item of items || []) if (counted(item)) counts[statusKey(item.status)] += 1;
  const n = LIFECYCLE.reduce((sum, key) => sum + counts[key], 0);
  const score = n ? LIFECYCLE.reduce((sum, key) => sum + counts[key] * LIFECYCLE_SCORE[key], 0) / n : 0;
  const band = !n ? 0 : score < 1.5 ? 1 : score < 2.5 ? 2 : score < 3.25 ? 3 : 4;
  const shares = Object.fromEntries(LIFECYCLE.map((key) => [key, n ? counts[key] / n : 0]));
  return { counts, n, score, band, shares };
}

/**
 * WHAT NEEDS THE PERSON in a set of items (w897; shared, KAN-785): an item In Review, an open one
 * flagged, and open work no Agent holds (only a Team, or nobody). Each a yes or no.
 */
export function attention(items) {
  const open = (items || []).filter((item) => counted(item) && statusKey(item.status) !== 'done');
  return {
    review: open.some((item) => statusKey(item.status) === 'review'),
    flagged: (items || []).some((item) => item.flagged && statusKey(item.status) !== 'done'),
    unassigned: open.some((item) => !String(item.holder || '').startsWith('agent:')),
  };
}

/** What needs the person, in words (no counts); '' when nothing does. */
export function attentionWords(needs) {
  return [needs.review ? t('epics.needs_review', 'Needs review') : '', needs.flagged ? t('epics.needs_flag', 'Flagged') : '',
    needs.unassigned ? t('epics.needs_assign', 'Work to assign') : ''].filter(Boolean).join(' · ');
}

/** The families in words, for the reading and its rows. */
export function lifecycleWords() {
  return { todo: t('epics.to_do', 'To Do'), progress: t('epics.in_progress', 'In Progress'), review: t('epics.in_review', 'In Review'), done: t('epics.done', 'Done') };
}

let openReading = null;
let listening = false;
function closeReading() { openReading?.remove(); openReading = null; }
function listen() {
  if (listening) return;
  listening = true;
  document.addEventListener('pointerdown', (event) => { if (openReading && !openReading.contains(event.target)) closeReading(); }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeReading(); });
}

/** The small reading a press opens: the heading when the consumer gave one, then the four counts. */
function showReading(anchor, reading, heading) {
  listen();
  closeReading();
  const box = document.createElement('div');
  box.className = 'lifecycle-reading';
  box.setAttribute('role', 'dialog');
  if (heading) {
    const head = document.createElement('strong');
    head.textContent = heading;
    box.append(head);
  }
  const words = lifecycleWords();
  for (const key of LIFECYCLE) {
    const row = document.createElement('span');
    row.className = 'lifecycle-row';
    row.dataset.status = key;
    row.append(document.createElement('i'), `${words[key]} ${reading.counts[key]}`);
    box.append(row);
  }
  document.body.append(box);
  const at = anchor.getBoundingClientRect();
  const width = box.offsetWidth;
  box.style.left = `${Math.max(8, Math.min(at.right - width, window.innerWidth - width - 8))}px`;
  box.style.top = `${at.bottom + 6 + box.offsetHeight > window.innerHeight ? Math.max(8, at.top - box.offsetHeight - 6) : at.bottom + 6}px`;
  openReading = box;
}

/**
 * The drawing: `line` along a stone's bottom edge, `bar` where a row or a head has room. One segment
 * per family in the board's colours, as wide as its share. `update(items, { heading, state })`
 * counts the items, repaints only when the counts moved, and returns the lifecycle; `heading` heads
 * the reading, `state` lands on `data-state` for the consumer's own band name. Nothing counted:
 * `data-empty="true"`. A press opens the reading and never presses what holds the drawing.
 */
export function createLifecycle(kind = 'line') {
  const el = document.createElement('span');
  el.className = `lifecycle lifecycle-${kind}`;
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.setAttribute('aria-label', t('lifecycle.press', 'Progress: press to read'));
  const parts = Object.fromEntries(LIFECYCLE.map((key) => {
    const part = document.createElement('i');
    part.dataset.status = key;
    el.append(part);
    return [key, part];
  }));
  let reading = lifecycle([]);
  let heading = '';
  let shown = '';
  const press = (event) => { event.preventDefault(); event.stopPropagation(); showReading(el, reading, heading); };
  el.addEventListener('click', press);
  el.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') press(event); });
  // A press on the drawing is the drawing's: the stone under it neither selects nor starts a drag.
  el.addEventListener('pointerdown', (event) => event.stopPropagation());
  el.dataset.empty = 'true';
  return {
    el,
    update(items, { heading: nextHeading = '', state = '' } = {}) {
      reading = lifecycle(items);
      heading = nextHeading;
      const now = JSON.stringify([state, reading.counts]);
      if (now === shown) return reading;
      shown = now;
      if (state) el.dataset.state = state; else delete el.dataset.state;
      el.dataset.band = String(reading.band);
      for (const key of LIFECYCLE) parts[key].style.flexGrow = String(reading.shares[key]);
      el.dataset.empty = String(!reading.n);
      return reading;
    },
    reading: () => reading,
  };
}
