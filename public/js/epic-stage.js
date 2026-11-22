/* part of the ronin-cowork client — see js/README.md */
/**
 * EPIC-STAGE (owner, 2026-11-22; w898, KAN-780): where an Epic is in its life, read from its items,
 * never from the Epic's own Status (kept as Jira has it, never indexed on). Each level-0 item under
 * the Epic scores To Do 1, In Progress 2, In Review 3, Done 4; the Epic's score is their mean, and the
 * bands do not overlap: Empty (no items), Starter (< 1.5), Working (< 2.5), Maturing (< 3.25),
 * Aging (to 4: the work is in, the Epic waits to be marked Done). An Epic whose Status is Done is
 * Done; a Workspace's Icebox (held by the Workspace, KAN-352) has none.
 *
 * Counted from the pushed rows (the live index, work-items-index.ts) when a view is drawn: no
 * counters. Shown as colour only (a line on a stone, a bar on the Epic); pressing it opens a small
 * reading with the epic-stage and the four counts.
 */
import { t } from './lexicon.js';
import { statusKey } from './tile-island.js';

export const STAGE_KEYS = ['todo', 'progress', 'review', 'done'];
const SCORE = { todo: 1, progress: 2, review: 3, done: 4 };

/** A Workspace's Icebox: the Epic a Workspace holds (KAN-352). */
export const isIcebox = (epic) => String(epic?.holder || '').startsWith('workspace:');
/** An Epic still open: not Done, not an Icebox. */
export const isOpenEpic = (epic) => statusKey(epic?.status) !== 'done' && !isIcebox(epic);

/** The four counts over an Epic's level-0 items (a Subtask is a step of its Task, not counted). */
export function epicCounts(items) {
  const counts = { todo: 0, progress: 0, review: 0, done: 0 };
  for (const item of items || []) if (item.level === 0) counts[statusKey(item.status)] += 1;
  return counts;
}

/** The Epic's epic-stage, score and counts. */
export function epicStage(epic, items) {
  const counts = epicCounts(items);
  const n = STAGE_KEYS.reduce((sum, key) => sum + counts[key], 0);
  const score = n ? STAGE_KEYS.reduce((sum, key) => sum + counts[key] * SCORE[key], 0) / n : 0;
  const stage = isIcebox(epic) ? 'icebox'
    : statusKey(epic?.status) === 'done' ? 'done'
      : !n ? 'empty' : score < 1.5 ? 'starter' : score < 2.5 ? 'working' : score < 3.25 ? 'maturing' : 'aging';
  return { stage, score, counts, n };
}

export const stageWords = (stage) => ({
  empty: t('epic_stage.empty', 'Empty'), starter: t('epic_stage.starter', 'Starter'), working: t('epic_stage.working', 'Working'),
  maturing: t('epic_stage.maturing', 'Maturing'), aging: t('epic_stage.aging', 'Aging'), done: t('epic_stage.done', 'Done'), icebox: t('epic_stage.icebox', 'Icebox'),
})[stage] || '';

function countWords() {
  return { todo: t('epics.to_do', 'To Do'), progress: t('epics.in_progress', 'In Progress'), review: t('epics.in_review', 'In Review'), done: t('epics.done', 'Done') };
}

let openReading = null;
function closeReading() { openReading?.remove(); openReading = null; }
document.addEventListener('pointerdown', (event) => { if (openReading && !openReading.contains(event.target)) closeReading(); }, true);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeReading(); });

/** The small reading a press opens: the epic-stage, then the four counts. */
function showReading(anchor, reading) {
  closeReading();
  const box = document.createElement('div');
  box.className = 'epic-stage-reading';
  box.setAttribute('role', 'dialog');
  const head = document.createElement('strong');
  head.textContent = stageWords(reading.stage);
  box.append(head);
  const words = countWords();
  for (const key of STAGE_KEYS) {
    const row = document.createElement('span');
    row.className = 'epic-stage-row';
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
 * The progress, as colour: `line` along a stone's bottom edge, `bar` on the Epic's own bar. One
 * segment per status in the board's column colours, as wide as its count. `update(epic, items)`
 * repaints only when the counts moved; a press opens the reading and never presses what holds it.
 */
export function createProgress(kind = 'line') {
  const el = document.createElement('span');
  el.className = `epic-progress epic-progress-${kind}`;
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  const parts = Object.fromEntries(STAGE_KEYS.map((key) => {
    const part = document.createElement('i');
    part.dataset.status = key;
    el.append(part);
    return [key, part];
  }));
  let reading = { stage: 'empty', counts: { todo: 0, progress: 0, review: 0, done: 0 } };
  let shown = '';
  const press = (event) => { event.preventDefault(); event.stopPropagation(); showReading(el, reading); };
  el.addEventListener('click', press);
  el.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') press(event); });
  // A press on the line is the line's: the stone under it neither selects nor starts a drag.
  el.addEventListener('pointerdown', (event) => event.stopPropagation());
  return {
    el,
    update(epic, items) {
      reading = epicStage(epic, items);
      const now = JSON.stringify([reading.stage, reading.counts]);
      if (now === shown) return reading;
      shown = now;
      el.dataset.stage = reading.stage;
      el.setAttribute('aria-label', t('epic_stage.press', 'Progress: press to read'));
      for (const key of STAGE_KEYS) parts[key].style.flexGrow = String(reading.counts[key]);
      el.dataset.empty = String(!reading.n);
      return reading;
    },
    reading: () => reading,
  };
}
