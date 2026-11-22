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
import { subscribe as hear } from './store.js';
import { renderItemDetail, holderOf } from './work-items-surface.js';

const el = (tag, cls = '', text = '') => {
  const out = document.createElement(tag); out.className = cls; out.textContent = text; return out;
};

/** "LIBRARY-", "library" or "LIBRARY": the library's list, not one item (KAN-767). */
export const asksLibrary = (typed) => /^library-?$/i.test(String(typed || '').trim());

/**
 * THE LIBRARY (owner, 2026-11-22; KAN-767, KAN-769): its items are files, read when asked. The
 * list is one line per item, pressed to open it in the item reading (renderItemDetail, with its
 * Check out and Make my version); New writes a file of your own at the next free number.
 */
function renderLibraryList(host, items, open) {
  const { createAction } = WorkspaceKit.primitives;
  const list = el('div', 'find-item-library');
  if (!items.length) list.append(el('p', 'fs-step-help', t('find_item.library_empty', 'The library is empty.')));
  for (const one of items) {
    const row = el('button', 'find-item-library-row', `${one.id} · ${one.title}`);
    row.type = 'button';
    row.addEventListener('click', () => open(one.id));
    list.append(row);
  }
  const said = el('p', 'fs-step-help wi-answer');
  said.setAttribute('role', 'status');
  const words = el('textarea', 'wi-compose-words wi-library-text');
  words.rows = 12;
  words.setAttribute('aria-label', t('find_item.library_new', 'New library item'));
  const save = createAction({ label: t('find_item.library_save', 'Save'), action: async () => {
    said.dataset.state = '';
    const result = await request('/api/work-items', { method: 'POST', json: { library: true, text: words.value } });
    if (result.ok) open(result.data.id);
    else { said.dataset.state = 'failed'; said.textContent = result.message || t('find_item.library_not_saved', 'It was not saved.'); }
  } });
  const add = createAction({ label: t('find_item.library_new', 'New library item'), action: () => {
    words.value = `# ${t('find_item.library_new_title', 'Its title')}\n\n${t('find_item.library_new_text', 'What the Agent who checks it out does.')}\n\n## ${t('find_item.library_new_task', 'A task')}\nDo: …\nCheck: …\n`;
    add.el.replaceWith(words, save.el);
    words.focus();
  } });
  list.append(add.el, said);
  host.append(list);
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
      // A library item: the same reading, its tasks not opened (they are parts of its file);
      // checked out, the new epic opens; saved or deleted, it reads again (or the list, gone).
      renderItemDetail(host, whole, { holder: holderOf({ ...whole, held_by: result.data.held_by }), heldBy: result.data.held_by, history: false,
        children: Array.isArray(result.data.children) ? result.data.children : [],
        openChild: whole.library ? null : (child) => { field.control.value = child.id; void load(child.id); },
        onCheckedOut: open, onLibraryChanged: (again) => open(again || 'LIBRARY-'),
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
