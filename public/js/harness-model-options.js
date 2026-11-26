/* New Agent display preferences. null follows the full list, [] hides a group. Unset is the full list. */
import { workbenchLink, openWorkbenchTab } from './workspace.js';
import { el } from './form-steps.js';
import { createTable } from './data-table.js';
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
 * MODELS SHOWN IN NEW AGENT (owner, 26 Nov 2026): a section of the harness page, as Yours is, holding one
 * table in the table pattern (data-table.js): a row per model option, ✓ when New Agent shows it, muted when
 * hidden, its model service, and Hide or Show, saved on the press.
 * A group with nothing hidden stays null, so models a service adds later show by themselves.
 */
export function harnessModelEditor(catalog, entry) {
  const section = el('section', 'setup-provider-catalog');
  const choices = { ...catalog.preferences?.[entry.cli] };
  const services = new Map((entry.services || []).map(service => [service.id, service.name]));
  const seen = new Set();
  const rows = entry.models.filter(row => {
    const id = `${row.service_id || ''}\n${row.model}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const groupOf = row => row.service_id || 'in-harness';
  const all = group => rows.filter(row => groupOf(row) === group).map(row => row.model);
  const isShown = row => { const picked = choices[groupOf(row)]; return !Array.isArray(picked) || picked.includes(row.model); };
  const status = el('p', 'setup-fine');
  status.setAttribute('role', 'status'); status.hidden = true;
  const holder = el('div');

  const flip = async row => {
    const group = groupOf(row);
    const before = choices[group];
    const shown = all(group).filter(model => model === row.model ? !isShown(row) : isShown({ ...row, model }));
    choices[group] = shown.length === all(group).length ? null : shown;
    paint();
    const result = await request('/api/new-agent-models/' + encodeURIComponent(entry.cli), { method: 'PUT', json: { ...choices } });
    if (result.ok) { (catalog.preferences ||= {})[entry.cli] = { ...choices }; status.textContent = ''; status.hidden = true; return; }
    choices[group] = before;
    paint();
    status.textContent = result.message; status.hidden = false;
  };

  const paint = () => {
    holder.replaceChildren(createTable({
      headings: ['Model', 'Model service'],
      rows: rows.map(row => {
        const name = el('span', 'data-table-name');
        const tick = el('span', 'hermes-tick', isShown(row) ? '✓' : '');
        tick.setAttribute('aria-label', isShown(row) ? 'Shown in New Agent' : 'Hidden from New Agent');
        name.append(tick, el('span', '', row.name || row.model));
        return { off: !isShown(row), cells: [name, services.get(row.service_id) || 'In harness'],
          tools: [[isShown(row) ? 'Hide' : 'Show', () => { void flip(row); }]] };
      }),
      lines: rows.length ? [] : [['No model options yet.', null]],
    }));
  };
  paint();
  section.append(el('h3', 'setup-provider-eyebrow', 'Models shown in New Agent'), holder, status);
  return { el: section, destroy: () => {} };
}
