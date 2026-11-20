/**
 * OFFICE READ (owner, 2026-11-19; KAN-712): the rig an Agent is sitting on, as one text any
 * Agent reads with `office read` (GET /api/office/read). Not the office record (office-record.ts),
 * which is the park's record of an office_unit. Assembled live, each time it is asked, from
 * the readers that already exist; nothing is stored. Built for Ronin Hosted, where the people come
 * from the Business Lounge's About You; an empty About You says it has not been filled in yet.
 *
 * Sections: the people and the notes on them (library/ABOUT_USER.md); the model providers signed
 * in; each Workspace with its Summary (library/workspaces/<handle>.md, KAN-713) and the Teams and
 * Agents running in it; Agents running on their own; services connected; the defaults new Agents
 * get. The lounge account is Ronin Services' (`office read` adds it when that part answers).
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { machineFacts } from './machine-settings.js';
import { readMachineSection } from './machine-state.js';
import { listPlans } from './plans.js';
import { listCanvases } from './canvases.js';
import { DONE, listItems } from './work-items.js';
import { listLetterHolds } from './tegami.js';
import { listSeats } from './seats.js';
import { storeDir } from './resources.js';
import { initialCampaignId } from './campaign-scope.js';
import { readCampaign } from './campaigns.js';
import { readAgentsSection } from './machine-state.js';
import { listWorkspaces } from './workspaces.js';
import { listTeamRosters } from './team-rosters.js';
import { listSessions } from './tmux.js';
import { readProviderSummary } from './provider-summary.js';
import { partProviderRows } from './provider-parts.js';
import { integrationsState } from './integrations.js';
import { discoverParts } from './parts.js';
import { listServices } from './sockets.js';
import { officePeople, type Person } from './office-people.js';
import { readWorkspaceSummary } from './workspace-doc.js';

/** The person's notes, any Agent's to read and add to (KAN-678). */
export const aboutUserFile = (): string => path.join(storeDir('library'), 'ABOUT_USER.md');
const NOT_FILLED = 'About You not filled in yet in the Business Lounge';
/** One person as the Lounge's About You has them; nothing there says so. */
export function personLine(p: Pick<Person, 'email' | 'role'> & Partial<Person>): string {
  const who = [p.name || [p.first_name, p.last_name].filter(Boolean).join(' '), p.nickname && `call them ${p.nickname}`].filter(Boolean).join(', ');
  const facts = [p.job_title, p.organization, p.technical_level, p.ai_experience && `AI: ${p.ai_experience}`,
    p.planned_use?.length && `plans ${[...p.planned_use, p.planned_use_other].filter(Boolean).join(', ')}`, p.time_zone, p.language].filter(Boolean);
  const head = `${who || p.email}${p.role ? ` (${p.role})` : ''}`;
  if (!who && !facts.length && !p.about) return `${head}: ${NOT_FILLED}`;
  return [head, ...facts].join(', ') + (p.about ? `. In their words: ${p.about}` : '');
}

const list = (items: string[]): string[] => (items.length ? items.map((one) => `- ${one}`) : ['- none yet']);

/** The office as it is now, as Markdown. With `only`, one Workspace and what is in it: a lead's
 * bearings (KAN-736). Every lead reads it, inside the office or out; a daimyo's overview is this. */
export async function officeRead(only = ''): Promise<string> {
  const campaign = await initialCampaignId();
  const parts = { onDisk: discoverParts().map((part) => part.name), loaded: listServices() };
  const [notes, allWorkspaces, rosters, sessions, summary, rows, services, office, agents, machine, facts, items, letters] = await Promise.all([
    fs.readFile(aboutUserFile(), 'utf8').catch(() => ''), listWorkspaces(campaign).catch(() => []), listTeamRosters().catch(() => []),
    listSessions().catch(() => []), readProviderSummary().catch(() => null), partProviderRows().catch(() => []),
    integrationsState(campaign, parts).catch(() => []), readCampaign(campaign).catch(() => null),
    readAgentsSection().catch(() => ({} as Record<string, unknown>)), readMachineSection().catch(() => ({} as Record<string, unknown>)),
    machineFacts().catch(() => ({} as Record<string, unknown>)), listItems().catch(() => []), listLetterHolds().catch(() => []),
  ]);
  const workspaces = allWorkspaces.filter((w) => !w.archived && (!only || w.name === only));
  if (only && !workspaces.length) throw new Error(`No Workspace "${only}". office read names them.`);
  const people = officePeople();
  const running = sessions.filter((one) => one.agent);
  const teams = rosters.filter((team) => team.state !== 'archived' && (!campaign || team.campaign_id === campaign));
  // WHO WORKS ON WHAT: each live Agent's items from its record, each Team's from its roster; open ones only.
  const byId = new Map(items.filter((item) => item.status !== DONE && (!campaign || !item.campaign_id || item.campaign_id === campaign)).map((item) => [item.id, item]));
  const heldBy = new Map<string, string[]>();
  for (const letter of letters) if (running.some((one) => one.name === letter.name)) heldBy.set(letter.name, letter.holds.filter((id) => byId.has(id)));
  const itemsOf = (name: string): string => {
    const held = (heldBy.get(name) ?? []).map((id) => `${id} ${byId.get(id)!.status}${byId.get(id)!.flagged ? ', flagged' : ''}`);
    return held.length ? ` (${held.join('; ')})` : '';
  };
  const teamLine = (team: (typeof teams)[number]): string => {
    const live = running.filter((one) => one.tags.includes(team.name));
    const leads = live.filter((one) => one.leads.includes(team.name)).map((one) => one.name);
    const who = live.map((one) => `${one.title || one.name}${itemsOf(one.name)}`);
    return `- ${team.title || team.name} (${team.name}): lead ${leads.join(', ') || 'none'}; ${who.length ? who.join(', ') : 'no Agents running'}`;
  };
  const shown = await Promise.all(workspaces.map(async (w) => {
    const sum = await readWorkspaceSummary(w.name).catch(() => '');
    const inIt = teams.filter((team) => team.workspace === w.name).map(teamLine);
    const [plans, canvases] = await Promise.all([listPlans(w).catch(() => []), listCanvases(w).catch(() => [])]);
    const facts = (i: Record<string, unknown>) => Object.entries(i).filter(([key]) => key !== 'provider').map(([key, value]) => `${key} ${String(value)}`).join(', ');
    return [`### ${w.title || w.name} (${w.name})`, w.objective || '', sum ? `Summary: ${sum}` : 'Summary: none yet',
      `Repos: ${w.repos.map((r) => `${r.name} ${r.dir} (${r.mode}${r.desks === 'managed' ? ', desks' : ''})`).join('; ') || 'none'}`,
      `Folders: ${w.folders.map((f) => `${f.name} ${f.dir}`).join('; ') || 'none'}`,
      `Integrations: ${w.integrations.map((i) => [i.provider, facts(i)].filter(Boolean).join(' ')).join('; ') || 'none'}`,
      `Plans: ${plans.map((p) => `${p.name} (${p.status})`).join(', ') || 'none'}`,
      `Canvases: ${canvases.map((c) => c.name).join(', ') || 'none'}`,
      inIt.length ? ['Teams:', ...inIt].join('\n') : 'Teams: none'].filter(Boolean).join('\n');
  }));
  // WAITING AND HANDED IN: what needs someone, with who holds it, in the Workspaces shown.
  const holderOf = new Map<string, string>();
  for (const [name, ids] of heldBy) for (const id of ids) holderOf.set(id, name);
  for (const team of teams) for (const id of team.holds) if (byId.has(id) && !holderOf.has(id)) holderOf.set(id, `team:${team.name}`);
  const shownTeams = new Set(teams.filter((team) => workspaces.some((w) => w.name === team.workspace)).map((team) => team.name));
  const inShown = (holder: string): boolean => !only || (holder.startsWith('team:')
    ? shownTeams.has(holder.slice(5)) : running.some((one) => one.name === holder && one.tags.some((tag) => shownTeams.has(tag))));
  const itemLine = (id: string): string => `${id} '${byId.get(id)!.title}' — ${holderOf.get(id)}`;
  const open = [...holderOf.keys()].filter((id) => inShown(holderOf.get(id)!));
  const flagged = open.filter((id) => byId.get(id)!.flagged).map(itemLine);
  const review = open.filter((id) => byId.get(id)!.status === 'In Review').map(itemLine);
  const seats = await listSeats().catch(() => []);
  const host = [machine.name, machine.where && `in ${machine.where}`].filter(Boolean).join(' ') || os.hostname();
  const machineLine = `${host}: ${facts.kind ?? 'machine'}${facts.hypervisor ? ` (${facts.hypervisor})` : ''}, ${facts.cores ?? '?'} cores, ${facts.ram_gb ?? '?'} GB RAM, ${facts.arch ?? os.arch()}`;
  const inTeams = new Set(teams.map((team) => team.name));
  const alone = running.filter((one) => !one.tags.some((tag) => inTeams.has(tag))).map((one) => one.title || one.name);
  const signedIn = [...(summary?.signed_in ?? []), ...rows.filter((row) => row.operational).map((row) => row.label)];
  const connected = services.filter((one) => one.secrets.length || one.workspaces.length || one.mcp?.saved)
    .map((one) => `${one.label}${one.workspaces.length ? ` (in ${one.workspaces.join(', ')})` : ''}`);
  const model = ((agents.sessions as Record<string, unknown> | undefined)?.default ?? {}) as { provider?: string; model?: string };
  const mine = office?.config.defaults;
  const defaults = [
    `Campaign: ${office?.title || campaign || 'none'}`,
    `Default model: ${[model.provider, model.model].filter(Boolean).join(', ') || 'none set'}`,
    ...(mine ? [`New Agents: reach ${mine.reach}, recruit ${mine.recruit}, output ${mine.output.join(', ')}; Mode ${mine.launch_mode === 'configured' ? 'Native' : 'Dangerously'}`] : []),
  ];
  const work = [
    '## Workspaces', ...(shown.length ? shown.flatMap((one) => [one, '']) : ['- none yet', '']),
    '## Flagged: waiting on someone', ...list(flagged), '',
    '## In Review: handed in', ...list(review), '',
  ];
  const daimyo = seats.length ? ['## Daimyo', ...seats.map((seat) => `- ${seat.name}: ${seat.status || 'no status line'}`), ''] : [];
  return [
    only ? `# Workspace ${only}` : '# This office', '', `As of ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`, '',
    '## The machine', `- ${machineLine}`, '',
    ...(only ? [...work, ...daimyo] : [
      '## The people', ...list(people.length ? people.map(personLine) : [`The owner: ${NOT_FILLED}`]), '',
      '## Notes on them (library/ABOUT_USER.md)', notes.trim() || '- none yet', '',
      ...daimyo,
      '## Model providers signed in', ...list(signedIn), '',
      ...work,
      '## Agents running outside a Team', ...list(alone), '',
      '## Services connected', ...list(connected), '',
      '## Defaults', ...list(defaults), '',
    ]),
  ].join('\n');
}
