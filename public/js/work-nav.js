/* part of the ronin-cowork client — see js/README.md */
/**
 * THE WORK NAVIGATION BAR — the utility stones every work-item surface shares, drawn once.
 * Like the phalanx it carries no feature meaning: a consumer hands it the actions it offers
 * and the bar draws one stone per action given, in a fixed order.
 *
 *   add           () => void              the outlined plus: a new item where the consumer sits
 *   autoAssign    (id) => void            drop a stone on it: triage
 *   manualAssign  { choices(id), pick(id, choice) }
 *                                         drop a stone on it: its choices open ({ id, label }
 *                                         rows, nothing else); press one to pick
 *   requestUpdate (id) => void            drop a stone on it: ask its holder for the ladder
 *
 * A stone is dragged with its item id as text/plain; `dragItem(id)` is that source for a
 * phalanx row. The manual-assign choices are the ERABI selector (ask.js), exposed.
 */
import { t } from './lexicon.js';
import { ask } from './ask.js';

const el = (tag, cls = '', text = '') => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text) out.textContent = text;
  return out;
};

/** The drag source for a phalanx row: spread into the row. */
export const dragItem = (id) => ({
  draggable: true,
  events: { dragstart: (event) => event.dataTransfer?.setData('text/plain', String(id)) },
});

export function createWorkNav({ add = null, autoAssign = null, manualAssign = null, requestUpdate = null } = {}) {
  const root = el('nav', 'wn-bar');
  root.setAttribute('aria-label', t('work_nav.label', 'Work navigation'));
  const stones = el('div', 'wn-stones');
  const choices = el('div', 'wn-choices');
  choices.hidden = true;
  root.append(stones, choices);

  // The choices are the ERABI selector every form uses, its option stones exposed.
  const closeChoices = () => { choices.hidden = true; choices.replaceChildren(); };
  const openChoices = async (id) => {
    const rows = (await manualAssign.choices(id)) || [];
    const picker = ask([{ fields: [{
      key: 'board', label: t('work_nav.move_under', 'Move {id} under', { id }),
      options: rows.map((row) => ({ v: row.id, l: row.label })),
    }] }], { density: 'tight', exposed: true, onChange: ({ board }) => {
      const row = rows.find((entry) => entry.id === board);
      if (!row) return;
      closeChoices(); manualAssign.pick(id, row);
    } });
    choices.replaceChildren(picker.el);
    choices.hidden = false;
  };
  choices.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); closeChoices(); } });

  const stone = (key, glyph, label, { press = null, drop = null } = {}) => {
    const button = el('button', 'sws-stone wn-stone');
    button.type = 'button';
    button.dataset.nav = key;
    const mark = el('i', 'sws-glyph', glyph);
    mark.setAttribute('aria-hidden', 'true');
    button.append(mark, el('span', 'wn-label', label));
    if (press) button.addEventListener('click', press);
    if (drop) {
      button.addEventListener('dragover', (event) => { event.preventDefault(); button.classList.add('over'); });
      button.addEventListener('dragleave', () => button.classList.remove('over'));
      button.addEventListener('drop', (event) => {
        event.preventDefault(); button.classList.remove('over');
        const id = event.dataTransfer?.getData('text/plain') || '';
        if (id) drop(id);
      });
    }
    stones.append(button);
  };
  if (add) stone('add', '+', t('work_nav.add', 'Add'), { press: () => { closeChoices(); add(); } });
  if (autoAssign) stone('auto', '⇢', t('work_nav.auto_assign', 'Auto-assign'), { drop: autoAssign });
  if (manualAssign) stone('manual', '⤷', t('work_nav.manual_assign', 'Move to board'), { drop: (id) => void openChoices(id) });
  if (requestUpdate) stone('update', '↻', t('work_nav.request_update', 'Request update'), { drop: requestUpdate });

  return { el: root, closeChoices };
}
