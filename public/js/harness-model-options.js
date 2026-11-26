/* New Agent display preferences. null follows the full list, [] hides a group. Unset is the full list. */
import { workbenchLink, openWorkbenchTab } from './workspace.js';
import { createStep, el } from './form-steps.js';
import { createTable } from './data-table.js';
import { request } from './request.js';

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
 * MODELS SHOWN IN NEW AGENT (owner, 26 Nov 2026): one table in the table pattern (data-table.js), one row
 * per model option: its model service, whether New Agent shows it, and Hide or Show, saved on the press.
 * A group with nothing hidden stays null, so models a service adds later show by themselves.
 */
export function harnessModelEditor(catalog, entry) {
  const section = createStep({ key: 'new-agent-models', title: 'Models shown in New Agent' });
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
  status.setAttribute('role', 'status');
  const holder = el('div');

  const flip = async row => {
    const group = groupOf(row);
    const before = choices[group];
    const shown = all(group).filter(model => model === row.model ? !isShown(row) : isShown({ ...row, model }));
    choices[group] = shown.length === all(group).length ? null : shown;
    paint();
    const result = await request('/api/new-agent-models/' + encodeURIComponent(entry.cli), { method: 'PUT', json: { ...choices } });
    if (result.ok) { (catalog.preferences ||= {})[entry.cli] = { ...choices }; status.textContent = ''; return; }
    choices[group] = before;
    paint();
    status.textContent = result.message;
  };

  const paint = () => {
    holder.replaceChildren(createTable({
      headings: ['Model', 'Model service', 'In New Agent'],
      rows: rows.map(row => ({
        cells: [row.name || row.model, services.get(row.service_id) || 'In harness', isShown(row) ? 'Shown' : 'Hidden'],
        tools: [[isShown(row) ? 'Hide' : 'Show', () => { void flip(row); }]],
      })),
      lines: rows.length ? [] : [['No model options yet.', null]],
    }));
  };
  paint();
  section.body.append(holder, status);
  return { el: section.el, destroy: () => {} };
}
