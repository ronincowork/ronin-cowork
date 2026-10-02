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
import { PROJECT_STAGES, itemLine } from './team-kanban.js';
import { buildLadder } from './shingo.js';
import { boardChoices, holderName } from './work-readings.js';
import { ask } from './ask.js';
import { request } from './request.js';
import { S } from './state.js';
import { teamsFromState } from './team-controller.js';
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
  return made.el;
};

/** A group or a board: what it is, then its items as item lines under one Work items step. */
export function listDetail(host, { title, about = '', items = [], empty = '', actions = [] }) {
  const box = detailBox(host, { title, about, actions });
  if (items.length || empty) step(box, 1, 'work', t('league.work_items', 'Work items'),
    items.length ? items.map((item) => itemLine(item, { holder: holderName(item.holder) })) : [el('p', null, empty)],
    false, t('league.item_count', '{count} items', { count: items.length }));
}

/** An open board: its leaves in six steps, one per stage. Drag a line onto another stage's
 * step to move it there (`move(id, stage)`); press a line to open it (`open(id)`). */
export function stageDetail(host, { title, about = '', items = [], move, open }) {
  const box = detailBox(host, { title, about });
  PROJECT_STAGES.forEach((stage, index) => {
    const here = items.filter((item) => item.stage === stage.key);
    const lines = here.map((item) => {
      const line = itemLine(item, { holder: holderName(item.holder) });
      line.draggable = true;
      line.addEventListener('dragstart', (event) => event.dataTransfer?.setData('text/plain', item.id));
      line.addEventListener('click', () => open(item.id));
      return line;
    });
    // An empty stage folds to its count and still takes a drop.
    const target = step(box, index + 1, stage.key, stage.label, lines, !lines.length, t('league.item_count', '{count} items', { count: here.length }));
    target.addEventListener('dragover', (event) => event.preventDefault());
    target.addEventListener('drop', (event) => {
      event.preventDefault();
      const id = event.dataTransfer?.getData('text/plain') || '';
      if (items.some((item) => item.id === id && item.stage !== stage.key)) move(id, stage.key);
    });
  });
  return box;
}

/* THE OVERLAY — one layer over whatever is open beneath it, the same on every surface. Its
 * utility sits small at its top right, in one order: Save (only while there is something to
 * save), Assign (an item, to an Agent or a Team), Add (a new item's form, laid in its place), Close. `context`
 * answers where Add puts a new item ({ stage, parent }); `changed(sentence)` hears every
 * write the overlay made, for the surface to say and re-read; `closed()` hears Close. */
const agentChoices = () => (Array.isArray(S.sessions) ? S.sessions : []).map((row) => ({ v: row.name, l: row.name }));
const firstLine = (text) => String(text || '').split('\n')[0];

function overlay(host, draw, { through = [], save = null, assign = null, context = null, changed = () => {}, closed = () => {} } = {}) {
  const { createAction } = WorkspaceKit.primitives;
  const layer = el('div', 'work-overlay');
  const close = () => { layer.remove(); closed(); };
  const saveAction = save ? createAction({ label: t('work_overlay.save', 'Save'), size: 'compact', disabled: true, action: () => void save.run() }) : null;
  const add = context ? () => { layer.remove(); draftOverlay(host, { ...context(), changed, closed }); } : null;
  const utility = el('div', 'work-overlay-utility');
  utility.append(...[
    saveAction,
    assign && createAction({ label: t('work_overlay.assign', 'Assign'), size: 'compact', action: () => assign.open() }),
    add && createAction({ label: t('work_overlay.add', 'Add'), size: 'compact', action: add }),
    createAction({ label: t('work.close_item', 'Close'), size: 'compact', action: close }),
  ].filter(Boolean).map((action) => action.el));
  draw(layer, [...through, utility]);
  save?.watch((dirty) => saveAction.setDisabled(!dirty));
  layer.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  host.append(layer);
  // Keys land in the overlay (Escape is its Close): in its first field, else on the layer.
  layer.tabIndex = -1;
  (layer.querySelector('input, textarea') || layer).focus();
  return layer;
}

/** A group of items (listDetail) as an overlay: Add puts a new item where the group sits. */
export function listOverlay(host, fields, options = {}) {
  return overlay(host, (layer, actions) => listDetail(layer, { ...fields, actions }), options);
}

/** An item as an overlay: Assign asks which Agent holds it and writes that. `through` are
 * the ways through to elsewhere (Open <team>), drawn before the utility. */
export function itemOverlay(host, item, options = {}) {
  const slot = el('div', 'work-overlay-assign');
  slot.hidden = true;
  const assign = { open: () => {
    // An Agent or a Team: pressing either writes it as the holder.
    const teams = teamsFromState().filter((row) => !row.holding).map((row) => ({ v: row.name, l: row.title || row.name }));
    const picker = ask([{ group: t('work_overlay.assign_to', 'Assign {id} to', { id: item.id }), fields: [
      { key: 'session', label: t('work_overlay.assign_agent', 'Agent'), options: agentChoices() },
      { key: 'team', label: t('work_overlay.assign_team', 'Team'), options: teams },
    ] }], {
      density: 'tight', exposed: true, onChange: async ({ session, team }) => {
        const holder = session ? { session } : team ? { team } : null;
        if (!holder) return;
        const held = await request(`/api/work-items/${encodeURIComponent(item.id)}/assign`, { method: 'POST', json: holder });
        slot.hidden = true;
        (options.changed || (() => {}))(held.ok ? firstLine(held.data.acknowledgement) : held.message);
      },
    });
    slot.replaceChildren(picker.el);
    slot.hidden = false;
  } };
  return overlay(host, (layer, actions) => {
    itemDetail(layer, item, { actions });
    layer.querySelector('.league-team-detail-head')?.after(slot);
  }, { ...options, assign });
}

/** Add's form as an overlay: Save makes the item, and is live once the item has a title. */
export function draftOverlay(host, { stage = 'IDEA', parent = '', changed = () => {}, closed = () => {} } = {}) {
  let form = null;
  const save = { watch: (hear) => form.onDirty(hear), run: () => form.submit() };
  return overlay(host, (layer, actions) => {
    form = draftItem(layer, { heading: t('work.draft', 'New item'), stage, parent, actions, save: async (fields) => {
      const made = await request('/api/work-items', { method: 'POST', json: fields });
      if (!made.ok) return made.message;
      layer.remove();
      closed();
      changed(firstLine(made.data.acknowledgement));
      return '';
    } });
  }, { save, changed, closed });
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

const NEW_BOARD = ' new board'; // the Board answer that makes the item a root of its own

/** Add's form: the kit's title and objective fields, then the item's status and the board it
 * goes under: an existing board, a new board of its own, or Unfiled (the default).
 * `stage` and `parent` are where Add was pressed. Enter saves (Shift+Enter
 * is a new line in the objective). `save(fields)` answers a sentence when it failed. */
export function draftItem(host, { heading, stage = 'IDEA', parent = '', save, actions = [] }) {
  const { createField } = WorkspaceKit.primitives;
  const box = detailBox(host, { title: heading, actions });
  const title = el('input'); title.type = 'text';
  const objective = el('textarea'); objective.rows = 3;
  const titleField = createField({ label: t('work_nav.draft_title', 'Title'), control: title });
  const objectiveField = createField({ label: t('work_nav.draft_objective', 'Objective'), control: objective });
  const picks = ask([{ fields: [
    { key: 'stage', label: t('work_nav.draft_stage', 'Status'), options: PROJECT_STAGES.map((row) => ({ v: row.key, l: row.label })) },
    { key: 'parent', label: t('work_nav.draft_board', 'Board'), blank: t('work_nav.draft_unfiled', 'Unfiled'), options: [] },
  ] }], { value: { stage, parent }, density: 'tight' });
  // Unfiled (the blank, the default) is the store's own root of that name, so it is not
  // offered twice; New board makes the item a root of its own.
  void request('/api/work-items', { cache: 'no-store' }).then((read) => {
    if (!read.ok) return;
    const items = read.data.items || [];
    const unfiled = items.find((item) => item.parent === null && item.title === 'Unfiled')?.id;
    picks.options('parent', [
      ...boardChoices(items, '').filter((row) => row.id !== unfiled).map((row) => ({ v: row.id, l: row.label })),
      { v: NEW_BOARD, l: t('work_nav.draft_new_board', 'New board') },
    ]);
  });
  const submit = async () => {
    if (!title.value.trim()) { title.focus(); return; }
    titleField.setValidation('', '');
    const { stage: at, parent: under } = picks.value();
    const failed = await save({ title: title.value.trim(), objective: objective.value.trim(), stage: at, ...(under === NEW_BOARD ? { root: true } : under ? { parent: under } : {}) });
    if (failed) titleField.setValidation('invalid', failed);
  };
  for (const field of [title, objective]) field.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } });
  box.append(titleField.el, objectiveField.el, picks.el);
  title.focus();
  return { submit, onDirty: (hear) => title.addEventListener('input', () => hear(Boolean(title.value.trim()))) };
}
