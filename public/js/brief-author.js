/* part of the ronin-cowork client — see js/README.md */
/** WRITE YOUR OWN (docs/architecture/brief.md, The files and their header; Where it is set in the UI): a behaviour, a tool for a command the user has, a bridge
 * (a behaviour in play when its integration is on, with the tools that serve it, in one Save),
 * or the user's own version of a stock file. A plain form; the browser composes the file's
 * header and writes it to the user's store through /api/brief/files. Nothing is checked
 * against the machine: a tool names a command, and the file is written (no guards). */
import { request } from './request.js';
import { ask } from './ask.js';
import { t } from './lexicon.js';
import { el } from './form-steps.js';
import { WorkspaceKit } from './workspace-kit.js';

const FIELDS = ['seed', 'line', 'when', 'depth', 'serves', 'order'];
const list = (text) => String(text || '').split(',').map((part) => part.trim()).filter(Boolean);
const slug = (text) => String(text || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** A file's header and text: `# Title`, then `- **field:** value` lines, a blank line, the text.
 *  Header lines this form does not draw (`hidden:` …) are kept as they are. */
export function parseFile(text = '') {
  const lines = String(text).split('\n');
  const out = { title: '', seed: '', line: '', when: [], depth: '', serves: [], order: '', extra: [], body: '' };
  let at = 0;
  if (/^#\s+/.test(lines[0] || '')) { out.title = lines[0].replace(/^#\s+/, '').trim(); at = 1; }
  for (; at < lines.length; at++) {
    const match = lines[at].match(/^- \*\*([a-z_]+):\*\*\s?(.*)$/);
    if (!match) break;
    const [, key, value] = match;
    if (key === 'when' || key === 'serves') out[key] = list(value);
    else if (FIELDS.includes(key)) out[key] = value.trim();
    else out.extra.push(lines[at]);
  }
  out.body = lines.slice(at).join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
  return out;
}

/** The file text for a parsed shape. */
export function fileText(file) {
  const head = [`# ${file.title || 'Untitled'}`];
  if (file.line) head.push(`- **line:** ${file.line}`);
  else head.push(`- **seed:** ${file.seed || ''}`);
  head.push(`- **when:** ${(file.when || []).join(', ')}`.trimEnd());
  if (file.depth) head.push(`- **depth:** ${file.depth}`);
  if (file.serves?.length) head.push(`- **serves:** ${file.serves.join(', ')}`);
  head.push(`- **order:** ${file.order || 50}`);
  head.push(...(file.extra || []));
  return `${head.join('\n')}\n\n${(file.body || '').trim()}\n`;
}

/** Write one file: a new one, the user's own version of a stock one, or an update to theirs. */
async function writeFile(scope, name, text, existing = null) {
  if (!existing) return request('/api/brief/files', { method: 'POST', json: { kind: scope, name, text } });
  if (existing.origin !== 'user') return request('/api/brief/files', { method: 'POST', json: { kind: scope, name, text, shadow: true } });
  return request(`/api/brief/files/${encodeURIComponent(scope)}/${encodeURIComponent(name)}`, { method: 'PUT', json: { text, revision: existing.revision } });
}

function depths() {
  return [
  { v: 'none', l: t('author.depth_none', 'When added'), sub: t('author.depth_none_sub', 'Told only where a Campaign, Workspace, Team or Agent adds it.') },
  { v: 'seed', l: t('author.depth_seed', 'Seed'), sub: t('author.depth_seed_sub', 'Its one line, and where to read more.') },
  { v: 'full', l: t('author.depth_full', 'Full'), sub: t('author.depth_full_sub', 'The whole text, from the start.') },
  ];
}

/**
 * The form. `mode` is 'behaviour' | 'tool' | 'bridge' | 'fact'; `existing` the file as read
 * (`{ name, scope, text, origin, revision }`) when editing or making a version of one.
 * `onDone(key)` after a save, with the `scope:name` to select; `onCancel()`.
 */
export function createAuthorForm({ mode = 'behaviour', existing = null, catalog = [], conditionals = [], onDone = () => {}, onCancel = () => {} } = {}) {
  const { createField, createAction, createActionBar } = WorkspaceKit.primitives;
  const root = el('div', 'bh-editor brief-author');
  const parsed = parseFile(existing?.text || '');
  const asks = [];
  // The app's own controls (the kit's labelled fields), in a compact grid like the Agent step.
  const input = (value = '', placeholder = '') => { const i = el('input', 'wk-field-control'); i.type = 'text'; i.value = value; i.placeholder = placeholder; i.spellcheck = false; return i; };
  const area = (value = '', rows = 10) => { const a = el('textarea', 'wk-field-control'); a.value = value; a.rows = rows; return a; };
  const field = (host, label, control, help = '', wide = false) => {
    const f = createField({ label, control }).el;
    f.classList.add('brief-author-field');
    if (wide) f.classList.add('brief-author-wide');
    if (help) f.append(el('p', 'na-behaviour-note', help));
    host.append(f); return control;
  };
  const behaviours = catalog.filter((row) => row.kind === 'behaviour' && !row.mandate).map((row) => ({ v: row.name, l: row.title || row.name, sub: row.seed || '' }));
  const whenRows = conditionals.map((name) => ({ v: name, l: name }));

  const isTool = mode === 'tool';
  const isBridge = mode === 'bridge';
  const isFact = mode === 'fact';
  const grid = el('div', 'brief-author-grid');
  root.append(grid);
  const name = existing ? null : input('', isTool ? t('author.command_placeholder', 'the command, e.g. deploy-site') : t('author.name_placeholder', 'from the title if left blank'));
  const integration = isBridge ? input('', t('author.integration_placeholder', 'e.g. netlify')) : null;
  if (isBridge) field(grid, t('author.integration', 'Integration'), integration, t('author.integration_help', 'Its behavior is told to an Agent while this integration is on for it.'));
  if (name && !isBridge) field(grid, isTool ? t('author.command', 'Command') : t('author.name', 'Name'), name,
    isTool ? t('author.command_help', 'A command you have, on the PATH or in ~/ronin/custom/tools. Ronin writes what Agents are told about it; the command stays yours.') : '');
  const title = field(grid, t('author.title', 'Title'), input(parsed.title));
  const seed = isFact ? null : field(grid, t('author.seed', 'Seed'), input(parsed.seed), isTool ? t('author.seed_tool_help', 'Its one job, in one line.') : t('author.seed_help', 'One line that stands on its own: what this guidance is for.'), true);
  const factLine = isFact ? field(grid, t('author.line', 'Line'), input(parsed.line), t('author.line_help', 'The line the brief prints, with values in braces: User: {user.name}.'), true) : null;

  /* When, depth and serves: one row of stones, each named once on its own stone. */
  const choices = [];
  if (!isTool && !isBridge) choices.push({ key: 'when', label: t('author.when', 'When it is in play'), many: true, options: whenRows });
  // What you write is meant to be told: a new behaviour or bridge starts Full, a tool Seed.
  if (!isFact) choices.push({ key: 'depth', label: t('author.depth', 'Depth'), options: depths() });
  if (isTool) choices.push({ key: 'serves', label: t('author.serves', 'Serves'), many: true, options: behaviours });
  const picked = choices.length ? ask([{ fields: choices }], {
    value: { when: parsed.when, depth: parsed.depth || (isTool ? 'seed' : 'full'), serves: parsed.serves }, density: 'tight',
  }) : null;
  if (picked) {
    asks.push(picked);
    // The row's help line first, then its stones (as every group's help sits under its name).
    root.append(el('p', 'na-behaviour-note', isTool ? t('author.serves_help', 'Serves: told under these behaviors. None: under Other tools.')
      : isBridge ? t('author.depth_help', 'Depth: how much of it an Agent is told.') : t('author.when_help', 'When it is in play: all chosen must hold. None chosen: every Agent.')), picked.el);
  }
  const body = field(root, isTool ? t('author.tool_text', 'What --help does not say') : t('author.text', 'Text'), area(parsed.body, isTool ? 5 : 10));

  /* A bridge's tools: new tool files, each a command and its one job, serving the bridge. */
  const tools = [];
  const toolsHost = el('div', 'brief-author-tools');
  if (isBridge) {
    root.append(el('div', 'ask-group-head', t('author.bridge_tools', 'Its tools')));
    const addTool = () => {
      const row = el('div', 'brief-author-grid');
      const command = field(row, t('author.command', 'Command'), input('', t('author.command_placeholder', 'the command, e.g. deploy-site')));
      const job = field(row, t('author.seed_tool', 'Its one job'), input('', t('author.seed_tool_help', 'Its one job, in one line.')));
      toolsHost.append(row); tools.push({ command, job });
    };
    const more = createAction({ label: t('author.add_tool', 'Add a tool'), action: addTool });
    addTool();
    const moreBar = createActionBar({ label: t('author.bridge_tools', 'Its tools') });
    moreBar.el.append(more.el);
    root.append(toolsHost, moreBar.el);
  }

  const status = el('p', 'bh-status'); status.setAttribute('role', 'status');
  const saveLabel = !existing ? t('author.create', 'Create') : existing.origin === 'user' ? t('forms.save', 'Save') : t('behaviours.save_mine', 'Save my version');
  // The Agent step's own actions: the kit's action bar, standard height, the save primary.
  const save = createAction({ label: saveLabel, kind: 'primary', endsEdit: true, action: () => doSave() });
  const cancel = createAction({ label: t('forms.cancel', 'Cancel'), endsEdit: true, action: () => onCancel() });
  const actions = createActionBar({ label: t('author.actions', 'Save or cancel'), className: 'ntf-actions' }).el; actions.append(save.el, cancel.el, status);
  root.append(actions);

  const shape = () => ({
    ...parsed, title: title.value.trim(), seed: seed?.value.trim() || '', line: factLine?.value.trim() || '',
    when: !isTool && !isBridge ? [...(picked?.value().when || [])] : parsed.when, depth: isFact ? '' : picked?.value().depth || '',
    serves: isTool ? [...(picked?.value().serves || [])] : parsed.serves, body: body.value,
  });
  async function doSave() {
    status.textContent = ''; delete status.dataset.bad;
    const fail = (message) => { status.textContent = message; status.dataset.bad = 'true'; };
    const scope = existing?.scope || (isTool ? 'tools' : isFact ? 'facts' : 'behaviours');
    if (isBridge) {
      const service = slug(integration.value);
      if (!service) return fail(t('author.integration_needed', 'Name the integration.'));
      const bridge = `${service}-bridge`;
      const made = await writeFile('behaviours', bridge, fileText({ ...shape(), title: title.value.trim() || `${service} bridge`, when: [`integration:${service}`] }));
      if (!made.ok) return fail(made.message);
      for (const tool of tools) {
        const command = tool.command.value.trim();
        if (!command) continue;
        const written = await writeFile('tools', command, fileText({ title: command, seed: tool.job.value.trim(), when: [], depth: 'seed', serves: [bridge], body: '' }));
        if (!written.ok) return fail(`${command}: ${written.message}`);
      }
      return onDone(`behaviours:${bridge}`);
    }
    const target = existing?.name || (isTool ? name.value.trim() : slug(name.value || title.value));
    if (!target) return fail(isTool ? t('author.command_needed', 'Name the command.') : t('author.name_needed', 'Give it a name.'));
    const result = await writeFile(scope, target, fileText(shape()), existing);
    if (!result.ok) return fail(result.message);
    onDone(`${scope}:${target}`);
  }
  return { el: root, destroy: () => asks.forEach((one) => one.destroy()) };
}
