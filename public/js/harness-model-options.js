/* New Agent display preferences. null follows the full list, [] hides a group. Unset is the full list. */
import { workbenchLink, openWorkbenchTab } from './workspace.js';
import { el, modelLabel } from './form-steps.js';
import { createTable, tableLink } from './data-table.js';
import { request } from './request.js';
import { t } from './lexicon.js';

export function modelSettingsLink(cli) {
  const state = cli ? { count: 1, selected: 'workspace1', seats: { workspace1: { type: 'models.provider', key: cli } } } : {};
  const spec = { destination: 'settings2', state };
  const link = workbenchLink(document.createElement('a'), spec);
  link.textContent = 'Configure model options';
  link.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0) return;
    event.preventDefault();
    openWorkbenchTab(spec);
  });
  return link;
}

/** Why a Ronin Gateway option can't be used now, in the person's words; '' when it can (w1028). */
export function gatewayBlockWord(blocked) {
  return blocked === 'stopped' ? t('model_services.gateway_stopped', 'house models are stopped for this office: see the Business Lounge')
    : blocked === 'token_rejected' ? t('model_services.gateway_token_rejected', 'the gateway rejected this office’s token')
    : blocked === 'unreachable' ? t('model_services.gateway_unreachable', 'the gateway could not be reached')
    : '';
}

export function modelSelection(catalog, entry, serviceId) {
  const selections = catalog.preferences?.[entry.cli];
  const group = serviceId || 'in-harness';
  return selections && Object.hasOwn(selections, group) ? selections[group] : null;
}

export function shownInNewAgent(catalog, entry, row) {
  const selected = modelSelection(catalog, entry, row.service_id);
  return selected === null || selected.includes(row.model);
}

/**
 * MODELS IN NEW AGENT, TWO TIERS (owner, 26 Nov 2026): first the model services New Agent offers for this
 * harness, In harness and each set-up service, as stones filled when on; then, for each one on, its own table
 * in the table pattern (data-table.js): a row per model, muted when hidden, Hide or Show.
 * Every press saves. A service on with nothing hidden is null, so models it adds later show by themselves;
 * a service off is [].
 */
const TYPES = [['gateway', 'Ronin Gateway', 'gateway'], ['private_api', 'API key', 'private'], ['openrouter', 'OpenRouter', 'openrouter']];
export function harnessModelEditor(catalog, entry, openServices) {
  const box = el('div', 'harness-models');
  const choices = { ...catalog.preferences?.[entry.cli] };
  const seen = new Set();
  const rows = entry.models.filter(row => {
    const id = `${row.service_id || ''}\n${row.model}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const groupOf = row => row.service_id || 'in-harness';
  // In harness, then each service type the harness can use in the Setup bar's order: its set-up services,
  // or one stone saying Not set up that opens that tab of Model services.
  const services = entry.services || [];
  const groups = [
    ...(rows.some(row => !row.service_id) ? [{ id: 'in-harness', name: 'In harness' }] : []),
    ...TYPES.filter(([type]) => (entry.service_types || []).includes(type) || services.some(s => s.service_type === type))
      .flatMap(([type, name, tab]) => {
        const mine = services.filter(s => s.service_type === type);
        return mine.length ? mine.map(s => ({ id: s.id, name: s.name })) : [{ id: '', name, tab }];
      }),
  ];
  const modelsOf = group => rows.filter(row => groupOf(row) === group);
  const isOn = group => !(Array.isArray(choices[group]) && choices[group].length === 0);
  const isShown = row => { const picked = choices[groupOf(row)]; return !Array.isArray(picked) || picked.includes(row.model); };
  const status = el('p', 'setup-fine');
  status.setAttribute('role', 'status'); status.hidden = true;
  const holder = el('div', 'harness-models-body');

  const save = async (group, next) => {
    const before = choices[group];
    choices[group] = next;
    paint();
    const result = await request('/api/new-agent-models/' + encodeURIComponent(entry.cli), { method: 'PUT', json: { ...choices } });
    if (result.ok) { (catalog.preferences ||= {})[entry.cli] = { ...choices }; status.hidden = true; return; }
    choices[group] = before;
    paint();
    status.textContent = result.message; status.hidden = false;
  };
  const flip = row => {
    const group = groupOf(row);
    const all = modelsOf(group);
    const shown = all.filter(other => other === row ? !isShown(row) : isShown(other)).map(other => other.model);
    void save(group, shown.length === all.length ? null : shown);
  };

  const unset = group => {
    const out = el('button', 'ask-opt ask-rect');
    out.type = 'button';
    out.append(el('span', 'ask-name', group.name), el('small', 'ask-word', 'Not set up'));
    out.setAttribute('aria-selected', 'false');
    out.addEventListener('click', () => openServices(group.tab));
    return out;
  };
  const stone = group => {
    if (!group.id) return unset(group);
    const on = isOn(group.id);
    const out = el('button', 'ask-opt ask-rect');
    out.type = 'button';
    out.append(el('span', 'ask-name', group.name));
    out.setAttribute('aria-selected', String(on));
    out.setAttribute('aria-label', `${group.name}, ${on ? 'on' : 'off'}`);
    out.addEventListener('click', () => { void save(group.id, on ? [] : null); });
    return out;
  };
  const table = group => {
    const models = modelsOf(group.id);
    // Name and Model ID always, even when they match: what a launch sends, never guessed from the name.
    return createTable({
      headings: ['Name', 'Model ID'],
      rows: models.map(row => {
        const id = row.model === 'native' ? 'CLI default' : row.api_model_id || row.model;
        return { off: !isShown(row), cells: [modelLabel(row), id], tools: [[isShown(row) ? 'Hide' : 'Show', () => flip(row)]] };
      }),
      lines: models.length ? [] : [['No models yet.', null]],
    });
  };

  const paint = () => {
    const sources = el('div', 'ask setup-harness-row setup-harness-ways setup-hermes-sources');
    sources.dataset.density = 'tight';
    sources.append(...groups.map(stone));
    const parts = [el('p', 'setup-fine', `The model services New Agent offers for ${entry.cli_label || entry.cli}, then the models in each.`), sources,
      tableLink('+ Add or change model services in Settings', () => openServices('gateway'))];
    for (const group of groups) {
      if (!group.id || !isOn(group.id)) continue;
      parts.push(el('h4', 'harness-models-service', group.name), table(group));
    }
    holder.replaceChildren(...parts);
  };
  paint();
  box.append(holder, status);
  return { el: box, destroy: () => {} };
}
