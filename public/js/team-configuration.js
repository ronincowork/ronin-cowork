/* Editable reading of one complete durable team_roster. Membership is intentionally absent.
 * THE SAME FORMAT AS NEW AGENT AND NEW TEAM (owner, 2026-09-13): the launch forms' numbered
 * steps (createStep), the kit's labelled fields (createField) and ERABI at the forms' tight
 * density. Step 1 · Team — Team ID, Title and Kind on one line, then Purpose. Step 2 · New
 * Agent defaults — Where it works, Model, Mandate, Runtime: what the next Agent starts from,
 * never the Team's own behaviour. Features and behaviours are not asked here. */
import { t } from './lexicon.js';
import { request } from './request.js';
import { ask } from './ask.js';
import { ruledRows } from './glyphs.js';
import { createStep, loadProviderCatalog, mandateWord, modelAvailabilityFact, modelLabel, providerCatalog, tierWord } from './form-steps.js';
import { WorkspacePrimitives } from './workspace-primitives.js';

const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = String(text); return node; };
const bucket = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];

const kindWord = (value) => ({
  open: t('campaign_view.option_open', 'Open'), coding: t('team_config.kind_coding', 'Coding'), work: t('team_config.kind_work', 'Work'), personal: t('team_config.kind_personal', 'Personal'),
  household: t('team_config.kind_household', 'Household'), social: t('team_config.kind_social', 'Social'), school: t('team_config.kind_school', 'School'),
})[value] || value;
const REACH = ['open', 'discuss', 'plan', 'execute'];
const RECRUIT = ['open', 'nobody', 'propose agents', 'staff agents'];
const OUTPUT = ['open', 'a plan', 'ideas', 'code', 'an artifact', 'the team'];

/** The provider and model rows as every ask() consumer reads them: the one catalog, reasons only. */
const reason = (row) => (row.off
  ? t('forms.reason_turned_off', 'turned off')
  : row.listed === false && row.model_list_current
    ? t('forms.reason_not_listed', 'not listed by your {cli} {client_version}', { cli: row.cli_label || row.cli, client_version: row.model_list?.client_version || '' })
    : t('forms.reason_not_on_machine', 'not on this machine'));
const providerRows = () => {
  const rows = providerCatalog().rows;
  return rows.filter((row, index) => rows.findIndex((other) => other.provider === row.provider) === index)
    .map((row) => ({ v: row.provider, l: row.provider_label || row.provider, off: row.operational ? '' : reason(row) }));
};
const modelRows = (provider) => providerCatalog().rows.filter((row) => row.provider === provider)
  .map((row) => ({ v: row.model, l: modelLabel(row), word: tierWord(row.tier), sub: modelAvailabilityFact(row) || row.cost || '', off: row.selectable ? '' : (row.operational ? modelAvailabilityFact(row) : reason(row)) }));

export function renderTeamConfiguration(host, roster, optionsArg = {}) {
  host.replaceChildren();
  if (!roster?.durable) { host.append(el('p', 'tw-config-empty', t('team_config.no_roster', 'This Team has no saved record.'))); return; }
  const loading = el('p', 'tw-config-empty', t('team_config.loading', 'Loading Team Configuration…')); host.append(loading);
  const { createField } = WorkspacePrimitives;

  // The form is painted even into a host that is not in the document: the caller renders
  // only on real change now, so a commons waiting off-screen must receive its form here —
  // nothing will render it again when it is placed. A superseded render's host is a
  // discarded node; painting it is invisible and cheap.
  void Promise.all([loadProviderCatalog(), request('/api/project-roots/detail')]).then(([, rootResult]) => {
    const roots = rootResult.ok && Array.isArray(rootResult.data?.roots) ? rootResult.data.roots.filter((root) => !root.archived) : [];
    const defaults = bucket(roster.agent_defaults);
    const form = el('form', 'ntf-form tw-config-form');

    /* ---- step 1 · Team: ID, Title and Kind on one line, then Purpose — the New Team form's own head ---- */
    const stepTeam = createStep({ n: 1, key: 'team', title: t('team_config.team_step', 'Team') });
    const idInput = el('input', 'tw-config-id'); idInput.type = 'text'; idInput.name = 'name'; idInput.value = roster.name; idInput.disabled = true;
    const title = el('input'); title.type = 'text'; title.name = 'title'; title.spellcheck = false; title.value = roster.title || '';
    const identity = el('div', 'tw-config-identity');
    const kind = ask([{ group: t('team_config.kind', 'Kind'), fields: [
      { key: 'kind', label: t('team_config.kind', 'Kind'), shape: 'square', options: ruledRows('kind', ['open', 'coding', 'work', 'personal', 'household', 'social', 'school'], kindWord) },
    ] }], { value: { kind: roster.kind || 'open' }, density: 'tight', trayHost: identity });
    identity.append(createField({ label: t('team_config.cowork_id', 'Team ID'), control: idInput }).el, createField({ label: t('team_config.title', 'Title'), control: title }).el, kind.el);
    const objective = el('textarea'); objective.name = 'objective'; objective.rows = 3; objective.value = roster.objective || '';
    objective.placeholder = t('new_team.objective_placeholder', 'what this team is for');
    stepTeam.body.append(identity, createField({ label: t('team_config.objective', 'Purpose'), control: objective }).el);
    form.append(stepTeam.el);

    /* ---- step 2 · New Agent defaults: what the next Agent starts from, never the Team's own behaviour ---- */
    const stepDefaults = createStep({ n: 2, key: 'defaults', title: t('team_config.agent_defaults', 'New Agent defaults') });
    stepDefaults.body.append(el('p', 'fs-step-help', t('team_config.next_form', 'What each new Agent on this Team starts from. Nothing live changes.')));
    const branches = { ...bucket(roster.branches) };
    const rootWasDesk = list(roster.repos).includes(roster.project_root); // a birthplace that is also a desk stays one
    const worktrees = (name) => roots.find((root) => root.name === name)?.repo_profile?.worktrees === 'enabled';
    const rootRows = () => roots.map((root) => ({ v: root.name, l: root.title || root.name, word: worktrees(root.name) ? t('where.worktree', 'worktree') : t('where.checkout', 'checkout') }));
    const branchLine = (option) => {
      if (worktrees(option.v)) return null; // worktree or checkout follows the Workspace Folder; only a checkout names a branch
      const input = el('input'); input.type = 'text'; input.spellcheck = false; input.value = branches[option.v] || '';
      input.placeholder = t('where.col_branch', 'Branch');
      input.addEventListener('input', () => { branches[option.v] = input.value.trim(); });
      return input;
    };
    const launchModes = [
      { v: 'configured', l: t('launch_mode.configured', 'Native'), sub: t('launch_mode.configured_sub', 'Use the provider CLI normally; a selected model is the only launch override.') },
      { v: 'live_dangerously', l: t('launch_mode.live', 'Dangerously'), sub: t('launch_mode.live_sub', 'Use that provider CLI’s own approval-bypass launch.') },
    ];
    const defaultsRow = el('div', 'tw-config-wide');
    const agentDefaults = ask([
      { group: t('where.label', 'Where it works'), fields: [
        { key: 'root', label: t('where.born_in', 'Born in'), blank: t('team_config.default', 'Default'), options: rootRows },
        { key: 'repos', label: t('where.additional', 'Additional workspaces'), many: true, after: 'root', options: (value) => rootRows().filter((row) => row.v !== value.root), row: branchLine },
      ] },
      { group: t('new_agent.model_package', 'Model'), fields: [
        { key: 'provider', label: t('team_config.provider', 'Provider'), blank: t('team_config.default', 'Default'), options: providerRows },
        { key: 'model', label: t('team_config.model', 'Model'), blank: t('team_config.default', 'Default'), after: 'provider', options: (value) => modelRows(value.provider) },
      ] },
      { group: t('mandate', 'Mandate'), fields: [
        { key: 'reach', label: t('team_config.reach', 'Reach'), options: REACH.map((v) => ({ v, l: mandateWord(v) })) },
        { key: 'recruit', label: t('team_config.recruit', 'Recruit'), options: RECRUIT.map((v) => ({ v, l: mandateWord(v) })) },
        { key: 'output', label: t('team_config.output', 'Output'), many: true, options: OUTPUT.map((v) => ({ v, l: mandateWord(v) })) },
      ] },
      { group: t('launch_mode.head', 'Launch mode'), fields: [
        { key: 'launch_mode', label: t('launch_mode.head', 'Launch mode'), options: launchModes },
      ] },
    ], { value: {
      root: roster.project_root || '', repos: list(roster.repos).filter((name) => name !== roster.project_root),
      provider: defaults.provider || '', model: defaults.model || '',
      reach: defaults.reach || 'open', recruit: defaults.recruit || 'open', output: [defaults.output || 'open'].flat().filter(Boolean),
      launch_mode: defaults.launch_mode || 'configured',
    }, density: 'tight', trayHost: defaultsRow });
    defaultsRow.append(agentDefaults.el); stepDefaults.body.append(defaultsRow); form.append(stepDefaults.el);

    const actions = el('div', 'tw-config-actions'); const status = el('span', 'tw-config-status');
    const saveAction = optionsArg.createAction?.({ label: t('panels.save', 'Save'), size: 'compact' }); const save = saveAction?.el || el('button', null, t('panels.save', 'Save')); save.type = 'submit'; actions.append(status, save); form.append(actions); host.replaceChildren(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (saveAction) saveAction.setDisabled(true); else save.disabled = true; status.textContent = t('team_config.saving', 'Saving…');
      const picked = agentDefaults.value();
      const repos = rootWasDesk && picked.root && picked.root === roster.project_root ? [picked.root, ...picked.repos.filter((name) => name !== picked.root)] : picked.repos.filter((name) => name !== picked.root);
      // Features and behaviours are not asked here (owner, 2026-09-13): the keys are not sent, so the store carries them as they are.
      const saved = await request(`/api/team-rosters/${encodeURIComponent(roster.name)}`, { method: 'PUT', json: {
        title: title.value, kind: kind.value().kind, objective: objective.value, project_root: picked.root, repos,
        branches: Object.fromEntries(repos.filter((name) => !worktrees(name) && branches[name]).map((name) => [name, branches[name]])),
        // Spread what was read so a key this card does not draw is carried rather than
        // dropped — but NOT `permissions`, which is ruled out of agent_defaults entirely;
        // spreading it would rewrite a retired field on every save.
        agent_defaults: { ...defaults, permissions: undefined, provider: picked.provider, model: picked.model, reach: picked.reach, recruit: picked.recruit, output: picked.output, launch_mode: picked.launch_mode },
      } });
      status.textContent = saved.ok ? t('team_config.saved', 'Saved') : saved.message; if (saveAction) saveAction.setDisabled(false); else save.disabled = false; if (saved.ok) optionsArg.onSaved?.(saved.data.roster);
    });
  });
}
