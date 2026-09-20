/* part of the ronin-cowork client — see js/README.md */
/**
 * THE DOOR BACK TO SETUP — one card at the head of Machine Settings.
 *
 * The word sits left, the five step marks sit right — the shared component
 * (setup-steps-bar.js), which this card only seats and sizes. The marks carry their own
 * numbers, so the card never counts itself out in words. Expanded, one line names the
 * step Setup will land on — the name alone, since a
 * "Next:" label says what the kaki-edged slab already says and eats the width a narrow
 * column needs for the name itself. Complete drops the bar and says two words.
 *
 * Like the component, it reads the Campaign's persisted answers and nothing else: no
 * probe, no second reading of machine state. Setup owns where it lands, so the card
 * navigates and lets it.
 *
 * The card is a DOOR, not a work surface: Ronin Setup is its own destination, so this is
 * built in the selector's `onSelectorRefresh` hook — where campaign-view already inserts
 * its group headings — rather than registered as a Workbench type a drag could seat.
 */
import { t } from './lexicon.js';
import { createSetupStepsBar, setupStepMarks } from './setup-steps-bar.js';

const node = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = String(text);
  return el;
};

/**
 * The card for one Campaign. Before the Desk record has loaded there is nothing to read,
 * so the card says its name and draws no bar rather than claiming nothing is answered.
 * `open()` takes the person to Ronin Setup; Setup itself decides which step to show.
 */
export function createSetupReturnCard(progress, open) {
  const card = node('button', 'wk-card setup-return-card');
  card.type = 'button';
  const rungs = progress ? setupStepMarks(progress) : null;
  const next = rungs ? rungs.find((step) => step.next) || null : null;

  // Unfinished, the card carries the column's entity weight; finished, it steps back to
  // the quiet utility edge. Both are the selector's established marks, not a new one.
  card.classList.add(rungs && !next ? 'wk-selector-utility' : 'wk-selector-entity');

  const head = node('span', 'setup-return-head');
  const heading = node('h3', 'wk-card-heading', t('setup_return.title', 'Setup'));
  head.append(heading);

  if (rungs && next) {
    head.append(createSetupStepsBar(progress));
  } else if (rungs) {
    heading.append(' ', node('span', 'setup-return-done', t('setup_return.complete', 'Complete')));
    card.dataset.complete = 'true';
  }
  card.append(head);

  if (next) card.append(node('p', 'setup-return-next', next.label));
  if (rungs) {
    card.append(node('span', 'ui-sr', next
      ? t('setup_return.reading_next', 'Opens Setup at step {n} of {total}.', { n: next.number, total: rungs.length })
      : t('setup_return.reading_complete', 'Setup complete. Opens any step again.')));
  }

  card.addEventListener('click', () => open());
  return card;
}
