/* Editable reading of one durable team_roster. Membership is intentionally absent. */
import { request } from './request.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const field = (form, label, name, value, kind = 'input') => {
  const row = el('label', 'tw-config-field');
  row.append(el('span', null, label));
  const input = document.createElement(kind);
  input.name = name;
  input.value = value || '';
  row.append(input);
  form.append(row);
  return input;
};

const reading = (form, label, value) => {
  const row = el('div', 'tw-config-reading');
  row.append(el('span', null, label), el('output', null, value || '—'));
  form.append(row);
};

const readableName = (name) => String(name || '').split(/[_-]+/).filter(Boolean)
  .map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');

export function renderTeamConfiguration(host, roster, options = {}) {
  host.replaceChildren();
  if (!roster?.durable) {
    host.append(el('p', 'tw-config-empty', 'This Cowork has no saved roster.'));
    return;
  }
  const form = el('form', 'tw-config-form');
  const name = field(form, 'Cowork name', 'name', roster.name);
  field(form, 'Readable title', 'title', roster.title);
  field(form, 'Purpose', 'objective', roster.objective, 'textarea');
  reading(form, 'Project root', roster.project_root);
  const actions = el('div', 'tw-config-actions');
  const status = el('span', 'tw-config-status');
  const saveAction = options.createAction?.({ label: 'Save', size: 'compact' });
  const save = saveAction?.el || el('button', null, 'Save'); save.type = 'submit';
  actions.append(status, save); form.append(actions); host.append(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saveAction) saveAction.setDisabled(true); else save.disabled = true; status.textContent = 'Saving…';
    const data = Object.fromEntries(new FormData(form));
    const nextName = String(data.name || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (nextName !== roster.name) {
      const renamed = await request(`/api/team-rosters/${encodeURIComponent(roster.name)}/rename`, { method: 'POST', json: { to: nextName } });
      if (!renamed.ok) { status.textContent = renamed.message; if (saveAction) saveAction.setDisabled(false); else save.disabled = false; return; }
    }
    delete data.name;
    // A generated readable title follows a renamed key. An explicitly customized title
    // stays exactly as the owner wrote it.
    if (nextName !== roster.name && data.title === readableName(roster.name)) data.title = readableName(nextName);
    const saved = await request(`/api/team-rosters/${encodeURIComponent(nextName)}`, { method: 'PUT', json: data });
    status.textContent = saved.ok ? 'Saved' : saved.message;
    if (saveAction) saveAction.setDisabled(false); else save.disabled = false;
    if (saved.ok) options.onSaved?.(saved.data.roster, nextName !== roster.name);
  });
}
