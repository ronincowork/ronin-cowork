/* Browser adapter from the Presets shell to Ronin's ordinary launch routes. */
import { request } from './request.js';

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
    provider: row.provider || '',
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
  const configured = plan.template.name === 'bare_metal'
    ? (plan.inputs?.sessions || [])
    : plan.template.name === 'health_and_fitness'
      ? (plan.inputs?.roles || []).map((row) => ({ ...row, instructions: [row.ask, plan.user_message].filter(Boolean).join('\n\n') }))
      : plan.template.name === 'morning_brief'
        ? (plan.inputs?.roles || template.agents || []).map((row) => ({ ...row, instructions: [row.ask || row.instructions, plan.user_message].filter(Boolean).join('\n\n') }))
      : plan.template.name === 'develop_new_project'
        ? (plan.inputs?.features || []).map((row) => ({ ...(typeof row === 'string' ? { name: row } : row), instructions: plan.user_message }))
        : (template.agents || []);
  const sessions = [], receipts = [];
  for (const row of configured) {
    const launched = await launchAgent(row, plan, team, send);
    if (!launched.ok) return launched;
    if (launched.data?.name) sessions.push({ name: launched.data.name });
    if (launched.data?.receipt) receipts.push(launched.data.receipt);
  }
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
  return { ok: true, data: { team, sessions, receipts, schedule, document: plan.inputs?.document || '', urlView: 'team' } };
}

export function presetLaunchUrl(data = {}) {
  const url = new URL(location.href);
  const view = data.urlView === 'team' && data.team ? `team/${encodeURIComponent(data.team)}` : 'cowork';
  url.hash = `#/${view}`;
  return url.href;
}
