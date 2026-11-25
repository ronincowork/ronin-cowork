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
const PROVIDERS = [{ v: 'openai', l: 'OpenAI' }, { v: 'mistral', l: 'Mistral' }, { v: 'custom', l: 'Other API', sub: 'Any OpenAI-compatible API: a local server, …' }];
const WIRE = rows([['chat', 'Chat Completions'], ['responses', 'Responses']]);
const APPROVALS = rows([['off', 'Approvals off'], ['prompt', 'Ask for approval']]);
const BASE = { openai: 'https://api.openai.com/v1', mistral: 'https://api.mistral.ai/v1', custom: '' };
const OPENROUTER = 'https://openrouter.ai/api/v1';
const isOpenRouter = (c) => /^https:\/\/openrouter\.ai\//.test(c.baseUrl || '');

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

  // OpenRouter is a key and nothing else: its address and wire are known (owner, 25 Nov 2026).
  const editOpenRouter = (connection = {}) => {
    closeEditor();
    const form = el('form', 'hermes-editor');
    const key = input('', 'password'); key.autocomplete = 'new-password';
    const save = stone('Save', () => form.requestSubmit());
    form.append(el('h3', '', connection.id ? 'Replace your OpenRouter key' : 'Add your OpenRouter key'), field('OpenRouter API key', key), stones(save, stone('Cancel', closeEditor)));
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); save.disabled = true;
      try { await run('connection', { id: connection.id, name: 'OpenRouter', provider: 'custom', baseUrl: OPENROUTER, wireApi: 'chat', apiKey: key.value }); }
      finally { key.value = ''; save.disabled = false; }
    });
    editor.append(form); key.focus();
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
    form.append(el('h3', '', connection.id ? 'Edit your API key' : 'Add your API key'), field('Name', name), question.el, field('Base URL', url),
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
  const open = { setups: true };
  let shown = '';
  let readOnce = false;
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

  // Models read on their own, once on open: the gateway's always (its options follow), any other
  // connection with a key and no list yet.
  const readUnread = () => {
    if (readOnce) return; readOnce = true;
    for (const c of state.connections) if (c.configured && (!c.discoveredAt || isGateway(c))) void run('discover', { id: c.id });
  };
  const paint = () => {
    if (disposed) return;
    closeEditor();
    notice.textContent = '';
    const intro = el('p', '', 'Hermes runs on the Ronin gateway, your own API key or OpenRouter. Each model option below shows under Model when you start a Hermes Agent.');
    root.replaceChildren(intro, notice);

    // THREE WAYS, AS ON CODEX'S BAR (owner, 25 Nov 2026): the Ronin gateway (always there), your own
    // API key, OpenRouter. Marked when Hermes has it; pressing one shows what it holds. Hermes may have
    // all three at once: each model option below names the one it runs on.
    const gateways = state.connections.filter(isGateway);
    const routers = state.connections.filter((c) => !isGateway(c) && isOpenRouter(c));
    const keys = state.connections.filter((c) => !isGateway(c) && !isOpenRouter(c));
    const ways = el('div', 'ask setup-harness-row setup-harness-ways'); ways.dataset.density = 'tight';
    const wayStone = (id, name, has) => {
      const made = stone(name, () => { shown = shown === id ? '' : id; paint(); });
      made.setAttribute('aria-selected', String(has));
      return made;
    };
    ways.append(wayStone('gateway', 'Ronin gateway', gateways.length > 0), wayStone('key', 'API key', keys.length > 0), wayStone('openrouter', 'OpenRouter', routers.length > 0));
    const panel = el('div', 'hermes-way');
    const keyRows = (list, editFn) => list.map((c) => ({
      cells: [nameOf(c), `${c.provider === 'custom' ? 'OpenAI-compatible' : c.provider === 'mistral' ? 'Mistral' : 'OpenAI'}${c.configured ? '' : ' · key missing'}`, c.discoveredAt ? `${c.models.length} models` : 'Models not read'],
      actions: [icon('edit', 'Edit', () => editFn(c)), ...(c.credentialEnv ? [] : [icon('remove', 'Remove', () => run('delete', { kind: 'connections', id: c.id }))])],
    }));
    if (shown === 'gateway') panel.append(el('p', '', gateways.length ? `Always on. ${gateways[0].models.length} Ronin models, ready for the options below.` : 'Always on.'));
    if (shown === 'key') panel.append(table(['Name', 'API', 'Models'], keyRows(keys, editConnection), 'Add your API key', () => editConnection()));
    if (shown === 'openrouter') panel.append(table(['Name', 'API', 'Models'], keyRows(routers, editOpenRouter), routers.length ? 'Add another OpenRouter key' : 'Add your OpenRouter key', () => editOpenRouter()));

    const setups = step(2, 'setups', 'Hermes model options', state.setups.length ? `${state.setups.length} · ${names(state.setups)}` : 'None yet');
    const canAdd = state.connections.some((c) => c.models.length);
    setups.body.append(table(['Name', 'Connection', 'Model', 'Reasoning', 'Approvals'], state.setups.map((setup) => {
      const c = state.connections.find((one) => one.id === setup.connection);
      return {
        cells: [setup.name, c ? nameOf(c) : 'Missing', setup.model, setup.reasoning === 'default' ? 'Default' : setup.reasoning, setup.approvals === 'off' ? 'Off' : 'Ask'],
        actions: [icon('edit', 'Edit', () => editSetup(setup)), icon('remove', 'Remove', () => run('delete', { kind: 'setups', id: setup.id }))],
      };
    }), 'Add a model option', canAdd ? () => editSetup() : null));

    root.append(ways, panel, editor, setups.el,
      el('p', 'hermes-fine', 'Changes apply to Agents started after them; a new key is picked up when an Agent restarts. Removing a connection does not revoke its key at the API provider.'));
  };
  void request('/api/hermes').then((result) => { if (disposed) return; if (result.ok) { state = result.data; paint(); readUnread(); } else { root.append(notice); notice.textContent = result.message; } });
  return () => { disposed = true; closeEditor(); };
}
