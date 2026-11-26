/* New Agent display preferences. null follows the full list, [] hides a group. */
import { workbenchLink, openWorkbenchTab } from './workspace.js';
import { ask } from './ask.js';
import { createStep, el } from './form-steps.js';
import { WorkspaceKit } from './workspace-kit.js';
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
  const section = createStep({ key: 'new-agent-models', title: 'Models shown in New Agent' });
  const choices = { ...catalog.preferences?.[entry.cli] };
  const selectors = [];
  const status = el('span', 'setup-fine');
  status.setAttribute('role', 'status');
  const groups = [{ id: '', name: 'In-harness models' }, ...(entry.services || [])];
  for (const group of groups) {
    const rows = entry.models.filter(row => (row.service_id || '') === group.id);
    if (!group.id && !rows.length) continue;
    const key = group.id || 'in-harness';
    const selection = modelSelection(catalog, entry, group.id);
    const mode = selection === null ? 'all' : selection.length ? 'selected' : 'hidden';
    const step = createStep({ key, title: group.name });
    const models = ask([{ fields: [{ key: 'models', label: 'Model options', many: true, shape: 'rect',
      options: rows.map(row => ({ v: row.model, l: row.name })) }] }], {
      exposed: true,
      value: { models: selection ?? rows.map(row => row.model) },
      onChange: value => { choices[key] = value.models; status.textContent = ''; },
    });
    const visibility = ask([{ fields: [{ key: 'mode', label: 'Show', shape: 'rect', options: [
      { v: 'all', l: 'All' }, { v: 'selected', l: 'Selected' }, { v: 'hidden', l: 'Hidden' },
    ] }] }], {
      exposed: true,
      value: { mode },
      onChange: value => {
        const currentMode = value.mode;
        choices[key] = currentMode === 'all' ? null : currentMode === 'hidden' ? [] : models.value().models;
        models.el.hidden = currentMode !== 'selected';
        status.textContent = '';
      },
    });
    models.el.hidden = mode !== 'selected';
    selectors.push(visibility, models);
    step.body.append(visibility.el, models.el);
    section.body.append(step.el);
  }
  const { createAction, createActionBar } = WorkspaceKit.primitives;
  const save = createAction({ label: 'Save model options', kind: 'primary', action: async () => {
    save.setDisabled(true);
    const saved = { ...choices };
    const result = await request('/api/new-agent-models/' + encodeURIComponent(entry.cli), { method: 'PUT', json: saved });
    save.setDisabled(false);
    if (result.ok) (catalog.preferences ||= {})[entry.cli] = saved;
    status.textContent = result.ok ? 'Saved' : result.message;
  } });
  section.body.append(createActionBar({ actions: [save] }).el, status);
  return { el: section.el, destroy: () => selectors.forEach(picker => picker.destroy()) };
}
