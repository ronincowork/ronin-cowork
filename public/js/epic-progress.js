/* part of the ronin-cowork client — see js/README.md */
/**
 * AN EPIC'S PROGRESS (owner, 2026-11-22; w898): the shared item-lifecycle drawing (item-lifecycle.js,
 * KAN-785) with the Epic's own words — its epic-stage heads the reading and lands on `data-state`.
 * No stage name and no counts on a stone or bar; the counting, the colours and the reading are the
 * shared drawing's.
 */
import { t } from './lexicon.js';
import { epicStage } from './epic-stage.js';
import { createLifecycle } from './item-lifecycle.js';

export const stageWords = (stage) => ({
  empty: t('epic_stage.empty', 'Empty'), starter: t('epic_stage.starter', 'Starter'), working: t('epic_stage.working', 'Working'),
  maturing: t('epic_stage.maturing', 'Maturing'), aging: t('epic_stage.aging', 'Aging'), done: t('epic_stage.done', 'Done'), icebox: t('epic_stage.icebox', 'Icebox'),
})[stage] || '';

/** The Epic's drawing: `line` on its stone, `bar` on its own bar. `update(epic, items)` returns the
 * epic-stage reading (the shared lifecycle plus `stage`). */
export function createProgress(kind = 'line') {
  const drawing = createLifecycle(kind);
  let reading = epicStage(null, []);
  return {
    el: drawing.el,
    update(epic, items) {
      reading = epicStage(epic, items);
      drawing.update(items, { heading: stageWords(reading.stage), state: reading.stage });
      return reading;
    },
    reading: () => reading,
  };
}
