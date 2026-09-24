import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { ask } from './ask.js';

export const AGENT_COMPOSITION_TYPE = 'agent.composition';
const REACH = ['open', 'discuss', 'plan', 'execute'];
const RECRUIT = ['open', 'nobody', 'propose agents', 'staff agents'];
const OUTPUT = ['open', 'ideas', 'a plan', 'code', 'an artifact', 'the team'];
const el = (tag, cls = '', text = '') => { const node = document.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; };
const rows = (values) => values.map((value) => ({ v: value, l: value }));
function mandateLine(value) {
  return value ? [value.reach, value.recruit, ...(value.output || [])].filter(Boolean).join(' · ') : t('agent_composition.birth_unavailable', 'Unavailable in this legacy birth receipt');
}
function behaviourList(items) {
  return items?.length ? items.map((row) => row.name).join(', ') : t('agent_composition.none', 'None');
}

export function createAgentCompositionSurface(agent) {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('agent_composition.title', 'Agent composition'), className: 'agent-composition' });
  const body = el('div', 'ac-body'); surface.content.append(body);
  let questions = [];
  const load = async () => {
    for (const question of questions) question.destroy(); questions = [];
    body.replaceChildren(el('p', 'ac-status', t('forms.loading', 'Loading…')));
    const result = await request(`/api/sessions/${encodeURIComponent(agent)}/composition`, { cache: 'no-store' });
    if (!result.ok) return surface.setState('failed', result.message);
    surface.setState(null, ''); render(result.data);
  };
  const render = (data) => {
    body.replaceChildren();
    const birth = el('section', 'ac-section ac-birth');
    birth.append(el('h3', '', t('agent_composition.birth', 'At birth')), el('p', 'ac-note', t('agent_composition.birth_note', 'Immutable history — changes below never rewrite these facts.')));
    const facts = el('dl', 'ac-facts'); facts.append(el('dt', '', t('mandate', 'Mandate')), el('dd', '', mandateLine(data.birth.mandate)), el('dt', '', t('behaviours', 'Behaviors')), el('dd', '', behaviourList(data.birth.behaviours)));
    birth.append(facts, el('h4', '', t('agent_composition.brief', 'Brief / assignment')), el('pre', 'ac-brief', data.birth.brief || t('agent_composition.no_brief', 'No saved brief.')));
    const current = el('section', 'ac-section'); current.append(el('h3', '', t('agent_composition.current', 'Current effective facts')));
    const form = el('form', 'ac-mandate');
    const question = ask([{ group: t('mandate', 'Mandate'), fields: [
      { key: 'reach', label: t('team_config.reach', 'Reach'), options: rows(REACH) },
      { key: 'recruit', label: t('team_config.recruit', 'Recruit'), options: rows(RECRUIT) },
      { key: 'output', label: t('team_config.output', 'Output'), many: true, options: rows(OUTPUT) },
    ] }], { value: data.current.mandate, density: 'tight' }); questions.push(question); form.append(question.el);
    const save = el('button', 'wk-action', t('forms.save', 'Save')); save.type = 'submit'; const status = el('p', 'ac-status'); form.append(save, status);
    form.addEventListener('submit', async (event) => { event.preventDefault(); save.disabled = true; const changed = await request(`/api/sessions/${encodeURIComponent(agent)}/composition/mandate`, { method: 'PUT', json: question.value() }); save.disabled = false; status.textContent = changed.ok ? t('agent_composition.mandate_saved', 'Work record updated; notice queued.') : changed.message; if (changed.ok) void load(); });
    const behaviours = el('div', 'ac-behaviours'); behaviours.append(el('p', '', behaviourList(data.current.behaviours)));
    const available = data.available_behaviours.filter((row) => !data.current.behaviours.some((item) => item.name === row.name));
    if (available.length) { const picker = ask([{ group: t('agent_composition.add_behavior', 'Add Behavior'), fields: [{ key: 'name', label: t('behaviours', 'Behaviors'), options: available.map((row) => ({ v: row.name, l: row.label || row.name, sub: row.blurb, read: row.path })) }] }], { value: { name: available[0].name }, density: 'tight' }); questions.push(picker); const add = el('button', 'wk-action', t('agent_composition.add_behavior', 'Add Behavior')); add.type = 'button'; const addStatus = el('p', 'ac-status'); add.addEventListener('click', async () => { add.disabled = true; const changed = await request(`/api/sessions/${encodeURIComponent(agent)}/composition/behaviours`, { method: 'POST', json: picker.value() }); add.disabled = false; addStatus.textContent = changed.ok ? t('agent_composition.behavior_queued', 'Teaching queued for the Agent.') : changed.message; if (changed.ok) void load(); }); const row = el('div', 'ac-add'); row.append(picker.el, add); behaviours.append(row, addStatus); }
    else behaviours.append(el('p', 'ac-note', t('agent_composition.no_additions', 'No further optional Behaviors are available.')));
    current.append(form, el('h4', '', t('behaviours', 'Behaviors')), behaviours); body.append(birth, current);
  };
  return { el: surface.el, show: load, destroy: () => { for (const question of questions) question.destroy(); questions = []; } };
}
