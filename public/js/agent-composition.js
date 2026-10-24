import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { createStep, readingRows } from './form-steps.js';

export const AGENT_COMPOSITION_TYPE = 'agent.composition';
const REACH = ['open', 'discuss', 'plan', 'execute'];
const RECRUIT = ['open', 'nobody', 'propose agents', 'staff agents'];
const OUTPUT = ['open', 'ideas', 'a plan', 'code', 'an artifact', 'the team'];
const el = (tag, cls = '', text = '') => { const node = document.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; };
const rows = (values) => values.map((value) => ({ v: value, l: value }));
// The few words a conditional behaviour gives as its reason; lead implies team.
function reasonWords(requires) {
  const words = {
    'arrangement:managed': t('agent_composition.because_managed', 'Managed worktree'),
    'arrangement:checkout': t('agent_composition.because_checkout', 'Shared checkout'),
    team: t('agent_composition.because_team', 'On a Team'),
    lead: t('agent_composition.because_lead', 'Team lead'),
    project_management: t('agent_composition.because_project_management', 'Project management on'),
  };
  return requires.filter((need) => !(need === 'team' && requires.includes('lead'))).map((need) => words[need] || need).join(' · ');
}

/**
 * THE ONE COMPOSITION BODY (owner, 2026-10-24): what this Agent is set to, and what you can change.
 * The composition tile and an opened Commons roster row paint it alike, as the kit's unnumbered
 * sections (createStep) in the launch forms' format: Mandate (the stones) and Behaviors — ONE list
 * of this Agent's behaviours, a reading row each: the name (press it to read its page), its line,
 * and in place of a control the reason, plain and muted, when it is not a choice ("every Cowork
 * Agent", "Team lead", "since birth"), or the kit's switch when it is. UPDATE is the body's one act: the host puts
 * `action` in its one action row as the primary; it wakes when something changed; pressed, Ronin
 * writes the configuration, builds the Agent a new brief and tells it once to read it. Its answer
 * sits first in the body, directly under the act.
 */
export function createAgentCompositionReader(agent, { setState = () => {} } = {}) {
  const { createAction, createNotice } = WorkspaceKit.primitives;
  const body = el('div', 'ac-body');
  const action = createAction({ label: t('agent_composition.update', 'Update'), kind: 'primary' });
  const notice = createNotice();
  action.el.disabled = true;
  let questions = [];
  let value = () => null;
  let loaded = '';
  const refresh = () => { action.el.disabled = JSON.stringify(value()) === loaded; };
  const load = async () => {
    for (const question of questions) question.destroy(); questions = [];
    action.el.disabled = true; notice.set();
    body.replaceChildren(el('p', 'ac-status', t('forms.loading', 'Loading…')));
    const result = await request(`/api/sessions/${encodeURIComponent(agent)}/composition`, { cache: 'no-store' });
    if (!result.ok) return setState('failed', result.message);
    setState(null, ''); render(result.data);
  };
  const render = (data) => {
    body.replaceChildren(notice.el);
    const section = (key, title) => { const step = createStep({ key, title }); body.append(step.el); return step.body; };
    const mandate = section('mandate', t('mandate', 'Mandate'));
    const mandateQuestion = ask([{ fields: [
      { key: 'reach', label: t('team_config.reach', 'Reach'), options: rows(REACH) },
      { key: 'recruit', label: t('team_config.recruit', 'Recruit'), options: rows(RECRUIT) },
      { key: 'output', label: t('team_config.output', 'Output'), many: true, options: rows(OUTPUT) },
    ] }], { value: data.current.mandate, density: 'tight', onChange: refresh }); questions.push(mandateQuestion);
    mandate.append(mandateQuestion.el);
    const behaviours = section('behaviours', t('behaviours', 'Behaviors'));
    // The name reads its page the way a stone's read glyph does: the same event, the same reader.
    const name = (row) => {
      const button = el('button', 'wa-link', row.label || row.name); button.type = 'button';
      button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('ronin:read-document', { detail: { path: row.path, source: body } })));
      return button;
    };
    const since = (row) => (row.since_birth ? t('agent_composition.since_birth', 'since birth') : '');
    // A conditional's reason; when the condition is the behaviour's own name, say only that it holds.
    const why = (row) => {
      if (row.scope === 'floor') return t('agent_composition.every_agent', 'every Cowork Agent');
      const reason = reasonWords(row.requires);
      return [reason === (row.label || row.name) ? t('agent_composition.holds_now', 'applies now') : reason, since(row)].filter(Boolean).join(' · ');
    };
    const line = (row, control) => { const dd = el('div'); if (row.blurb) dd.append(el('div', 'ac-line', row.blurb)); dd.append(control); return [name(row), dd]; };
    const fixed = (data.sends?.rows || []).filter((row) => row.scope !== 'selected');
    const chosenNow = new Set(data.current.behaviours.map((row) => row.name));
    const switches = data.available_behaviours.map((row) => {
      const given = ask([{ fields: [{ key: row.name, label: row.label || row.name, switch: true, compact: true }] }], { value: { [row.name]: chosenNow.has(row.name) }, density: 'tight', onChange: refresh });
      questions.push(given);
      return { row, given };
    });
    const list = readingRows([
      ...fixed.map((row) => line(row, el('div', 'ac-line', why(row)))),
      ...switches.map(({ row, given }) => line(row, given.el)),
    ]);
    list.classList.add('ac-behaviours'); behaviours.append(list);
    if (data.sends?.error) behaviours.append(el('p', 'ac-status', data.sends.error));
    value = () => ({ mandate: mandateQuestion.value(), behaviours: switches.filter(({ row, given }) => given.value()[row.name]).map(({ row }) => row.name) });
    loaded = JSON.stringify(value()); refresh();
  };
  action.el.addEventListener('click', async () => {
    action.el.disabled = true; notice.set('info', t('agent_composition.updating', 'Updating…'));
    const sent = await request(`/api/sessions/${encodeURIComponent(agent)}/configuration`, { method: 'PUT', json: value() });
    if (!sent.ok) { notice.set('failed', sent.message); refresh(); return; }
    loaded = JSON.stringify(value()); refresh();
    notice.set('success', t('agent_composition.updated', 'The Agent has been sent its new brief.'));
  });
  return { el: body, action, show: load, destroy: () => { for (const question of questions) question.destroy(); questions = []; } };
}

export function createAgentCompositionSurface(agent) {
  const reader = createAgentCompositionReader(agent, { setState: (state, message) => surface.setState(state, message) });
  const surface = WorkspaceKit.primitives.createSurface({ label: t('agent_composition.title', 'Agent composition'), className: 'agent-composition', actions: [reader.action] });
  surface.content.append(reader.el);
  return { el: surface.el, show: reader.show, destroy: reader.destroy };
}
