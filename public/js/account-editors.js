/* part of the ronin-cowork client — see js/README.md */
/**
 * THE ACCOUNT EDITORS (KAN-236, the Agent Harness workbench): the forms and tick lists every page that shows
 * an account uses — the Accounts tilespace, the Models tilespace and, later, each harness page. Modelled on the
 * Hermes editors (hermes-surface.js), which keep drawing the Hermes page unchanged. One record behind them all:
 * `/api/accounts` reads the Hermes connections as accounts; every write goes back through it.
 *   `accountForm(account, { kind, onSaved })` — add or edit a Personal API (vendor or OpenAI-compatible endpoint,
 *   key) or a Ronin API (the gateway endpoint, prefilled, and the house token).
 *   `tickList(rows, ticked, onChange)` — a tick per row, saved as one list on change.
 *   `kindWord(kind)` — the account kind's word, the same everywhere.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { el, loadProviderCatalog } from './form-steps.js';
import { t } from './lexicon.js';

export function kindWord(kind) {
  return {
    subscription: t('accounts.kind_subscription', 'Subscription'),
    personal_api: t('accounts.kind_personal_api', 'Personal API'),
    ronin_api: t('accounts.kind_ronin_api', 'Ronin API'),
  }[kind] || kind;
}

export function button(label, action, kind = '') { const made = WorkspaceKit.primitives.createAction({ label, kind, action }); return made.el ?? made; }
function bar(...actions) { return WorkspaceKit.primitives.createActionBar({ actions }).el; }
function input(value = '', type = 'text') {
  const node = el('input'); node.type = type; node.value = value; return node;
}
function select(rows, value = '') {
  const node = el('select');
  for (const [id, name] of rows) { const o = el('option', null, name); o.value = id; node.append(o); }
  node.value = value || rows[0]?.[0] || '';
  return node;
}
function field(name, control) {
  control.setAttribute('aria-label', name);
  const node = el('label', 'hermes-field', name); node.append(control); return node;
}

/** One write to the record; the answer is the whole list again. Resolves the answer, or null after saying why. */
export async function accountAction(action, body, say) {
  const result = await request(`/api/accounts/${action}`, { method: 'POST', json: body });
  if (!result.ok) { say?.(result.message, true); return null; }
  await loadProviderCatalog();
  return result.data;
}
export async function presetAction(action, body, say) {
  const result = await request(`/api/presets/${action}`, { method: 'POST', json: body });
  if (!result.ok) { say?.(result.message, true); return null; }
  await loadProviderCatalog();
  return result.data;
}

/** A tick list: `rows` as [id, label], `ticked` the ids on; `onChange(ids)` after each press. */
export function tickList(rows, ticked, onChange, { className = '' } = {}) {
  const list = el('div', `accounts-ticks ${className}`.trim());
  const on = new Set(ticked);
  for (const [id, label, note] of rows) {
    const line = el('label', 'accounts-tick');
    const box = el('input'); box.type = 'checkbox'; box.checked = on.has(id); box.value = id;
    box.addEventListener('change', () => { if (box.checked) on.add(id); else on.delete(id); onChange([...on]); });
    line.append(box, el('span', null, label));
    if (note) line.append(el('span', 'setup-provider-default', note));
    list.append(line);
  }
  return list;
}

/**
 * Add or edit an account. `kind` fixes the form: a Personal API asks vendor, endpoint, wire and key; a Ronin
 * API asks endpoint (prefilled with the gateway) and the house token. `onSaved(answer)` gets the new list.
 */
export function accountForm(account = {}, { kind = account.kind || 'personal_api', onSaved = () => {}, onCancel = () => {}, say = () => {} } = {}) {
  const form = el('form', 'hermes-editor accounts-form');
  const editing = !!account.id && !account.seeded;
  const name = input(account.name || (kind === 'ronin_api' ? t('accounts.ronin_api_name', 'Ronin API') : ''));
  const url = input(account.baseUrl || (kind === 'ronin_api' ? 'http://127.0.0.1:4912/v1' : 'https://api.openai.com/v1'), 'url');
  const key = input('', 'password'); key.autocomplete = 'new-password';
  form.append(el('h3', null, editing
    ? t('accounts.edit_title', 'Edit {kind}', { kind: kindWord(kind) })
    : t('accounts.add_title', 'Add {kind}', { kind: kindWord(kind) })));
  form.append(field(t('accounts.field_name', 'Name'), name));
  let provider = null, wire = null, wireChanged = false;
  if (kind === 'personal_api') {
    provider = select([['openai', t('accounts.vendor_openai', 'OpenAI API')], ['mistral', t('accounts.vendor_mistral', 'Mistral API')], ['custom', t('accounts.vendor_custom', 'OpenAI-compatible API')]], account.provider);
    wire = select([['chat', t('accounts.wire_chat', 'Chat Completions')], ['responses', t('accounts.wire_responses', 'Responses')]], account.wire || (account.provider === 'openai' || !account.provider ? 'responses' : 'chat'));
    wire.addEventListener('change', () => { wireChanged = true; });
    provider.addEventListener('change', () => { url.value = provider.value === 'mistral' ? 'https://api.mistral.ai/v1' : provider.value === 'openai' ? 'https://api.openai.com/v1' : ''; wire.value = provider.value === 'openai' ? 'responses' : 'chat'; });
    form.append(field(t('accounts.field_vendor', 'API provider'), provider), field(t('accounts.field_url', 'Base URL'), url), field(t('accounts.field_wire', 'Wire API'), wire));
    form.append(field(editing ? t('accounts.field_key_keep', 'API key (leave blank to keep)') : t('accounts.field_key', 'API key'), key));
  } else {
    form.append(field(t('accounts.field_endpoint', 'Gateway endpoint'), url));
    form.append(field(editing ? t('accounts.field_token_keep', 'House token (leave blank to keep)') : t('accounts.field_token', 'House token'), key));
    form.append(el('p', 'setup-fine', t('accounts.ronin_api_note', 'From Ronin Cloud onboarding, or the house gateway running on this machine. Usage is stamped by the gateway.')));
  }
  const save = button(t('accounts.save', 'Save'), () => {}, 'primary'); save.type = 'submit';
  form.append(bar(save, button(t('accounts.cancel', 'Cancel'), onCancel)));
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); save.disabled = true;
    try {
      const body = { id: account.id, kind, name: name.value, baseUrl: url.value, apiKey: key.value };
      if (provider) { body.provider = provider.value; body.wireApi = !editing || wireChanged ? wire.value : account.wire; }
      const answer = await accountAction('save', body, say);
      if (answer) onSaved(answer);
    } finally { key.value = ''; save.disabled = false; }
  });
  queueMicrotask(() => name.focus());
  return form;
}

/** Add or edit a preset: name, account, model (from the account's offered list), reasoning, approvals. */
export function presetForm(preset = {}, accounts = [], { onSaved = () => {}, onCancel = () => {}, say = () => {} } = {}) {
  const form = el('form', 'hermes-editor accounts-form');
  const usable = accounts.filter((a) => a.configured && a.models.length);
  const name = input(preset.name || '');
  const account = select(usable.map((a) => [a.id, a.name]), preset.account);
  const model = select([]); const reasoning = select([]);
  const approvals = select([['off', t('accounts.approvals_off', 'YOLO — approvals off')], ['prompt', t('accounts.approvals_prompt', 'Ask for approval')]], preset.approvals || 'off');
  const populate = () => {
    const a = usable.find((row) => row.id === account.value);
    const rows = (a?.offered?.length ? a.offered : a?.models || []).map((id) => [id, id]);
    const options = select(rows, preset.account === a?.id ? preset.model : ''); model.replaceChildren(...options.childNodes); model.value = rows.some(([id]) => id === preset.model) && preset.account === a?.id ? preset.model : rows[0]?.[0] || '';
    const levels = a?.provider === 'openai' || a?.wire === 'responses' ? ['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max'] : ['default'];
    const choices = select(levels.map((id) => [id, id === 'default' ? t('accounts.reasoning_default', 'Provider default') : id]), levels.includes(preset.reasoning) ? preset.reasoning : a?.provider === 'openai' ? 'medium' : 'default');
    const chosen = choices.value; reasoning.replaceChildren(...choices.childNodes); reasoning.value = chosen;
  };
  account.addEventListener('change', populate); populate();
  form.append(el('h3', null, preset.id ? t('accounts.preset_edit', 'Edit preset') : t('accounts.preset_add', 'Add preset')),
    field(t('accounts.preset_name', 'Name shown under Model'), name), field(t('accounts.preset_account', 'Account'), account), field(t('accounts.preset_model', 'Model'), model),
    field(t('accounts.preset_reasoning', 'Reasoning effort'), reasoning), field(t('accounts.preset_approvals', 'Approvals'), approvals));
  const save = button(t('accounts.save', 'Save'), () => {}, 'primary'); save.type = 'submit';
  form.append(bar(save, button(t('accounts.cancel', 'Cancel'), onCancel)));
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); save.disabled = true;
    try {
      const answer = await presetAction('save', { id: preset.id, harness: 'hermes', name: name.value, account: account.value, model: model.value, reasoning: reasoning.value, approvals: approvals.value }, say);
      if (answer) onSaved(answer);
    } finally { save.disabled = false; }
  });
  queueMicrotask(() => name.focus());
  return form;
}

/** One account's facts in a line: kind · endpoint · configured · models. */
export function accountSummary(account) {
  const node = el('div', 'hermes-card-summary');
  const facts = [
    account.fault ? t('accounts.fault', 'no gateway address: {fault}', { fault: account.fault }) : account.baseUrl.replace(/^https?:\/\//, ''),
    account.credentialEnv ? account.credentialEnv : '',
    account.seeded ? t('accounts.seeded', 'add a token to use it') : account.configured ? t('accounts.configured', 'Configured') : t('accounts.key_missing', 'Key missing'),
    account.discoveredAt ? t('accounts.models_n', '{n} models · {m} offered', { n: account.models.length, m: account.offered.length }) : t('accounts.not_discovered', 'Models not discovered'),
  ].filter(Boolean);
  node.append(el('span', 'setup-provider-default', kindWord(account.kind)), el('strong', null, account.name), el('span', null, facts.join(' · ')));
  return node;
}
