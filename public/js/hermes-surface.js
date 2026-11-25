/* part of the ronin-cowork client — see js/README.md */
/**
 * HERMES'S CONNECTIONS AND MODEL OPTIONS — Hermes owns an installed runtime; Ronin owns named API
 * connections and launch setups (src/hermes-setups.ts). Mounted in Setup's Hermes bar and on
 * Settings' Hermes page.
 *
 * ERABI THROUGHOUT (owner, 24 Nov 2026): every press is an ERABI stone of one size, and every choice
 * (API provider, Wire API, connection, model, reasoning, approvals) is an ERABI question (ask.js).
 * Only what is typed (a name, a URL, a key) is a text field.
 */
import { request } from './request.js';
import { loadProviderCatalog } from './form-steps.js';
import { ask } from './ask.js';
import { createStep } from './form-steps.js';

const el = (tag, cls = '', text = null) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = String(text); return node; };
const input = (value = '', type = 'text') => { const node = el('input'); node.type = type; node.value = value; return node; };
const field = (name, control) => { control.setAttribute('aria-label', name); const node = el('label', 'hermes-field', name); node.append(control); return node; };
const stone = (name, fn) => {
  const out = el('button', 'ask-opt ask-rect');
  out.type = 'button';
  out.append(el('span', 'ask-name', name));
  out.addEventListener('click', () => { if (!out.disabled) fn(); });
  return out;
};
const stones = (...items) => { const row = el('div', 'ask hermes-stones'); row.dataset.density = 'tight'; row.append(...items); return row; };
const rows = (pairs) => pairs.map(([v, l]) => ({ v, l }));

// Stone names fit the stone; the sentence goes in the caption (ask.js `sub`).
const PROVIDERS = [{ v: 'openai', l: 'OpenAI' }, { v: 'mistral', l: 'Mistral' }, { v: 'custom', l: 'Other API', sub: 'Any OpenAI-compatible API: OpenRouter, a local server, …' }];
const WIRE = rows([['chat', 'Chat Completions'], ['responses', 'Responses']]);
const APPROVALS = rows([['off', 'Approvals off'], ['prompt', 'Ask for approval']]);
const BASE = { openai: 'https://api.openai.com/v1', mistral: 'https://api.mistral.ai/v1', custom: '' };

export function mountHermesSurface(host, provider, onChanged) {
  let disposed = false;
  let state = { connections: [], setups: [] };
  const root = el('section', 'hermes-settings'); host.append(root);
  const notice = el('p'); notice.setAttribute('role', 'status');
  const editor = el('div');
  let question = null;
  const closeEditor = () => { question?.destroy?.(); question = null; editor.replaceChildren(); };
  const run = async (action, body) => {
    notice.textContent = 'Saving…';
    const result = await request(`/api/hermes/${action}`, { method: 'POST', json: body });
    if (disposed) return false;
    if (!result.ok) { notice.textContent = result.message; return false; }
    state = result.data;
    await loadProviderCatalog();
    if (onChanged) await onChanged();
    paint(); return true;
  };

  const editConnection = (connection = {}) => {
    closeEditor();
    const form = el('form', 'hermes-editor');
    const name = input(connection.name || '');
    const url = input(connection.baseUrl || BASE.openai, 'url');
    const key = input('', 'password'); key.autocomplete = 'new-password';
    const inferredWire = connection.provider === 'openai' && connection.baseUrl === BASE.openai ? 'responses' : 'chat';
    let wireChanged = false;
    let chosen = { provider: connection.provider || 'openai', wire: connection.wireApi || inferredWire };
    question = ask([{ fields: [
      { key: 'provider', label: 'API provider', options: PROVIDERS },
      { key: 'wire', label: 'Wire API', options: WIRE },
    ] }], { value: chosen, density: 'tight', onChange: (value) => {
      if (value.provider !== chosen.provider) url.value = BASE[value.provider] ?? '';
      if (value.wire !== chosen.wire) wireChanged = true;
      chosen = { ...value };
    } });
    const save = stone('Save', () => form.requestSubmit());
    form.append(el('h3', '', connection.id ? 'Edit API connection' : 'Add an API connection'), field('Name', name), question.el, field('Base URL', url),
      field(connection.id ? 'API key (blank keeps it)' : 'API key', key), stones(save, stone('Cancel', closeEditor)));
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); save.disabled = true;
      try { await run('connection', { id: connection.id, name: name.value, provider: chosen.provider, baseUrl: url.value, wireApi: !connection.id || wireChanged ? chosen.wire : connection.wireApi, apiKey: key.value }); }
      finally { key.value = ''; save.disabled = false; }
    });
    editor.append(form); name.focus();
  };

  const editSetup = (setup = {}) => {
    closeEditor();
    const form = el('form', 'hermes-editor');
    const name = input(setup.name || '');
    const connectionOf = (id) => state.connections.find((c) => c.id === id);
    const modelsOf = (c) => rows((c?.models || []).map((id) => [id, id]));
    const levelsOf = (c) => (c?.provider === 'openai' || c?.wireApi === 'responses' ? ['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max'] : ['default'])
      .map((id) => ({ v: id, l: id === 'default' ? 'Provider default' : id }));
    const first = setup.connection || state.connections[0]?.id || '';
    const c0 = connectionOf(first);
    let chosen = {
      connection: first,
      model: c0?.models.includes(setup.model) ? setup.model : c0?.models[0] || '',
      reasoning: levelsOf(c0).some((l) => l.v === setup.reasoning) ? setup.reasoning : c0?.provider === 'openai' ? 'medium' : 'default',
      approvals: setup.approvals || 'off',
    };
    question = ask([{ fields: [
      { key: 'connection', label: 'API connection', options: rows(state.connections.map((c) => [c.id, nameOf(c)])) },
      { key: 'model', label: 'API model', options: modelsOf(c0) },
      { key: 'reasoning', label: 'Reasoning effort', options: levelsOf(c0) },
      { key: 'approvals', label: 'Approvals', options: APPROVALS },
    ] }], { value: chosen, density: 'tight', onChange: (value) => {
      if (value.connection !== chosen.connection) {
        const c = connectionOf(value.connection);
        question.options('model', modelsOf(c));
        question.options('reasoning', levelsOf(c));
        question.set({ model: c?.models[0] || '', reasoning: c?.provider === 'openai' ? 'medium' : 'default' });
        chosen = question.value();
        return;
      }
      chosen = { ...value };
    } });
    const save = stone('Save', () => form.requestSubmit());
    form.append(el('h3', '', setup.id ? 'Edit model option' : 'Add a model option'), field('Name under Model', name), question.el, stones(save, stone('Cancel', closeEditor)));
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); save.disabled = true;
      try { await run('setup', { id: setup.id, name: name.value, ...chosen }); } finally { save.disabled = false; }
    });
    editor.append(form); name.focus();
  };

  // TABLES (owner, 25 Nov 2026): each list is a table, one row per entry, its title first; on the right
  // an icon to edit and one to remove; under the last row one Add line. No cards, no add card.
  const SVG = 'http://www.w3.org/2000/svg';
  const ICONS = {
    edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
    remove: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
    read: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4',
  };
  const icon = (name, label, fn) => {
    const out = el('button', 'hermes-icon'); out.type = 'button'; out.title = label; out.setAttribute('aria-label', label);
    const svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG, 'path'); path.setAttribute('d', ICONS[name]); svg.append(path); out.append(svg);
    out.addEventListener('click', () => { if (!out.disabled) fn(); });
    return out;
  };
  const table = (heads, rows, addLabel, onAdd, addNote = '') => {
    const out = el('table', 'hermes-table');
    const head = el('tr'); for (const h of [...heads, '']) head.append(el('th', '', h));
    const thead = el('thead'); thead.append(head);
    const body = el('tbody');
    for (const { cells, actions } of rows) {
      const tr = el('tr');
      cells.forEach((cell, i) => tr.append(el(i ? 'td' : 'th', '', cell)));
      const tools = el('td', 'hermes-tools'); tools.append(...actions); tr.append(tools);
      body.append(tr);
    }
    const add = el('tr', 'hermes-add'); const cell = el('td'); cell.colSpan = heads.length + 1;
    const press = el('button', 'hermes-add-line', `+ ${addLabel}`); press.type = 'button'; press.disabled = !onAdd;
    if (onAdd) press.addEventListener('click', onAdd);
    cell.append(press); if (addNote) cell.append(el('span', 'hermes-add-note', addNote));
    add.append(cell); body.append(add);
    out.append(thead, body);
    return out;
  };
  // TWO COLLAPSIBLE STEPS, the form idiom of New Team (form-steps.js createStep): open by default;
  // folded, each says in a line what it holds.
  const open = { connections: true, setups: true };
  const step = (n, key, title, meta) => {
    const made = createStep({ n, key, title, onToggle: () => { open[key] = !open[key]; made.setCollapsed(!open[key], meta, true); } });
    made.setCollapsed(!open[key], meta, true);
    return made;
  };
  // ONE NAME FOR THE GATEWAY (owner, 25 Nov 2026): the office's Ronin API connection reads "Ronin gateway"
  // here, as on the harness bars, whatever its stored name; its kind comes resolved (src/hermes-setups.ts accountKind).
  const isGateway = (c) => c.kind === 'ronin_api';
  const nameOf = (c) => (isGateway(c) ? 'Ronin gateway' : c.name);
  const names = (list) => list.map(nameOf).join(', ');
  const modelsLine = (c) => (c.discoveredAt ? `${c.models.length} model${c.models.length === 1 ? '' : 's'}` : 'model list not read yet');

  const paint = () => {
    if (disposed) return;
    closeEditor();
    notice.textContent = '';
    const intro = el('p', '', 'Hermes runs on an API connection. Each model option is one model from a connection, and shows under Model when you start a Hermes Agent.');
    root.replaceChildren(intro, notice);

    const connections = step(1, 'connections', 'API connections', state.connections.length
      ? `${state.connections.length} · ${names(state.connections)}` : 'None yet');
    connections.body.append(table(['Name', 'API', 'Models'], state.connections.map((c) => ({
      cells: [nameOf(c), isGateway(c) ? 'Ronin’s own models' : `${c.provider === 'custom' ? 'OpenAI-compatible' : c.provider === 'mistral' ? 'Mistral' : 'OpenAI'}${c.configured ? '' : ' · key missing'}`,
        c.discoveredAt ? String(c.models.length) : 'Not read'],
      actions: [icon('read', 'Read its models', () => run('discover', { id: c.id })),
        ...(isGateway(c) ? [] : [icon('edit', 'Edit', () => editConnection(c))]),
        ...(c.credentialEnv || isGateway(c) ? [] : [icon('remove', 'Remove', () => run('delete', { kind: 'connections', id: c.id }))])],
    })), 'Add a connection', () => editConnection()));

    const setups = step(2, 'setups', 'Hermes model options', state.setups.length ? `${state.setups.length} · ${names(state.setups)}` : 'None yet');
    const canAdd = state.connections.some((c) => c.models.length);
    setups.body.append(table(['Name', 'Connection', 'Model', 'Reasoning', 'Approvals'], state.setups.map((setup) => {
      const c = state.connections.find((one) => one.id === setup.connection);
      return {
        cells: [setup.name, c ? nameOf(c) : 'Missing', setup.model, setup.reasoning === 'default' ? 'Default' : setup.reasoning, setup.approvals === 'off' ? 'Off' : 'Ask'],
        actions: [icon('edit', 'Edit', () => editSetup(setup)), icon('remove', 'Remove', () => run('delete', { kind: 'setups', id: setup.id }))],
      };
    }), 'Add a model option', canAdd ? () => editSetup() : null, canAdd ? '' : 'Read a connection’s models first.'));

    root.append(connections.el, setups.el, editor,
      el('p', 'hermes-fine', 'Changes apply to Agents started after them; a new key is picked up when an Agent restarts. Removing a connection does not revoke its key at the API provider.'));
  };
  void request('/api/hermes').then((result) => { if (disposed) return; if (result.ok) { state = result.data; paint(); } else { root.append(notice); notice.textContent = result.message; } });
  return () => { disposed = true; closeEditor(); };
}
