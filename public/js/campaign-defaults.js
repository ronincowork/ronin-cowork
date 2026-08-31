/* part of the ronin-cowork client — see js/README.md */
/** Campaign Agent defaults. These values seed the next form; they never edit a live Agent. */
import { t } from './lexicon.js';
import { request } from './request.js';
import { saveCampaign } from './campaigns.js';
import { WorkspaceKit } from './workspace-kit.js';

const el = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = String(text); return out; };
const bucket = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const CHOICES = Object.freeze({ reach: ['open', 'discuss', 'plan', 'execute'], recruit: ['open', 'nobody', 'propose agents', 'staff agents'], output: ['open', 'a plan', 'ideas', 'code', 'an artifact', 'the team'], dial: ['user', 'read', 'write'] });
const optionLabel = (value) => ({
  open: t('campaign_view.option_open', 'Open'), discuss: t('campaign_view.option_discuss', 'Discuss'), plan: t('campaign_view.option_plan', 'Plan'), execute: t('campaign_view.option_execute', 'Execute'),
  nobody: t('campaign_view.option_nobody', 'Nobody'), 'propose agents': t('campaign_view.option_propose', 'Propose Agents'), 'staff agents': t('campaign_view.option_staff', 'Staff Agents'),
  'a plan': t('campaign_view.option_a_plan', 'A plan'), ideas: t('campaign_view.option_ideas', 'Ideas'), code: t('campaign_view.option_code', 'Code'), 'an artifact': t('campaign_view.option_artifact', 'An artifact'), 'the team': t('campaign_view.option_team', 'The Team'),
  user: t('campaign_view.option_user', 'You only'), read: t('campaign_view.option_read', 'Read'), write: t('campaign_view.option_write', 'Read and write'),
})[value] || value;

const labeled = (form, label, control, help = '') => {
  const row = el('label', 'cv-default-field'); row.append(el('span', 'cv-default-label', label), control);
  if (help) row.append(el('small', 'cv-from', help)); form.append(row); return control;
};
const selectOf = (values, selected) => {
  const select = el('select', 'cv-input');
  for (const value of values) select.add(new Option(optionLabel(value), value));
  select.value = values.includes(selected) ? selected : values[0]; return select;
};

export function createAgentDefaultsSurface(campaign) {
  const { createSurface, createNotice } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('campaign_view.agent_defaults', 'Agent defaults'), className: 'cv-surface' });
  const body = el('div', 'cv-body'); surface.content.append(body);
  let specs = [];

  function paint() {
    const row = campaign(); body.replaceChildren();
    if (!row) return surface.setState('empty', t('campaign_view.none_selected', 'No Campaign selected.'));
    surface.setState(null, '');
    const current = bucket(row.config?.agent_defaults);
    const form = el('form', 'cv-defaults-form');
    const notice = createNotice();
    body.append(el('p', 'cv-note', t('campaign_view.defaults_help', 'These defaults land in the next Team or Agent form that opens. They remain editable there; nothing live changes.')));
    const providers = [...new Set(specs.map((spec) => spec.provider))];
    const provider = selectOf(['', ...providers], String(current.provider || ''));
    provider.options[0].textContent = t('campaign_view.provider_default', 'Default provider');
    const model = el('select', 'cv-input');
    const fillModels = () => {
      const previous = String(current.model || ''); model.replaceChildren(new Option(t('campaign_view.model_default', 'Default model'), ''));
      for (const spec of specs.filter((item) => item.provider === provider.value)) model.add(new Option(spec.model, spec.model));
      model.value = [...model.options].some((option) => option.value === previous) ? previous : '';
      model.disabled = !provider.value;
    };
    provider.addEventListener('change', () => { current.model = ''; fillModels(); }); fillModels();
    labeled(form, t('campaign_view.col_provider', 'Provider'), provider);
    labeled(form, t('campaign_view.col_model', 'Preferred model'), model);
    const controls = {};
    const fieldLabels = { reach: t('campaign_view.default_reach', 'Reach'), recruit: t('campaign_view.default_recruit', 'Recruit'), output: t('campaign_view.default_output', 'Output'), dial: t('campaign_view.default_dial', 'Control') };
    for (const [name, values] of Object.entries(CHOICES)) controls[name] = labeled(form, fieldLabels[name], selectOf(values, current[name]));
    const permissions = el('input', 'cv-input'); permissions.value = String(current.permissions || 'default');
    labeled(form, t('campaign_view.default_permissions', 'Permissions'), permissions, t('campaign_view.permissions_help', 'Provider permission posture; default uses the provider’s normal setting.'));
    const behaviours = el('textarea', 'cv-input'); behaviours.value = list(current.behaviours).join('\n');
    labeled(form, t('campaign_view.default_behaviours', 'Behaviours'), behaviours, t('campaign_view.behaviours_help', 'One shelf:name book per line.'));
    const actions = el('div', 'cv-default-actions');
    const save = el('button', 'cv-save', t('panels.save', 'Save')); save.type = 'submit'; actions.append(notice.el, save); form.append(actions); body.append(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); save.disabled = true; notice.set('info', t('campaign.saving', 'saving…'));
      const next = { ...current, provider: provider.value, model: model.value, reach: controls.reach.value, recruit: controls.recruit.value, output: controls.output.value, dial: controls.dial.value, permissions: permissions.value, behaviours: behaviours.value.split('\n').map((value) => value.trim()).filter(Boolean) };
      const result = await saveCampaign(row.id, { config: { agent_defaults: next } });
      notice.set(result.ok ? 'success' : 'failed', result.ok ? t('settei.saved', 'saved') : result.message); save.disabled = false;
      if (result.ok) paint();
    });
  }

  return { el: surface.el, enter: () => void request('/api/session-launch-specs').then((result) => { specs = result.ok && Array.isArray(result.data) ? result.data : []; paint(); }) };
}

export function defaultsSummary(campaign) {
  const defaults = bucket(campaign?.config?.agent_defaults);
  const model = [defaults.provider, defaults.model].filter(Boolean).join(' · ') || t('campaign_view.provider_default', 'Default provider');
  return t('campaign_view.defaults_summary', '{model} · {reach} · {dial}', { model, reach: defaults.reach || 'open', dial: defaults.dial || 'write' });
}
