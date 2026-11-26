/* Behaviors (docs/architecture/brief.md, The files and their header; Where it is set in the UI): every
 * fact, behaviour and tool file to read, or to replace with their own version by name. Which are on
 * is each level's Configuration (the Campaign's Defaults, a Workspace, a Team).
 * Over /api/brief/catalog and /api/brief/files. */
import { request } from './request.js';
import { createPhalanx } from './phalanx.js';
import { addProvMark } from './provenance.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { renderMarkdownDocument } from './markdown-reader.js';
import { scopeOf } from './brief-step.js';
import { createAuthorForm } from './brief-author.js';
import { AXES } from './mandates.js';

export const BEHAVIOUR_SURFACE_TYPE = 'campaign.behaviours';
const node = (tag, cls = '', text = '') => { const out = document.createElement(tag); if (cls) out.className = cls; if (text) out.textContent = text; return out; };
const keyOf = (row) => `${row.scope}:${row.name}`;

function mandateGroup(axis) {
  const word = ({ reach: t('reach', 'Reach'), recruit: t('recruit', 'Recruit'), output: t('output', 'Output') })[axis] || axis;
  return t('brief.mandate_group', 'Mandate: {axis}', { axis: word });
}
function groupOf(scope) {
  return ({ facts: t('brief.facts', 'Facts'), behaviours: t('behaviours', 'Behaviors'), tools: t('brief.tools', 'Tools') })[scope] || scope;
}

/** The conditionals a "when" can name: the server's list, less those that need a value typed in. */
async function readConditionals() {
  const result = await request('/api/brief/conditionals', { cache: 'no-store' });
  return result.ok && Array.isArray(result.data) ? result.data.filter((name) => !String(name).includes('<')) : [];
}
const modeOf = (row) => (row.scope === 'tools' ? 'tool' : row.scope === 'facts' ? 'fact' : 'behaviour');

function viewer(row, host, afterSave, context) {
  let active = true;
  let form = null;
  const heading = node('h2', 'bh-title', row.title || row.name || ({ tool: t('author.new_tool', 'New tool'), bridge: t('author.new_bridge', 'New bridge') })[row.mode] || t('behaviours.new', 'New Behavior'));
  addProvMark(heading, row);
  const summary = node('p', 'bh-summary', row.seed || row.line || '');
  const meta = node('p', 'bh-meta', [row.mandate ? mandateGroup(row.mandate) : groupOf(row.scope), row.origin === 'user' ? t('behaviours.yours', 'Yours') : row.origin ? t('behaviours.stock', 'Ronin') : ''].filter(Boolean).join(' · '));
  const status = node('p', 'bh-status'); status.setAttribute('role', 'status');
  const readingHost = node('div', 'bh-reading');
  const actions = node('div', 'bh-actions');
  host.append(heading, summary, meta, actions, status, readingHost);
  // Write, edit or make a version: the plain form (brief-author.js), never the raw file.
  const edit = async (file = null) => {
    const conditionals = await readConditionals();
    if (!active) return;
    form?.destroy();
    form = createAuthorForm({ mode: row.mode || modeOf(row), existing: file, catalog: context.rows(), conditionals,
      onDone: (key) => { window.dispatchEvent(new Event('ronin:behaviours-changed')); afterSave(key); },
      onCancel: () => { form?.destroy(); form = null; readingHost.replaceChildren(file ? renderMarkdownDocument(file.text) : ''); showActions(file); } });
    readingHost.replaceChildren(form.el);
    actions.replaceChildren();
  };
  const showActions = (file) => {
    if (!file) return;
    const button = node('button', 'wk-action', file.origin === 'user' ? t('behaviours.edit', 'Edit') : t('author.make_mine', 'Make my version'));
    button.type = 'button'; button.addEventListener('click', () => void edit(file)); actions.replaceChildren(button);
  };
  if (row.new) { void edit(); return () => { active = false; form?.destroy(); }; }
  status.textContent = t('docs.loading', 'loading…');
  void (async () => {
    const result = await request(`/api/brief/files/${encodeURIComponent(row.scope)}/${encodeURIComponent(row.name)}`, { cache: 'no-store' });
    if (!active) return;
    if (!result.ok) { status.textContent = result.message; status.dataset.bad = 'true'; return; }
    status.textContent = '';
    readingHost.replaceChildren(renderMarkdownDocument(result.data?.text || ''));
    showActions(result.data);
  })();
  return () => { active = false; form?.destroy(); };
}

export function createBehaviourSurface(initial = {}) {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('behaviours.title', 'Behaviors'), className: 'behaviour-surface' });
  let rows = [];
  const stones = createPhalanx({ className: 'behaviour-stones', renderDetail: (item, host) => viewer(item.row, host, refresh, { rows: () => rows }) });
  const intro = node('div', 'sws-intro');
  intro.append(node('h2', '', t('behaviours.title', 'Behaviors')), node('p', '', t('brief.files_help', 'What Agents can be told. Open any file to read it, or save your own version: yours replaces Ronin’s by name and survives updates.')));
  // Write your own: a behaviour, a tool for a command you have, or a bridge (docs/architecture/brief.md, Where it is set in the UI).
  const adds = node('div', 'bh-actions');
  for (const [mode, scope, label] of [['behaviour', 'behaviours', t('behaviours.new', 'New Behavior')], ['tool', 'tools', t('author.new_tool', 'New tool')], ['bridge', 'behaviours', t('author.new_bridge', 'New bridge')]]) {
    const add = WorkspaceKit.primitives.createAction({ label, size: 'compact', action: () => stones.openDetail({ row: { scope, mode, new: true } }, { returnFocus: add.el }) });
    adds.append(add.el);
  }
  intro.append(adds);
  stones.mount(surface.content, { before: [intro] });
  // Behaviors, then the mandate values by axis (each a behaviour file, docs/architecture/brief.md, Mandates), Facts, Tools.
  const shelves = [['behaviours', ''], ...AXES.map((axis) => ['behaviours', axis]), ['facts', ''], ['tools', '']];
  const items = () => shelves.flatMap(([scope, axis]) => rows.filter((row) => row.scope === scope && (row.mandate || '') === axis))
    // A stone carries the name only (its seed would be cut short); the opened file says the rest.
    .map((row) => ({ id: keyOf(row), label: row.title || row.name, group: row.mandate ? mandateGroup(row.mandate) : groupOf(row.scope), secondary: '', state: row.origin === 'user' ? t('behaviours.yours', 'Yours') : '', row }));
  async function refresh(select = '') {
    surface.setState('loading', t('customize.reading', 'reading…'));
    const result = await request('/api/brief/catalog', { cache: 'no-store' });
    if (!result.ok || !Array.isArray(result.data)) { surface.setState('failed', result.message || t('customize.not_a_list', 'the route did not answer with a list')); return; }
    rows = result.data.map((row) => ({ ...row, scope: scopeOf(row.kind) })); stones.setItems(items()); surface.setState(null, '');
    const wanted = select || (initial.scope && initial.name ? `${scopeOf(initial.scope)}:${initial.name}` : '');
    if (wanted) stones.select(wanted);
  }
  return {
    el: surface.el,
    show: (detail = {}) => { if (detail.scope && detail.name) initial = detail; void refresh(); },
    enter: () => { void refresh(); },
    destroy: () => { stones.destroy(); },
  };
}

export function registerBehaviourSurface() {
  const { surfaces } = WorkspaceKit.workbench;
  if (!surfaces.has(BEHAVIOUR_SURFACE_TYPE)) surfaces.register({
    type: BEHAVIOUR_SURFACE_TYPE,
    header: 'surface',
    label: () => t('behaviours.title', 'Behaviors'),
    summary: () => t('brief.card_summary', 'What every Agent is told: facts, behaviors and tools, and your own versions of them.'),
    create: ({ detail }) => createBehaviourSurface(detail),
  });
}
