/* part of the ronin-cowork client — see js/README.md */
/**
 * THE FIVE STEP MARKS — one drawing of Setup's progress, for anyone who needs to show it.
 *
 * Five narrow slabs leaning one shared angle, each carrying its own numeral: hollow until
 * that step is answered, kaki once it is, and the first unanswered slab kaki-edged because
 * that is the step Setup lands on. Five marks that carry their own numbers need no counter
 * beside them.
 *
 * STATELESS AND SELF-CONTAINED. It reads the Campaign's persisted answers
 * (setup-progress.js) and nothing else: no fetch, no probe, no reading of machine state,
 * no listeners, no timers, nothing to destroy. Call it again with a newer record and
 * replace the element you were given; there is nothing to update in place.
 *
 * It draws at one size. A consumer that needs another — the Machine Settings card steps
 * down in a squeezed column and up in the expanded one — sets that in its own CSS, under
 * its own class. The component never reads its surroundings.
 */
import { SETUP_SCENES } from './setup-journey.js';
import { SETUP_STEP_IDS, firstUnansweredSetupStep, setupAnswers } from './setup-progress.js';

/**
 * The five steps of one Campaign, in the order Setup asks them. `label` is the Setup
 * selector's own scene label, so no caller holds a second, staler copy of that column.
 * `next` marks the first unanswered step; every step false means Setup is complete.
 */
export function setupStepMarks(campaign) {
  const answers = setupAnswers(campaign);
  const next = firstUnansweredSetupStep(campaign);
  return SETUP_STEP_IDS.map((id, index) => ({
    id,
    number: index + 1,
    label: SETUP_SCENES.find((scene) => scene.id === id)?.label || id,
    answered: Boolean(answers[id]),
    next: id === next,
  }));
}

/**
 * The bar for one Campaign, as an element to seat wherever it belongs.
 *
 * It is `aria-hidden`: five bare numerals are a picture, not a reading, so the surface
 * that seats it owns the words that say the same thing — the card does this with the
 * step's name and a `.ui-sr` line.
 */
export function createSetupStepsBar(campaign) {
  const bar = document.createElement('span');
  bar.className = 'setup-steps-bar';
  bar.setAttribute('aria-hidden', 'true');
  for (const step of setupStepMarks(campaign)) {
    const mark = document.createElement('span');
    mark.className = 'setup-steps-mark';
    mark.dataset.n = String(step.number);
    if (step.answered) mark.dataset.answered = 'true';
    else if (step.next) mark.dataset.next = 'true';
    bar.append(mark);
  }
  return bar;
}
