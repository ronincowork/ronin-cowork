/* Behaviors — shared reader and optional guidance editor. */
import { request } from './request.js';
import { createStoneWorkSurface } from './stone-work-surface.js';
import { addProvMark } from './provenance.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { renderMarkdownDocument } from './markdown-reader.js';

export const BEHAVIOUR_SURFACE_TYPE = 'campaign.behaviours';
const node = (tag, cls = '', text = '') => { const out = document.createElement(tag); if (cls) out.className = cls; if (text) out.textContent = text; return out; };
const keyOf = (row) => `${row.scope}:${row.name}`;
const field = (label, value = '') => {
  const wrap = node('label', 'bh-field', label);
  const input = node('input'); input.value = value; wrap.append(input);
  return { wrap, input };
};
const parts = (text) => {
  const match = String(text).match(/^(#[^\n]*\n\n)((?:- \*\*[^\n]+\n)+)\n([\s\S]*)$/);
  return match ? { title: match[1], metadata: match[2], body: match[3] } : null;
};
const metadataValue = (metadata, key) => metadata.match(new RegExp(`^- \\*\\*${key}:\\*\\* (.*)$`, 'm'))?.[1] || '';
const setMetadata = (metadata, key, value) => {
  const line = `- **${key}:** ${value}`;
  const pattern = new RegExp(`^- \\*\\*${key}:\\*\\* .*$`, 'm');
  return pattern.test(metadata) ? metadata.replace(pattern, line) : `${metadata}${line}\n`;
};

function group(row) {
  if (row.scope === 'floor') return t('behaviours.auto', 'All Cowork Agents');
  if (row.scope === 'conditional') return t('behaviours.conditional', 'Conditional');
  return t('behaviours.available', 'Optional');
}

function viewer(row, host, afterSave) {
  let active = true;
  const heading = node('h2', 'bh-title', row.label || row.name);
  addProvMark(heading, row);
  const summary = node('p', 'bh-summary', row.blurb || '');
  const meta = node('p', 'bh-meta', [group(row), row.requires?.length ? `${t('behaviours.requires', 'When')}: ${row.requires.join(', ')}` : '', row.origin === 'user' ? t('behaviours.yours', 'Yours') : t('behaviours.stock', 'Ronin')].filter(Boolean).join(' · '));
  const status = node('p', 'bh-status'); status.setAttribute('role', 'status');
  const readingHost = node('div', 'bh-reading');
  const actions = node('div', 'bh-actions');
  host.append(heading, summary, meta, actions, status, readingHost);
  const edit = (document = null) => {
    const source = parts(document?.text || '') || { title: `# ${row.label || 'New Behavior'}\n\n`, metadata: '- **scope:** selected\n', body: document?.text || '' };
    const name = field(t('behaviours.name', 'Name'), row.name || '');
    const label = field(t('behaviours.label', 'Label'), metadataValue(source.metadata, 'label') || row.label || '');
    const blurb = field(t('behaviours.blurb', 'Summary'), metadataValue(source.metadata, 'blurb') || row.blurb || '');
    const guidance = node('label', 'bh-field', t('behaviours.guidance', 'Guidance'));
    const body = node('textarea'); body.value = source.body; body.rows = 12; guidance.append(body);
    const message = node('p', 'bh-status'); message.setAttribute('role', 'status');
    const save = node('button', 'wk-action', !document ? t('behaviours.create', 'Create Behavior') : document.origin === 'user' ? t('forms.save', 'Save') : t('behaviours.save_mine', 'Save my version'));
    const saveAs = node('button', 'wk-action', t('behaviours.save_as', 'Save As new'));
    const cancel = node('button', 'wk-action', t('forms.cancel', 'Cancel'));
    for (const button of [save, saveAs, cancel]) button.type = 'button';
    const form = node('div', 'bh-editor');
    form.append(name.wrap, label.wrap, blurb.wrap, guidance, save, saveAs, cancel, message);
    saveAs.hidden = !document;
    readingHost.replaceChildren(form);
    actions.replaceChildren();
    name.input.readOnly = Boolean(document);
    cancel.addEventListener('click', () => { if (document) readingHost.replaceChildren(renderMarkdownDocument(document.text)); else readingHost.replaceChildren(); showActions(document); });
    const write = async (asNew) => {
      const target = asNew || !document ? name.input.value.trim() : row.name;
      let metadata = setMetadata(source.metadata, 'label', label.input.value.trim());
      metadata = setMetadata(metadata, 'blurb', blurb.input.value.trim());
      metadata = setMetadata(metadata, 'scope', 'selected');
      const text = `${source.title.replace(/^#.*\n/, `# ${label.input.value.trim() || target}\n`)}${metadata}\n${body.value.trim()}\n`;
      const result = asNew || !document
        ? await request('/api/ways', { method: 'POST', json: { scope: 'selected', name: target, text } })
        : document.origin === 'stock'
          ? await request('/api/ways', { method: 'POST', json: { scope: 'selected', name: target, text, shadow: true } })
          : await request(`/api/ways/selected/${encodeURIComponent(target)}`, { method: 'PUT', json: { text, revision: document.revision } });
      if (!active) return;
      if (!result.ok) { message.textContent = result.message; message.dataset.bad = 'true'; return; }
      window.dispatchEvent(new Event('ronin:behaviours-changed'));
      afterSave(`selected:${target}`);
    };
    save.addEventListener('click', () => void write(false));
    let namingCopy = false;
    saveAs.addEventListener('click', () => {
      if (namingCopy) return void write(true);
      namingCopy = true; name.input.readOnly = false; name.input.value = ''; name.input.focus(); save.hidden = true;
      saveAs.textContent = t('behaviours.create', 'Create new Behavior');
    });
  };
  const showActions = (document) => {
    actions.replaceChildren();
    if (row.scope !== 'selected') return;
    const button = node('button', 'wk-action', t('behaviours.edit', 'Edit'));
    button.type = 'button'; button.addEventListener('click', () => edit(document)); actions.append(button);
  };
  if (row.new) { status.textContent = ''; edit(); return () => { active = false; }; }
  status.textContent = t('docs.loading', 'loading…');
  void (async () => {
    const result = await request(`/api/ways/${encodeURIComponent(row.scope)}/${encodeURIComponent(row.name)}`, { cache: 'no-store' });
    if (!active) return;
    if (!result.ok) { status.textContent = result.message; status.dataset.bad = 'true'; return; }
    status.textContent = '';
    readingHost.replaceChildren(renderMarkdownDocument(result.data?.text || ''));
    showActions(result.data);
  })();
  return () => { active = false; };
}

export function createBehaviourSurface(initial = {}) {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('behaviours.title', 'Behaviors'), className: 'behaviour-surface' });
  let rows = [];
  const stones = createStoneWorkSurface({ className: 'behaviour-stones', renderDetail: (item, host) => viewer(item.row, host, refresh) });
  const intro = node('div', 'sws-intro');
  intro.append(node('h2', '', t('behaviours.title', 'Behaviors')), node('p', '', t('behaviours.intro', 'Behaviors are specific guidance given to Agents at birth.')));
  const add = node('button', 'wk-action', t('behaviours.new', 'New optional Behavior'));
  add.type = 'button'; add.addEventListener('click', () => stones.openDetail({ row: { scope: 'selected', new: true } }, { returnFocus: add }));
  intro.append(add);
  stones.mount(surface.content, { before: [intro] });
  const items = () => {
    const visible = rows.filter((row) => row.scope === 'floor' || row.scope === 'conditional' || (row.scope === 'selected' && !row.installation));
    const ordered = ['selected', 'floor', 'conditional'].flatMap((scope) => visible.filter((row) => row.scope === scope));
    return ordered.map((row) => ({ id: keyOf(row), label: row.label || row.name, group: group(row), secondary: row.blurb || '', state: row.origin === 'user' ? t('behaviours.yours', 'Yours') : '', row }));
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
    summary: () => t('behaviours.card_summary', 'Optional, All Cowork Agents, and Conditional guidance Agents receive at birth.'),
    create: ({ detail }) => createBehaviourSurface(detail),
  });
}
