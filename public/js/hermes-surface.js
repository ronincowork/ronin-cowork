/* part of the ronin-cowork client — see js/README.md */
/**
 * HERMES'S CONNECTIONS AND NAMED SETUPS — Hermes owns an installed runtime; Ronin owns named API
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
    form.append(el('h3', '', connection.id ? 'Edit API connection' : 'Add API connection'), field('Name', name), question.el, field('Base URL', url),
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
      { key: 'connection', label: 'API connection', options: rows(state.connections.map((c) => [c.id, c.name])) },
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
    form.append(el('h3', '', setup.id ? 'Edit named setup' : 'Add named setup'), field('Name shown under Model', name), question.el, stones(save, stone('Cancel', closeEditor)));
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); save.disabled = true;
      try { await run('setup', { id: setup.id, name: name.value, ...chosen }); } finally { save.disabled = false; }
    });
    editor.append(form); name.focus();
  };

  // ONE ROW SHAPE (owner, 24 Nov): a connection, a setup and the row that adds another all read the
  // same: a name, one line saying what it is, its stones. The adding row is dashed.
  const card = (title, detail, presses, adding = false) => {
    const row = el('div', `hermes-card${adding ? ' adding' : ''}`);
    const summary = el('div', 'hermes-card-summary');
    summary.append(el('strong', '', title), el('span', '', detail));
    row.append(summary, stones(...presses));
    return row;
  };
  // TWO COLLAPSIBLE STEPS, the form idiom of New Team (form-steps.js createStep): open by default;
  // folded, each says in a line what it holds.
  const open = { connections: true, setups: true };
  const step = (n, key, title, meta) => {
    const made = createStep({ n, key, title, onToggle: () => { open[key] = !open[key]; made.setCollapsed(!open[key], meta, true); } });
    made.setCollapsed(!open[key], meta, true);
    return made;
  };
  const names = (list) => list.map((one) => one.name).join(', ');
  const modelsLine = (c) => (c.discoveredAt ? `${c.models.length} model${c.models.length === 1 ? '' : 's'}` : 'model list not read yet');

  const paint = () => {
    if (disposed) return;
    closeEditor();
    notice.textContent = '';
    const intro = el('p', '', 'Hermes runs on API connections: an API’s address and key. A named setup picks one model from a connection and shows under Model when you start a Hermes Agent.');
    root.replaceChildren(intro, notice);

    const connections = step(1, 'connections', 'API connections', state.connections.length
      ? `${state.connections.length} · ${names(state.connections)}` : 'None yet');
    for (const c of state.connections) {
      const what = c.credentialEnv ? 'This office’s connection to Ronin models' : `${c.provider === 'custom' ? 'OpenAI-compatible API' : c.provider === 'mistral' ? 'Mistral API' : 'OpenAI API'}${c.configured ? '' : ' · key missing'}`;
      connections.body.append(card(c.name, `${what} · ${modelsLine(c)}`, [
        stone('Read its models', () => run('discover', { id: c.id })),
        stone('Edit', () => editConnection(c)),
        ...(c.credentialEnv ? [] : [stone('Remove', () => run('delete', { kind: 'connections', id: c.id }))]),
      ]));
    }
    connections.body.append(card(state.connections.length ? 'Add another connection' : 'Add a connection',
      'OpenAI, Mistral, or any OpenAI-compatible API such as OpenRouter.', [stone('Add', () => editConnection())], true));

    const setups = step(2, 'setups', 'Named setups', state.setups.length ? `${state.setups.length} · ${names(state.setups)}` : 'None yet');
    for (const setup of state.setups) {
      setups.body.append(card(setup.name, `${state.connections.find((c) => c.id === setup.connection)?.name || 'Missing connection'} · ${setup.model} · ${setup.reasoning === 'default' ? 'provider default' : setup.reasoning} reasoning · ${setup.approvals === 'off' ? 'approvals off' : 'asks for approval'}`, [
        stone('Edit', () => editSetup(setup)),
        stone('Remove', () => run('delete', { kind: 'setups', id: setup.id })),
      ]));
    }
    const canAdd = state.connections.some((c) => c.models.length);
    const add = stone('Add', () => editSetup());
    add.disabled = !canAdd;
    setups.body.append(card(state.setups.length ? 'Add another setup' : 'Add a setup',
      canAdd ? 'A name for one model of a connection, with its reasoning and approvals.' : 'Read a connection’s models first.', [add], true));

    root.append(connections.el, setups.el, editor,
      el('p', 'hermes-fine', 'Changes apply to Agents started after them; a new key is picked up when an Agent restarts. Removing a connection does not revoke its key at the API provider.'));
  };
  void request('/api/hermes').then((result) => { if (disposed) return; if (result.ok) { state = result.data; paint(); } else { root.append(notice); notice.textContent = result.message; } });
  return () => { disposed = true; closeEditor(); };
}
