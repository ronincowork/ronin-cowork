/* part of the ronin-cowork client — see js/README.md */
/**
 * MODEL SERVICES (owner, 2026-11-25; KAN-870; samurai_lab wip/MACHINE_SETTINGS_V2.md): Settings v2's
 * Harnesses and models → Model services. One office-side record per service connection, the same for Ronin
 * Gateway, OpenRouter and an API key (private_api): its address and key, and its model options (a display name and
 * the exact model ID sent). Gateway sync fills the Gateway's list; the OpenRouter and API key pages are the one
 * editor for those connections (Setup's Harness step links here). Every compatible harness reads the same record:
 * connection → its model options → the chosen one. A CLI on its own native service keeps its own flow.
 *
 * Read: GET /api/model-services. Writes: POST /api/model-services/<save|discover|delete|save-model|delete-model>,
 * each answering the whole list again. One reading is shared by every surface on the page.
 *
 * `modelServicePageRequest(page)` is the workbench request another view opens to reach a page here
 * (the Harness work surface's empty list links to it): page is 'openrouter' or 'private'.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { el } from './form-steps.js';
import { t } from './lexicon.js';
import { store } from './store.js';
import { openWorkbenchTab } from './workspace.js';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';
export const MODEL_SERVICE_PAGES = Object.freeze({ openrouter: 'settings2.openrouter', private: 'settings2.private-api' });

/** Which page a service belongs to: the Gateway, OpenRouter, or a private API. */
export function serviceKind(service) {
  if (service?.service_type === 'private_api') return 'private';
  if (service?.service_type) return service.service_type;
  if (service?.kind === 'ronin_api') return 'gateway';
  return String(service?.baseUrl || '').includes('openrouter.ai') ? 'openrouter' : 'private';
}

/** Open Settings v2 with Model services beside the named page; `serviceId` opens the API key page on that connection. */
export function modelServicePageRequest(page, serviceId = '') {
  const type = MODEL_SERVICE_PAGES[page] || MODEL_SERVICE_PAGES.openrouter;
  return { destination: 'settings2', mode: 'replace', state: {
    count: 2, selected: 'workspace2',
    seats: { workspace1: 'settings2.model-services', workspace2: serviceId ? { type, key: serviceId } : type },
  } };
}

/* ---- the one reading ---- */
let services = [];
let read = false;
const listeners = new Set();
const tell = (heard = false) => { for (const fn of listeners) fn(heard); };
async function load(say, heard = false) {
  const result = await request('/api/model-services', { cache: 'no-store' });
  if (!result.ok) { say?.(result.message, true); return; }
  services = Array.isArray(result.data.services) ? result.data.services : []; read = true; tell(heard);
}
// Anyone's write (model-services-changed, broadcast by the server) is read again once, for every surface.
let heardOff = null;
function hearChanges() {
  heardOff ||= store.listen('model-services-changed', () => { void load(null, true); });
}
async function act(action, body, say) {
  const result = await request(`/api/model-services/${action}`, { method: 'POST', json: body });
  if (!result.ok) { say?.(result.message, true); return false; }
  services = Array.isArray(result.data.services) ? result.data.services : services; read = true; say?.(''); tell();
  return true;
}

/* ---- small parts ---- */
function button(label, action, kind = '') {
  const made = WorkspaceKit.primitives.createAction({ label, kind, action });
  return made.el ?? made;
}
function bar(...actions) {
  return WorkspaceKit.primitives.createActionBar({ actions: actions.filter(Boolean) }).el;
}
function input(value = '', type = 'text') {
  const node = el('input'); node.type = type; node.value = value;
  return node;
}
function select(rows, value) {
  const node = el('select');
  for (const [id, name] of rows) { const o = el('option', null, name); o.value = id; node.append(o); }
  node.value = rows.some(([id]) => id === value) ? value : rows[0]?.[0] || '';
  return node;
}
function field(name, control) {
  control.setAttribute('aria-label', name);
  const node = el('label', 'hermes-field', name); node.append(control);
  return node;
}
const reasons = (service) => service.provider === 'openai' || service.wire === 'responses';

function shell(label, className) {
  const out = WorkspaceKit.primitives.createSurface({ label, className: `setup-surface model-services ${className}` });
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text || ''; notice.hidden = !text; };
  const body = el('div', 'model-services-body');
  out.content.append(notice, body);
  return { out, say, body };
}
function lifecycle(out, paint, say) {
  let disposed = false;
  // A change heard from elsewhere waits while someone types here, so typing survives.
  const typing = () => { const a = document.activeElement; return !!a && out.el.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName); };
  const watch = (heard) => { if (!disposed && !(heard && typing())) paint(); };
  listeners.add(watch); hearChanges();
  return {
    el: out.el,
    show: async () => { if (read) paint(); await load(say); },
    destroy: () => { disposed = true; listeners.delete(watch); },
  };
}

/** A service's named models: each row Edit and Remove, Add below, the form in place. */
function namedModels(service, say) {
  const block = el('section', 'model-services-models');
  const editor = el('div', 'accounts-editor');
  const form = (entry = {}) => {
    const node = el('form', 'hermes-editor accounts-form');
    const name = input(entry.name || '');
    const model = input(entry.model || '');
    const listId = `ms-discovered-${service.id}`;
    if (service.discovered?.length) {
      model.setAttribute('list', listId);
      const list = el('datalist'); list.id = listId;
      for (const id of service.discovered) { const o = el('option'); o.value = id; list.append(o); }
      node.append(list);
    }
    const reasoning = reasons(service)
      ? select(['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max'].map((id) => [id, id === 'default' ? t('accounts.reasoning_default', 'Provider default') : id]), entry.reasoning || 'default')
      : null;
    const approvals = select([['off', t('accounts.approvals_off', 'YOLO — approvals off')], ['prompt', t('accounts.approvals_prompt', 'Ask for approval')]], entry.approvals || 'off');
    node.append(el('h3', null, entry.id ? t('model_services.edit_model', 'Edit model') : t('model_services.add_model', 'Add a model')),
      field(t('model_services.model_name', 'Name shown under Model'), name),
      field(t('model_services.model_id', 'Model ID sent to the service'), model),
      ...(reasoning ? [field(t('accounts.preset_reasoning', 'Reasoning effort'), reasoning)] : []),
      field(t('accounts.preset_approvals', 'Approvals'), approvals));
    const save = button(t('accounts.save', 'Save'), () => {}, 'primary'); save.type = 'submit';
    node.append(bar(save, button(t('accounts.cancel', 'Cancel'), () => editor.replaceChildren())));
    node.addEventListener('submit', async (event) => {
      event.preventDefault(); save.disabled = true;
      try {
        await act('save-model', { id: entry.id, service_id: service.id, name: name.value.trim(), model: model.value.trim(),
          reasoning: reasoning ? reasoning.value : 'default', approvals: approvals.value }, say);
      } finally { save.disabled = false; }
    });
    editor.replaceChildren(node); queueMicrotask(() => name.focus());
  };
  const rows = (service.models || []).map((entry) => {
    const row = el('div', 'hermes-card model-services-model');
    const summary = el('div', 'hermes-card-summary');
    summary.append(el('strong', null, entry.name), el('span', null, entry.model));
    row.append(summary, bar(
      button(t('accounts.edit', 'Edit'), () => form(entry)),
      button(t('accounts.remove', 'Remove'), () => act('delete-model', { id: entry.id }, say)),
    ));
    return row;
  });
  block.append(el('h3', null, t('model_services.model_options', 'Model options')),
    el('p', 'setup-fine', t('model_services.options_lede', 'Each one appears under Model for every compatible harness on this connection.')),
    ...(rows.length ? rows : [el('p', 'setup-fine', t('model_services.no_options', 'No model options yet.'))]));
  const discovered = service.discovered?.length
    ? t('model_services.discovered_n', '{n} model IDs listed by the service; pick one when you add a model.', { n: service.discovered.length })
    : '';
  if (discovered) block.append(el('p', 'setup-fine', discovered));
  block.append(bar(
    service.configured ? button(t('model_services.add_model', 'Add a model'), () => form()) : null,
    service.configured ? button(t('model_services.discover', 'List the service’s models'), () => act('discover', { id: service.id }, say)) : null,
  ), editor);
  return block;
}

/**
 * A harness's page in Settings (Hermes today, provider-surface.js): each service's model options, read only.
 * Model services is the one editor; an OpenRouter or API key list links to its page. Returns the disposer.
 */
export function mountModelOptions(host) {
  const root = el('section', 'model-services-options');
  const notice = el('p', 'setup-fine'); notice.hidden = true;
  const say = (text) => { notice.textContent = text || ''; notice.hidden = !text; };
  host.append(root);
  let disposed = false;
  const paint = () => {
    if (disposed) return;
    const blocks = services.map((service) => {
      const kind = serviceKind(service);
      const block = el('div', 'hermes-card model-services-entry');
      const summary = el('div', 'hermes-card-summary');
      summary.append(el('strong', null, kind === 'gateway' ? t('model_services.gateway', 'Ronin Gateway') : service.name));
      const names = (service.models || []).map((m) => m.name);
      summary.append(el('span', null, names.length ? names.join(' · ') : t('model_services.no_options', 'No model options yet.')));
      block.append(summary);
      if (kind !== 'gateway') block.append(bar(button(t('model_services.edit_options', 'Edit in Model services'), () => openWorkbenchTab(modelServicePageRequest(kind, kind === 'private' ? service.id : '')))));
      return block;
    });
    root.replaceChildren(el('h3', null, t('model_services.model_options', 'Model options')),
      el('p', 'setup-fine', t('model_services.harness_lede', 'What shows under Model when you start an Agent on this harness, by service. Keys and model options are edited in Settings → Model services.')),
      notice, ...blocks);
    if (!services.length) root.append(bar(button(t('model_services.open', 'Open Model services'), () => openWorkbenchTab(modelServicePageRequest('openrouter')))));
  };
  const watch = () => paint();
  listeners.add(watch); hearChanges();
  if (read) paint();
  void load(say);
  return () => { disposed = true; listeners.delete(watch); };
}

/* ---- Model services: the three services and what each holds ---- */
export function createModelServicesSurface({ open = () => {} } = {}) {
  const { out, say, body } = shell(t('settings2.model_services', 'Model services'), 'model-services-list');
  const entry = (title, facts, actions = [], extra = []) => {
    const row = el('div', 'hermes-card model-services-entry');
    const summary = el('div', 'hermes-card-summary');
    summary.append(el('strong', null, title), el('span', null, facts));
    row.append(summary, ...extra, ...(actions.length ? [bar(...actions)] : []));
    return row;
  };
  const paint = () => {
    const gateway = services.filter((s) => serviceKind(s) === 'gateway');
    const routers = services.filter((s) => serviceKind(s) === 'openrouter');
    const privates = services.filter((s) => serviceKind(s) === 'private');
    const count = (rows) => rows.reduce((n, s) => n + (s.models?.length || 0), 0);
    const g = gateway.find((s) => s.configured) || gateway[0];
    const gatewayFacts = !g ? t('model_services.gateway_none', 'Not connected on this office.')
      : g.fault ? g.fault
      : !g.configured ? t('model_services.gateway_waiting', 'Not connected yet.')
      : t('model_services.gateway_models', '{n} models, supplied by the gateway', { n: count([g]) });
    const gatewayList = g?.models?.length ? [el('p', 'setup-fine', g.models.map((m) => m.name).join(' · '))] : [];
    const router = routers.find((s) => s.configured) || routers[0];
    body.replaceChildren(
      el('p', 'setup-fine', t('model_services.lede', 'A service holds the address and key; its model options appear under Model for every compatible harness that uses it. A harness signed in to its own service keeps its own flow.')),
      entry(t('model_services.gateway', 'Ronin Gateway'), gatewayFacts,
        g?.configured ? [button(t('model_services.refresh', 'Refresh the list'), () => act('discover', { id: g.id }, say))] : [], gatewayList),
      entry(t('model_services.openrouter', 'OpenRouter'),
        router?.configured ? t('model_services.options_n', 'Key saved · {n} model options', { n: count(routers) }) : t('model_services.no_key', 'No key yet'),
        [button(t('model_services.open_openrouter', 'Open OpenRouter'), () => open('openrouter'))]),
      entry(t('model_services.private', 'API key'),
        privates.length ? t('model_services.private_n', '{c} connections · {n} model options', { c: privates.length, n: count(privates) }) : t('model_services.private_none', 'None yet'),
        [button(t('model_services.open_private', 'Open API key'), () => open('private'))]),
    );
  };
  return lifecycle(out, paint, say);
}

/* ---- OpenRouter: the key, then its named models ---- */
export function createOpenRouterSurface() {
  const { out, say, body } = shell(t('model_services.openrouter', 'OpenRouter'), 'model-services-openrouter');
  const paint = () => {
    const service = services.find((s) => serviceKind(s) === 'openrouter' && s.configured) || services.find((s) => serviceKind(s) === 'openrouter');
    const key = input('', 'password'); key.autocomplete = 'new-password';
    const form = el('form', 'hermes-editor accounts-form');
    const save = button(service ? t('model_services.replace_key', 'Replace key') : t('model_services.save_key', 'Save key'), () => {}, 'primary'); save.type = 'submit';
    form.append(field(t('model_services.openrouter_key', 'OpenRouter API key'), key), bar(save,
      service ? button(t('accounts.remove', 'Remove'), () => act('delete', { id: service.id }, say)) : null));
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); save.disabled = true;
      try { await act('save', { id: service?.id, kind: 'personal_api', name: 'OpenRouter', provider: 'custom', baseUrl: OPENROUTER_URL, wireApi: 'chat', apiKey: key.value }, say); }
      finally { key.value = ''; save.disabled = false; }
    });
    body.replaceChildren(
      el('p', 'setup-fine', service?.configured ? t('model_services.key_saved', 'Key saved.') : t('model_services.openrouter_lede', 'Save your OpenRouter key, then name the models you want offered.')),
      form,
      ...(service ? [namedModels(service, say)] : []),
    );
  };
  return lifecycle(out, paint, say);
}

/* ---- API key: pick a connection, its address and key, then its model options ---- */
export function createPrivateApiSurface({ serviceId = '' } = {}) {
  const { out, say, body } = shell(t('model_services.private', 'API key'), 'model-services-private');
  let chosen = serviceId;
  let adding = false;
  const vendors = [['openai', t('accounts.vendor_openai', 'OpenAI API'), 'https://api.openai.com/v1', 'responses'],
    ['mistral', t('accounts.vendor_mistral', 'Mistral API'), 'https://api.mistral.ai/v1', 'chat'],
    ['custom', t('accounts.vendor_custom', 'OpenAI-compatible API'), '', 'chat']];
  const connectionForm = (service = {}) => {
    const form = el('form', 'hermes-editor accounts-form');
    const editing = !!service.id;
    const name = input(service.name || '');
    const provider = select(vendors.map(([id, label]) => [id, label]), service.provider || 'openai');
    const url = input(service.baseUrl || vendors[0][2], 'url');
    const wire = select([['chat', t('accounts.wire_chat', 'Chat Completions')], ['responses', t('accounts.wire_responses', 'Responses')]], service.wire || vendors[0][3]);
    const key = input('', 'password'); key.autocomplete = 'new-password';
    provider.addEventListener('change', () => { const v = vendors.find(([id]) => id === provider.value); url.value = v[2]; wire.value = v[3]; });
    form.append(field(t('accounts.field_name', 'Name'), name), field(t('accounts.field_vendor', 'API provider'), provider),
      field(t('accounts.field_url', 'Base URL'), url), field(t('accounts.field_wire', 'Wire API'), wire),
      field(editing ? t('accounts.field_key_keep', 'API key (leave blank to keep)') : t('accounts.field_key', 'API key'), key));
    const save = button(t('accounts.save', 'Save'), () => {}, 'primary'); save.type = 'submit';
    form.append(bar(save,
      editing && !service.credentialEnv ? button(t('accounts.remove', 'Remove'), async () => { if (await act('delete', { id: service.id }, say)) chosen = ''; }) : null,
      !editing ? button(t('accounts.cancel', 'Cancel'), () => { adding = false; paint(); }) : null));
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); save.disabled = true;
      try {
        const before = new Set(services.map((s) => s.id));
        const ok = await act('save', { id: service.id, kind: 'personal_api', name: name.value.trim(), provider: provider.value, baseUrl: url.value.trim(), wireApi: wire.value, apiKey: key.value }, say);
        if (ok && !editing) { adding = false; chosen = services.find((s) => !before.has(s.id))?.id || chosen; paint(); }
      } finally { key.value = ''; save.disabled = false; }
    });
    return form;
  };
  const paint = () => {
    const privates = services.filter((s) => serviceKind(s) === 'private');
    if (!privates.some((s) => s.id === chosen)) chosen = privates[0]?.id || '';
    const service = privates.find((s) => s.id === chosen);
    const picks = privates.map((s) => button(s.name, () => { chosen = s.id; adding = false; paint(); }, s.id === chosen && !adding ? 'primary' : ''));
    picks.push(button(t('model_services.add_private', 'Add an API key'), () => { adding = true; paint(); }));
    body.replaceChildren(
      el('p', 'setup-fine', t('model_services.private_lede', 'Your own API key for a provider such as OpenAI or Mistral. Each connection has its own model options.')),
      bar(...picks),
      ...(adding || !service ? [connectionForm()] : [connectionForm(service), namedModels(service, say)]),
    );
  };
  return lifecycle(out, paint, say);
}
