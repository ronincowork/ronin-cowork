/* New Agent display preferences. null follows the full list, [] hides a group. */
import { workbenchLink, openWorkbenchTab } from './workspace.js';
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
  if (selections && Object.hasOwn(selections, group)) return selections[group];
  return entry.services?.find(service => service.id === serviceId)?.gateway ? [] : null;
}

export function shownInNewAgent(catalog, entry, row) {
  const selected = modelSelection(catalog, entry, row.service_id);
  return selected === null || selected.includes(row.model);
}

export function harnessModelEditor(catalog, entry) {
  const form = document.createElement('form');
  const title = document.createElement('h3');
  title.textContent = 'Models shown in New Agent';
  form.append(title);
  const choices = { ...catalog.preferences?.[entry.cli] };
  const groups = [{ id: '', name: 'In-harness models' }, ...(entry.services || [])];
  for (const group of groups) {
    const rows = entry.models.filter(row => (row.service_id || '') === group.id);
    if (!group.id && !rows.length) continue;
    const box = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = group.name;
    box.append(legend);
    const key = group.id || 'in-harness';
    const selection = modelSelection(catalog, entry, group.id);
    const mode = document.createElement('select');
    mode.setAttribute('aria-label', group.name);
    for (const [label, value] of [['All model options', 'all'], ['Selected model options', 'selected'], ['Hidden', 'hidden']]) mode.add(new Option(label, value));
    mode.value = selection === null ? 'all' : selection.length ? 'selected' : 'hidden';
    box.append(mode);
    const list = document.createElement('div');
    const selected = new Set(selection ?? rows.map(row => row.model));
    for (const row of rows) {
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = selected.has(row.model);
      check.onchange = () => {
        if (check.checked) selected.add(row.model); else selected.delete(row.model);
        choices[key] = [...selected];
      };
      label.append(check, row.name);
      list.append(label, document.createElement('br'));
    }
    list.hidden = mode.value !== 'selected';
    mode.onchange = () => {
      list.hidden = mode.value !== 'selected';
      choices[key] = mode.value === 'all' ? null : mode.value === 'hidden' ? [] : [...selected];
    };
    box.append(list);
    form.append(box);
  }
  const save = document.createElement('button');
  save.textContent = 'Save model options';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  form.append(save, status);
  form.onsubmit = async event => {
    event.preventDefault();
    save.disabled = true;
    const result = await request('/api/new-agent-models/' + encodeURIComponent(entry.cli), { method: 'PUT', json: choices });
    save.disabled = false;
    status.textContent = result.ok ? 'Saved' : result.message;
    if (result.ok) (catalog.preferences ||= {})[entry.cli] = { ...choices };
  };
  return form;
}
