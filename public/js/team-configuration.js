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

/* THE KIT IS THE TEAM'S, NOT AN AGENT'S (owner, 2026-08-31). Ronin Control cannot be
   read as one Agent's setting: hand-in implies someone to hand to and promotion implies a
   lead, so managed file coordination only means anything with a team around it. That is
   why the routines map lives on the roster and why New Agent previews it and never edits
   it — and why this page has to SHOW it. At a glance: is this team on file management, on
   base alone, or on nothing at all?

   The names are the owner-facing ones (KOTOBA): `ronin_control` is **managed file
   coordination**; the token stays internal. */
const ROUTINE_WORDS = Object.freeze({
  ronin_base: 'Ronin Base',
  ronin_control: 'managed file coordination',
  ronin_services: 'Ronin Services',
  machine: 'Machine',
  gbrain: 'gbrain',
  koshi: 'Koshi',
  ronin_koe: 'Ronin Koe',
});
const routineWord = (key) => ROUTINE_WORDS[key] || key;

/** What an Agent born here is equipped with, in one line. The floor is not a switch and
 *  is not listed; with nothing on above it, the honest answer is the floor alone. */
const kitLine = (routines) => {
  const on = Object.entries(routines || {}).filter(([, value]) => value).map(([key]) => routineWord(key));
  return on.length ? on.join(' · ') : 'the floor alone — no Routine is on';
};

export function renderTeamConfiguration(host, roster, options = {}) {
  host.replaceChildren();
  if (!roster?.durable) {
    host.append(el('p', 'tw-config-empty', 'This Cowork has no saved roster.'));
    return;
  }
  const form = el('form', 'tw-config-form');
  reading(form, 'Cowork ID', roster.name);
  field(form, 'Readable title', 'title', roster.title);
  field(form, 'Purpose', 'objective', roster.objective, 'textarea');
  reading(form, 'Project root', roster.project_root);
  reading(form, 'Kind', roster.kind);
  // THE TEAM KIT, as selected — what every Agent raised here inherits.
  reading(form, 'Routines', kitLine(roster.routines));
  const books = roster.behaviours?.books || [];
  reading(form, 'Behaviours', books.length
    ? `${books.join(' · ')}${roster.behaviours?.required ? ' (required)' : ''}`
    : 'none');
  const actions = el('div', 'tw-config-actions');
  const status = el('span', 'tw-config-status');
  const saveAction = options.createAction?.({ label: 'Save', size: 'compact' });
  const save = saveAction?.el || el('button', null, 'Save'); save.type = 'submit';
  actions.append(status, save); form.append(actions); host.append(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saveAction) saveAction.setDisabled(true); else save.disabled = true; status.textContent = 'Saving…';
    const data = Object.fromEntries(new FormData(form));
    const saved = await request(`/api/team-rosters/${encodeURIComponent(roster.name)}`, { method: 'PUT', json: data });
    status.textContent = saved.ok ? 'Saved' : saved.message;
    if (saveAction) saveAction.setDisabled(false); else save.disabled = false;
    if (saved.ok) options.onSaved?.(saved.data.roster);
  });
}
