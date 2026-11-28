/* New Agent display preferences: form display only, never routing (the launch progression does not read them).
 * null follows the full list, [] hides a group. Unset is the full list, except Ronin Gateway, hidden until someone
 * picks it for that harness (owner, 26 Nov 2026): Irasshai and a launch with no default reach it all the same. */
import { workbenchLink, openWorkbenchTab } from './workspace.js';
import { el, modelLabel } from './form-steps.js';
import { createTable, tableLink } from './data-table.js';
import { request } from './request.js';
import { t } from './lexicon.js';

export function modelSettingsLink(cli, label = 'Configure model entries') {
  const state = cli ? { count: 1, selected: 'workspace1', seats: { workspace1: { type: 'models.provider', key: cli } } } : {};
  const spec = { destination: 'settings2', state };
  const link = workbenchLink(document.createElement('a'), spec);
  link.textContent = label;
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
  if (selections && Object.hasOwn(selections, group)) return selections[group];
  return entry.services?.find(service => service.id === serviceId)?.service_type === 'gateway' ? [] : null;
}

export function shownInNewAgent(catalog, entry, row) {
  const selected = modelSelection(catalog, entry, row.service_id);
  return selected === null || selected.includes(row.model);
}

/**
 * A HARNESS'S MODEL SERVICES, TWO PARTS (owner, 27 Nov 2026; docs/architecture/harness-catalog.md, One harness
 * panel). `stones`: a stone per outside service the harness can use (Ronin Gateway, an API key in the Ronin key
 * vault, OpenRouter: src/model-services.ts, by request format), filled when New Agent offers it; one with no key
 * yet says No key in vault and opens Model services on its tab. They sit in the panel's service row beside the in-harness ways. `entries`: under the row, a table per
 * service that is on (In harness first, when the CLI lists its own), in the table pattern (data-table.js): a row
 * per model, muted when hidden, Hide or Show. Every press saves. A service on with nothing hidden is null, so
 * models it adds later show by themselves; a service off is [].
 */
const TYPES = [['gateway', 'Ronin Gateway', 'gateway'], ['private_api', 'API key', 'private'], ['openrouter', 'OpenRouter', 'openrouter']];
/** `skip`: service types this harness does not show (a harness with its own key login shows no key in the vault). */
export function harnessModelEditor(catalog, entry, openServices, { skip = [] } = {}) {
  const choices = { ...catalog.preferences?.[entry.cli] };
  const seen = new Set();
  const rows = (entry.models || []).filter(row => {
    const id = `${row.service_id || ''}\n${row.model}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const groupOf = row => row.service_id || 'in-harness';
  const services = entry.services || [];
  const word = type => TYPES.find(([one]) => one === type)?.[1] || '';
  const ronin = TYPES.filter(([type]) => !skip.includes(type) && ((entry.service_types || []).includes(type) || services.some(s => s.service_type === type)))
    .flatMap(([type, name, tab]) => {
      const mine = services.filter(s => s.service_type === type);
      return mine.length ? mine.map(s => ({ id: s.id, name: type === 'gateway' ? name : s.name, type })) : [{ id: '', name, tab, type }];
    });
  const modelsOf = group => rows.filter(row => groupOf(row) === group);
  const isOn = group => !(Array.isArray(choices[group]) && choices[group].length === 0);
  const isShown = row => { const picked = choices[groupOf(row)]; return !Array.isArray(picked) || picked.includes(row.model); };
  const status = el('p', 'setup-fine');
  status.setAttribute('role', 'status'); status.hidden = true;
  const holder = el('div', 'harness-models-body');
  const box = el('div', 'harness-models');
  box.append(holder, status);
  let onChange = () => {};

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

  /** The Ronin-side stones, drawn afresh for the panel's row. */
  const stones = () => ronin.map(group => {
    const out = el('button', 'ask-opt ask-rect');
    out.type = 'button';
    out.append(el('span', 'ask-name', group.name));
    // A key's own name says which key; the small word says what it is.
    if (group.id && group.type === 'private_api') out.append(el('small', 'ask-word', word('private_api')));
    if (!group.id) {
      // A key service with no key yet says so (owner, 27 Nov 2026); the Ronin Gateway needs none, so it is not set
      // up. The press opens Model services to add it.
      out.append(el('small', 'ask-word', group.type === 'gateway' ? t('harness.not_set_up', 'Not set up') : t('harness.no_key', 'No key in vault')));
      out.setAttribute('aria-selected', 'false');
      out.addEventListener('click', () => openServices(group.tab));
      return out;
    }
    const on = isOn(group.id);
    out.setAttribute('aria-selected', String(on));
    out.setAttribute('aria-label', `${group.name}, ${on ? 'on' : 'off'}`);
    out.addEventListener('click', () => { void save(group.id, on ? [] : null); });
    return out;
  });
  const table = group => {
    const models = modelsOf(group);
    // Name and Model ID always, even when they match: what a launch sends, never guessed from the name.
    return createTable({
      headings: ['Name', 'Model ID'],
      rows: models.map(row => {
        const id = row.model === 'native' ? 'CLI default' : row.api_model_id || row.model;
        return { off: !isShown(row), cells: [modelLabel(row), id], tools: [[isShown(row) ? 'Hide' : 'Show', () => flip(row)]] };
      }),
      // Native alone in the harness's own list: neither the CLI nor HQ has named its models yet (KAN-993).
      lines: !models.length ? [['No models yet.', null]]
        : group === 'in-harness' && models.every((row) => row.model === 'native') ? [[t('harness.models_on_way', 'Its models are on their way from Ronin HQ.'), null]] : [],
    });
  };

  // The harness's own lists are headed by the way it is signed in (owner, 28 Nov; KAN-992), as the panel knows it.
  let way = '';
  let ownHead = null;
  const ownWord = () => way === 'subscription' ? t('harness.in_harness_subscription', 'Subscription (in harness)')
    : way === 'api_key' ? t('harness.in_harness_api_key', 'API key (in harness)')
      : t('harness.in_harness', 'In harness');
  const paint = () => {
    const parts = [];
    ownHead = null;
    if (modelsOf('in-harness').length) { ownHead = el('h4', 'harness-models-service', ownWord()); parts.push(ownHead, table('in-harness')); }
    for (const group of ronin) {
      if (!group.id || !isOn(group.id)) continue;
      parts.push(el('h4', 'harness-models-service', group.name), table(group.id));
    }
    if (!parts.length) parts.push(el('p', 'setup-fine', t('harness.no_entries', 'No model service is on yet. Choose one above.')));
    // The way to add or change them comes after them (owner, 27 Nov: never above the choice).
    parts.push(tableLink(t('harness.add_services', '+ Add or change model services in Settings'), () => openServices('gateway')));
    holder.replaceChildren(...parts);
    onChange();
  };
  paint();
  const setWay = (next) => { way = next || ''; if (ownHead) ownHead.textContent = ownWord(); };
  return { stones, entries: box, setWay, onChange: (fn) => { onChange = fn; }, destroy: () => {} };
}
