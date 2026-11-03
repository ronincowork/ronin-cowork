import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { loadProviderCatalog } from './form-steps.js';
const el = (tag, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
const input = (value = '', type = 'text') => { const node = el('input'); node.type = type; node.value = value; return node; };
const select = (rows, value = '') => { const node = el('select'); for (const [id, name] of rows) { const o = el('option', name); o.value = id; node.append(o); } node.value = value || rows[0]?.[0] || ''; return node; };
const field = (name, control) => { control.setAttribute('aria-label', name); const node = el('label', name); node.className = 'hermes-field'; node.append(control); return node; };
function button(name, fn) {
  const made = WorkspaceKit.primitives.createAction({ label: name, action: fn });
  return made.el ?? made;
}

const summary = (name, detail) => { const node = el('div'); node.className = 'hermes-card-summary'; node.append(el('strong', name), el('span', detail)); return node; };
const actions = (...items) => WorkspaceKit.primitives.createActionBar({ actions: items }).el;

/** Hermes owns an installed runtime; Ronin owns named API connections and launch setups. */
export function mountHermesSurface(host, provider, onChanged) {
  let disposed = false;
  let state = { connections: [], setups: [] };
  const root = el('section'); root.className = 'hermes-settings'; host.append(root);
  const notice = el('p'); notice.setAttribute('role', 'status');
  const editor = el('div');
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
    editor.replaceChildren();
    const form = el('form'); form.className = 'hermes-editor';
    const name = input(connection.name || '');
    const providerChoice = select([['openai', 'OpenAI API'], ['mistral', 'Mistral API'], ['custom', 'OpenAI-compatible API']], connection.provider);
    const url = input(connection.baseUrl || 'https://api.openai.com/v1', 'url');
    const inferredWireApi = connection.provider === 'openai' && connection.baseUrl === 'https://api.openai.com/v1' ? 'responses' : 'chat';
    const wireApi = select([['chat', 'Chat Completions'], ['responses', 'Responses']], connection.wireApi || inferredWireApi);
    let wireChanged = false; wireApi.addEventListener('change', () => { wireChanged = true; });
    const key = input('', 'password'); key.autocomplete = 'new-password';
    providerChoice.addEventListener('change', () => { url.value = providerChoice.value === 'mistral' ? 'https://api.mistral.ai/v1' : providerChoice.value === 'openai' ? 'https://api.openai.com/v1' : ''; });
    form.append(el('h3', connection.id ? 'Edit API connection' : 'Add API connection'), field('Name', name), field('API provider', providerChoice), field('Base URL', url), field('Wire API', wireApi), field(connection.id ? 'API key (leave blank to keep)' : 'API key', key));
    const save = button('Save connection', () => {}); save.type = 'submit'; form.append(actions(save, button('Cancel', () => editor.replaceChildren())));
    form.addEventListener('submit', async event => { event.preventDefault(); save.disabled = true; try { await run('connection', { id: connection.id, name: name.value, provider: providerChoice.value, baseUrl: url.value, wireApi: !connection.id || wireChanged ? wireApi.value : connection.wireApi, apiKey: key.value }); } finally { key.value = ''; save.disabled = false; } });
    editor.append(form); name.focus();
  };
  const editSetup = (setup = {}) => {
    editor.replaceChildren();
    const form = el('form'); form.className = 'hermes-editor';
    const name = input(setup.name || '');
    const connection = select(state.connections.map(c => [c.id, c.name]), setup.connection);
    const model = select([]); const reasoning = select([]);
    const approvals = select([['off', 'YOLO — approvals off'], ['prompt', 'Ask for approval']], setup.approvals || 'off');
    const populate = () => {
      const c = state.connections.find(c => c.id === connection.value);
      const options = select((c?.models || []).map(id => [id, id]), setup.connection === c?.id ? setup.model : ''); model.replaceChildren(...options.childNodes); model.value = setup.connection === c?.id && c.models.includes(setup.model) ? setup.model : c?.models[0] || '';
      const levels = c?.provider === 'openai' || c?.wireApi === 'responses' ? ['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max'] : ['default'];
      const choices = select(levels.map(id => [id, id === 'default' ? 'Provider default' : id]), levels.includes(setup.reasoning) ? setup.reasoning : c?.provider === 'openai' ? 'medium' : 'default');
      const chosen = choices.value; reasoning.replaceChildren(...choices.childNodes); reasoning.value = chosen;
    };
    connection.addEventListener('change', populate); populate();
    form.append(el('h3', setup.id ? 'Edit named setup' : 'Add named setup'), field('Name shown in the Model dropdown', name), field('API connection', connection), field('API model', model), field('Reasoning effort', reasoning), field('Approvals', approvals));
    const save = button('Save setup', () => {}); save.type = 'submit'; form.append(actions(save, button('Cancel', () => editor.replaceChildren())));
    form.addEventListener('submit', async event => { event.preventDefault(); save.disabled = true; try { await run('setup', { id: setup.id, name: name.value, connection: connection.value, model: model.value, reasoning: reasoning.value, approvals: approvals.value }); } finally { save.disabled = false; } });
    editor.append(form); name.focus();
  };
  const paint = () => {
    if (disposed) return;
    root.replaceChildren(el('h2', 'Hermes'), el('p', provider?.installed ? `Runtime installed${provider.version ? ` · ${provider.version}` : ''}` : 'Install Hermes before launching an agent.'), notice);
    notice.textContent = '';
    root.append(el('h3', 'API connections'), el('p', 'Saved API connections appear here automatically. Load a connection’s models to create named setups.'));
    for (const c of state.connections) {
      const row = el('div'); row.className = 'hermes-card';
      row.append(summary(c.name, `${c.provider}${c.credentialEnv ? ` · ${c.credentialEnv}` : ''} · ${c.configured ? 'Configured' : 'Key missing'} · ${c.discoveredAt ? `${c.models.length} models discovered` : 'Models not discovered'}`),
        actions(button('Load models', () => run('discover', { id: c.id })), button('Edit', () => editConnection(c)), ...(c.credentialEnv ? [] : [button('Remove', () => run('delete', { kind: 'connections', id: c.id }))])));
      root.append(row);
    }
    root.append(actions(button('Add API connection', () => editConnection())));
    root.append(el('h3', 'Named setups'), el('p', 'These names appear under Model when you select Hermes in New Agent. Each launch gets separate memory and conversation history.'));
    for (const setup of state.setups) {
      const row = el('div'); row.className = 'hermes-card';
      row.append(summary(setup.name, `${state.connections.find(c => c.id === setup.connection)?.name || 'Missing connection'} · ${setup.model} · ${setup.reasoning} reasoning · ${setup.approvals === 'off' ? 'YOLO' : 'Ask for approval'}`),
        actions(button('Edit', () => editSetup(setup)), button('Duplicate', () => editSetup({ ...setup, id: undefined, name: `${setup.name} copy` })), button('Remove', () => run('delete', { kind: 'setups', id: setup.id }))));
      root.append(row);
    }
    const add = button('Add named setup', () => editSetup()); add.disabled = !state.connections.some(c => c.models.length); root.append(actions(add), editor); editor.replaceChildren();
    root.append(el('p', 'Setup edits apply to future launches. Key changes are picked up when an agent restarts. Removing a connection does not revoke its key at the API provider.'));
  };
  void request('/api/hermes').then(result => { if (disposed) return; if (result.ok) { state = result.data; paint(); } else { root.append(notice); notice.textContent = result.message; } });
  return () => { disposed = true; };
}
