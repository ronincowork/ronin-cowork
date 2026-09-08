/* Browser adapter from the Presets shell to Ronin's ordinary launch routes. */
import { request } from './request.js';
import { seedReservedWorkspaceTab } from './workspace.js';
import { launchTeamAgents } from './team-loader.js';

const slug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 34);
const unique = (base) => `${slug(base) || 'preset'}_${Date.now().toString(36)}`;

function launchAgent(row, plan, team = '', send) {
  const options = {
    method: 'POST',
    json: {
    session_type: 'cowork_agent',
    name: unique(team ? `${team}_${row.name || 'agent'}` : row.name || plan.template.name),
    team,
    instructions: plan.user_message || row.instructions || '',
    team_lead: row.team_lead === true,
    project_root: plan.inputs?.root || '',
    mandate: row.mandate,
    behaviours: row.behaviours,
    ...(plan.template?.name ? { template: plan.template.name } : {}),
    },
  };
  return send ? send('/api/launch', options) : request('/api/launch', options);
}

async function launchPersonalAssistant(plan, template, send) {
  const mode = plan.inputs?.assistant_mode || 'single';
  if (mode === 'single') {
    const launched = await launchAgent({ name: template.name }, plan, '', send);
    if (!launched.ok) return launched;
    return { ok: true, data: { sessions: launched.data?.name ? [{ name: launched.data.name }] : [], receipts: launched.data?.receipt ? [launched.data.receipt] : [], urlView: 'cowork' } };
  }
  const team = unique('personal_assistant');
  const rosterOptions = { method: 'POST', json: { name: team, title: template.label || 'Personal Assistant', objective: plan.user_message || template.brief || '', template: template.name } };
  const made = await (send ? send('/api/team-rosters', rosterOptions) : request('/api/team-rosters', rosterOptions));
  if (!made.ok) return made;
  const recruiting = mode === 'recruit';
  const instructions = [plan.user_message || template.brief || '', recruiting && plan.inputs?.specialists ? `Staff specialist help for: ${plan.inputs.specialists}` : ''].filter(Boolean).join('\n\n');
  const launched = await launchAgent({
    name: 'assistant_lead', instructions,
    mandate: { reach: 'execute', recruit: recruiting ? 'staff agents' : 'nobody', output: ['open'] },
  }, plan, team, send);
  if (!launched.ok) return launched;
  return { ok: true, data: { team, sessions: launched.data?.name ? [{ name: launched.data.name }] : [], receipts: launched.data?.receipt ? [launched.data.receipt] : [], urlView: 'team' } };
}

/**
 * WHAT A TEAM LAUNCH CAME TO. Rows the server refused are named with its sentence; if any
 * row was born the team is open and the person goes there, told who is missing. Only a
 * launch that born nobody is a failure.
 */
function teamOutcome(outcomes, extra = {}) {
  const born = outcomes.filter(({ result }) => result?.ok);
  const refused = outcomes.filter(({ result }) => !result?.ok).map(({ row, result }) => ({ name: row.name, message: result?.message || 'refused' }));
  if (!born.length) return { ok: false, message: refused[0]?.message || 'Nothing launched.' };
  return { ok: true, data: {
    ...extra,
    sessions: born.map(({ result }) => result.data?.name).filter(Boolean).map((name) => ({ name })),
    receipts: born.map(({ result }) => result.data?.receipt).filter(Boolean),
    refused, urlView: 'team',
  } };
}

export async function launchPresetPlan(plan = {}, send) {
  const ask = send || request;
  const shelf = plan.template?.shelf === 'teams' ? 'teams' : 'agents';
  const catalog = await ask(`/api/templates/${shelf}`, { cache: 'no-store' });
  if (!catalog.ok) return catalog;
  const template = (Array.isArray(catalog.data) ? catalog.data : []).find((row) => row.name === plan.template?.name);
  if (!template) return { ok: false, message: `Template not found: ${plan.template?.name || '(blank)'}` };

  if (plan.template?.name === 'personal_assistant') return launchPersonalAssistant(plan, template, send);

  if (shelf === 'agents') {
    const launched = await launchAgent({ name: template.name }, plan, '', send);
    if (!launched.ok) return launched;
    const name = launched.data?.name;
    return { ok: true, data: { sessions: name ? [{ name }] : [], receipts: launched.data?.receipt ? [launched.data.receipt] : [], root: plan.inputs?.root || '', document: plan.inputs?.document || '', urlView: 'cowork' } };
  }

  // BARE METAL IS A BARE-METAL TEAM: a team named bare_metal_<code>, whose members are the
  // native agent, bare — no Ronin birth packet, mandate or brief. One three-digit code per
  // launch names the team and rides every row's name, so several can live together; a name
  // still in use is refused by the server, loudly, in its words.
  if (plan.template.name === 'bare_metal') {
    const code = String(100 + Math.floor(Math.random() * 900));
    const team = `bare_metal_${code}`;
    const made = await ask('/api/team-rosters', { method: 'POST', json: {
      name: team, title: `Bare Metal ${code}`, objective: plan.user_message || template.objective || '', project_root: plan.inputs?.root || 'ronin_lab', template: template.name,
      // A bare-metal team launches bare: no Ronin base, no worktrees, whatever the Campaign cascades.
      routines: { ronin_base: false, ronin_worktrees: false },
    } });
    if (!made.ok) return made;
    const picks = (plan.inputs?.sessions || []).map((row) => ({
      session_type: 'bare_metal_agent', name: `${slug(row.name) || 'session'}_${code}`, project_root: plan.inputs?.root || 'ronin_lab', instructions: plan.user_message || '',
      ...(row.provider ? { provider: row.provider } : {}), ...(row.model ? { model: row.model } : {}),
    }));
    const outcomes = await launchTeamAgents(ask, team, picks);
    return teamOutcome(outcomes, { team, root: plan.inputs?.root || 'ronin_lab' });
  }

  const team = unique(template.name);
  const rosterOptions = {
    method: 'POST',
    json: {
      name: team,
      title: template.label || template.name,
      objective: plan.user_message || template.objective || '',
      project_root: plan.inputs?.root || '',
      template: template.name,
    },
  };
  const made = await (send ? send('/api/team-rosters', rosterOptions) : request('/api/team-rosters', rosterOptions));
  if (!made.ok) return made;
  const configured = plan.template.name === 'bare_metal' || plan.template.name === 'ronin_team'
    ? (plan.inputs?.sessions || [])
    : plan.template.name === 'health_and_fitness'
      ? (plan.inputs?.roles || []).map((row) => ({ ...row, instructions: [row.ask, plan.user_message].filter(Boolean).join('\n\n') }))
      : plan.template.name === 'morning_brief'
        ? (plan.inputs?.roles || template.agents || []).map((row) => ({ ...row, instructions: [row.ask || row.instructions, plan.user_message].filter(Boolean).join('\n\n') }))
      : plan.template.name === 'develop_new_project'
        ? (plan.inputs?.features || []).map((row) => ({ ...(typeof row === 'string' ? { name: row } : row), instructions: plan.user_message }))
        : (template.agents || []);
  // THE TEMPLATE IS THE TEMPLATE. Each row is one of the stored template's agents — its
  // instructions, mandate, lead mark and Routine switches — and goes through the same
  // loader the New Team form uses. The preset only says which rows, what they are called,
  // and the owner's starting message; nothing about provider or model rides on a row.
  const stored = Array.isArray(template.agents) ? template.agents : [];
  // A session's name is the name in its row, nothing appended.
  const picks = configured.map((row, index) => {
    const chosen = { ...(row.provider ? { provider: row.provider } : {}), ...(row.model ? { model: row.model } : {}) };
    const base = stored.find((agent) => slug(agent.name) === slug(row.name)) || stored[index] || stored.at(-1) || {};
    return {
      name: slug(row.name || base.name) || 'agent',
      instructions: [row.instructions ?? base.instructions ?? '', plan.user_message].filter(Boolean).filter((line, at, all) => all.indexOf(line) === at).join('\n\n'),
      mandate: row.mandate || base.mandate,
      team_lead: row.team_lead === true || (row.team_lead === undefined && base.team_lead === true),
      routines_on: [...(base.routines_on || [])],
      routines_off: [...(base.routines_off || [])],
      ...chosen,
    };
  });
  const outcomes = await launchTeamAgents(ask, team, picks);
  const settled = teamOutcome(outcomes, { team });
  if (!settled.ok) return settled;
  const { sessions, receipts, refused } = settled.data;
  let schedule = null;
  if (plan.template?.name === 'morning_brief') {
    const scheduled = await ask('/api/setup/morning-brief/schedules', { method: 'POST', json: {
      team,
      request: 'Run the configured Morning Brief team and publish today\'s briefing.',
      when: plan.inputs?.schedule || 'daily 08:00',
    } });
    if (!scheduled.ok) return scheduled;
    schedule = scheduled.data?.schedule || null;
  }
  return { ok: true, data: { team, sessions, receipts, refused, schedule, document: plan.inputs?.document || '', urlView: 'team' } };
}

export function presetWorkspaceState(plan) {
  if (!plan || !Array.isArray(plan.seats)) return null;
  const seats = Object.fromEntries(plan.seats.flatMap(({ workspace, type, key, root, path, tab, doc }) => {
    if (!workspace || !key) return [];
    if (type === 'session') return [[workspace, key]];
    return [[workspace, { type, key, ...(root ? { root } : {}), ...(path ? { path } : {}), ...(tab ? { tab } : {}), ...(doc ? { doc } : {}) }]];
  }));
  return Object.keys(seats).length ? { count: plan.count, seats, ...(plan.arrangement ? { arrangement: plan.arrangement } : {}) } : null;
}

export function presetLaunchUrl(data = {}, plan = null, tab = null) {
  const url = new URL(location.href);
  const team = data.urlView === 'team' && data.team;
  const view = team ? 'team' : 'cowork';
  const workspaceState = presetWorkspaceState(plan);
  if (workspaceState) seedReservedWorkspaceTab(tab, view, workspaceState);
  url.hash = team ? `#/team/${encodeURIComponent(data.team)}` : '#/cowork';
  return url.href;
}
