/* Browser adapter from the Presets shell to Ronin's ordinary launch routes. */
import { request } from './request.js';

const slug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 34);
const unique = (base) => `${slug(base) || 'preset'}_${Date.now().toString(36)}`;

function launchAgent(row, plan, team = '') {
  return request('/api/launch', {
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
  });
}

export async function launchPresetPlan(plan = {}) {
  const shelf = plan.template?.shelf === 'teams' ? 'teams' : 'agents';
  const catalog = await request(`/api/templates/${shelf}`, { cache: 'no-store' });
  if (!catalog.ok) return catalog;
  const template = (Array.isArray(catalog.data) ? catalog.data : []).find((row) => row.name === plan.template?.name);
  if (!template) return { ok: false, message: `Template not found: ${plan.template?.name || '(blank)'}` };

  if (shelf === 'agents') {
    const launched = await launchAgent({ name: template.name }, plan);
    if (!launched.ok) return launched;
    const name = launched.data?.name;
    return { ok: true, data: { sessions: name ? [{ name }] : [], document: plan.inputs?.document || '', urlView: 'cowork' } };
  }

  const team = unique(template.name);
  const made = await request('/api/team-rosters', {
    method: 'POST',
    json: {
      name: team,
      title: template.label || template.name,
      objective: plan.user_message || template.objective || '',
      project_root: plan.inputs?.root || '',
      template: template.name,
    },
  });
  if (!made.ok) return made;
  const configured = plan.template.name === 'bare_metal'
    ? (plan.inputs?.sessions || [])
    : plan.template.name === 'health_and_fitness'
      ? (plan.inputs?.roles || []).map((row) => ({ ...row, instructions: plan.user_message }))
      : plan.template.name === 'develop_new_project'
        ? (plan.inputs?.features || []).map((row) => ({ ...(typeof row === 'string' ? { name: row } : row), instructions: plan.user_message }))
        : (template.agents || []);
  const sessions = [];
  for (const row of configured) {
    const launched = await launchAgent(row, plan, team);
    if (!launched.ok) return launched;
    if (launched.data?.name) sessions.push({ name: launched.data.name });
  }
  return { ok: true, data: { team, sessions, document: plan.inputs?.document || '', urlView: 'team' } };
}

export function presetLaunchUrl(data = {}) {
  const url = new URL(location.href);
  const view = data.urlView === 'team' && data.team ? `team/${encodeURIComponent(data.team)}` : 'cowork';
  url.hash = `#/${view}`;
  return url.href;
}
