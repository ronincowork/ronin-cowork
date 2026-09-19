/* part of the ronin-cowork client — see js/README.md */
/** Campaign Team and Agent defaults. These values seed the next form; they never edit a live Team or Agent. */
import { t } from './lexicon.js';
import { saveCampaign } from './campaigns.js';
import { WorkspaceKit } from './workspace-kit.js';
import { loadProviderCatalog, providerCatalog, modelAvailabilityFact, modelLabel } from './form-steps.js';
import { ask } from './ask.js';
import { request } from './request.js';

const el = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = String(text); return out; };
const bucket = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
// The Campaign is the TOP of this cascade — campaign → team → launch — so the stock value
// has to be settable somewhere, and this card is that somewhere.
const CHOICES = Object.freeze({ reach: ['open', 'discuss', 'plan', 'execute'], recruit: ['open', 'nobody', 'propose agents', 'staff agents'], output: ['open', 'a plan', 'ideas', 'code', 'an artifact', 'the team', 'no code'], launch_mode: ['configured', 'live_dangerously'] });
const optionLabel = (value) => ({
  open: t('campaign_view.option_open', 'Open'), discuss: t('campaign_view.option_discuss', 'Discuss'), plan: t('campaign_view.option_plan', 'Plan'), execute: t('campaign_view.option_execute', 'Execute'),
  nobody: t('campaign_view.option_nobody', 'Nobody'), 'propose agents': t('campaign_view.option_propose', 'Propose Agents'), 'staff agents': t('campaign_view.option_staff', 'Staff Agents'),
  'a plan': t('campaign_view.option_a_plan', 'A plan'), ideas: t('campaign_view.option_ideas', 'Ideas'), code: t('campaign_view.option_code', 'Code'), 'an artifact': t('campaign_view.option_artifact', 'An artifact'), 'the team': t('campaign_view.option_team', 'The Team'), 'no code': t('campaign_view.option_no_code', 'No code'),
  configured: t('launch_mode.configured', 'Native'), live_dangerously: t('launch_mode.live', 'Dangerously'),
})[value] || value;

export function createAgentDefaultsSurface(campaign) {
  const { createSurface, createNotice } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('campaign_view.defaults', 'Defaults'), className: 'cv-surface' });
  const body = el('div', 'cv-body'); surface.content.append(body);

  function paint(seed = null) {
    const row = campaign(); body.replaceChildren();
    if (!row) return surface.setState('empty', t('campaign_view.none_selected', 'No Campaign selected.'));
    surface.setState(null, '');
    const current = bucket(row.config?.defaults);
    const form = el('form', 'cv-defaults-form');
    const questionsRow = el('div', 'cv-default-field');
    const notice = createNotice();
    body.append(el('p', 'cv-note', t('campaign_view.defaults_help', 'These defaults land in the next Team or Agent form that opens. They remain editable there; nothing live changes.')));
    const catalog = providerCatalog().rows;
    const providers = catalog.filter((row, index) => catalog.findIndex((other) => other.provider === row.provider) === index);
    const reason = (providerRow) => providerRow.off
      ? t('forms.reason_turned_off', 'turned off')
      : providerRow.listed === false && providerRow.model_list_current
        ? t('forms.reason_not_listed', 'not listed by your {cli} {client_version}', { cli: providerRow.cli_label || providerRow.cli, client_version: providerRow.model_list?.client_version || '' })
        : t('forms.reason_not_on_machine', 'not on this machine');
    const availableNames = new Set(list(seed?.available));
    const availableBehaviours = list(seed?.behaviours).filter((behaviour) => availableNames.has(behaviour.name));
    let picked = {
      provider: String(current.provider || ''), model: String(current.model || ''),
      reach: current.reach || CHOICES.reach[0], recruit: current.recruit || CHOICES.recruit[0],
      output: list(current.output), launch_mode: current.launch_mode || CHOICES.launch_mode[0],
      behaviours: list(current.behaviours),
    };
    const questions = ask([
      { group: t('new_agent.model_package', 'Model'), fields: [
        { key: 'provider', label: t('campaign_view.col_provider', 'Provider'), blank: t('campaign_view.provider_default', 'Default provider'), options: providers.map((row) => ({ v: row.provider, l: row.provider_label, off: row.operational ? '' : reason(row) })) },
        { key: 'model', label: t('campaign_view.col_model', 'Preferred model'), blank: t('campaign_view.model_default', 'Default model'), after: 'provider', options: (value) => catalog.filter((row) => row.provider === value.provider).map((row) => ({ v: row.model, l: modelLabel(row), word: row.tier, sub: modelAvailabilityFact(row), off: row.selectable ? '' : (row.operational ? modelAvailabilityFact(row) : reason(row)) })) },
      ] },
      { group: t('mandate', 'Mandate'), fields: [
        { key: 'reach', label: t('campaign_view.default_reach', 'Reach'), options: CHOICES.reach.map((value) => ({ v: value, l: optionLabel(value) })) },
        { key: 'recruit', label: t('campaign_view.default_recruit', 'Recruit'), options: CHOICES.recruit.map((value) => ({ v: value, l: optionLabel(value) })) },
        { key: 'output', label: t('campaign_view.default_output', 'Output'), many: true, options: CHOICES.output.map((value) => ({ v: value, l: optionLabel(value) })) },
      ] },
      { group: t('campaign_view.defaults_runtime', 'Runtime'), fields: [
        { key: 'launch_mode', label: t('launch_mode.head', 'Launch mode'), options: [
          { v: 'configured', l: optionLabel('configured'), sub: t('launch_mode.configured_sub', 'Use the provider CLI normally; a selected model is the only launch override.') },
          { v: 'live_dangerously', l: optionLabel('live_dangerously'), sub: t('launch_mode.live_sub', 'Use that provider CLI’s own approval-bypass launch.') },
        ] },
      ] },
      { group: t('campaign_view.default_behaviours', 'Behaviours'), fields: [{
        key: 'behaviours', label: t('campaign_view.default_behaviours', 'Behaviours'), many: true, shape: 'tall',
        options: availableBehaviours.map((row) => ({ v: row.name, l: row.label || row.name, sub: row.blurb || '', read: row.reading })),
      }] },
    ], { value: picked, trayHost: questionsRow, onChange: (value) => { picked = value; } });
    questionsRow.append(questions.el); form.append(questionsRow);
    const actions = el('div', 'cv-default-actions');
    const save = el('button', 'cv-save', t('panels.save', 'Save')); save.type = 'submit'; actions.append(notice.el, save); form.append(actions); body.append(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); save.disabled = true; notice.set('info', t('campaign.saving', 'saving…'));
      const next = { ...current, ...picked, behaviours: list(picked.behaviours) };
      const result = await saveCampaign(row.id, { config: { defaults: next } });
      notice.set(result.ok ? 'success' : 'failed', result.ok ? t('settei.saved', 'saved') : result.message); save.disabled = false;
      if (result.ok) paint(seed);
    });
  }

  return { el: surface.el, enter: () => void Promise.all([
    loadProviderCatalog(),
    request(`/api/launch-seed?campaign_id=${encodeURIComponent(campaign()?.id || '')}`),
  ]).then(([, seedResult]) => paint(seedResult.ok ? seedResult.data : null)) };
}

export function defaultsSummary(campaign) {
  const defaults = bucket(campaign?.config?.defaults);
  const model = [defaults.provider, defaults.model ? modelLabel(defaults) : ''].filter(Boolean).join(' · ') || t('campaign_view.provider_default', 'Default provider');
  return t('campaign_view.defaults_summary', '{model} · {reach}', { model, reach: defaults.reach || 'open' });
}
