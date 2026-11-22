/* part of the ronin-cowork client — see js/README.md */
/**
 * FIND ITEM (owner, 2026-11-12, KAN-433): on the Team workbench's selector after Epics. It asks
 * for an item number and loads that item's reading on this work surface (work-items-surface.js
 * renderItemDetail), its Subtasks opening in its place and its head closing it back to the
 * question. Any id the item has had finds it (the item read resolves renamed w ids); a bare
 * number is tried under each Jira key the pushed items carry, then as a w id.
 *
 * THE ENTRY IS ONE BLOCK (owner, 2026-11-13, KAN-464): the number typed into an Erabi reading
 * stone, Find beside it at the stone's height, and a rule before the item shown. An Agent stone
 * in the item opens that Agent's own tile over this work surface (renderItemDetail's own).
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { request } from './request.js';
import { get, subscribe as hear } from './store.js';
import { S } from './state.js';
import { ask } from './ask.js';
import { renderItemDetail, holderOf } from './work-items-surface.js';

const el = (tag, cls = '', text = '') => {
  const out = document.createElement(tag); out.className = cls; out.textContent = text; return out;
};

/** "LIBRARY-", "library" or "LIBRARY": the library's list, not one item (KAN-767). */
export const asksLibrary = (typed) => /^library-?$/i.test(String(typed || '').trim());

/**
 * THE LIBRARY (owner, 2026-11-22; KAN-767): its items are files, read when asked. The list is one
 * line per item, pressed to read it; a reading is the epic's text and its tasks, with Assign:
 * an Agent or a Team picked, the item is checked out to it as plain new live items, and the new
 * epic opens in its place.
 */
function renderLibraryList(host, items, open) {
  const list = el('div', 'find-item-library');
  if (!items.length) list.append(el('p', 'fs-step-help', t('find_item.library_empty', 'The library is empty.')));
  for (const one of items) {
    const row = el('button', 'find-item-library-row', `${one.id} · ${one.title}`);
    row.type = 'button';
    row.addEventListener('click', () => open(one.id));
    list.append(row);
  }
  host.append(list);
}

function renderLibraryItem(host, item, children, onAssigned) {
  const { createAction } = WorkspaceKit.primitives;
  host.append(el('h2', 'wi-title', item.title), el('p', 'wi-key', `${item.id} · ${t('find_item.library', 'Library')}`));
  if (item.objective) host.append(el('p', 'wi-objective', item.objective));
  if (children.length) {
    const tasks = el('ol', 'find-item-library-tasks');
    for (const task of children) {
      const line = el('li', '', task.title);
      if (Array.isArray(task.subtasks) && task.subtasks.length) line.append(el('span', 'fs-step-help', ` · ${task.subtasks.join(' · ')}`));
      tasks.append(line);
    }
    host.append(tasks);
  }
  const agents = (S.sessions || []).map((one) => one.name).filter(Boolean);
  const teams = (get('teams') || []).map((one) => one.name).filter(Boolean);
  const options = [...agents.map((name) => ({ v: name, l: `@${name}` })), ...teams.map((name) => ({ v: `team:${name}`, l: t('find_item.team', 'Team {name}', { name }) }))];
  let to = '';
  const pick = ask([{ fields: [{ key: 'to', label: t('find_item.assign_to', 'Assign to'), options }] }], { value: { to }, density: 'tight', onChange: ({ to: next }) => { to = next || ''; } });
  const said = el('p', 'fs-step-help wi-answer');
  said.setAttribute('role', 'status');
  const assign = createAction({ label: t('find_item.assign', 'Assign'), action: async () => {
    if (!to) { said.dataset.state = 'failed'; said.textContent = t('find_item.assign_pick', 'Pick an Agent or a Team.'); return; }
    said.dataset.state = '';
    said.textContent = t('find_item.assigning', 'Checking out…');
    const result = await request(`/api/work-items/${encodeURIComponent(item.id)}/checkout`, { method: 'POST', json: { to } });
    if (result.ok) onAssigned(result.data.item.id);
    else { said.dataset.state = 'failed'; said.textContent = result.message || t('find_item.assign_failed', 'It was not checked out.'); }
  } });
  host.append(pick.el, assign.el, said);
}

/** The ids to try for what was typed: "kan-433" → KAN-433; "433" → each known key's 433, then w433. */
export function candidateIds(typed, knownIds = []) {
  const given = String(typed || '').trim();
  if (!given) return [];
  if (/^\d+$/.test(given)) {
    const keys = [...new Set(knownIds.map((id) => /^([A-Z][A-Z0-9]*)-\d+$/.exec(String(id))?.[1]).filter(Boolean))];
    return [...keys.map((key) => `${key}-${given}`), `w${given}`];
  }
  if (/^[a-z][a-z0-9]*-\d+$/i.test(given)) return [given.toUpperCase()];
  return [given];
}

/** `id`: an item to load at once (a Chat link dropped here, KAN-707). */
export function createFindItem(id = '') {
  const { createSurface, createAction } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('find_item.title', 'Find item'), className: 'setup-surface find-item' });
  // An Erabi reading stone (ask.css): its label over what is typed, the Find action beside it.
  const stone = el('label', 'ask-stone find-item-stone');
  const control = el('input', 'ask-reading find-item-number');
  control.type = 'text';
  control.autocomplete = 'off';
  control.spellcheck = false;
  control.placeholder = t('find_item.placeholder', 'KAN-433, 433, w475 or LIBRARY-');
  stone.append(el('span', 'ask-label', t('find_item.label', 'Item number')), control);
  const field = { control };
  const said = el('p', 'fs-step-help wi-answer');
  said.setAttribute('role', 'status');
  const find = createAction({ label: t('find_item.find', 'Find'), action: () => void load(field.control.value) });
  find.el.classList.add('find-item-go');
  const ask = el('div', 'ask find-item-ask');
  const fields = el('div', 'ask-fields');
  fields.append(stone, find.el);
  ask.append(fields);
  const host = el('div', 'find-item-reading');
  out.content.append(ask, said, host);
  field.control.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void load(field.control.value); } });

  let known = [];
  const stop = hear('epicItems', (items) => { known = Array.isArray(items) ? items.map((item) => item.id) : []; });
  let asked = 0;

  async function load(typed) {
    const open = (id) => { field.control.value = id; void load(id); };
    if (asksLibrary(typed)) {
      const mine = ++asked;
      const result = await request('/api/work-items?library=1', { cache: 'no-store' });
      if (mine !== asked) return;
      said.textContent = result.ok ? '' : (result.message || '');
      host.replaceChildren();
      if (result.ok) renderLibraryList(host, result.data.items || [], open);
      return;
    }
    const ids = candidateIds(typed, known);
    if (!ids.length) { field.control.focus(); return; }
    const mine = ++asked;
    said.dataset.state = '';
    said.textContent = t('find_item.finding', 'Finding {id}…', { id: String(typed).trim() });
    for (const id of ids) {
      const result = await request(`/api/work-items/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (mine !== asked) return;
      if (!result.ok) continue;
      const whole = result.data.item;
      said.textContent = '';
      host.replaceChildren();
      if (whole.library) { renderLibraryItem(host, whole, Array.isArray(result.data.children) ? result.data.children : [], open); return; }
      renderItemDetail(host, whole, { holder: holderOf({ ...whole, held_by: result.data.held_by }), heldBy: result.data.held_by, history: false,
        children: Array.isArray(result.data.children) ? result.data.children : [],
        openChild: (child) => { field.control.value = child.id; void load(child.id); },
        onClose: () => { host.replaceChildren(); field.control.focus(); } });
      return;
    }
    said.dataset.state = 'failed';
    said.textContent = t('find_item.none', 'No work item {id}.', { id: String(typed).trim() });
  }

  if (id) { field.control.value = id; void load(id); }
  return {
    el: out.el,
    show: () => { if (!host.childElementCount) field.control.focus(); },
    destroy: () => { stop(); asked += 1; },
  };
}
