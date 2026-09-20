/* Behaviors — the resolved, read-only guidance library. */
import { request } from './request.js';
import { createStoneWorkSurface } from './stone-work-surface.js';
import { addProvMark } from './provenance.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { renderMarkdownDocument } from './markdown-reader.js';

export const BEHAVIOUR_SURFACE_TYPE = 'campaign.behaviours';
const GENERAL = new Set(['write_it_down', 'buildout', 'recruit', 'visual_staging', 'report_before_fixing']);
const node = (tag, cls = '', text = '') => { const out = document.createElement(tag); if (cls) out.className = cls; if (text) out.textContent = text; return out; };
const keyOf = (row) => `${row.scope}:${row.name}`;

function group(row) {
  if (row.scope === 'floor') return t('behaviours.auto', 'All Cowork Agents');
  if (row.scope === 'conditional') return t('behaviours.conditional', 'Conditional');
  return t('behaviours.available', 'Optional');
}

function viewer(row, host) {
  let active = true;
  const heading = node('h2', 'bh-title', row.label || row.name);
  addProvMark(heading, row);
  const summary = node('p', 'bh-summary', row.blurb || '');
  const meta = node('p', 'bh-meta', [group(row), row.requires?.length ? `${t('behaviours.requires', 'When')}: ${row.requires.join(', ')}` : '', row.origin === 'user' ? t('behaviours.yours', 'Yours') : t('behaviours.stock', 'Ronin')].filter(Boolean).join(' · '));
  const status = node('p', 'bh-status'); status.setAttribute('role', 'status');
  const readingHost = node('div', 'bh-reading');
  const viewOnly = node('span', 'wk-action bh-view-only', t('behaviours.view', 'View'));
  host.append(heading, summary, meta, viewOnly, status, readingHost);
  status.textContent = t('docs.loading', 'loading…');
  void (async () => {
    const result = await request(`/api/ways/${encodeURIComponent(row.scope)}/${encodeURIComponent(row.name)}`, { cache: 'no-store' });
    if (!active) return;
    if (!result.ok) { status.textContent = result.message; status.dataset.bad = 'true'; return; }
    status.textContent = '';
    readingHost.replaceChildren(renderMarkdownDocument(result.data?.text || ''));
  })();
  return () => { active = false; };
}

export function createBehaviourSurface(initial = {}) {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('behaviours.title', 'Behaviors'), className: 'behaviour-surface' });
  let rows = [];
  const stones = createStoneWorkSurface({ className: 'behaviour-stones', renderDetail: (item, host) => viewer(item.row, host) });
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
