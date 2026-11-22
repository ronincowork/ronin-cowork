/**
 * THE FACTS (owner, 2026-11-22; KAN-768; samurai_lab/wip/FACTS.md): one common suite of docs on the
 * office, the same for every Agent, Irasshai, a gecko and the daimyo. An Agent learns the office by
 * reading, never by running a tool.
 *
 * One builder per fact, reading its sources of truth; nothing else summarises that layer. Each
 * fact is a file, `~/ronin/library/facts/<fact>.md`, rewritten when one of its source stores is
 * written (one store watcher per store, KAN-641 style; a burst of writes is one rebuild a second
 * later, and only of the facts that read that store), so reading the file is reading the office
 * now. GitHub's sign-in is gh's own, not a store: every read through Ronin asks it first (checkGithub). Its first line after the title is its seed line, the brief's `{office.<fact>.line}`; the rest
 * is its text. The brief takes each from the catalog's facts (ronin_catalogs/facts/<fact>.md): seed
 * is the line and the path, full is the text at birth. Nothing is pushed to live Agents.
 *
 * `office read` and MACHINE_STATUS.md are the suite in one: the facts, concatenated (suiteText).
 * `you`, the Agent's own configuration, is the brief's own lines from its work record, not a file.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { storeDir } from './resources.js';
import { watchStore } from './ws/events.js';
import { initialCampaignId } from './campaign-scope.js';
import { readCampaign } from './campaigns.js';
import { machineFacts, tailnetIp } from './machine-settings.js';
import { readAgentsSection, readMachineSection } from './machine-state.js';
import { passwordAuthEnabled } from './auth.js';
import { registrationAnswer } from './activation/registration.js';
import { readOfficeRecord } from './office-record.js';
import { roninIdentity } from './routes/version.js';
import { installedAnswer } from './routes/installed-api.js';
import { loadMembers, officePeople, type Person } from './office-people.js';
import { readUserIntro } from './user-intro.js';
import { listWorkspaces } from './workspaces.js';
import { readWorkspaceSummary } from './workspace-doc.js';
import { listPlans } from './plans.js';
import { listCanvases } from './canvases.js';
import { AGENTS } from './agents.js';
import { readProviderSummary } from './provider-summary.js';
import { partProviderRows } from './provider-parts.js';
import { githubSetupAnswer } from './setup-runtime.js';
import { integrationsState } from './integrations.js';
import { discoverParts } from './parts.js';
import { listServices } from './sockets.js';
import { accountsAnswer } from './accounts.js';
import { DONE, listItems, type WorkItem } from './work-items.js';
import { listLetterHolds } from './tegami.js';
import { listTeamRosters } from './team-rosters.js';
import { listSessions } from './tmux.js';
import { listArchives } from './session-archive.js';
import { listSeats } from './seats.js';

/** What a builder answers: the seed line and the text under it. null: the fact does not hold here (no file). */
export interface Built { line: string; lines: string[] }
export interface Fact {
  name: string;
  title: string;
  /** The stores it reads; a write in one rebuilds it. `match` narrows to the files that matter. */
  stores: Array<{ store: string; match?: RegExp }>;
  build(): Promise<Built | null>;
}

export const factsDir = (): string => path.join(storeDir('library'), 'facts');
export const factFile = (name: string): string => path.join(factsDir(), `${name}.md`);
/** The suite in one file, for anyone to grep (KAN-759). */
export const machineStatusFile = (): string => path.join(storeDir('library'), 'MACHINE_STATUS.md');
/** The person's notes, any Agent's to read and add to (KAN-678). */
export const aboutUserFile = (): string => path.join(storeDir('library'), 'ABOUT_USER.md');

const stamp = (iso: string): string => iso.slice(0, 16).replace('T', ' ');
const bullets = (items: string[]): string[] => (items.length ? items.map((one) => `- ${one}`) : ['- none yet']);

// ---- about_user: hosted, the people from members.json (the Lounge's About you, office-people.ts);
// self-hosted, the owner's user-intro; and either way their notes, library/ABOUT_USER.md.
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

async function aboutUser(): Promise<Built> {
  const [hosting, notes, intro] = await Promise.all([readOfficeRecord().catch(() => null), fs.readFile(aboutUserFile(), 'utf8').catch(() => ''), readUserIntro()]);
  const hosted = hosting?.hosting === 'office_unit';
  if (hosted) await loadMembers(); // members.json's watcher and this one both fire: read it here, not after
  const people = officePeople();
  const who = hosted
    ? (people.length ? people.map(personLine) : [`The owner: ${NOT_FILLED}`])
    : [intro.intro ? `The owner, in their words: ${intro.intro.replace(/\s*\n\s*/g, ' ')}` : 'The owner: no introduction written yet (Setup → About you)'];
  const line = hosted
    ? (people.length ? people.map((p) => `${p.nickname || p.first_name || p.name || p.email}${p.role ? ` (${p.role})` : ''}`).join(', ') : `the owner, ${NOT_FILLED}`)
    : intro.intro ? 'the owner, with their introduction' : 'the owner, no introduction yet';
  return { line, lines: ['People:', ...bullets(who), '', `Notes on them (${aboutUserFile()}):`, notes.trim() || '- none yet'] };
}

// ---- THE OFFICE'S STATES that a fact prints and Setup ticks from (src/setup-progress.ts): one meaning each.
/** The providers Activated: each CLI the provider summary has operational, and each house row that is. */
export const providersOn = (summary: Awaited<ReturnType<typeof readProviderSummary>>, rows: Awaited<ReturnType<typeof partProviderRows>>): string[] =>
  [...AGENTS.filter((a) => summary?.operational.includes(a.id) && !summary.off.includes(a.id)).map((a) => a.label), ...rows.filter((row) => row.operational).map((row) => row.label)];
export async function activatedProviders(): Promise<string[]> {
  return providersOn(await readProviderSummary().catch(() => null), await partProviderRows().catch(() => []));
}
/** Anything installed: a Services part on this machine, or an installation switched on. */
export const anythingInstalled = (installed: Awaited<ReturnType<typeof installedAnswer>> | null): boolean =>
  !!installed && (installed.services.installed || installed.installations.some((one) => one.on));
/** How the browser reaches Ronin: a password set, or the owner's "Tailscale only, no password"
 * setting (machine settings' machine.no_password); and the tailnet address, '' off Tailscale. */
export async function browserAccess(): Promise<{ password: boolean; no_password: boolean; tailscale: string }> {
  const ip = tailnetIp();
  return { password: passwordAuthEnabled(), no_password: (await readMachineSection().catch(() => ({} as Record<string, unknown>))).no_password === true, tailscale: ip === '127.0.0.1' ? '' : ip };
}
/** Registered with Ronin: registered, anonymously, or not ('optional'). */
export const registrationStatus = async (): Promise<string> => (await registrationAnswer().catch(() => null))?.status ?? 'optional';

// ---- machine: hosting (the office record), Ronin's version, the box, disk, the Services parts,
// browser access, registration.
async function machine(): Promise<Built> {
  const [hosting, named, box, disk, installed, access, registered] = await Promise.all([
    readOfficeRecord().catch((e: Error) => ({ hosting: 'unreadable' as const, error: e.message })),
    readMachineSection().catch(() => ({} as Record<string, unknown>)), machineFacts().catch(() => ({} as Record<string, unknown>)),
    fs.statfs(os.homedir()).catch(() => null), installedAnswer().catch(() => null), browserAccess(), registrationStatus(),
  ]);
  const host = [named.name, named.where && `in ${String(named.where)}`].filter(Boolean).join(' ') || os.hostname();
  const boxLine = `${host}: ${box.kind ?? 'machine'}${box.hypervisor ? ` (${box.hypervisor})` : ''}, ${box.cores ?? '?'} cores, ${box.ram_gb ?? '?'} GB RAM, ${box.arch ?? os.arch()}`;
  const ronin = roninIdentity();
  const gb = (blocks: number) => (disk ? Math.round(blocks * disk.bsize / 1e9) : 0);
  const where = hosting.hosting === 'office_unit'
    ? `A hosted office: ${hosting.record.office_id} on ${hosting.record.office_park}${hosting.record.tier ? `, ${hosting.record.tier} tier` : ''}. It has no screen or browser of its own: sign-ins use a device code or a link opened on the person's own computer`
    : hosting.hosting === 'self_hosted' ? 'Self-hosted (not an office on an office_park)' : `Office record unreadable: ${hosting.error}`;
  const services = installed?.services;
  const parts = !services?.loaded.length ? ['Ronin Services: not running'] : [
    `Ronin Services running: ${services.loaded.join(', ')}`,
    ...services.parked.map((one) => `Parked: ${one.name}${'reason' in one && one.reason ? ` (${one.reason})` : ''}`),
    ...(services.restart_needed ? ['A restart is needed for the parts switched on or off to take effect'] : []),
  ];
  const on = installed?.installations.filter((one) => one.on).map((one) => one.label) ?? [];
  const browser = access.password ? 'a password is set'
    : access.no_password ? `no password: the owner chose ${access.tailscale ? 'Tailscale only' : 'no password'}` : 'no password set, and none chosen';
  const line = `${host}, ${hosting.hosting === 'office_unit' ? 'hosted' : 'self-hosted'}, Ronin ${ronin.release ?? 'checkout'}${disk ? `, ${gb(disk.bavail)} GB free` : ''}${services?.loaded.length ? ', Ronin Services running' : ''}`;
  return { line, lines: bullets([
    boxLine, where,
    `Ronin ${ronin.release ?? 'checkout'} (${ronin.commit}), running since ${stamp(ronin.startedAt)} UTC`,
    ...(disk ? [`Disk: ${gb(disk.bavail)} GB free of ${gb(disk.blocks)} GB`] : []),
    ...parts,
    `Installations switched on: ${on.join(', ') || 'none'}`,
    `Browser access: ${browser}`,
    `Tailscale: ${access.tailscale ? `on, ${access.tailscale}` : 'not on this machine'}`,
    `Registered with Ronin: ${registered === 'registered' ? 'yes' : registered === 'anonymous' ? 'yes, anonymously' : 'no'}`,
  ]) };
}

// ---- workspaces: each Workspace, its folders, repositories, objective, Summary, plans and canvases.
async function workspaces(): Promise<Built> {
  const campaign = await initialCampaignId();
  const all = (await listWorkspaces(campaign).catch(() => [])).filter((w) => !w.archived);
  const shown = await Promise.all(all.map(async (w) => {
    const [sum, plans, canvases] = await Promise.all([readWorkspaceSummary(w.name).catch(() => ''), listPlans(w).catch(() => []), listCanvases(w).catch(() => [])]);
    const facts = (i: Record<string, unknown>) => Object.entries(i).filter(([key]) => key !== 'provider').map(([key, value]) => `${key} ${String(value)}`).join(', ');
    return [`### ${w.title || w.name} (${w.name})`, w.objective || '', sum ? `Summary: ${sum}` : 'Summary: none yet',
      `Repos: ${w.repos.map((r) => `${r.name} ${r.dir} (${r.mode}${r.desks === 'managed' ? ', desks' : ''})`).join('; ') || 'none'}`,
      `Folders: ${w.folders.map((f) => `${f.name} ${f.dir}`).join('; ') || 'none'}`,
      `Integrations: ${w.integrations.map((i) => [i.provider, facts(i)].filter(Boolean).join(' ')).join('; ') || 'none'}`,
      `Plans: ${plans.map((p) => `${p.name} (${p.status})`).join(', ') || 'none'}`,
      `Canvases: ${canvases.map((c) => c.name).join(', ') || 'none'}`, ''].filter((one, i) => one || i).join('\n');
  }));
  return { line: all.length ? `${all.length}: ${all.map((w) => w.name).join(', ')}` : 'none yet', lines: shown.length ? shown : ['- none yet'] };
}

// ---- integrations_authentications: model providers, GitHub, integrations (MCP servers and web APIs included), Hermes accounts.
async function integrationsAuthentications(): Promise<Built> {
  const campaign = await initialCampaignId();
  const parts = { onDisk: discoverParts().map((part) => part.name), loaded: listServices() };
  const [summary, rows, github, services, accounts] = await Promise.all([
    readProviderSummary().catch(() => null), partProviderRows().catch(() => []), githubSetupAnswer().catch(() => null),
    integrationsState(campaign, parts).catch(() => []), accountsAnswer().catch(() => null),
  ]);
  githubBuilt = githubKey(github);
  // THE ONE WORDING of a provider's state (FACTS.md): not installed, installed not signed in, signed in not activated, Activated, turned off.
  const stateOf = (id: string): string => !summary?.installed.includes(id) ? 'not installed'
    : summary.off.includes(id) ? 'turned off (sign-in kept)' : summary.operational.includes(id) ? 'Activated'
    : summary.signed_in.includes(id) ? 'signed in, not activated' : 'installed, not signed in';
  const providers = [
    ...AGENTS.map((a) => `${a.label}${summary?.versions[a.id] ? ` ${summary.versions[a.id]}` : ''}: ${stateOf(a.id)}`),
    ...rows.map((row) => `${row.label}: ${row.operational ? 'Activated' : 'not available'} (Ronin's house models)`),
    summary ? `Last measured ${stamp(summary.measured_at)} UTC` : 'Not measured yet: Setup → Model providers measures them',
  ];
  const gh = !github ? 'GitHub CLI: unreadable' : !github.installed ? 'GitHub CLI: not installed (needed to clone a GitHub repository)'
    : github.authenticated ? `GitHub CLI: signed in as ${github.account}` : 'GitHub CLI: installed, not signed in (needed to clone a private repository)';
  const connected = (one: (typeof services)[number]) => !!(one.secrets.length || one.mcp?.saved);
  const integrations = services.map((one) => `${one.label}: ${connected(one) ? 'connected' : one.available ? 'available, not connected' : 'not available for this Desk'}${one.workspaces.length ? ` in ${one.workspaces.join(', ')}` : ''}`);
  const hermes = (accounts?.accounts ?? []).map((a) => `${a.name} (${a.kind}): ${a.configured ? 'set up' : 'not set up'}${a.models.length ? `, ${a.models.length} models` : ''}`);
  const on = providersOn(summary, rows);
  const line = `Activated: ${on.join(', ') || 'none'}; connected: ${services.filter(connected).map((one) => one.label).join(', ') || 'none'}${github?.authenticated ? '; GitHub signed in' : ''}`;
  return { line, lines: [
    'Model providers:', ...bullets(providers), '',
    'Developer tools:', ...bullets([gh]), '',
    'Integrations:', ...bullets(integrations), '',
    'Hermes accounts:', ...bullets(hermes),
  ] };
}

// ---- who holds what: each live Agent's items from its record, each Team's from its roster.
async function holders(open: Map<string, WorkItem>): Promise<Map<string, string>> {
  const [letters, rosters, sessions] = await Promise.all([listLetterHolds().catch(() => []), listTeamRosters().catch(() => []), listSessions().catch(() => [])]);
  const holder = new Map<string, string>();
  for (const letter of letters) if (sessions.some((one) => one.name === letter.name)) for (const id of letter.holds) if (open.has(id)) holder.set(id, letter.name);
  for (const team of rosters) for (const id of team.holds) if (open.has(id) && !holder.has(id)) holder.set(id, `team:${team.name}`);
  return holder;
}

// ---- epics: open epics, their tasks and who holds what. Onboarding's progress is its epic, nowhere else.
async function epics(): Promise<Built> {
  const campaign = await initialCampaignId();
  const items = (await listItems().catch(() => [])).filter((item) => !item.archived && (!campaign || !item.campaign_id || item.campaign_id === campaign));
  const open = new Map(items.filter((item) => item.status !== DONE).map((item) => [item.id, item]));
  const holder = await holders(open);
  const say = (item: WorkItem): string => `${item.id} ${item.title}: ${item.status}${item.flagged ? ', flagged' : ''}${holder.get(item.id) ? ` — ${holder.get(item.id)}` : ''}`;
  const open_epics = [...open.values()].filter((item) => item.kind === 'Epic');
  const under = (id: string): WorkItem[] => items.filter((item) => item.parent === id);
  const sections = open_epics.flatMap((epic) => [`### ${say(epic)}`, ...bullets(under(epic.id).map(say)), '']);
  const loose = [...open.values()].filter((item) => item.level === 0 && !open_epics.some((epic) => epic.id === item.parent));
  const flagged = [...open.values()].filter((item) => item.flagged).map(say);
  const review = [...open.values()].filter((item) => item.status === 'In Review').map(say);
  return {
    line: `${open_epics.length} open epics, ${flagged.length} flagged, ${review.length} In Review`,
    lines: [...sections, '### Open items outside an open epic', ...bullets(loose.map(say)), '',
      '### Flagged: waiting on someone', ...bullets(flagged), '', '### In Review: handed in', ...bullets(review)],
  };
}

// ---- teams_agents: Teams, leads, members; Agents live and archived; a gecko's seat.
async function teamsAgents(): Promise<Built> {
  const campaign = await initialCampaignId();
  const [rosters, sessions, archives, seats] = await Promise.all([listTeamRosters().catch(() => []), listSessions().catch(() => []), listArchives().catch(() => []), listSeats().catch(() => [])]);
  const running = sessions.filter((one) => one.agent);
  const teams = rosters.filter((team) => team.state !== 'archived' && (!campaign || team.campaign_id === campaign));
  const inTeams = new Set(teams.map((team) => team.name));
  const teamLines = teams.map((team) => {
    const live = running.filter((one) => one.tags.includes(team.name));
    const leads = live.filter((one) => one.leads.includes(team.name)).map((one) => one.name);
    return `${team.title || team.name} (${team.name}${team.workspace ? `, Workspace ${team.workspace}` : ''}): lead ${leads.join(', ') || 'none'}; ${live.length ? live.map((one) => `${one.title || one.name} (${one.agent})`).join(', ') : 'no Agents running'}`;
  });
  const alone = running.filter((one) => !one.tags.some((tag) => inTeams.has(tag))).map((one) => `${one.title || one.name} (${one.agent})`);
  const archived = archives.map((one) => `${one.name}, archived ${stamp(one.archived_at)} UTC${one.tags.length ? ` (${one.tags.join(', ')})` : ''}`);
  return {
    line: `${teams.length} Teams, ${running.length} Agents running, ${archives.length} archived${seats.length ? `, ${seats.length} gecko` : ''}`,
    lines: ['Teams:', ...bullets(teamLines), '', 'Agents running outside a Team:', ...bullets(alone), '',
      'Archived Agents (restorable within 7 days):', ...bullets(archived),
      ...(seats.length ? ['', 'Gecko:', ...bullets(seats.map((seat) => `${seat.name}: ${seat.status || 'no status line'}`))] : [])],
  };
}

// ---- defaults: the default model, the Campaign's mandate and Mode for new Agents.
async function defaults(): Promise<Built> {
  const campaign = await initialCampaignId();
  const [office, agents] = await Promise.all([readCampaign(campaign).catch(() => null), readAgentsSection().catch(() => ({} as Record<string, unknown>))]);
  const model = ((agents.sessions as Record<string, unknown> | undefined)?.default ?? {}) as { provider?: string; model?: string };
  const mine = office?.config.defaults;
  const named = [model.provider, model.model].filter(Boolean).join(' ') || 'none set';
  const mode = mine ? (mine.launch_mode === 'configured' ? 'Native' : 'Dangerously') : '';
  return {
    line: `default model ${named}${mode ? `, Mode ${mode}` : ''}`,
    lines: bullets([
      `Campaign: ${office?.title || campaign || 'none'}`, `Default model: ${named}`,
      ...(mine ? [`New Agents: reach ${mine.reach}, recruit ${mine.recruit}, output ${mine.output.join(', ')}; Mode ${mode}`] : []),
    ]),
  };
}

const NOT_OURS = /^(facts\/|MACHINE_STATUS\.md)/;
/** THE SUITE, in its order. A part adds its own (Services' account) with addFact. */
const FACTS: Fact[] = [
  { name: 'about_user', title: 'About the user', build: aboutUser,
    stores: [{ store: 'office_unit', match: /members\.json$/ }, { store: 'facts', match: /^user-intro\.md$/ }, { store: 'library', match: /^ABOUT_USER\.md$/ }] },
  { name: 'machine', title: 'The machine', build: machine,
    stores: [{ store: 'office_unit', match: /office_record\.json$/ }, { store: 'config' }, { store: 'campaigns' }, { store: 'services_secrets' }] },
  { name: 'workspaces', title: 'Workspaces', build: workspaces, stores: [{ store: 'workspaces' }, { store: 'library', match: /^workspaces\// }] },
  { name: 'integrations_authentications', title: 'Integrations and authentications', build: integrationsAuthentications,
    stores: [{ store: 'campaigns' }, { store: 'catalogs' }, { store: 'services_secrets' }, { store: 'config' }, { store: 'workspaces' }] },
  { name: 'epics', title: 'Epics', build: epics, stores: [{ store: 'work_items' }, { store: 'session', match: /tegami\.md$/ }, { store: 'team_rosters' }] },
  { name: 'teams_agents', title: 'Teams and Agents', build: teamsAgents,
    stores: [{ store: 'team_rosters' }, { store: 'session', match: /tegami\.md$/ }, { store: 'archived_sessions' }, { store: 'seats', match: /\.json$/ }] },
  { name: 'defaults', title: 'Defaults', build: defaults, stores: [{ store: 'campaigns' }, { store: 'config' }] },
];
/** A part's own fact (Services' account), placed after the machine. Added before startFacts. */
export function addFact(fact: Fact): void { FACTS.splice(FACTS.findIndex((one) => one.name === 'machine') + 1, 0, fact); }
export const factNames = (): string[] => FACTS.map((fact) => fact.name);

/** A fact's file as it reads: its title, its seed line, its text. */
const render = (fact: Fact, built: Built): string => [`# ${fact.title}`, '', built.line, '', ...built.lines].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';

async function writeFile(file: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, text);
  await fs.rename(tmp, file);
}

/** One fact built now and written; the machine status follows. Answers its text, '' when it does not hold here. */
export async function writeFact(name: string): Promise<string> {
  const fact = FACTS.find((one) => one.name === name);
  if (!fact) throw new Error(`No fact "${name}". The facts: ${factNames().join(', ')}.`);
  const built = await fact.build();
  if (built) await writeFile(factFile(name), render(fact, built));
  else await fs.rm(factFile(name), { force: true });
  await writeFile(machineStatusFile(), await suiteText());
  for (const listener of written) listener(name);
  return built ? render(fact, built) : '';
}

/** Told each time a fact is written: Setup's ticks are pushed again from it (setup-progress.ts). */
const written = new Set<(name: string) => void>();
export const onFactWritten = (listener: (name: string) => void): void => { written.add(listener); };

/** A fact's file as it is; '' when it does not hold here. */
export const readFact = (name: string): Promise<string> => fs.readFile(factFile(name), 'utf8').catch(() => '');

/** THE SUITE IN ONE (office read, MACHINE_STATUS.md): the facts' files, concatenated, each a section. */
export async function suiteText(): Promise<string> {
  const texts = await Promise.all(FACTS.map((fact) => readFact(fact.name)));
  const nested = texts.filter(Boolean).map((text) => text.replace(/^(#{1,5})(?=\s)/gm, '#$1').trim());
  return ['# This office', '', `As of ${stamp(new Date().toISOString())} UTC. Each section is a fact: ${factsDir()}/<fact>.md.`, '', ...nested.flatMap((one) => [one, ''])].join('\n').trimEnd() + '\n';
}

/** Every fact built now, then the suite in one: at start only. */
export async function writeFacts(): Promise<string> {
  for (const fact of FACTS) await writeFact(fact.name).catch((e: Error) => console.warn(`[facts] ${fact.name}: ${e.message}`));
  return suiteText();
}

/** The brief's facts at birth: each fact's seed line, path and text (no title). */
export async function briefFacts(): Promise<Record<string, { line: string; path: string; text: string }>> {
  await checkGithub();
  const out: Record<string, { line: string; path: string; text: string }> = {};
  for (const fact of FACTS) {
    const raw = await readFact(fact.name);
    if (!raw) continue;
    const [line = '', ...rest] = raw.replace(/^# .*\n+/, '').split(/\n\n/);
    out[fact.name] = { line: line.trim(), path: factFile(fact.name), text: rest.join('\n\n').trim() };
  }
  return out;
}

// A burst of writes is one rebuild of each fact that reads them, a second after the first; one
// rebuild of a fact at a time, the next waiting for it.
const BURST_MS = 1000;
const due = new Set<string>();
const running = new Map<string, Promise<void>>();
function rebuild(name: string): void {
  if (due.has(name)) return;
  due.add(name);
  setTimeout(() => {
    due.delete(name);
    const next = (running.get(name) ?? Promise.resolve()).then(() => writeFact(name)).then(() => {}, (e: Error) => console.warn(`[facts] ${name}: ${e.message}`));
    running.set(name, next);
    void next.finally(() => { if (running.get(name) === next) running.delete(name); });
  }, BURST_MS);
}

/** GitHub's sign-in lives in gh's own files, which Ronin does not watch: every read through Ronin
 * (office read, GET /api/facts, Settings, a brief at birth) asks gh first and rebuilds
 * integrations_authentications now when its answer is not the one the fact was built on. */
let githubBuilt = '';
const githubKey = (one: Awaited<ReturnType<typeof githubSetupAnswer>> | null): string => (one ? `${one.installed}:${one.authenticated}:${one.account ?? ''}` : '');
export async function checkGithub(): Promise<void> {
  if (githubKey(await githubSetupAnswer().catch(() => null)) !== githubBuilt) await writeFact('integrations_authentications');
}

/** The suite as it reads now: GitHub asked first. office read and Settings' Machine status. */
export async function readSuite(): Promise<string> {
  await checkGithub();
  return suiteText();
}

/** One fact as it reads now: GitHub asked first. GET /api/facts/<fact>. */
export async function readFactNow(name: string): Promise<string> {
  if (!FACTS.some((one) => one.name === name)) throw new Error(`No fact "${name}". The facts: ${factNames().join(', ')}.`);
  await checkGithub();
  return readFact(name);
}

/** At start, after the parts load: every fact written, then one watcher per store rebuilds the facts that read it. */
export async function startFacts(): Promise<() => void> {
  await writeFacts();
  const byStore = new Map<string, Array<{ fact: string; match?: RegExp }>>();
  for (const fact of FACTS) for (const { store, match } of fact.stores) byStore.set(store, [...(byStore.get(store) ?? []), { fact: fact.name, match }]);
  const stops = [...byStore].map(([store, readers]) => watchStore(storeDir(store), (file) => {
    if (store === 'library' && NOT_OURS.test(file)) return;
    for (const one of readers) if (!one.match || one.match.test(file)) rebuild(one.fact);
  }));
  return () => { for (const stop of stops) stop(); };
}

/** Live Agents come and go in tmux, not a store: the session feed calls this on each change. */
export const sessionsMoved = (): void => { rebuild('teams_agents'); rebuild('epics'); };
