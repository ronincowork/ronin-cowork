/* part of the ronin-cowork client — see js/README.md */
/**
 * THE WORK-ITEM SURFACES' DETAILS — what opens beside a stone on New work and Work, built
 * only from pieces that already exist: the in-place Team detail's head and steps
 * (league-team-detail, createStep), the one item line (itemLine), the tile's work record
 * (shingo's buildLadder), the kit's fields (createField) and the density control the Team
 * people surface draws. Nothing here has a look of its own.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createStep, el } from './form-steps.js';
import { itemLine } from './team-kanban.js';
import { buildLadder } from './shingo.js';
import { holderName } from './work-readings.js';
import { t } from './lexicon.js';

/** The one-dash / two-dash density control (team-members.js draws the same one). */
export function densityControl(start, onChange) {
  const { createAction } = WorkspaceKit.primitives;
  let density = start;
  const button = createAction({ label: '', size: 'compact', className: 'tw-agent-density' });
  const lines = el('span', 'tw-agent-density-lines'); lines.append(el('i'), el('i'));
  button.el.replaceChildren(lines);
  const paint = () => {
    button.el.dataset.lines = density === 'compact' ? 'two' : 'one';
    button.el.title = density === 'compact' ? t('work_nav.expand', 'More detail') : t('work_nav.compact', 'Less detail');
    button.el.setAttribute('aria-label', button.el.title);
    button.el.setAttribute('aria-pressed', String(density === 'full'));
  };
  button.el.addEventListener('click', () => { density = density === 'compact' ? 'full' : 'compact'; paint(); onChange(density); });
  paint();
  return button;
}

/** The Team detail's box and head: a title, the objective under it, any actions beside. */
const detailBox = (host, { title, about = '', actions = [] }) => {
  const box = el('div', 'league-team-detail');
  const head = el('div', 'league-team-detail-head');
  const tools = el('div', 'wk-surface-header-actions');
  tools.append(...actions.map((action) => action.el || action));
  head.append(el('h2', null, title), tools);
  if (about) head.append(el('p', 'league-team-objective', about));
  box.append(head);
  host.append(box);
  return box;
};
let steps = 0;
const step = (box, n, key, title, body, folded = false, meta = '') => {
  let collapsed = folded;
  const made = createStep({ n, key: `${key}-${++steps}`, title, onToggle: () => { collapsed = !collapsed; made.setCollapsed(collapsed, meta); } });
  made.body.classList.add('league-team-step-body');
  made.body.append(...body);
  made.setCollapsed(collapsed, meta);
  box.append(made.el);
};

/** A group or a board: what it is, then its items as item lines under one Work items step. */
export function listDetail(host, { title, about = '', items = [], empty = '' }) {
  const box = detailBox(host, { title, about });
  if (items.length || empty) step(box, 1, 'work', t('league.work_items', 'Work items'),
    items.length ? items.map((item) => itemLine(item, { holder: holderName(item.holder) })) : [el('p', null, empty)],
    false, t('league.item_count', '{count} items', { count: items.length }));
}

/** The whole work item: its line (title, holder, stage bar), its work record (objective,
 * docs and ladder, as the tile draws it) and its trail, folded to its count. */
export function itemDetail(host, item, { actions = [] } = {}) {
  const box = detailBox(host, { title: item.title, actions });
  step(box, 1, 'item', t('work_item.item', 'Work item'), [itemLine(item, { holder: holderName(item.holder) })]);
  step(box, 2, 'record', t('work_item.record', 'Work record'), [buildLadder({ objective: item.objective, ladder: item.ladder || [], docs: item.docs || [] })]);
  const trail = (item.trail || []).map((line) => el('div', null, [
    String(line.at || '').slice(0, 16).replace('T', ' '), line.by, line.op,
    line.from !== undefined || line.to !== undefined ? `${line.from ?? '—'} → ${line.to ?? '—'}` : '', line.note || '',
  ].filter(Boolean).join(' · ')));
  step(box, 3, 'trail', t('work_item.trail', 'Trail'), trail, true, t('work_item.trail_count', '{n} lines', { n: trail.length }));
}

/** The plus stone's detail: the kit's title and objective fields; Enter saves (Shift+Enter
 * is a new line in the objective). `save` answers a sentence when it failed. */
export function draftItem(host, { heading, save }) {
  const { createField } = WorkspaceKit.primitives;
  const box = detailBox(host, { title: heading });
  const title = el('input'); title.type = 'text';
  const objective = el('textarea'); objective.rows = 3;
  const titleField = createField({ label: t('work_nav.draft_title', 'Title'), control: title });
  const objectiveField = createField({ label: t('work_nav.draft_objective', 'Objective'), control: objective });
  const submit = async () => {
    if (!title.value.trim()) { title.focus(); return; }
    titleField.setValidation('', '');
    const failed = await save({ title: title.value.trim(), objective: objective.value.trim() });
    if (failed) titleField.setValidation('invalid', failed);
  };
  for (const field of [title, objective]) field.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } });
  box.append(titleField.el, objectiveField.el);
  title.focus();
}
