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
import { createStep, mandateWord } from './form-steps.js';
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

/** The form's one-line answer when its step is folded: its kind. The model is Models > Defaults' (owner, 2026-10-21). */
export function teamConfigurationMeta(roster) {
  return kindWord(roster?.kind || 'open');
}

export function renderTeamConfiguration(host, roster, optionsArg = {}) {
  host.replaceChildren();
  if (!roster?.durable) { host.append(el('p', 'tw-config-empty', t('team_config.no_roster', 'This Team has no saved record.'))); return; }
  const loading = el('p', 'tw-config-empty', t('team_config.loading', 'Loading Team Configuration…')); host.append(loading);
  const { createField } = WorkspacePrimitives;

  // The form is painted even into a host that is not in the document: the caller renders
  // only on real change now, so a commons waiting off-screen must receive its form here —
  // nothing will render it again when it is placed. A superseded render's host is a
  // discarded node; painting it is invisible and cheap.
  void request(`/api/workspaces?campaign_id=${encodeURIComponent(roster.campaign_id || '')}`).then((workspaceResult) => {
    const workspaces = workspaceResult.ok && Array.isArray(workspaceResult.data?.workspaces) ? workspaceResult.data.workspaces : [];
    const defaults = bucket(roster.agent_defaults);
    const form = el('form', 'ntf-form tw-config-form');

    /* ---- Team (an unnumbered section inside the Team's Configuration step): ID, Title and Kind on one line, then Purpose — the New Team form's own head ---- */
    const stepTeam = createStep({ key: 'team', title: t('team_config.team_step', 'Team') });
    const idInput = el('input', 'tw-config-id'); idInput.type = 'text'; idInput.name = 'name'; idInput.value = roster.name; idInput.disabled = true;
    const title = el('input'); title.type = 'text'; title.name = 'title'; title.spellcheck = false; title.value = roster.title || '';
    const identity = el('div', 'tw-config-identity');
    const kind = ask([{ group: t('team_config.kind', 'Kind'), fields: [
      { key: 'kind', label: t('team_config.kind', 'Kind'), shape: 'square', options: ruledRows('kind', ['open', 'coding', 'work', 'personal', 'household', 'social', 'school'], kindWord) },
    ] }], { value: { kind: roster.kind || 'open' }, density: 'tight', trayHost: identity });
    const identityField = (label, control) => {
      control.classList.add('tw-config-control');
      const field = createField({ label, control }).el;
      field.classList.add('tw-config-field');
      return field;
    };
    identity.append(identityField(t('team_config.cowork_id', 'Team ID'), idInput), identityField(t('team_config.title', 'Title'), title), kind.el);
    const objective = el('textarea'); objective.name = 'objective'; objective.rows = 3; objective.value = roster.objective || '';
    objective.placeholder = t('new_team.objective_placeholder', 'what this team is for');
    stepTeam.body.append(identity, createField({ label: t('team_config.objective', 'Purpose'), control: objective }).el);
    form.append(stepTeam.el);

    /* ---- New Agent defaults (unnumbered): what the next Agent starts from, never the Team's own behaviour ---- */
    const stepDefaults = createStep({ key: 'defaults', title: t('team_config.agent_defaults', 'New Agent defaults') });
    stepDefaults.body.append(el('p', 'fs-step-help', t('team_config.next_form', 'What each new Agent on this Team starts from. Nothing live changes.')));
    const workspaceRows = () => workspaces.map((w) => ({ v: w.name, l: w.title || w.name, sub: w.objective || '' }));
    const defaultsRow = el('div', 'tw-config-wide');
    const agentDefaults = ask([
      { group: t('new_team.workspace', 'Workspace'), fields: [
        { key: 'workspace', label: t('new_team.workspace', 'Workspace'), blank: t('new_team.workspace_none', 'None'), options: workspaceRows },
      ] },
      { group: t('mandate', 'Mandate'), fields: [
        { key: 'reach', label: t('team_config.reach', 'Reach'), options: REACH.map((v) => ({ v, l: mandateWord(v) })) },
        { key: 'recruit', label: t('team_config.recruit', 'Recruit'), options: RECRUIT.map((v) => ({ v, l: mandateWord(v) })) },
        { key: 'output', label: t('team_config.output', 'Output'), many: true, options: OUTPUT.map((v) => ({ v, l: mandateWord(v) })) },
      ] },
    ], { value: {
      workspace: roster.workspace || '',
      reach: defaults.reach || 'open', recruit: defaults.recruit || 'open', output: [defaults.output || 'open'].flat().filter(Boolean),
    }, density: 'tight', trayHost: defaultsRow });
    defaultsRow.append(agentDefaults.el); stepDefaults.body.append(defaultsRow); form.append(stepDefaults.el);

    const actions = el('div', 'tw-config-actions'); const status = el('span', 'tw-config-status');
    const saveAction = optionsArg.createAction?.({ label: t('panels.save', 'Save'), size: 'compact' }); const save = saveAction?.el || el('button', null, t('panels.save', 'Save')); save.type = 'submit'; actions.append(status, save); form.append(actions); host.replaceChildren(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (saveAction) saveAction.setDisabled(true); else save.disabled = true; status.textContent = t('team_config.saving', 'Saving…');
      const picked = agentDefaults.value();
      // Features and behaviours are not asked here (owner, 2026-09-13): the keys are not sent, so the store carries them as they are.
      const saved = await request(`/api/team-rosters/${encodeURIComponent(roster.name)}`, { method: 'PUT', json: {
        title: title.value, kind: kind.value().kind, objective: objective.value, workspace: picked.workspace,
        // Spread what was read so a key this card does not draw is carried rather than
        // dropped — but NOT `permissions` or the model, which are ruled out of agent_defaults;
        // spreading them would rewrite a retired field on every save.
        agent_defaults: { ...defaults, permissions: undefined, provider: undefined, model: undefined, launch_mode: undefined, reach: picked.reach, recruit: picked.recruit, output: picked.output },
      } });
      status.textContent = saved.ok ? t('team_config.saved', 'Saved') : saved.message; if (saveAction) saveAction.setDisabled(false); else save.disabled = false; if (saved.ok) optionsArg.onSaved?.(saved.data.roster);
    });
  });
}
