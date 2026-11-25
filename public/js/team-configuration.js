/* Editable reading of one complete durable team_roster. Membership is intentionally absent.
 * THE SAME FORMAT AS NEW AGENT AND NEW TEAM (owner, 2026-09-13): the launch forms' numbered
 * steps (createStep), the kit's labelled fields (createField) and ERABI at the forms' tight
 * density. Step 1 · Team (open) — Team ID and Title on one line, then the Team objective, its
 * instructions and its Workspace. Step 2 · New Agent defaults (starts folded) — Mandate: what the next
 * Agent starts from, never the Team's own behaviour. Step 3 · Behaviors (starts folded) — what this Team's Agents are told: its
 * add, block and only lists, integrations and project management (brief-step.js, docs/architecture/brief.md, Where it is set in the UI). */
import { t } from './lexicon.js';
import { request } from './request.js';
import { ask } from './ask.js';
import { createStep } from './form-steps.js';
import { firstMandate, screenOf, loadMandates, mandateRows } from './mandates.js';
import { WorkspacePrimitives } from './workspace-primitives.js';
import { createBriefSettingsPanel } from './brief-step.js';

const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = String(text); return node; };
const bucket = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];

/** The form's one-line answer when its step is folded: its Workspace. The model is Models > Defaults' (owner, 2026-10-21). */
export function teamConfigurationMeta(roster) {
  return roster?.workspace || '';
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
  // The mandate menus are the catalog's mandate files (mandates.js), read with the Workspaces.
  void Promise.all([request('/api/workspaces'), loadMandates(),
    screenOf({ team: roster.name })]).then(([workspaceResult, , screen]) => {
    const workspaces = workspaceResult.ok && Array.isArray(workspaceResult.data?.workspaces) ? workspaceResult.data.workspaces.filter((w) => !w.archived || w.name === roster.workspace) : [];
    const defaults = bucket(roster.agent_defaults);
    const form = el('form', 'ntf-form tw-config-form');

    /* ---- Team (an unnumbered section inside the Team's Configuration step): ID and Title on one line, then objective, instructions and Workspace — the New Team form's own head ---- */
    const stepTeam = createStep({ key: 'team', title: t('team_config.team_step', 'Team') });
    const idInput = el('input', 'tw-config-id'); idInput.type = 'text'; idInput.name = 'name'; idInput.value = roster.name; idInput.disabled = true;
    const title = el('input'); title.type = 'text'; title.name = 'title'; title.spellcheck = false; title.value = roster.title || '';
    const identity = el('div', 'tw-config-identity');
    const identityField = (label, control) => {
      control.classList.add('tw-config-control');
      const field = createField({ label, control }).el;
      field.classList.add('tw-config-field');
      return field;
    };
    identity.append(identityField(t('team_config.cowork_id', 'Team ID'), idInput), identityField(t('team_config.title', 'Title'), title));
    const objective = el('textarea'); objective.name = 'objective'; objective.rows = 3; objective.value = roster.objective || '';
    objective.placeholder = t('new_team.objective_placeholder', 'what the lead picks up and starts on');
    const instructions = el('textarea'); instructions.name = 'instructions'; instructions.rows = 3; instructions.value = roster.instructions || '';
    instructions.placeholder = t('new_team.instructions_placeholder', 'standing directions every Agent in the Team reads');
    // The Team's own Workspace (roster.workspace), beside Purpose, read by its title.
    const workspaceRows = () => workspaces.map((w) => ({ v: w.name, l: w.title || w.name, sub: w.objective || '' }));
    const workspaceRow = el('div', 'tw-config-wide');
    const teamWorkspace = ask([{ group: t('new_team.workspace', 'Workspace'), fields: [
      { key: 'workspace', label: t('new_team.workspace', 'Workspace'), blank: t('new_team.workspace_none', 'None'), options: workspaceRows },
    ] }], { value: { workspace: roster.workspace || '' }, density: 'tight', trayHost: workspaceRow });
    workspaceRow.append(teamWorkspace.el);
    stepTeam.body.append(identity, createField({ label: t('new_team.objective', 'Team objective'), control: objective }).el,
      createField({ label: t('new_team.instructions', 'Team instructions'), control: instructions }).el, workspaceRow);
    form.append(stepTeam.el);

    // Team stays open; the two sections below start folded and open on their head (the kit's step fold).
    const open = { defaults: false, brief: false };
    const foldable = (key, title) => {
      const step = createStep({ key, title, onToggle: () => { open[key] = !open[key]; step.setCollapsed(!open[key], null); } });
      step.setCollapsed(true, null);
      return step;
    };

    /* ---- New Agent defaults (unnumbered): what the next Agent starts from, never the Team's own behaviour ---- */
    const stepDefaults = foldable('defaults', t('team_config.agent_defaults', 'New Agent defaults'));
    stepDefaults.body.append(el('p', 'fs-step-help', t('team_config.next_form', 'What each new Agent on this Team starts from. Nothing live changes.')));
    const defaultsRow = el('div', 'tw-config-wide');
    const agentDefaults = ask([
      { group: t('mandate', 'Mandate'), fields: [
        { key: 'reach', label: t('team_config.reach', 'Reach'), options: mandateRows('reach', screen) },
        { key: 'recruit', label: t('team_config.recruit', 'Recruit'), options: mandateRows('recruit', screen) },
        { key: 'output', label: t('team_config.output', 'Output'), many: true, options: mandateRows('output', screen) },
      ] },
    ], { value: {
      reach: defaults.reach || firstMandate('reach'), recruit: defaults.recruit || firstMandate('recruit'), output: [defaults.output || firstMandate('output')].flat().filter(Boolean),
    }, density: 'tight', trayHost: defaultsRow });
    defaultsRow.append(agentDefaults.el); stepDefaults.body.append(defaultsRow); form.append(stepDefaults.el);

    /* ---- Behaviors (unnumbered): what every Agent on this Team is told, saved with the form ---- */
    const stepBrief = foldable('brief', t('behaviours', 'Behaviors'));
    const brief = createBriefSettingsPanel({ layer: 'team', id: roster.name, campaignId: roster.campaign_id || '', ownSave: false,
      preview: { team: roster.name, campaign_id: roster.campaign_id || undefined } });
    stepBrief.body.append(el('p', 'fs-step-help', t('team_config.brief_help', 'What every Agent on this Team is told. Agents already working are sent the change.')), brief.el);
    form.append(stepBrief.el); void brief.enter();

    const actions = el('div', 'tw-config-actions'); const status = el('span', 'tw-config-status');
    const saveAction = optionsArg.createAction?.({ label: t('panels.save', 'Save'), size: 'compact' }); const save = saveAction?.el || el('button', null, t('panels.save', 'Save')); save.type = 'submit'; actions.append(status, save); form.append(actions); host.replaceChildren(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (saveAction) saveAction.setDisabled(true); else save.disabled = true; status.textContent = t('team_config.saving', 'Saving…');
      const picked = agentDefaults.value();
      const briefSaved = await brief.save();
      const saved = await request(`/api/team-rosters/${encodeURIComponent(roster.name)}`, { method: 'PUT', json: {
        title: title.value, objective: objective.value, instructions: instructions.value, workspace: teamWorkspace.value().workspace,
        // Spread what was read so a key this card does not draw is carried rather than
        // dropped — but NOT `permissions` or the model, which are ruled out of agent_defaults;
        // spreading them would rewrite a retired field on every save.
        agent_defaults: { ...defaults, permissions: undefined, provider: undefined, model: undefined, launch_mode: undefined, reach: picked.reach, recruit: picked.recruit, output: picked.output },
      } });
      status.textContent = saved.ok && briefSaved.ok ? t('team_config.saved', 'Saved') : saved.ok ? briefSaved.message : saved.message; if (saveAction) saveAction.setDisabled(false); else save.disabled = false; if (saved.ok) optionsArg.onSaved?.(saved.data.roster);
    });
  });
}
