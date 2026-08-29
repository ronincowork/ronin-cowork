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
  field(form, 'Role', 'team_role', roster.team_role);
  field(form, 'Project root', 'project_root', roster.project_root);
  field(form, 'Repositories', 'repos', (roster.repos || []).join(', '));
  field(form, 'Branch', 'branch', roster.branch);
  field(form, 'Wipeboard', 'wipeboard', roster.wipeboard);
  const actions = el('div', 'tw-config-actions');
  const status = el('span', 'tw-config-status');
  const save = el('button', null, 'Save'); save.type = 'submit';
  actions.append(status, save); form.append(actions); host.append(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true; status.textContent = 'Saving…';
    const data = Object.fromEntries(new FormData(form));
    const nextName = String(data.name || '').trim();
    if (nextName !== roster.name) {
      const renamed = await request(`/api/team-rosters/${encodeURIComponent(roster.name)}/rename`, { method: 'POST', json: { to: nextName } });
      if (!renamed.ok) { status.textContent = renamed.message; save.disabled = false; return; }
    }
    delete data.name;
    data.repos = String(data.repos || '').split(',').map((repo) => repo.trim()).filter(Boolean);
    const saved = await request(`/api/team-rosters/${encodeURIComponent(nextName)}`, { method: 'PUT', json: data });
    status.textContent = saved.ok ? 'Saved' : saved.message;
    save.disabled = false;
    if (saved.ok) options.onSaved?.(saved.data.roster, nextName !== roster.name);
  });
}
