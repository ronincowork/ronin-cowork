/* part of the ronin-cowork client — see js/README.md */
/**
 * FIND ITEM (owner, 2026-11-12, KAN-433): on the Team workbench's selector after Epics. It asks
 * for an item number and loads that item's reading on this work surface (work-items-surface.js
 * renderItemDetail), its Subtasks opening in its place and its head closing it back to the
 * question. Any id the item has had finds it (the item read resolves renamed w ids); a bare
 * number is tried under each Jira key the pushed items carry, then as a w id.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { request } from './request.js';
import { subscribe as hear } from './store.js';
import { renderItemDetail, holderOf } from './work-items-surface.js';

const el = (tag, cls = '', text = '') => {
  const out = document.createElement(tag); out.className = cls; out.textContent = text; return out;
};

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

export function createFindItem({ openAgent = null } = {}) {
  const { createSurface, createField, createAction } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('find_item.title', 'Find item'), className: 'setup-surface find-item' });
  const field = createField({ label: t('find_item.label', 'Item number') });
  field.control.type = 'text';
  field.control.autocomplete = 'off';
  field.control.placeholder = t('find_item.placeholder', 'KAN-433, 433 or w475');
  const said = el('p', 'fs-step-help wi-answer');
  said.setAttribute('role', 'status');
  const find = createAction({ label: t('find_item.find', 'Find'), size: 'compact', action: () => void load(field.control.value) });
  const ask = el('div', 'find-item-ask');
  ask.append(field.el, find.el);
  const host = el('div', 'find-item-reading');
  out.content.append(ask, said, host);
  field.control.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void load(field.control.value); } });

  let known = [];
  const stop = hear('epicItems', (items) => { known = Array.isArray(items) ? items.map((item) => item.id) : []; });
  let asked = 0;

  async function load(typed) {
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
      renderItemDetail(host, whole, { holder: holderOf({ ...whole, held_by: result.data.held_by }), heldBy: result.data.held_by, openAgent, history: false,
        children: Array.isArray(result.data.children) ? result.data.children : [],
        openChild: (child) => { field.control.value = child.id; void load(child.id); },
        onClose: () => { host.replaceChildren(); field.control.focus(); } });
      return;
    }
    said.dataset.state = 'failed';
    said.textContent = t('find_item.none', 'No work item {id}.', { id: String(typed).trim() });
  }

  return {
    el: out.el,
    show: () => { if (!host.childElementCount) field.control.focus(); },
    destroy: () => { stop(); asked += 1; },
  };
}
