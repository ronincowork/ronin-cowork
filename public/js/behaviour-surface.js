/* Behaviors — the resolved library and the owner-safe ways-store editor. */
import { request } from './request.js';
import { createStoneWorkSurface } from './stone-work-surface.js';
import { addProvMark } from './provenance.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { renderMarkdownDocument } from './markdown-reader.js';
import { confirmDialog } from './ui.js';

export const BEHAVIOUR_SURFACE_TYPE = 'campaign.behaviours';
const GENERAL = new Set(['write_it_down', 'buildout', 'recruit', 'visual_staging', 'report_before_fixing']);
const node = (tag, cls = '', text = '') => { const out = document.createElement(tag); if (cls) out.className = cls; if (text) out.textContent = text; return out; };
const keyOf = (row) => `${row.scope}:${row.name}`;

function group(row) {
  if (row.scope === 'floor') return t('behaviours.auto', 'All Cowork Agents');
  if (row.scope === 'conditional') return t('behaviours.conditional', 'Conditional');
  return t('behaviours.available', 'Behaviors');
}

function editor(row, host, refresh) {
  let reading = null;
  let dirty = false;
  let editing = false;
  let generation = 0;
  const heading = node('h2', 'bh-title', row.label || row.name);
  addProvMark(heading, row);
  const summary = node('p', 'bh-summary', row.blurb || '');
  const meta = node('p', 'bh-meta', [group(row), row.requires?.length ? `${t('behaviours.requires', 'When')}: ${row.requires.join(', ')}` : '', row.origin === 'user' ? t('behaviours.yours', 'Yours') : t('behaviours.stock', 'Ronin')].filter(Boolean).join(' · '));
  const status = node('p', 'bh-status'); status.setAttribute('role', 'status');
  const readingHost = node('div', 'bh-reading');
  const area = node('textarea', 'bh-text'); area.spellcheck = false; area.autocapitalize = 'off'; area.hidden = true;
  const actions = node('div', 'bh-actions');
  const toggle = node('button', 'wk-action', t('behaviours.view_edit', 'View/Edit'));
  const save = node('button', 'wk-action', t('panels.save', 'Save')); save.disabled = true;
  const saveAs = node('button', 'wk-action', t('behaviours.save_as', 'Save As'));
  const saveAsForm = node('form', 'bh-save-as'); saveAsForm.hidden = true;
  const saveAsLabel = node('label', '', t('behaviours.save_as_name', 'New Behavior name (lowercase with underscores):'));
  const saveAsName = node('input', 'bh-name'); saveAsName.name = 'name'; saveAsName.autocomplete = 'off'; saveAsName.pattern = '[a-z0-9]+(?:_[a-z0-9]+)*';
  const create = node('button', 'wk-action', t('behaviours.create', 'Create')); create.type = 'submit';
  const cancel = node('button', 'wk-action', t('panels.cancel', 'Cancel')); cancel.type = 'button';
  saveAsLabel.append(saveAsName); saveAsForm.append(saveAsLabel, create, cancel);
  actions.append(toggle, save, saveAs);
  const viewOnly = node('span', 'wk-action bh-view-only', t('behaviours.view', 'View'));
  host.append(heading, summary, meta, viewOnly, status, readingHost);
  const stoneRoot = host.closest('.sws');
  const guard = (event) => {
    const leaving = event.type === 'keydown' ? event.key === 'Escape' : event.target.closest?.('[data-sws-id]');
    if (!dirty || !leaving) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const target = event.type === 'click' ? leaving : null;
    void confirmDialog({
      label: t('behaviours.discard_title', 'Discard Behavior changes?'),
      message: t('docs.discard_confirm', 'Discard unsaved changes?'),
      confirmLabel: t('behaviours.discard', 'Discard'),
    }).then((discard) => {
      if (!discard) return;
      dirty = false;
      if (target) target.click();
      else stoneRoot?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
  };
  stoneRoot?.addEventListener('click', guard, true);
  stoneRoot?.addEventListener('keydown', guard, true);

  const say = (message, bad = false) => { status.textContent = message; status.dataset.bad = bad ? 'true' : 'false'; };
  const paintMode = () => {
    area.hidden = !editing; readingHost.hidden = editing;
    if (!editing) readingHost.replaceChildren(renderMarkdownDocument(area.value));
    save.disabled = !editing || !reading?.name;
    toggle.setAttribute('aria-pressed', String(editing));
  };
  const load = async () => {
    const mine = ++generation;
    if (!row.name) {
      reading = { name: '', scope: 'selected', origin: 'user', revision: '', text: `# My Behavior\n\n- **label:** My Behavior\n- **blurb:** Describe when this guidance helps.\n- **installation:** —\n- **scope:** selected\n\nWrite the guidance the Agent receives at birth.\n` };
      area.value = reading.text; editing = true; paintMode(); saveAsForm.hidden = false; saveAsName.focus(); say(''); return;
    }
    say(t('docs.loading', 'loading…'));
    const result = await request(`/api/ways/${encodeURIComponent(row.scope)}/${encodeURIComponent(row.name)}`, { cache: 'no-store' });
    if (mine !== generation) return;
    if (!result.ok) { say(result.message, true); return; }
    reading = result.data; area.value = reading.text || ''; dirty = false; editing = false; paintMode(); say('');
  };
  toggle.addEventListener('click', () => { editing = !editing; paintMode(); if (editing) area.focus(); else toggle.focus(); });
  area.addEventListener('input', () => { dirty = true; say(''); });
  area.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 's') { event.preventDefault(); save.click(); } });
  save.addEventListener('click', async () => {
    if (!reading || !reading.name) return;
    const stock = reading.origin === 'stock';
    if (stock && !await confirmDialog({ label: t('behaviours.shadow_title', 'Make this Behavior yours?'), message: t('behaviours.shadow_warning', 'Saving this Ronin Behavior makes it yours. Later Ronin improvements to this Behavior will not reach your copy. Continue?'), confirmLabel: t('panels.save', 'Save') })) return;
    save.disabled = true; say(t('docs.saving', 'saving…'));
    const result = await request(stock ? '/api/ways' : `/api/ways/${encodeURIComponent(reading.scope)}/${encodeURIComponent(reading.name)}`, {
      method: stock ? 'POST' : 'PUT',
      json: stock ? { scope: reading.scope, name: reading.name, text: area.value, shadow: true } : { text: area.value, revision: reading.revision },
    });
    if (!result.ok) say(result.message, true);
    else { reading = result.data; dirty = false; say(t('docs.saved', 'saved')); await refresh(keyOf(reading)); }
    save.disabled = !editing;
  });
  saveAs.addEventListener('click', () => { saveAsForm.hidden = false; saveAsName.focus(); });
  cancel.addEventListener('click', () => { if (row.name) saveAsForm.hidden = true; saveAsName.value = ''; saveAs.focus(); });
  saveAsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = saveAsName.value.trim();
    if (!name || !saveAsName.checkValidity()) { say(t('behaviours.name_invalid', 'Use lowercase letters, digits, and underscores.'), true); saveAsName.focus(); return; }
    const label = name.split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ');
    const text = reading ? area.value.replace(/^#\s+.*$/m, `# ${label}`).replace(/^-\s+\*\*label:\*\*\s*.*$/mi, `- **label:** ${label}`) : '';
    say(t('docs.saving', 'saving…'));
    const result = await request('/api/ways', { method: 'POST', json: { scope: row.scope || 'selected', name, text } });
    if (!result.ok) say(result.message, true); else { dirty = false; say(t('docs.saved', 'saved')); await refresh(keyOf(result.data)); }
  });
  void load();
  return () => { generation++; stoneRoot?.removeEventListener('click', guard, true); stoneRoot?.removeEventListener('keydown', guard, true); };
}

export function createBehaviourSurface(initial = {}) {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('behaviours.title', 'Behaviors'), className: 'behaviour-surface' });
  let rows = [];
  const stones = createStoneWorkSurface({ className: 'behaviour-stones', renderDetail: (item, host) => editor(item.row, host, refresh) });
  const intro = node('div', 'sws-intro');
  intro.append(node('h2', '', t('behaviours.title', 'Behaviors')), node('p', '', t('behaviours.intro', 'Behaviors are specific guidance given to Agents at birth.')));
  stones.mount(surface.content, { before: [intro] });
  const items = () => {
    const visible = rows.filter((row) => row.scope === 'floor' || row.scope === 'conditional' || (row.scope === 'selected' && !row.installation && (GENERAL.has(row.name) || row.origin === 'user')));
    const ordered = ['selected', 'floor', 'conditional'].flatMap((scope) => visible.filter((row) => row.scope === scope));
    const stones = ordered.map((row) => ({ id: keyOf(row), label: row.label || row.name, group: group(row), secondary: row.blurb || '', state: row.origin === 'user' ? t('behaviours.yours', 'Yours') : '', row }));
    const addAt = stones.findLastIndex((item) => item.row.scope === 'selected') + 1;
    stones.splice(addAt, 0, {
      id: 'selected:+', label: t('behaviours.add_own', 'Add Your Own'), group: t('behaviours.available', 'Optional'), secondary: '', className: 'sws-add', disabled: true, row: { name: '', label: t('behaviours.add_own', 'Add Your Own'), blurb: '', scope: 'selected', origin: 'user', requires: [] },
    });
    return stones;
  };
  async function refresh(select = '') {
    surface.setState('loading', t('customize.reading', 'reading…'));
    const result = await request('/api/ways', { cache: 'no-store' });
    if (!result.ok || !Array.isArray(result.data)) { surface.setState('failed', result.message || t('customize.not_a_list', 'the route did not answer with a list')); return; }
    rows = result.data; stones.setItems(items()); surface.setState(null, '');
    const wanted = select || (initial.create ? 'selected:+' : initial.scope && initial.name ? `${initial.scope}:${initial.name}` : '');
    if (wanted) stones.select(wanted);
  }
  return { el: surface.el, show: (detail = {}) => { if (detail.scope && (detail.name || detail.create)) initial = detail; void refresh(); }, enter: () => void refresh(), destroy: () => stones.destroy() };
}

export function registerBehaviourSurface() {
  const { library } = WorkspaceKit.workbench;
  if (!library.has(BEHAVIOUR_SURFACE_TYPE)) library.register({
    type: BEHAVIOUR_SURFACE_TYPE,
    header: 'surface',
    label: () => t('behaviours.title', 'Behaviors'),
    summary: () => t('behaviours.card_summary', 'Optional, System, and Conditional guidance Agents receive at birth.'),
    create: ({ detail }) => createBehaviourSurface(detail),
  });
}
