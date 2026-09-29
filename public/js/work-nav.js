/* part of the ronin-cowork client — see js/README.md */
/**
 * THE WORK NAVIGATION BAR — the utility stones every work-item surface shares, drawn once.
 * Like the phalanx it carries no feature meaning: a consumer hands it the actions it offers
 * and the bar draws one stone per action given, in a fixed order.
 *
 *   add           () => void              the outlined plus: a new item where the consumer sits
 *   autoAssign    (id) => void            drop a stone on it: triage
 *   manualAssign  { choices(id), pick(id, choice) }
 *                                         drop a stone on it: a clean list of choices opens
 *                                         ({ id, label } rows, nothing else); press one to pick
 *   requestUpdate (id) => void            drop a stone on it: ask its holder for the ladder
 *
 * A stone is dragged with its item id as text/plain; `dragItem(id)` is that source for a
 * phalanx row. `draftItem` is the plus stone's detail: title and objective, Enter saves.
 */
import { t } from './lexicon.js';

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

  const closeChoices = () => { choices.hidden = true; choices.replaceChildren(); };
  const openChoices = async (id) => {
    const rows = await manualAssign.choices(id);
    choices.replaceChildren();
    const list = el('ul', 'wn-choice-list');
    for (const row of rows || []) {
      const entry = el('li');
      const button = el('button', 'wn-choice', row.label);
      button.type = 'button';
      button.addEventListener('click', () => { closeChoices(); manualAssign.pick(id, row); });
      entry.append(button); list.append(entry);
    }
    if (!list.children.length) list.append(el('li', 'wn-choice-empty', t('work_nav.no_choices', 'Nowhere to move it.')));
    choices.append(list);
    choices.hidden = false;
    list.querySelector('button')?.focus();
  };
  choices.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); closeChoices(); } });

  const stone = (key, glyph, label, { press = null, drop = null } = {}) => {
    const button = el('button', 'wn-stone');
    button.type = 'button';
    button.dataset.nav = key;
    const mark = el('i', 'wn-glyph', glyph);
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

/** The plus stone's detail: a title and an objective; Enter saves (Shift+Enter is a new
 * line in the objective). `save` answers a sentence when it failed, nothing when it saved. */
export function draftItem(host, { heading = '', save }) {
  const form = el('form', 'wn-draft');
  const title = el('input');
  title.name = 'title';
  title.placeholder = t('work_nav.draft_title', 'Title');
  title.setAttribute('aria-label', title.placeholder);
  const objective = el('textarea');
  objective.name = 'objective';
  objective.rows = 3;
  objective.placeholder = t('work_nav.draft_objective', 'Objective');
  objective.setAttribute('aria-label', objective.placeholder);
  const said = el('p', 'wn-draft-said');
  said.setAttribute('role', 'status');
  const submit = async () => {
    if (!title.value.trim()) { title.focus(); return; }
    said.textContent = '';
    const failed = await save({ title: title.value.trim(), objective: objective.value.trim() });
    if (failed) said.textContent = failed;
  };
  for (const field of [title, objective]) field.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } });
  if (heading) form.append(el('h2', '', heading));
  form.append(title, objective, said);
  host.append(form);
  title.focus();
}
