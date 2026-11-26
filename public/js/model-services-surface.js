/* part of the ronin-cowork client — see js/README.md */
/**
 * MODEL SERVICES (owner, 2026-11-25/26; KAN-870; samurai_lab wip/MACHINE_SETTINGS_V2.md): Settings v2's
 * Harnesses and models → Model services. One office-side record per service connection, the same for Ronin
 * Gateway, OpenRouter and an API key (private_api): its address and key, and its model options (a display
 * name and the exact model ID sent). Every compatible harness reads the same record: connection → its model
 * options → the chosen one. A CLI on its own native service keeps its own flow.
 *
 * ONE CARD, THREE TABS (owner, 26 Nov 2026), the Hermes bar's stones: Ronin Gateway (comes configured: only
 * its model list, read again by Refresh), API key and OpenRouter (each a Configure section and a Model
 * options section). Sections are the New Agent form's (createStep); lists are the table pattern (data-table.js).
 *
 * Read: GET /api/model-services. Writes: POST /api/model-services/<save|discover|delete|save-model|delete-model>,
 * each answering the whole list again; anyone's write is read again on model-services-changed.
 *
 * `modelServicePageRequest(tab, serviceId)` is the workbench request another view opens to reach a tab here
 * (Setup's Hermes bar links to it): tab 'gateway', 'openrouter' or 'private'; serviceId picks an API key,
 * 'new' opens an empty one.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { el, createStep } from './form-steps.js';
import { t } from './lexicon.js';
import { gatewayBlockWord } from './harness-model-options.js';
import { store } from './store.js';
import { openWorkbenchTab } from './workspace.js';
import { createTable } from './data-table.js';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';
const SURFACE = 'settings2.model-services';
const TABS = ['gateway', 'private', 'openrouter'];

/** Which tab a service belongs to: the Gateway, OpenRouter, or an API key. */
export function serviceKind(service) {
  if (service?.service_type === 'private_api') return 'private';
  if (service?.service_type) return service.service_type;
  if (service?.kind === 'ronin_api') return 'gateway';
  return String(service?.baseUrl || '').includes('openrouter.ai') ? 'openrouter' : 'private';
}

/** Open Settings v2 on Model services, on the named tab (and API key). */
export function modelServicePageRequest(tab, serviceId = '') {
  const seat = { type: SURFACE, tab: TABS.includes(tab) ? tab : 'gateway', ...(serviceId ? { key: serviceId } : {}) };
  return { destination: 'settings2', mode: 'replace', state: { count: 1, selected: 'workspace1', seats: { workspace1: seat } } };
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
async function act(action, body, say) {
  const result = await request(`/api/model-services/${action}`, { method: 'POST', json: body });
  if (!result.ok) { say?.(result.message, true); return false; }
  services = Array.isArray(result.data.services) ? result.data.services : services; read = true; say?.(''); tell();
  return true;
}
// Anyone's write (model-services-changed, broadcast by the server) is read again once, for every surface.
let heardOff = null;
function hearChanges() {
  heardOff ||= store.listen('model-services-changed', () => { void load(null, true); });
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
/** A tab, the Hermes bar's stone: ticked when that service is set up, marked when it is the one open. */
function stone(name, pressed, ticked, fn) {
  const out = el('button', 'ask-opt ask-rect');
  out.type = 'button';
  if (ticked) out.append(el('span', 'hermes-tick', '✓'));
  out.append(el('span', 'ask-name', name));
  out.setAttribute('aria-selected', String(pressed));
  out.addEventListener('click', fn);
  return out;
}
function stones(...items) {
  const row = el('div', 'ask setup-harness-row setup-harness-ways setup-hermes-sources'); row.dataset.density = 'tight';
  row.append(...items);
  return row;
}
const reasons = (service) => service.provider === 'openai' || service.wire === 'responses';
function tabName(tab) {
  if (tab === 'private') return t('model_services.private', 'API key');
  if (tab === 'openrouter') return t('model_services.openrouter', 'OpenRouter');
  return t('model_services.gateway', 'Ronin Gateway');
}
function optionsMeta(service) {
  return t('model_services.options_meta', '{n} model options', { n: service?.models?.length || 0 });
}

/** The table pattern (data-table.js), called the short way. */
function table(headings, rows, lines = []) {
  return createTable({ headings, rows, lines });
}

/**
 * THE FORM PATTERN (owner, 26 Nov 2026: "look at our new agent form"): numbered sections with a heading,
 * a rule between topics, each folding to a one-line `meta`. defs: [{ key, title, meta, nodes }]; `open`
 * keeps each fold across repaints.
 */
function sections(defs, open) {
  const box = el('div', 'fs-steps model-services-steps');
  defs.forEach((d, i) => {
    if (!(d.key in open)) open[d.key] = true;
    const step = createStep({ n: i + 1, key: d.key, title: d.title, onToggle: () => { open[d.key] = !open[d.key]; step.setCollapsed(!open[d.key], d.meta || ''); } });
    step.body.append(...d.nodes);
    step.setCollapsed(!open[d.key], d.meta || '');
    box.append(step.el);
  });
  return box;
}

/** A service's model options: a row each with Edit and Remove, `+ Add a model` below, the form in place. */
function modelOptions(service, say) {
  const block = el('div', 'model-services-models');
  const editor = el('div', 'accounts-editor');
  const form = (entry = {}) => {
    const node = el('form', 'hermes-editor accounts-form');
    const name = input(entry.name || '');
    const model = input(entry.model || '');
    const listId = `ms-discovered-${service.id}`;
    if (service.discovered?.length) {
      model.setAttribute('list', listId);
      const list = el('datalist'); list.id = listId;
      for (const id of service.discovered) { const o = el('option'); o.value = id; o.label = service.discoveredNames?.[id] || id; list.append(o); }
      model.addEventListener('change', () => { if (!name.value.trim()) name.value = service.discoveredNames?.[model.value] || model.value; });
      node.append(list);
    }
    const reasoning = reasons(service)
      ? select(['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max'].map((id) => [id, id === 'default' ? t('accounts.reasoning_default', 'Service default') : id]), entry.reasoning || 'default')
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
  const rows = (service.models || []).map((entry) => ({ cells: [entry.name, entry.model], tools: [
    [t('accounts.edit', 'Edit'), () => form(entry)],
    [t('accounts.remove', 'Remove'), () => act('delete-model', { id: entry.id }, say)],
  ] }));
  const lines = [
    ...(rows.length ? [] : [[t('model_services.no_options', 'No model options yet.'), null]]),
    [t('model_services.add_line', '+ Add a model'), () => form()],
    [service.discovered?.length
      ? t('model_services.discovered_line', '+ Read the service’s list again ({n} model IDs to pick from)', { n: service.discovered.length })
      : t('model_services.discover_line', '+ Read the service’s list, to pick model IDs from'), () => act('discover', { id: service.id }, say)],
  ];
  block.append(el('p', 'setup-fine', t('model_services.options_lede', 'Each one appears under Model for every compatible harness on this connection.')),
    table([t('model_services.col_name', 'Name'), t('model_services.col_model', 'Model ID')], rows, lines), editor);
  return block;
}

/**
 * A harness's page in Settings (Hermes today, harnesses-surface.js): each service's model options, read only.
 * Model services is the one editor; an OpenRouter or API key row links to its tab. Returns the disposer.
 */
export function mountModelOptions(host) {
  const root = el('section', 'model-services-options');
  const notice = el('p', 'setup-fine'); notice.hidden = true;
  const say = (text) => { notice.textContent = text || ''; notice.hidden = !text; };
  host.append(root);
  let disposed = false;
  const paint = () => {
    if (disposed) return;
    const rows = services.map((service) => {
      const kind = serviceKind(service);
      const names = (service.models || []).map((m) => m.name);
      return { cells: [kind === 'gateway' ? tabName('gateway') : service.name, names.length ? names.join(' · ') : t('model_services.no_options', 'No model options yet.')],
        tools: kind === 'gateway' ? [] : [[t('accounts.edit', 'Edit'), () => openWorkbenchTab(modelServicePageRequest(kind, kind === 'private' ? service.id : ''))]] };
    });
    root.replaceChildren(el('h3', null, t('model_services.model_options', 'Model options')),
      el('p', 'setup-fine', t('model_services.harness_lede', 'What shows under Model when you start an Agent on this harness, by service. Keys and model options are edited in Settings → Model services.')),
      notice, table([t('model_services.col_service', 'Service'), t('model_services.model_options', 'Model options')], rows,
        services.length ? [] : [[t('model_services.open_line', '+ Add a service in Model services'), () => openWorkbenchTab(modelServicePageRequest('openrouter'))]]));
  };
  const watch = () => paint();
  listeners.add(watch); hearChanges();
  if (read) paint();
  void load(say);
  return () => { disposed = true; listeners.delete(watch); };
}

/* ---- Model services: three tabs ---- */
export function createModelServicesSurface({ tab = 'gateway', serviceId = '' } = {}) {
  const out = WorkspaceKit.primitives.createSurface({ label: t('settings2.model_services', 'Model services'), className: 'setup-surface model-services' });
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text || ''; notice.hidden = !text; };
  const body = el('div', 'model-services-body');
  out.content.append(body);

  let shown = TABS.includes(tab) ? tab : 'gateway';
  let adding = serviceId === 'new'; // an empty API key form
  let chosen = adding ? '' : serviceId; // the API key open, when there are several
  let refreshFault = '';
  const folds = { gateway: {}, private: {}, openrouter: {} };
  const of = (kind) => services.filter((s) => serviceKind(s) === kind);
  const first = (kind) => of(kind).find((s) => s.configured) || of(kind)[0];

  /* Ronin Gateway: comes configured; its model list, read only. */
  const gatewayTab = () => {
    const g = first('gateway');
    const rows = (g?.models || []).map((m) => ({ cells: [m.name, m.model] }));
    const refresh = async () => {
      await act('discover', { id: g.id }, (text, bad) => { refreshFault = bad ? text : ''; });
      paint();
    };
    const lines = !g ? [[t('model_services.gateway_none', 'Not connected on this office.'), null]]
      : g.fault ? [[g.fault, null]]
      : !g.configured ? [[t('model_services.gateway_waiting', 'Not connected yet.'), null]]
      : [...(rows.length ? [] : [[t('model_services.gateway_empty', 'No models from the gateway yet.'), null]]), [t('model_services.refresh_line', '+ Refresh the list'), refresh]];
    const blocked = g?.status ? [el('p', 'setup-notice bad', t('model_services.gateway_blocked', 'Ronin Gateway can’t be used now: {why}. Its options are greyed in New Agent. Refresh reads it again.', { why: gatewayBlockWord(g.status) }))] : [];
    const fault = g && refreshFault ? [el('p', 'setup-notice bad', t('model_services.refresh_failed', 'Refresh failed: {why} ({address}). The list shown is the last one read.', { why: refreshFault, address: String(g.baseUrl || '').replace(/^https?:\/\//, '') }))] : [];
    return [
      el('p', 'setup-fine', t('model_services.gateway_lede', 'The Ronin Gateway comes configured. Its model list is supplied by the gateway; there is nothing to set here.')),
      ...blocked,
      sections([{ key: 'models', title: t('model_services.model_options', 'Model options'), meta: optionsMeta(g),
        nodes: [table([t('model_services.col_name', 'Name'), t('model_services.col_model', 'Model ID')], rows, lines), ...fault] }], folds.gateway),
    ];
  };

  /* OpenRouter: Configure (the key), then Model options. */
  const openRouterTab = () => {
    const service = first('openrouter');
    const key = input('', 'password'); key.autocomplete = 'new-password';
    const form = el('form', 'model-services-form');
    const save = button(service ? t('model_services.replace_key', 'Replace key') : t('model_services.save_key', 'Save key'), () => {}, 'primary'); save.type = 'submit';
    form.append(field(t('model_services.openrouter_key', 'OpenRouter API key'), key), bar(save,
      service ? button(t('accounts.remove', 'Remove'), () => act('delete', { id: service.id }, say)) : null));
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); save.disabled = true;
      try { await act('save', { id: service?.id, kind: 'personal_api', name: 'OpenRouter', provider: 'custom', baseUrl: OPENROUTER_URL, wireApi: 'chat', apiKey: key.value }, say); }
      finally { key.value = ''; save.disabled = false; }
    });
    const saved = service?.configured ? t('model_services.key_saved', 'Key saved.') : t('model_services.no_key', 'No key yet');
    return [
      el('p', 'setup-fine', t('model_services.openrouter_lede', 'Save your OpenRouter key, then name the models you want offered.')),
      sections([
        { key: 'configure', title: t('model_services.configure', 'Configure'), meta: saved, nodes: [el('p', 'setup-fine', saved), form] },
        { key: 'options', title: t('model_services.model_options', 'Model options'), meta: optionsMeta(service),
          nodes: [service ? modelOptions(service, say) : el('p', 'setup-fine', t('model_services.key_first', 'Save the key first.'))] },
      ], folds.openrouter),
    ];
  };

  /* API key: Configure (pick a key or add one; its address and key), then Model options. */
  const vendors = [['openai', t('accounts.vendor_openai', 'OpenAI API'), 'https://api.openai.com/v1', 'responses'],
    ['mistral', t('accounts.vendor_mistral', 'Mistral API'), 'https://api.mistral.ai/v1', 'chat'],
    ['custom', t('accounts.vendor_custom', 'OpenAI-compatible API'), '', 'chat']];
  const connectionForm = (service = {}) => {
    const form = el('form', 'model-services-form');
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
      !editing && of('private').length ? button(t('accounts.cancel', 'Cancel'), () => { adding = false; paint(); }) : null));
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
  const apiKeyTab = () => {
    const keys = of('private');
    if (!keys.some((s) => s.id === chosen)) chosen = keys[0]?.id || '';
    const service = adding ? null : keys.find((s) => s.id === chosen);
    const picks = keys.length ? [stones(
      ...keys.map((s) => stone(s.name, !adding && s.id === chosen, s.configured, () => { chosen = s.id; adding = false; paint(); })),
      stone(t('model_services.add_private', '+ Add an API key'), adding, false, () => { adding = true; paint(); }),
    )] : [];
    return [
      el('p', 'setup-fine', t('model_services.private_lede', 'Your own API key for a provider such as OpenAI or Mistral. Each key has its own model options.')),
      sections([
        { key: 'configure', title: t('model_services.configure', 'Configure'), meta: service ? service.name : t('model_services.adding', 'Adding a key'),
          nodes: [...picks, service ? connectionForm(service) : connectionForm()] },
        { key: 'options', title: t('model_services.model_options', 'Model options'), meta: optionsMeta(service),
          nodes: [service ? modelOptions(service, say) : el('p', 'setup-fine', t('model_services.key_first', 'Save the key first.'))] },
      ], folds.private),
    ];
  };

  const paint = () => {
    const tabs = stones(...TABS.map((id) => stone(tabName(id), shown === id, of(id).some((s) => s.configured), () => { shown = id; paint(); })));
    const content = shown === 'gateway' ? gatewayTab() : shown === 'openrouter' ? openRouterTab() : apiKeyTab();
    body.replaceChildren(
      el('p', 'setup-fine', t('model_services.lede', 'A service holds the address and key; its model options appear under Model for every compatible harness that uses it. A harness signed in to its own service keeps its own flow.')),
      tabs, notice, ...content,
    );
  };

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
