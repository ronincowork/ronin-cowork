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
import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config, authEnabled, tailnetIp } from './config.js';
import { SETTEI_SCHEMA } from './settei-registry.js';
import { listServices } from './sockets.js';
import { CONTRACT_V } from './sockets-contract.js';
import { roninIdentity } from './routes/version.js';
import { listProjectRoots } from './project-roots.js';
import { storeDir } from './stores.js';
import { listAgentAvailability } from './agents.js';
import {
  readAgentsSection,
  readMachineSection,
  readOwner,
  readMax,
  readSection,
  readSetupSection,
  liveCount,
} from './user-config.js';

const pexec = promisify(execFile);

/** This node's tailnet address, measured once — see `routes()` for why it is needed. */
const TAILNET_IP = tailnetIp();

/* ------------------------------------------------------------------ the shapes */

/** One project as the record shows it. NO per-root model: there is ONE default for
 * new sessions (`agents.sessions.default`, the owner's ruling 2026-08-18) and a root
 * carries none — whatever columns the roots file still has, settei does not read them. */
export interface SetteiProject {
  name: string;
  dir: string;
  /** The one line a person picks a project from in a list. Already in the roots file. */
  remit: string;
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
  /** What a choice still needs, judged per read — met items do not exist. */
  needed: Array<{ leaf: string; needs: string; how: string }>;
  schema: typeof SETTEI_SCHEMA;
}

/* The registry lives in src/settei-registry.ts — pure data, split out by the
 * line ceiling; it is still the ONE declaration and this file still serves it. */

/* ------------------------------------------------------- small honest measurers */

/**
 * Absent reads `null`, never missing: a thing this box could have and does not.
 *
 * FOR TOOLS ONLY — `gh`, `tailscale`, `chromium`. **The agent CLIs do not come through
 * here**, and the difference is the whole reason `src/agents.ts` exists: this process's
 * PATH is not the one a pane gets. `systemd --user` carries a minimal PATH, so a CLI
 * installed through npm-global or nvm is routinely present in the owner's shell and
 * absent here — a scan from node and a scan from the tmux server's environment each
 * answer wrong, in different directions. Agent availability is measured in a LOGIN
 * SHELL by `listAgentAvailability()` and this record consumes that answer rather than
 * producing a second, cheaper, wronger one.
 */
async function whichPath(cmd: string): Promise<string | null> {
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

/**
 * HOW THIS BOX IS REACHED BY HAND — the ssh family (owner, 2026-08-18). The box can
 * say every address a person could point ssh at, and whether sshd is listening; it
 * can never know the alias the owner types on their laptop — that lives client-side,
 * in an ~/.ssh/config it has no business reading. Interfaces only, no metadata call
 * (the no-egress rule holds): the tailnet address is recognised by its CGNAT range
 * (100.64/10), everything else non-internal is reported as public.
 *
 * `listening` is boolean OR NULL — on a box with no /proc (a Mac) the question is
 * unanswerable, and unanswerable must never be spelled `false`: absent means absent.
 * Only port 22 is asked about; a moved sshd port is the owner's own arrangement.
 */
async function sshReach(): Promise<Record<string, unknown>> {
  let listening: boolean | null = null;
  try {
    const tcp = await readFile('/proc/net/tcp', 'utf8');
    const tcp6 = (await readTrimmed('/proc/net/tcp6')) ?? '';
    // /proc/net/tcp: local_address is col 2 (hex ip:port), st is col 4; 0A = LISTEN.
    listening = (tcp + '\n' + tcp6)
      .split('\n')
      .slice(1)
      .some((l) => {
        const c = l.trim().split(/\s+/);
        return c[3] === '0A' && c[1]?.toUpperCase().endsWith(':0016');
      });
  } catch {
    /* not linux — unknown, not false */
  }
  const isTailnet = (a: string) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a);
  const tailnet: string[] = [];
  const pub: string[] = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const i of infos ?? []) {
      if (i.internal) continue;
      if (i.family === 'IPv4') (isTailnet(i.address) ? tailnet : pub).push(i.address);
      // Link-local and ULA v6 reach nobody who does not already have a better route.
      else if (i.family === 'IPv6' && !/^(fe80|fd|fc)/.test(i.address)) pub.push(i.address);
    }
  }
  return { ssh: { listening, port: 22, addresses: { tailnet, public: pub } } };
}

/** LOCAL WEIGHTS — open models actually downloaded onto this box (the koshi_weights
 * store's models/). Named and sized per read, because "I believe we downloaded qwen"
 * is exactly the sentence a record exists to replace with a measurement. An empty or
 * absent shelf is the ordinary state of a box that has not installed the service. */
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
      /* vanished mid-read */
    }
  }
  return out;
}

/* ------------------------------------------------------------------ the record */

/** A typed string leaf: the owner's words, or null. A BLANK IS NOT AN ANSWER — an
 * empty or whitespace string reads as null, so the fallback machinery downstream
 * (`??` in computeStatus, "unset — using …" in ⚙) never mistakes a cleared field for
 * a given name. The live defect this closes: a stored `machine.name: ""` made
 * status.machine_name empty and the hostname invisible on the whole ⚙ tab. */
const typedStr = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null;

async function readSet(): Promise<Record<string, unknown>> {
  const owner = await readSection<Record<string, unknown>>('owner', {});
  const machine = await readMachineSection();
  const agents = await readAgentsSection();
  const gbrain = await readSection<Record<string, unknown>>('gbrain', {});
  const services = await readSection<Record<string, unknown>>('services', {});
  const setup = await readSetupSection();
  const roots = await listProjectRoots();

  const projects: SetteiProject[] = roots.map((r) => ({
    name: r.name,
    dir: r.dir,
    remit: r.remit,
  }));

  return {
    owner: { name: typedStr(owner.name) },
    machine: {
      name: typedStr(machine.name),
      where: typedStr(machine.where),
    },
    sessions: { max: await readMax() },
    projects,
    agents: {
      sessions: (agents.sessions as unknown) ?? { default: { provider: null, model: null } },
      jobs: (agents.jobs as unknown) ?? {},
    },
    gbrain: { enabled: gbrain.enabled === true },
    // ASSERTS "SHOW ME", NEVER "HIDE ME". Absent is the normal state of every install
    // older than the key, so it has to be quiet — see stampFreshInstall().
    setup: {
      pending: setup.pending === true,
      stamped_at: setup.stamped_at ?? null,
      completed_at: setup.completed_at ?? null,
    },
    services: {
      entitlement: services.entitlement ?? null,
      email: services.email ?? null,
      verified: services.verified ?? null,
      terms: services.terms ?? null,
    },
  };
}

/** The half the box answers for itself. Nothing here is written down.
 * `jobKeyNames` — every `key_env` the typed half names; joins the registry's own
 * key list so a job pointed at a provider is a key the scan checks, automatically. */
async function readObserved(jobKeyNames: string[]): Promise<Record<string, unknown>> {
  /**
   * THE OWNER-RULED STARTING FOUR, measured by ATARASHI's login-shell probe.
   *
   * `installed` is the only claim it makes — never *signed in*, because the owner ruled
   * we do not inspect accounts. And the probe's failure mode is deliberately generous:
   * if the login shell will not run at all, every agent comes back `installed: false`,
   * because a shell that will not run is not evidence that nothing is installed. That is
   * the right default for a page offering an install, so this record keeps the full
   * `{ installed, path }` rather than flattening to a bare null — a reader can then see
   * the shape of the claim instead of inheriting a bare absence it cannot check.
   */
  const agents = Object.fromEntries(
    (await listAgentAvailability()).map((a) => [
      a.id,
      { label: a.label, from: a.from, installed: a.installed, path: a.path || null },
    ]),
  );

  const tools = Object.fromEntries(
    await Promise.all(
      SETTEI_SCHEMA.scans.tools.map(async (t) => [t, (await whichPath(t)) !== null] as const),
    ),
  );

  // PRESENCE ONLY. The variable's name is public; its value is not, and there is no
  // path from this record to one. The names come from the registry — a name worth
  // scanning is a name the registry mentions — plus what the typed jobs point at.
  const keyNames = [...new Set([...SETTEI_SCHEMA.scans.keys, ...jobKeyNames])];
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
  const agentsSeen = observed.agents as Record<string, { installed: boolean; path: string | null }>;
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
      // THE REPO IS MEASURED, NEVER RECORDED (owner asked 2026-08-18; the model rules
      // the shape): whether a root has a repository and where origin points are facts
      // the directory answers per read — a repo cloned tonight shows up tomorrow with
      // no one editing a catalog, and a note in the roots file would be a stored
      // measurement, lying the moment someone runs git clone. One file read per root
      // (.git/config), no exec, no call out.
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
            // a .git FILE is a worktree/submodule pointer — a repo, home elsewhere
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

  const jobs = ((set.agents as Record<string, unknown>).jobs ?? {}) as Record<string, SetteiJob>;
  const jobStatus = Object.fromEntries(
    Object.entries(jobs).map(([name, j]) => {
      const needs = j?.key_env;
      const where = j?.provider ?? j?.outlet;
      if (needs && !keys[needs]) return [name, `pointed at ${where} — ${needs} not set`];
      // SAY WHEN A CHEAP JOB IS ON THE EXPENSIVE MODEL. A house job is pointed at
      // something light on purpose — Mika explains the house and runs errands — and the
      // costly mistake is pointing it at the same model the sessions use without
      // noticing. Two rows each showing a model name make that invisible; saying it out
      // loud is most of why the row is worth drawing at all.
      const sameAsDefault = Boolean(j?.model) && j?.model === dflt?.model && j?.provider === dflt?.provider;
      return [
        name,
        `pointed at ${where}${j?.model ? `/${j.model}` : ''}${sameAsDefault ? ' — same as your session default' : ''}`,
      ];
    }),
  );

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
    routes: [{
      what: 'coworkspace',
      at: r.url,
      state: 'answering',
      exposure,
      // THE ALIAS (owner, 2026-08-18): on a tailnet bind the hostname usually IS the
      // MagicDNS name, so http://<host>:<port> reaches the same door with a name a
      // person can remember. Derived from facts already measured — no lookup, no call.
      alias: r.reachable.tailnet ? `http://${obsMachine.host as string}:${(observed.routes as { port: number }).port}` : null,
    }],
    // REACH BY HAND — the sentence a person actually needs: what to type. The tailnet
    // address leads because it is the private door; public addresses are listed as
    // facts, never recommended. Unknown stays unknown — a Mac cannot answer sshd.
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
    subscription: services.entitlement
      ? `services — ${String(services.entitlement)}${services.verified ? `, verified ${String(services.verified)}` : ''}`
      : 'free cowork — no entitlement recorded',
  };
}

/* ------------------------------------------------------- what is still needed */

/** One vocabulary check, judged against the record. Four verbs, never more — the
 * first "just one more condition kind" is a new scan family, not a new verb here. */
function holds(
  check: { kind: string; path?: string; name?: string },
  set: Record<string, unknown>,
  observed: Record<string, unknown>,
): boolean {
  if (check.kind === 'set') {
    const v = String(check.path ?? '')
      .split('.')
      .reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), set);
    return v != null && v !== '';
  }
  const name = check.name ?? '';
  if (check.kind === 'key') return (observed.keys as Record<string, boolean>)[name] === true;
  if (check.kind === 'agent') return (observed.agents as Record<string, { installed: boolean }>)[name]?.installed === true;
  if (check.kind === 'tool') return (observed.tools as Record<string, boolean>)[name] === true;
  return false;
}

/**
 * NEEDED — what a choice still needs, judged fresh on every read. A registry
 * `requires` row speaks only while its `applies` check holds, and an entry exists
 * only while its `met` check does not: MET ITEMS DO NOT EXIST, so nothing is ever
 * written, cleared, or stale, and satisfying a need makes its task vanish everywhere
 * with no write anywhere. The ⚙ rows and the seat's reading list render exactly this.
 */
function computeNeeded(
  set: Record<string, unknown>,
  observed: Record<string, unknown>,
): SetteiRecord['needed'] {
  return SETTEI_SCHEMA.requires
    .filter((r) => holds(r.applies, set, observed) && !holds(r.met, set, observed))
    .map((r) => ({ leaf: r.leaf, needs: r.needs, how: r.how }));
}

/** The whole record. One call, one answer, no writes — schema included, because the
 * schema of the object is part of the object and a renderer needs nothing else. */
export async function readSettei(): Promise<SetteiRecord> {
  const set = await readSet();
  const jobs = ((set.agents as Record<string, unknown>).jobs ?? {}) as Record<string, SetteiJob>;
  const jobKeyNames = Object.values(jobs)
    .map((j) => j?.key_env)
    .filter((k): k is string => typeof k === 'string' && k.length > 0);
  const observed = await readObserved(jobKeyNames);
  return {
    set,
    observed,
    status: await computeStatus(set, observed),
    needed: computeNeeded(set, observed),
    schema: SETTEI_SCHEMA,
  };
}
