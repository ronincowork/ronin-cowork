/**
 * SETTEI — one record of what this install IS, assembled on read.
 *
 * `plans/SETTEI.md` Part VI in ronin-lab is the plan this implements, and its one idea is
 * the whole of this file: every line in the record arrived one of three ways, and keeping
 * those apart is what stops a config file lying.
 *
 *   set        the owner typed it        PERSISTS — ronin.json + the roots file
 *   observed   the box measured it       never stored, and carries `observed_at`
 *   status     follows from the other two computed here, never stored
 *
 * **A stored fact is a lie the moment the box changes.** Hostname, core count, which
 * agent CLIs exist and whether a key is present are all things that answer differently
 * next week; writing them down would produce a record that disagrees with its own
 * machine and no way to tell which was right. So only the half a person typed is saved,
 * which is also what keeps the write path a single writer with no cache and nothing to
 * reconcile.
 *
 * WHAT THIS FILE MAY NOT DO, and the reason is load-bearing:
 *
 *  - **It never returns `ronin.json`.** The document also carries `auth` (a scrypt record
 *    AND the secret that signs session tokens) and `passkeys`. The obvious implementation
 *    of "one place you see the setup" is a GET that hands back the file, and that GET
 *    would hand out the signing secret. Every section below is assembled from NAMED keys.
 *  - **It never renders a credential.** A key appears as its variable NAME and a boolean
 *    for whether it is set. Never a value, and never a field to type one into.
 *  - **It makes no outbound call.** A record that phones anyone to draw itself has quietly
 *    become a third egress door, and the house has exactly two (AGERU, and the model
 *    provider). Provider comes from the DMI table the kernel already read; region is not
 *    detected at all — it is `machine.where`, in the owner's own words.
 */
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config, authEnabled, tailnetIp } from './config.js';
import { listServices } from './sockets.js';
import { CONTRACT_V } from './sockets-contract.js';
import { roninIdentity } from './routes/version.js';
import { listProjectRoots } from './project-roots.js';
import { readOwner, readMax, readSection, liveCount } from './user-config.js';

const pexec = promisify(execFile);

/** This node's tailnet address, measured once — see `routes()` for why it is needed. */
const TAILNET_IP = tailnetIp();

/* ------------------------------------------------------------------ the shapes */

/** One project as the record shows it — the roots file's own fields, nothing added. */
export interface SetteiProject {
  name: string;
  dir: string;
  /** The one line a person picks a project from in a list. Already in the roots file. */
  remit: string;
  provider: string;
  model: string;
}

/** What a job that needs a model is pointed at. `key_env` is a NAME, never a key. */
export interface SetteiJob {
  outlet: string;
  provider: string | null;
  model: string | null;
  key_env: string | null;
}

export interface SetteiRecord {
  set: Record<string, unknown>;
  observed: Record<string, unknown>;
  status: Record<string, unknown>;
}

/* ------------------------------------------------------- small honest measurers */

/** Absent reads `null`, never missing: a thing this box could have and does not. */
async function whichPath(cmd: string): Promise<string | null> {
  // PATH SCAN, NOT A PROBE — and the difference matters. `systemd --user` carries a
  // minimal PATH, so a CLI installed through npm-global or nvm is routinely present in
  // the owner's shell and absent from this process's environment. ATARASHI leg 2 owns
  // the real probe (it has to answer in the environment a tmux pane actually gets);
  // this stands in until it lands and is deliberately the cheap version.
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    const p = path.join(d, cmd);
    try {
      await access(p);
      return p;
    } catch {
      /* not here — next */
    }
  }
  return null;
}

/** One line out of a file, or null. Never throws: a missing fact is not an error. */
async function readTrimmed(file: string): Promise<string | null> {
  try {
    return (await readFile(file, 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

/** Ubuntu 26.04 LTS, or whatever this is. `PRETTY_NAME` is the one humans recognise. */
async function osName(): Promise<string> {
  const raw = await readTrimmed('/etc/os-release');
  const m = raw?.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
  return m?.[1] ?? `${os.type()} ${os.release()}`;
}

/**
 * Physical or virtual, and whose. `systemd-detect-virt` answers `none` on metal and
 * names the hypervisor otherwise; the DMI table names the vendor without a network call.
 * Both are best-effort — a box that answers neither is reported as unknown rather than
 * guessed at.
 */
async function machineFacts(): Promise<Record<string, unknown>> {
  let virt: string | null = null;
  try {
    const { stdout } = await pexec('systemd-detect-virt', [], { timeout: 1500 });
    virt = stdout.trim() || null;
  } catch (e) {
    // exit 1 means "none" — bare metal, and the message carries it
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

/** Loopback in the spellings a person actually writes. Mirrors config.ts's own test. */
const isLoopback = (a: string): boolean => {
  const s = a.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return s === '127.0.0.1' || s === '::1' || s === 'localhost' || s.startsWith('127.');
};

/**
 * HOW THIS BOX IS REACHED, AND BY WHOM. The interesting part is not the port, it is
 * the sentence about exposure: an install bound to its tailnet address with no password
 * is not insecure — the tailnet IS the door — and one bound wider with no password is a
 * live shell on an open port. Saying which, in words, is the point of the row.
 */
function routes(): Record<string, unknown> {
  const bind = config.bind;
  const loopback = isLoopback(bind);
  // Measured once at module load, exactly as config.ts does for the default bind — a
  // shell-out per request to answer a question whose answer does not change would be a
  // cost with no reader.
  const tailnet = !loopback && bind.trim() === TAILNET_IP;
  return {
    url: `http://${bind}:${config.port}`,
    bind,
    port: config.port,
    reachable: { loopback, tailnet, wider: !loopback && !tailnet },
    auth: { basic: authEnabled },
  };
}

/* ------------------------------------------------------------------ the record */

/** The half that persists, read back from where it actually lives. */
async function readSet(): Promise<Record<string, unknown>> {
  const owner = await readSection<Record<string, unknown>>('owner', {});
  const machine = await readSection<Record<string, unknown>>('machine', {});
  const agents = await readSection<Record<string, unknown>>('agents', {});
  const gbrain = await readSection<Record<string, unknown>>('gbrain', {});
  const services = await readSection<Record<string, unknown>>('services', {});
  const roots = await listProjectRoots();

  const projects: SetteiProject[] = roots.map((r) => ({
    name: r.name,
    dir: r.dir,
    remit: r.remit,
    provider: r.provider,
    model: r.model,
  }));

  return {
    owner: { name: typeof owner.name === 'string' ? owner.name : null },
    machine: {
      name: typeof machine.name === 'string' ? machine.name : null,
      where: typeof machine.where === 'string' ? machine.where : null,
    },
    sessions: { max: await readMax() },
    projects,
    agents: {
      sessions: (agents.sessions as unknown) ?? { default: { provider: null, model: null } },
      jobs: (agents.jobs as unknown) ?? {},
    },
    gbrain: { enabled: gbrain.enabled === true },
    services: {
      entitlement: services.entitlement ?? null,
      email: services.email ?? null,
      verified: services.verified ?? null,
      terms: services.terms ?? null,
    },
  };
}

/** The half the box answers for itself. Nothing here is written down. */
async function readObserved(): Promise<Record<string, unknown>> {
  // The owner-ruled starting four, plus local weights. Absent is `null`, not missing.
  const names = ['claude', 'codex', 'gemini', 'hermes', 'ollama'];
  const found = await Promise.all(names.map((n) => whichPath(n)));
  const agents = Object.fromEntries(names.map((n, i) => [n, found[i]]));

  const tools = Object.fromEntries(
    await Promise.all(
      ['gh', 'tailscale', 'chromium'].map(async (t) => [t, (await whichPath(t)) !== null] as const),
    ),
  );

  // PRESENCE ONLY. The variable's name is public; its value is not, and there is no
  // path from this record to one.
  const keyNames = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];
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
    agents,
    keys,
    tools,
  };
}

/**
 * WHAT FOLLOWS — every line a comparison the owner would otherwise make in their head.
 *
 * The rule this section keeps: **registration and configuration, never liveness.**
 * Proving Koshi answers means spending an API call, and a record that costs money to
 * render is a record nobody opens twice. "Pointed at openai, OPENAI_API_KEY not set" is
 * free, and it is the line that earns the section — today that failure is discovered
 * when Koshi tries to answer and cannot.
 */
async function computeStatus(
  set: Record<string, unknown>,
  observed: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const obsMachine = observed.machine as Record<string, unknown>;
  const setMachine = set.machine as Record<string, unknown>;
  const setOwner = set.owner as Record<string, unknown>;
  const agentsSeen = observed.agents as Record<string, string | null>;
  const keys = observed.keys as Record<string, boolean>;
  const projects = set.projects as SetteiProject[];
  const services = set.services as Record<string, unknown>;
  const max = (set.sessions as Record<string, number>).max;
  const running = await liveCount();

  // A project whose directory has gone is the most common real breakage, and the
  // cheapest thing to check: one stat per root.
  const projectStatus = await Promise.all(
    projects.map(async (p) => {
      let dir = 'ok';
      try {
        await access(p.dir);
      } catch {
        dir = 'missing';
      }
      return {
        name: p.name,
        dir,
        brain: p.provider && p.model ? `${p.provider}/${p.model}` : 'none set — uses the install default',
      };
    }),
  );

  const jobs = ((set.agents as Record<string, unknown>).jobs ?? {}) as Record<string, SetteiJob>;
  const jobStatus = Object.fromEntries(
    Object.entries(jobs).map(([name, j]) => {
      const needs = j?.key_env;
      const ok = !needs || keys[needs];
      return [
        name,
        ok
          ? `pointed at ${j?.provider ?? j?.outlet}${j?.model ? `/${j.model}` : ''}`
          : `pointed at ${j?.provider ?? j?.outlet} — ${needs} not set`,
      ];
    }),
  );

  const sessionDefault = ((set.agents as Record<string, unknown>).sessions ?? {}) as {
    default?: { provider?: string | null; model?: string | null };
  };
  const dflt = sessionDefault.default;

  const r = observed.routes as {
    url: string;
    reachable: { loopback: boolean; tailnet: boolean; wider: boolean };
    auth: { basic: boolean };
  };
  // THE ONE DISTINCTION WORTH SPELLING OUT. Tailnet with no password is a closed door —
  // the tailnet IS the door, and it is the ordinary deployment. Wider with no password
  // is a live shell on an open port, and the install refuses to start that way; if it is
  // ever read here it means a password is what is holding it, and the row should say so.
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
    routes: [{ what: 'coworkspace', at: r.url, state: 'answering', exposure }],
    services: listServices().map((name) => ({
      name,
      state: name === 'gbrain' && (set.gbrain as { enabled: boolean }).enabled !== true
        ? 'registered, disabled in settings'
        : 'registered',
    })),
    agents: {
      new_session: dflt?.provider && dflt?.model ? `${dflt.provider}/${dflt.model}` : 'no install default — per-project only',
      usable: Object.entries(agentsSeen).filter(([, p]) => p).map(([n]) => n),
      ...jobStatus,
    },
    subscription: services.entitlement
      ? `services — ${String(services.entitlement)}${services.verified ? `, verified ${String(services.verified)}` : ''}`
      : 'free cowork — no entitlement recorded',
  };
}

/** The whole record. One call, one answer, no writes. */
export async function readSettei(): Promise<SetteiRecord> {
  const set = await readSet();
  const observed = await readObserved();
  return { set, observed, status: await computeStatus(set, observed) };
}
