/* Behaviors — the resolved library and the owner-safe ways-store editor. */
import { request } from './request.js';
import { createStoneWorkSurface } from './stone-work-surface.js';
import { addProvMark } from './provenance.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';

export const BEHAVIOUR_SURFACE_TYPE = 'campaign.behaviours';
const GENERAL = new Set(['write_it_down', 'buildout', 'recruit', 'visual_staging', 'report_before_fixing']);
const node = (tag, cls = '', text = '') => { const out = document.createElement(tag); if (cls) out.className = cls; if (text) out.textContent = text; return out; };
const keyOf = (row) => `${row.scope}:${row.name}`;

function group(row) {
  if (row.scope === 'floor') return t('behaviours.auto', 'Auto Selected');
  if (row.scope === 'conditional') return t('behaviours.conditional', 'Conditional');
  return t('behaviours.available', 'Available Behaviors');
}

function editor(row, host, refresh) {
  let reading = null;
  let dirty = false;
  let editing = false;
  const heading = node('h2', 'bh-title', row.label || row.name);
  addProvMark(heading, row);
  const summary = node('p', 'bh-summary', row.blurb || '');
  const meta = node('p', 'bh-meta', [group(row), row.requires?.length ? `${t('behaviours.requires', 'When')}: ${row.requires.join(', ')}` : '', row.origin === 'user' ? t('behaviours.yours', 'Yours') : t('behaviours.stock', 'Ronin')].filter(Boolean).join(' · '));
  const status = node('p', 'bh-status'); status.setAttribute('role', 'status');
  const area = node('textarea', 'bh-text'); area.spellcheck = false; area.autocapitalize = 'off'; area.disabled = true;
  const actions = node('div', 'bh-actions');
  const toggle = node('button', 'wk-action', t('behaviours.view_edit', 'View/Edit'));
  const save = node('button', 'wk-action', t('panels.save', 'Save')); save.disabled = true;
  const saveAs = node('button', 'wk-action', t('behaviours.save_as', 'Save As'));
  actions.append(toggle, save, saveAs);
  host.append(heading, summary, meta, actions, status, area);
  const stoneRoot = host.closest('.sws');
  const guard = (event) => {
    const leaving = event.type === 'keydown' ? event.key === 'Escape' : event.target.closest?.('[data-sws-id]');
    if (!dirty || !leaving || window.confirm(t('docs.discard_confirm', 'Discard unsaved changes?'))) return;
    event.preventDefault(); event.stopImmediatePropagation();
  };
  stoneRoot?.addEventListener('click', guard, true);
  stoneRoot?.addEventListener('keydown', guard, true);

  const say = (message, bad = false) => { status.textContent = message; status.dataset.bad = bad ? 'true' : 'false'; };
  const load = async () => {
    if (!row.name) {
      reading = { name: '', scope: 'selected', origin: 'user', revision: '', text: `# My Behavior\n\n- **label:** My Behavior\n- **blurb:** Describe when this guidance helps.\n- **installation:** —\n- **scope:** selected\n\nWrite the guidance the Agent receives at birth.\n` };
      area.value = reading.text; editing = true; area.disabled = false; save.disabled = true; toggle.setAttribute('aria-pressed', 'true'); say(''); return;
    }
    say(t('docs.loading', 'loading…'));
    const result = await request(`/api/ways/${encodeURIComponent(row.scope)}/${encodeURIComponent(row.name)}`, { cache: 'no-store' });
    if (!result.ok) { say(result.message, true); return; }
    reading = result.data; area.value = reading.text || ''; area.disabled = !editing; save.disabled = !editing; dirty = false; say('');
  };
  toggle.addEventListener('click', () => { editing = !editing; area.disabled = !editing; save.disabled = !editing; toggle.setAttribute('aria-pressed', String(editing)); if (editing) area.focus(); });
  area.addEventListener('input', () => { dirty = true; say(''); });
  area.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 's') { event.preventDefault(); save.click(); } });
  save.addEventListener('click', async () => {
    if (!reading || !reading.name) return;
    const stock = reading.origin === 'stock';
    if (stock && !window.confirm(t('behaviours.shadow_warning', 'Saving this Ronin Behavior makes it yours. Later Ronin improvements to this Behavior will not reach your copy. Continue?'))) return;
    save.disabled = true; say(t('docs.saving', 'saving…'));
    const result = await request(stock ? '/api/ways' : `/api/ways/${encodeURIComponent(reading.scope)}/${encodeURIComponent(reading.name)}`, {
      method: stock ? 'POST' : 'PUT',
      json: stock ? { scope: reading.scope, name: reading.name, text: area.value, shadow: true } : { text: area.value, revision: reading.revision },
    });
    if (!result.ok) say(result.message, true);
    else { reading = result.data; dirty = false; say(t('docs.saved', 'saved')); await refresh(keyOf(reading)); }
    save.disabled = !editing;
  });
  saveAs.addEventListener('click', async () => {
    const name = window.prompt(t('behaviours.save_as_name', 'New Behavior name (lowercase with underscores):'), '');
    if (!name) return;
    const label = name.split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ');
    const text = reading ? area.value.replace(/^#\s+.*$/m, `# ${label}`).replace(/^-\s+\*\*label:\*\*\s*.*$/mi, `- **label:** ${label}`) : '';
    say(t('docs.saving', 'saving…'));
    const result = await request('/api/ways', { method: 'POST', json: { scope: row.scope || 'selected', name, text } });
    if (!result.ok) say(result.message, true); else { say(t('docs.saved', 'saved')); await refresh(keyOf(result.data)); }
  });
  void load();
  return () => { stoneRoot?.removeEventListener('click', guard, true); stoneRoot?.removeEventListener('keydown', guard, true); };
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
    const stones = ordered.map((row) => ({ id: keyOf(row), label: row.label || row.name, secondary: group(row), state: row.origin === 'user' ? t('behaviours.yours', 'Yours') : '', row }));
    const addAt = stones.findLastIndex((item) => item.row.scope === 'selected') + 1;
    stones.splice(addAt, 0, {
      id: 'selected:+', label: t('behaviours.add_own', 'Add Your Own'), secondary: t('behaviours.available', 'Available Behaviors'), className: 'sws-add', row: { name: '', label: t('behaviours.add_own', 'Add Your Own'), blurb: t('behaviours.add_own_blurb', 'Create a Behavior in your owner store.'), scope: 'selected', origin: 'user', requires: [] },
    });
    return stones;
  };
  async function refresh(select = '') {
    surface.setState('loading', t('customize.reading', 'reading…'));
    const result = await request('/api/ways', { cache: 'no-store' });
    if (!result.ok || !Array.isArray(result.data)) { surface.setState('failed', result.message || t('customize.not_a_list', 'the route did not answer with a list')); return; }
    rows = result.data; stones.setItems(items()); surface.setState(null, '');
    const wanted = select || (initial.scope && initial.name ? `${initial.scope}:${initial.name}` : '');
    if (wanted) stones.select(wanted);
  }
  return { el: surface.el, show: (detail = {}) => { if (detail.scope && detail.name) initial = detail; void refresh(); }, enter: () => void refresh(), destroy: () => stones.destroy() };
}

export function registerBehaviourSurface() {
  const { library } = WorkspaceKit.workbench;
  if (!library.has(BEHAVIOUR_SURFACE_TYPE)) library.register({
    type: BEHAVIOUR_SURFACE_TYPE,
    header: 'surface',
    label: () => t('behaviours.title', 'Behaviors'),
    summary: () => t('behaviours.card_summary', 'Guidance Agents receive at birth, including automatic and conditional Behaviors.'),
    create: ({ detail }) => createBehaviourSurface(detail),
  });
}
