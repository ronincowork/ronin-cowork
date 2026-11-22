/* part of the ronin-cowork client — see js/README.md */
/**
 * EPIC-STAGE AS COLOUR (owner, 2026-11-22; w898): the rules are epic-stage.js; this draws them. No
 * stage name and no counts on a stone or bar: a line on a stone, a bar on the Epic, each segment a
 * status in the board's colours, as wide as its count. Pressing it opens a small reading with the
 * epic-stage and the four counts, closed by a press elsewhere or Escape.
 */
import { t } from './lexicon.js';
import { epicStage, STAGE_KEYS } from './epic-stage.js';

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
