/* part of the ronin-cowork client — see js/README.md */
/** A LEVEL'S NEW AGENT DEFAULTS (src/waterfall.ts): what each Agent and Team made under a Workspace
 * starts with: its Mandate (reach, recruit, output), the Mode it launches in, and its model, one for
 * an Agent and one for a Team lead. Copied from the parent when the level was made; changed only
 * here. The mandate menus are the catalog's (mandates.js) and the models the provider catalog's
 * (form-steps.js): call after `loadMandates()` and `loadHarnessCatalog()`.
 *
 *   value: { agent_defaults: { reach, recruit, output: [] }, launch_mode, models: { default: { provider, model }, lead: { provider, model } } }
 */
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { modelLabel, harnessCatalog, rowTierWord } from './form-steps.js';
import { firstMandate, mandateRows } from './mandates.js';

const el = (tag, cls) => { const node = document.createElement(tag); if (cls) node.className = cls; return node; };
const pair = (value) => ({ provider: value?.provider || '', model: value?.model || '' });

// The New Agent form's model rows: every provider and model in the catalog, what this box cannot launch off.
const reason = (row) => (row.off ? t('forms.reason_turned_off', 'turned off') : t('forms.reason_not_on_machine', 'not on this machine'));
const harnessRows = () => harnessCatalog().rows
  .filter((row, index, all) => all.findIndex((other) => other.provider === row.provider) === index)
  .map((row) => ({ v: row.provider, l: row.cli_label || row.provider_label || row.provider, off: row.operational ? undefined : reason(row) }));
const modelRows = (provider) => harnessCatalog().rows.filter((row) => row.provider === provider)
  .map((row) => ({ v: row.model, l: modelLabel(row), word: rowTierWord(row), off: row.selectable ? undefined : reason(row) }));

export function createLevelDefaults({ value = {}, screen = {}, onChange = () => {} } = {}) {
  const a = value.agent_defaults || {};
  const agent = pair(value.models?.default);
  const lead = pair(value.models?.lead);
  const root = el('div', 'level-defaults');
  const modelFields = (prefix) => [
    { key: `${prefix}provider`, label: t('forms.provider', 'Harness'), blank: t('forms.default', 'Default'), options: harnessRows },
    { key: `${prefix}model`, label: t('forms.model', 'Model'), blank: t('forms.default', 'Default'), after: `${prefix}provider`, options: (now) => modelRows(now[`${prefix}provider`]) },
  ];
  const asks = ask([
    { group: t('mandate', 'Mandate'), fields: [
      { key: 'reach', label: t('team_config.reach', 'Reach'), options: mandateRows('reach', screen) },
      { key: 'recruit', label: t('team_config.recruit', 'Recruit'), options: mandateRows('recruit', screen) },
      { key: 'output', label: t('team_config.output', 'Output'), many: true, options: mandateRows('output', screen) },
      { key: 'launch_mode', label: t('launch_mode.mode', 'Mode'), options: [
        { v: 'configured', l: t('launch_mode.configured', 'Native'), sub: t('launch_mode.configured_sub', 'Do not override the harness’s approval behavior. Model selection is separate.') },
        { v: 'live_dangerously', l: t('launch_mode.live', 'Dangerously'), sub: t('workspaces.live_sub', 'Each harness’s own approval-bypass launch; Native where a harness has none.') },
      ] },
    ] },
    { group: t('level_defaults.model_agent', 'Model for a new Agent'), fields: modelFields('') },
    { group: t('level_defaults.model_lead', 'Model for a new Team lead'), fields: modelFields('lead_') },
  ], { value: {
    reach: a.reach || firstMandate('reach'), recruit: a.recruit || firstMandate('recruit'), output: [a.output || firstMandate('output')].flat().filter(Boolean),
    launch_mode: value.launch_mode === 'configured' ? 'configured' : 'live_dangerously',
    provider: agent.provider, model: agent.model, lead_provider: lead.provider, lead_model: lead.model,
  }, density: 'tight', trayHost: root, onChange: () => onChange() });
  root.append(asks.el);
  const read = () => {
    const now = asks.value();
    return {
      agent_defaults: { reach: now.reach, recruit: now.recruit, output: [...(now.output || [])] },
      launch_mode: now.launch_mode,
      models: { default: { provider: now.provider || '', model: now.model || '' }, lead: { provider: now.lead_provider || '', model: now.lead_model || '' } },
    };
  };
  return { el: root, value: read, destroy: () => asks.destroy() };
}
