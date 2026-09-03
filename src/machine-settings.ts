import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { access, mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { MACHINE_SETTINGS_SCHEMA, providerModelFields, type ProviderModelField } from './machine-settings-schema.js';
import { repositoryNeeds } from './repository-needs.js';
import { secureUrl } from './passkey.js';
import { listServices } from './sockets.js';
import { CONTRACT_V } from './sockets-contract.js';
import { roninIdentity } from './routes/version.js';
import { listProjectRoots, listSessionLaunchSpecs } from './project-roots.js';
import { storeDir } from './resources.js';
import { AGENTS, listAgentAvailability } from './agents.js';
import {
  publicState,
  readState as readServicesActivation,
  type ActivationState,
} from './activation/state.js';
const pexec = promisify(execFile);
const MACHINE_SETTINGS_FILE = () => path.join(storeDir('config'), 'machine_settings.json');
const MAX_OPT = '@ronin-session-max';
const OWNER_OPT = '@ronin-owner';
const NO_LIMIT = 0;
let writeQueue = Promise.resolve();
let legacyImport: Promise<Record<string, unknown>> | null = null;

async function importLegacyDocument(): Promise<Record<string, unknown>> {
  const document: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(await readFile(path.join(storeDir('config'), 'ronin.json'), 'utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) Object.assign(document, parsed);
  } catch {}

  const campaigns: Record<string, unknown> = {};
  try {
    for (const name of await readdir(storeDir('campaigns'))) {
      if (!/^[a-z0-9][a-z0-9_-]{0,63}\.json$/.test(name)) continue;
      try {
        const value = JSON.parse(await readFile(path.join(storeDir('campaigns'), name), 'utf8')) as unknown;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          campaigns[name.slice(0, -5)] = value;
        }
      } catch {}
    }
  } catch {}
  if (Object.keys(campaigns).length) document.campaigns = campaigns;

  const { writeCredential } = await import('./credential-store.js');
  if (document.auth !== undefined) {
    await writeCredential('auth', document.auth);
    delete document.auth;
  }
  if (document.passkeys !== undefined) {
    await writeCredential('passkeys', document.passkeys);
    delete document.passkeys;
  }

  if (Object.keys(document).length) {
    await mkdir(storeDir('config'), { recursive: true });
    const temporary = `${MACHINE_SETTINGS_FILE()}.${process.pid}.import.tmp`;
    await writeFile(temporary, JSON.stringify(document, null, 2) + '\n');
    await rename(temporary, MACHINE_SETTINGS_FILE());
  }
  return document;
}

async function readDocument(): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await readFile(MACHINE_SETTINGS_FILE(), 'utf8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return {};
    legacyImport ??= importLegacyDocument();
    return legacyImport;
  }
}

async function updateDocument(
  mutate: (document: Record<string, unknown>) => void | Promise<void>,
): Promise<void> {
  const operation = writeQueue.then(async () => {
    const document = await readDocument();
    await mutate(document);
    await mkdir(storeDir('config'), { recursive: true });
    const temporary = `${MACHINE_SETTINGS_FILE()}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify(document, null, 2) + '\n');
    await rename(temporary, MACHINE_SETTINGS_FILE());
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

async function readSection<T>(key: string, fallback: T): Promise<T> {
  const value = (await readDocument())[key];
  return value && typeof value === 'object' ? value as T : fallback;
}

async function updateSection<T extends Record<string, unknown>>(
  key: string,
  mutate: (value: T) => T,
): Promise<void> {
  return updateDocument((document) => {
    const current = document[key];
    const value = current && typeof current === 'object' && !Array.isArray(current)
      ? current as T : {} as T;
    document[key] = mutate(value);
  });
}

const cleanMax = (value: unknown): number => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : NO_LIMIT;
};
async function readMax(): Promise<number> {
  return cleanMax((await readSection<Record<string, unknown>>('sessions', {})).max);
}
async function publishMax(value = 0): Promise<void> {
  await pexec('tmux', ['set-option', '-s', MAX_OPT, String(value)]).catch(() => {});
}
async function writeMax(max: number): Promise<number> {
  const value = cleanMax(max);
  await updateSection('sessions', (sessions) => ({ ...sessions, max: value }));
  await publishMax(value);
  return value;
}
const machineUser = (): string => {
  try { return os.userInfo().username || 'owner'; } catch { return 'owner'; }
};
async function readOwner(): Promise<string> {
  const name = (await readSection<{ name?: unknown }>('owner', {})).name;
  return typeof name === 'string' && name.trim() ? name.trim() : machineUser();
}
async function publishOwner(value: string): Promise<void> {
  await pexec('tmux', ['set-option', '-s', OWNER_OPT, value]).catch(() => {});
}
async function writeOwner(name: string): Promise<string> {
  const value = String(name ?? '').trim().slice(0, 64) || machineUser();
  await updateSection('owner', (owner) => ({ ...owner, name: value }));
  await publishOwner(value);
  return value;
}
const readMachineSection = () => readSection<Record<string, unknown>>('machine', {});
const readAgentsSection = () => readSection<Record<string, unknown>>('agents', {});
const readSetupSection = () => readSection<Record<string, unknown>>('setup', {});
async function readDesksSection(): Promise<{ new_project: 'managed' | 'none' }> {
  const value = await readSection<{ new_project?: unknown }>('desks', {});
  return { new_project: value.new_project === 'none' ? 'none' : 'managed' };
}
const writeMachineSection = (value: Record<string, unknown>) =>
  updateSection('machine', (current) => ({ ...current, ...value }));
const writeAgentsSection = (value: Record<string, unknown>) =>
  updateDocument((document) => { document.agents = value; });
const writeGbrainSection = (value: Record<string, unknown>) =>
  updateDocument((document) => { document.gbrain = value; });
const writeDesksSection = (value: { new_project?: string }) =>
  updateSection('desks', (current) => ({
    ...current,
    ...(value.new_project === undefined ? {} : {
      new_project: value.new_project === 'none' ? 'none' : 'managed',
    }),
  }));
const writeWantedSection = (wanted: Array<{ kind: string; name: string }>) =>
  updateDocument((document) => { document.wanted = wanted; });
const completeSetup = () => updateDocument((document) => {
  document.setup = { completed_at: new Date().toISOString() };
});
async function liveCount(): Promise<number> {
  try {
    const { stdout } = await pexec('tmux', ['list-sessions', '-F', '#{session_name}']);
    return stdout.split('\n').filter((name) => name && !name.startsWith('grid_')).length;
  } catch { return 0; }
}

export function tailnetIp(): string {
  try {
    return execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8' }).trim().split('\n')[0]?.trim()
      || '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
}

export const config = {
  port: Number(process.env.PORT ?? 3006),
  bind: process.env.BIND?.trim() || tailnetIp(),
  user: process.env.GRID_USER ?? '',
  pass: process.env.GRID_PASS ?? '',
  windowSize: process.env.TMUX_WINDOW_SIZE?.trim() || 'latest',
  mouse: process.env.TMUX_MOUSE?.trim() || 'off',
  viewerPrefix: 'grid_',
  newSessionDir: process.env.RONIN_NEW_SESSION_DIR?.trim() || `${process.env.HOME}`,
  scribeUrl: process.env.SCRIBE_URL?.trim() ?? 'http://127.0.0.1:3004',
} as const;

export const authEnabled = Boolean(config.user && config.pass);

export function assertBindIsSafe(passwordAuth = false): void {
  const bind = config.bind.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const loopback = bind === 'localhost' || bind === '::1' || bind.startsWith('127.');
  if (!authEnabled && !passwordAuth && !loopback && bind !== tailnetIp()) {
    console.warn(`[ronin] BIND=${config.bind} exposes live terminals without authentication.`);
  }
}

const TAILNET_IP = tailnetIp();

export interface MachineSettingsProject {
  name: string;
  dir: string;
  remit: string;
}

export interface MachineSettingsJob {
  outlet: string;
  provider: string | null;
  model: string | null;
  key_env: string | null;
}

export interface MachineSettingsRecord {
  set: Record<string, unknown>;
  observed: Record<string, unknown>;
  status: Record<string, unknown>;
  needed: Array<{ leaf: string; needs: string; how: string; met_by: MetBy }>;
  schema: Omit<typeof MACHINE_SETTINGS_SCHEMA, 'fields'>
    & { fields: Array<(typeof MACHINE_SETTINGS_SCHEMA)['fields'][number] | ProviderModelField> };
}

export type MetBy = 'mechanical' | 'owner' | 'agent';

async function whichPath(cmd: string): Promise<string | null> {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    const p = path.join(d, cmd);
    try {
      await access(p);
      return p;
    } catch {
    }
  }
  return null;
}

async function readTrimmed(file: string): Promise<string | null> {
  try {
    return (await readFile(file, 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

async function osName(): Promise<string> {
  const raw = await readTrimmed('/etc/os-release');
  const m = raw?.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
  return m?.[1] ?? `${os.type()} ${os.release()}`;
}

async function machineFacts(): Promise<Record<string, unknown>> {
  let virt: string | null = null;
  try {
    const { stdout } = await pexec('systemd-detect-virt', [], { timeout: 1500 });
    virt = stdout.trim() || null;
  } catch (e) {
    const out = (e as { stdout?: string })?.stdout?.trim();
    virt = out || null;
  }
  const vendor = await readTrimmed('/sys/class/dmi/id/sys_vendor');
  const product = await readTrimmed('/sys/class/dmi/id/product_name');
  return {
    kind: virt && virt !== 'none' ? 'virtual' : 'physical',
    hypervisor: virt && virt !== 'none' ? virt : null,
    provider: vendor,
    product,
    cores: os.cpus().length,
    ram_gb: Math.round(os.totalmem() / 1024 ** 3),
    arch: os.arch(),
  };
}

const isLoopback = (a: string): boolean => {
  const s = a.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return s === '127.0.0.1' || s === '::1' || s === 'localhost' || s.startsWith('127.');
};

function routes(): Record<string, unknown> {
  const bind = config.bind;
  const loopback = isLoopback(bind);
  const tailnet = !loopback && bind.trim() === TAILNET_IP;
  return {
    url: `http://${bind}:${config.port}`,
    bind,
    port: config.port,
    secure: secureUrl() ?? null,
    reachable: { loopback, tailnet, wider: !loopback && !tailnet },
    auth: { basic: authEnabled },
  };
}

async function sshReach(): Promise<Record<string, unknown>> {
  let listening: boolean | null = null;
  try {
    const tcp = await readFile('/proc/net/tcp', 'utf8');
    const tcp6 = (await readTrimmed('/proc/net/tcp6')) ?? '';
    listening = (tcp + '\n' + tcp6)
      .split('\n')
      .slice(1)
      .some((l) => {
        const c = l.trim().split(/\s+/);
        return c[3] === '0A' && c[1]?.toUpperCase().endsWith(':0016');
      });
  } catch {
  }
  const isTailnet = (a: string) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a);
  const tailnet: string[] = [];
  const pub: string[] = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const i of infos ?? []) {
      if (i.internal) continue;
      if (i.family === 'IPv4') (isTailnet(i.address) ? tailnet : pub).push(i.address);
      else if (i.family === 'IPv6' && !/^(fe80|fd|fc)/.test(i.address)) pub.push(i.address);
    }
  }
  return { ssh: { listening, port: 22, addresses: { tailnet, public: pub } } };
}

async function localWeights(): Promise<Array<Record<string, unknown>>> {
  const dir = path.join(storeDir('koshi_weights'), 'models');
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: Array<Record<string, unknown>> = [];
  for (const n of names.sort()) {
    if (n.startsWith('.') || n === 'SHA256SUMS') continue;
    try {
      const st = await stat(path.join(dir, n));
      if (st.isFile()) out.push({ name: n, mb: Math.round(st.size / 1024 ** 2) });
    } catch {
    }
  }
  return out;
}

const typedStr = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null;

const sessionDefaults = (v: unknown): Record<string, unknown> => ({
  default: (v as Record<string, unknown>)?.default ?? { provider: null, model: null },
  by_provider: (v as Record<string, unknown>)?.by_provider ?? {},
});

async function readSet(): Promise<Record<string, unknown>> {
  const owner = await readSection<Record<string, unknown>>('owner', {});
  const machine = await readMachineSection();
  const agents = await readAgentsSection();
  const gbrain = await readSection<Record<string, unknown>>('gbrain', {});
  const koshi = await readSection<Record<string, unknown>>('koshi', {});
  const wipeboard = await readSection<Record<string, unknown>>('wipeboard', {});
  const campaigns = await readSection<Record<string, unknown>>('campaigns', {});
  const firstCampaign = Object.entries(campaigns)
    .sort(([a], [b]) => a.localeCompare(b))[0];
  const campaignRecord = firstCampaign && firstCampaign[1] && typeof firstCampaign[1] === 'object'
    ? firstCampaign[1] as Record<string, unknown> : {};
  const setup = await readSetupSection();
  const roots = await listProjectRoots();

  const projects: MachineSettingsProject[] = roots.map((r) => ({
    name: r.name,
    dir: r.dir,
    remit: r.remit,
  }));

  const activation = await readServicesActivation();
  return {
    campaign: { name: typedStr(campaignRecord.title), description: typedStr(campaignRecord.description) },
    campaigns,
    owner: { name: typedStr(owner.name) },
    machine: {
      name: typedStr(machine.name),
      where: typedStr(machine.where),
    },
    sessions: { max: await readMax() },
    projects,
    agents: { sessions: sessionDefaults(agents.sessions), jobs: (agents.jobs as unknown) ?? {} },
    gbrain: { enabled: gbrain.enabled === true },
    koshi,
    wipeboard,
    desk: { profile: typedStr(campaignRecord.desk_profile) },
    desks: { new_project: typedStr((await readDesksSection()).new_project) },
    wanted: (await readSection<Array<{ kind?: unknown; name?: unknown }>>('wanted', []))
      .filter((w) => typeof w?.kind === 'string' && typeof w?.name === 'string')
      .map((w) => ({ kind: w.kind as string, name: w.name as string })),
    setup: {
      pending: setup.pending === true,
      stamped_at: setup.stamped_at ?? null,
      completed_at: setup.completed_at ?? null,
    },
    services: setteiServices(activation),
  };
}

export function setteiServices(activation: ActivationState) {
  return {
    selected: activation.stage !== 'not_requested' && activation.stage !== 'cancelled',
    activation: publicState(activation),
  };
}

type PublicActivation = ReturnType<typeof publicState>;

export function servicesSubscription(activation: PublicActivation): string {
  if (activation.entitlement_id) {
    return `services: ${activation.entitlement_id}`
      + (activation.verified_at ? `, verified ${activation.verified_at}` : '');
  }
  if (activation.stage === 'requesting' || activation.stage === 'awaiting_email'
      || activation.stage === 'address_changed') {
    return 'free cowork: Services confirmation pending';
  }
  if (activation.stage === 'expired' || activation.stage === 'error') {
    return 'free cowork: Services activation needs attention';
  }
  return 'free cowork: no entitlement recorded';
}

async function readObserved(jobKeyNames: string[]): Promise<Record<string, unknown>> {
  const agents = Object.fromEntries(
    (await listAgentAvailability()).map((a) => [
      a.id,
      { label: a.label, from: a.from, installed: a.installed, path: a.path || null },
    ]),
  );

  const tools = Object.fromEntries(
    await Promise.all(
      MACHINE_SETTINGS_SCHEMA.scans.tools.map(async (t) => [t, (await whichPath(t)) !== null] as const),
    ),
  );

  const keyNames = [...new Set([...MACHINE_SETTINGS_SCHEMA.scans.keys, ...jobKeyNames])];
  const keys = Object.fromEntries(keyNames.map((k) => [k, Boolean(process.env[k])]));

  const id = roninIdentity();
  return {
    observed_at: new Date().toISOString(),
    machine: { host: os.hostname(), user: os.userInfo().username, ...(await machineFacts()) },
    os: { name: await osName(), kernel: os.release() },
    runtime: { node: process.version },
    ronin: {
      release: id.release,
      commit: id.commit,
      dirty: id.dirty,
      started_at: id.startedAt,
      contract: CONTRACT_V,
      services: listServices(),
    },
    routes: routes(),
    reach: await sshReach(),
    weights: await localWeights(),
    agents,
    keys,
    tools,
  };
}

async function computeStatus(
  set: Record<string, unknown>,
  observed: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const obsMachine = observed.machine as Record<string, unknown>;
  const setMachine = set.machine as Record<string, unknown>;
  const setOwner = set.owner as Record<string, unknown>;
  const agentsSeen = observed.agents as Record<string, { installed: boolean; path: string | null }>;
  const keys = observed.keys as Record<string, boolean>;
  const projects = set.projects as MachineSettingsProject[];
  const services = set.services as Record<string, unknown>;
  const servicesActivation = services.activation as PublicActivation;
  const max = (set.sessions as Record<string, number>).max;
  const running = await liveCount();

  const projectStatus = await Promise.all(
    projects.map(async (p) => {
      let dir = 'ok';
      try {
        await access(p.dir);
      } catch {
        dir = 'missing';
      }
      let repo = '—';
      if (dir === 'ok') {
        const cfg = await readTrimmed(path.join(p.dir, '.git', 'config'));
        if (cfg !== null) {
          const m = cfg.match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/);
          repo = m
            ? m[1].replace(/^git@([^:/]+):/, '$1/').replace(/^[a-z+]+:\/\//, '').replace(/\.git$/, '')
            : 'local repo — no remote';
        } else {
          try {
            await access(path.join(p.dir, '.git'));
            repo = 'repo — worktree of another';
          } catch {
            repo = 'no repo';
          }
        }
      }
      return { name: p.name, dir, repo };
    }),
  );

  const sessionDefault = ((set.agents as Record<string, unknown>).sessions ?? {}) as {
    default?: { provider?: string | null; model?: string | null };
  };
  const dflt = sessionDefault.default;

  const jobs = ((set.agents as Record<string, unknown>).jobs ?? {}) as Record<string, MachineSettingsJob>;
  const jobStatus = Object.fromEntries(
    Object.entries(jobs).map(([name, j]) => {
      const needs = j?.key_env;
      const where = j?.provider ?? j?.outlet;
      if (needs && !keys[needs]) return [name, `pointed at ${where} — ${needs} not set`];
      const sameAsDefault = Boolean(j?.model) && j?.model === dflt?.model && j?.provider === dflt?.provider;
      return [
        name,
        `pointed at ${where}${j?.model ? `/${j.model}` : ''}${sameAsDefault ? ' — same as your session default' : ''}`,
      ];
    }),
  );

  const r = observed.routes as {
    url: string;
    secure: string | null;
    reachable: { loopback: boolean; tailnet: boolean; wider: boolean };
    auth: { basic: boolean };
  };
  const exposure = r.reachable.loopback
    ? 'this box only'
    : r.reachable.tailnet
      ? `your tailnet only${r.auth.basic ? ', with a password' : ''}`
      : r.auth.basic
        ? 'beyond your tailnet, with a password'
        : 'beyond your tailnet, no password set';

  return {
    owner_name: await readOwner(),
    machine_name: (setMachine.name as string) ?? (obsMachine.host as string),
    sessions: { running, max, state: max === 0 ? 'no limit' : running >= max ? 'at the cap' : `${running} of ${max}` },
    projects: projectStatus,
    routes: [{
      what: 'coworkspace',
      at: r.url,
      state: 'answering',
      exposure,
      secure: r.secure,
      alias: r.reachable.tailnet ? `http://${obsMachine.host as string}:${(observed.routes as { port: number }).port}` : null,
    }],
    ssh: (() => {
      const reach = (observed.reach as { ssh: { listening: boolean | null; addresses: { tailnet: string[]; public: string[] } } }).ssh;
      if (reach.listening === false) return 'sshd is not listening — not reachable by ssh';
      const user = (obsMachine.user as string) ?? '';
      const first = reach.addresses.tailnet[0] ?? reach.addresses.public[0];
      if (!first) return 'no reachable address found';
      const rest = [...reach.addresses.tailnet.slice(1), ...reach.addresses.public.filter((a) => a !== first)];
      return `ssh ${user}@${first}${reach.addresses.tailnet[0] ? ' — your tailnet' : ''}${rest.length ? ` · also answers on ${rest.join(', ')}` : ''}${reach.listening === null ? ' · sshd not measurable on this OS' : ''}`;
    })(),
    services: listServices().map((name) => ({
      name,
      state: name === 'gbrain' && (set.gbrain as { enabled: boolean }).enabled !== true
        ? 'registered, disabled in settings'
        : 'registered',
    })),
    agents: {
      new_session: dflt?.provider && dflt?.model ? `${dflt.provider}/${dflt.model}` : 'no install default — per-project only',
      usable: Object.entries(agentsSeen).filter(([, a]) => a.installed).map(([n]) => n),
      ...jobStatus,
    },
    setup: (set.setup as { pending: boolean; completed_at: string | null }).pending
      ? 'first run has not been finished'
      : (set.setup as { completed_at: string | null }).completed_at
        ? `first run finished ${(set.setup as { completed_at: string }).completed_at}`
        : 'not applicable — this install predates the first-run surface',
    subscription: servicesSubscription(servicesActivation),
  };
}

function holds(
  check: { kind: string; path?: string; name?: string },
  set: Record<string, unknown>,
  observed: Record<string, unknown>,
): boolean {
  if (check.kind === 'set') {
    const v = String(check.path ?? '')
      .split('.')
      .reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), set);
    return v != null && v !== '' && v !== false;
  }
  const name = check.name ?? '';
  if (check.kind === 'key') return (observed.keys as Record<string, boolean>)[name] === true;
  if (check.kind === 'agent') return (observed.agents as Record<string, { installed: boolean }>)[name]?.installed === true;
  if (check.kind === 'tool') return (observed.tools as Record<string, boolean>)[name] === true;
  if (check.kind === 'service') {
    const ss = ((observed.ronin as { services: string[] }).services ?? []);
    return name === '*' ? ss.length > 0 : ss.includes(name);
  }
  return false;
}

function computeNeeded(
  set: Record<string, unknown>,
  observed: Record<string, unknown>,
): MachineSettingsRecord['needed'] {
  const declared = MACHINE_SETTINGS_SCHEMA.requires
    .filter((r) => holds(r.applies, set, observed) && !holds(r.met, set, observed))
    .map((r) => ({ leaf: r.leaf, needs: r.needs, how: r.how, met_by: r.met_by as MetBy }));
  const HOW: Record<string, { how: (n: string) => string; met_by: (n: string) => MetBy }> = {
    agent: {
      how: (n) => `install the ${n} CLI — it appears in agent installations the moment it lands`,
      met_by: (n) => (AGENTS.find((a) => a.id === n)?.operations.install ? 'mechanical' : 'owner'),
    },
    service: { how: () => 'install Ronin Services — it registers itself', met_by: () => 'owner' },
    tool: { how: (n) => `install ${n} on the host`, met_by: () => 'agent' },
    key: { how: (n) => `set ${n} in .env and restart the operator`, met_by: () => 'owner' },
  };
  const wanted = ((set.wanted ?? []) as Array<{ kind: string; name: string }>)
    .filter((w) => HOW[w.kind] && !holds(w, set, observed))
    .map((w) => ({
      leaf: 'wanted',
      needs: w.kind === 'service' && w.name === '*' ? 'Ronin Services (the bundle)' : `${w.name} (${w.kind})`,
      how: HOW[w.kind].how(w.name),
      met_by: HOW[w.kind].met_by(w.name),
    }));
  return [...declared, ...wanted];
}

export async function readMachineSettings(): Promise<MachineSettingsRecord> {
  const set = await readSet();
  const jobs = ((set.agents as Record<string, unknown>).jobs ?? {}) as Record<string, MachineSettingsJob>;
  const jobKeyNames = Object.values(jobs)
    .map((j) => j?.key_env)
    .filter((k): k is string => typeof k === 'string' && k.length > 0);
  const observed = await readObserved(jobKeyNames);
  const status = await computeStatus(set, observed);
  const needed = computeNeeded(set, observed);
  needed.push(...repositoryNeeds(set, status));
  return {
    set,
    observed,
    status,
    needed,
    schema: { ...MACHINE_SETTINGS_SCHEMA, fields: [...MACHINE_SETTINGS_SCHEMA.fields,
      ...providerModelFields([...new Set((await listSessionLaunchSpecs()).map((s) => s.provider))])] },
  };
}

const editString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export async function writeMachineSettings(
  family: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  if (family === 'setup') {
    await completeSetup();
    return { ok: true };
  }
  if (family === 'bootstrap') {
    const { populateHomeMachine } = await import('./campaigns.js');
    const campaign = await populateHomeMachine(body);
    await writeDesksSection({
      new_project: body.routine_bundle === 'worktrees' || body.routine_bundle === 'services'
        ? 'managed' : 'none',
    });
    return { ok: true, campaign_id: campaign.id };
  }
  if (family === 'campaign') {
    const { writeCampaignSection } = await import('./campaigns.js');
    await writeCampaignSection({
      name: editString(body.name),
      description: editString(body.description),
    });
    return { ok: true };
  }
  if (family === 'owner') return { name: await writeOwner(String(body.name ?? '').trim()) };
  if (family === 'machine') {
    await writeMachineSection({
      name: editString(body.name),
      where: editString(body.where),
      monitor: typeof body.monitor === 'boolean' ? body.monitor : undefined,
    });
    return { ok: true };
  }
  if (family === 'desk') {
    const { writeDeskSection } = await import('./campaigns.js');
    await writeDeskSection({ profile: editString(body.profile) ?? '' });
    return { ok: true };
  }
  if (family === 'desks') {
    await writeDesksSection({ new_project: editString(body.new_project) ?? 'managed' });
    return { ok: true };
  }
  if (family === 'session-max') return { max: await writeMax(Number(body.max)) };
  if (family === 'gbrain') {
    await writeGbrainSection({ enabled: body.enabled === true });
    return { ok: true };
  }
  if (family === 'wanted') {
    const kinds = new Set(['agent', 'service', 'tool', 'key', 'set']);
    const wanted = (Array.isArray(body.wanted) ? body.wanted : [])
      .filter((item): item is { kind: string; name: string } => {
        const row = item as Record<string, unknown>;
        return kinds.has(String(row?.kind)) && typeof row?.name === 'string';
      })
      .map(({ kind, name }) => ({ kind, name }));
    await writeWantedSection(wanted);
    return { ok: true, wanted };
  }
  if (family === 'campaigns') {
    await updateDocument((document) => { document.campaigns = body.campaigns ?? {}; });
    return { ok: true };
  }
  if (family === 'record-section') {
    const key = String(body.key ?? '');
    if (!['sessions', 'owner', 'machine', 'agents', 'gbrain', 'desks', 'wanted', 'setup', 'koshi', 'wipeboard'].includes(key)) {
      throw new Error(`no machine-settings section named '${key}'`);
    }
    await updateDocument((document) => { document[key] = body.value ?? {}; });
    return { ok: true };
  }
  if (family === 'agents') {
    const prior = await readAgentsSection();
    const incomingSessions = (body.sessions ?? {}) as Record<string, unknown>;
    const priorSessions = (prior.sessions ?? {}) as Record<string, unknown>;
    const incomingDefault = (incomingSessions.default ?? {}) as Record<string, unknown>;
    const priorByProvider = (priorSessions.by_provider ?? {}) as Record<string, unknown>;
    const byProvider = { ...priorByProvider };
    for (const [provider, model] of Object.entries(
      (incomingSessions.by_provider ?? {}) as Record<string, unknown>,
    )) byProvider[provider] = editString(model)?.trim() || null;
    const jobs = { ...((prior.jobs ?? {}) as Record<string, unknown>) };
    for (const [name, value] of Object.entries((body.jobs ?? {}) as Record<string, unknown>)) {
      const job = (value ?? {}) as Record<string, unknown>;
      jobs[name] = {
        outlet: editString(job.outlet) ?? null,
        provider: editString(job.provider) ?? null,
        model: editString(job.model) ?? null,
        key_env: editString(job.key_env) ?? null,
      };
    }
    await writeAgentsSection({
      sessions: body.sessions === undefined ? priorSessions : {
        default: incomingSessions.default === undefined
          ? (priorSessions.default ?? { provider: null, model: null })
          : {
              provider: editString(incomingDefault.provider) ?? null,
              model: editString(incomingDefault.model) ?? null,
            },
        by_provider: byProvider,
      },
      jobs: body.jobs === undefined ? prior.jobs : jobs,
    });
    return { ok: true };
  }
  throw new Error(`no machine-settings family named '${family}'`);
}
