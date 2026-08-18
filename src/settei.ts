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
  schema: typeof SETTEI_SCHEMA;
}

/* ------------------------------------------------------------------ the registry */

/**
 * THE REGISTRY — every askable leaf declared once, as DATA, and served with the answer.
 *
 * The schema of the object is part of the object: a view may not know a field this
 * block does not say, which is what makes several renderers of one record safe. The
 * declaration used to live client-side (`public/js/setup-fields.js`) and used to be
 * closures — `initial(ctx)`, `fold(body,v)` — which no server could serve or judge.
 * Here every closure became a datum: `from` is a path into the record, `lands` names
 * a write family and a key inside its body, `options` names a source the renderer
 * resolves, `omit: 'blank'` is the one omission rule anyone ever used.
 *
 * `requires` is judged against the observed half (the `needed[]` family) and its
 * vocabulary is four verbs and STAYS four — `key` · `agent` · `tool` · `set`. The
 * first "just one more condition kind" is a new scan family, not a new verb.
 *
 * The scan-name lists live here too (`scans`), because a name worth scanning is a
 * name the registry mentions — plus every `key_env` a configured job names, which is
 * typed data and joins at read time. No other file may carry a list of these names.
 *
 * `families` maps a write family to its route. It is the migration seam: when the
 * per-family handlers collapse into `PUT /api/settei/:family`, only this table moves.
 */
export const SETTEI_SCHEMA = {
  sections: [
    {
      id: 'machine',
      title: 'This machine',
      lede: 'Ronin is now installed on this machine — laptop, home server or a VM somewhere, it makes no difference to what follows. This page is already talking to it.',
      facts: true,
    },
    {
      id: 'you',
      title: 'You',
      lede: 'One name, used by everything on the box that has to address you — the assistant, the roster, an agent writing you a note.',
    },
    {
      id: 'project',
      title: 'Your first project',
      lede: 'A project is a directory Ronin is allowed to work in, plus a line saying what it is for. Every session carries two things — where it works and what it is doing — and this is the first half. Add as many as you like later from ▣ Roots.',
    },
    {
      id: 'agents',
      title: 'Agents',
      lede: 'Ronin is the room your agents work in — a co-working space for the CLIs you already use, each in its own terminal, all on one screen. So the only question here is what is on the machine: something present asks whether you want it in the room, something absent tells you how to get it. Ronin looks for the command and nothing else — signing in happens inside the agent itself, the first time you use it.',
      custom: 'agents',
    },
    {
      id: 'defaults',
      title: 'Defaults for new sessions',
      lede: 'A default is what a new session starts as, never what it is stuck with — every launch can pick something else.',
    },
    { id: 'services', title: 'Optional', custom: 'services' },
  ],

  fields: [
    {
      id: 'machineName',
      sec: 'machine',
      kind: 'text',
      label: 'What do you want to call this machine?',
      hint: 'Yours to choose — it is what you will see in the roster. The hostname stays what it is.',
      placeholder: 'the workshop',
      from: 'set.machine.name',
      lands: { family: 'machine', key: 'name' },
      omit: 'blank',
    },
    {
      id: 'ownerName',
      sec: 'you',
      kind: 'text',
      label: 'What should we call you?',
      placeholder: 'Your name',
      from: 'set.owner.name',
      lands: { family: 'owner', key: 'name' },
      omit: 'blank',
    },
    {
      id: 'projName',
      sec: 'project',
      kind: 'text',
      label: 'Name',
      hint: 'Short, lowercase. You will type it when you point an agent somewhere.',
      placeholder: 'ronin',
      norm: 'lower',
      lands: { family: 'project', key: 'name' },
      omit: 'blank',
    },
    {
      id: 'projRemit',
      sec: 'project',
      kind: 'text',
      label: 'What is it for?',
      hint: 'One line. Agents read it to know what they have been put in front of.',
      placeholder: 'The browser grid of live tmux sessions',
      lands: { family: 'project', key: 'remit' },
    },
    {
      id: 'projDir',
      sec: 'project',
      kind: 'text',
      cls: 'fr-path',
      label: 'Where does it live?',
      placeholder: 'project directory',
      from: 'home',
      lands: { family: 'project', key: 'dir' },
      omit: 'blank',
    },
    {
      id: 'model',
      sec: 'defaults',
      kind: 'select',
      label: 'Model',
      hint: 'Any session can be launched with another.',
      options: 'models',
      from: 'models:first',
      shape: 'provider-model',
      lands: { family: 'agents', key: 'sessions.default' },
      omit: 'blank',
    },
    {
      id: 'mika',
      sec: 'defaults',
      kind: 'select',
      label: 'Which model answers Mika?',
      hint: 'Mika is Ronin’s own assistant — she explains the house and runs small errands. She does not need your best model, and using one is how a helper gets expensive.',
      options: 'models',
      from: 'models:light',
      shape: 'provider-model',
      // Keyed by the session_job's own name — the token the launcher, memory and
      // counting already share, so nothing has to translate it.
      lands: { family: 'agents', key: 'jobs.MikaAssist' },
      omit: 'blank',
    },
    {
      id: 'cap',
      sec: 'defaults',
      kind: 'select',
      label: 'How many agents at once',
      hint: 'Budget about 700 MB per agent. Ronin refuses a new session past your number rather than letting the machine run out of memory.',
      options: 'caps',
      from: 'set.sessions.max',
      shape: 'number',
      lands: { family: 'session-max', key: 'max' },
    },
  ],

  /** Named option sources. `models` is the launch table via /api/session-launch-specs —
   * data the record deliberately does not own; `caps` is the list itself. */
  sources: { caps: [5, 10, 15, 20] },

  families: {
    owner: { method: 'PUT', route: '/api/owner' },
    machine: { method: 'PUT', route: '/api/settei/machine' },
    agents: { method: 'PUT', route: '/api/settei/agents' },
    'session-max': { method: 'PUT', route: '/api/session-max' },
    project: { method: 'POST', route: '/api/project-roots' },
  },

  /** The machine strip on the setup view — deliberately short: only the facts a later
   * answer depends on. Paths are into `observed`. A missing value drops its row. */
  facts: [
    { label: 'this box', path: 'machine.host' },
    { label: 'cores', path: 'machine.cores' },
    { label: 'memory', path: 'machine.ram_gb', suffix: ' GB' },
  ],

  /** What Ronin Services buys, and the two asks. The page renders whatever is here. */
  services: {
    features: [
      ['Live status ladders', 'Every agent shows its plan and how far through it is — on the tile and in the roster. Stop asking how it is going.'],
      ['Readable transcripts', 'Tiles become real text instead of a terminal mirror. Select it, copy it, scroll back through it — on your phone too.'],
      ['Voice', 'Talk to a session instead of typing at it, and have it read back to you.'],
      ['Usage statistics', 'What every session spent, by model, over time.'],
      ['gbrain', 'A memory your agents search before they answer, and write to as they work.'],
    ],
    terms: [
      ['Share how it runs', 'How many sessions, which models, how long they ran. Never your code, and never what was typed — by you or by your agents. It is how we find out where the experience is bad and make it better for everyone.'],
      ["Don't resell it", 'Use the services for your own work, commercial or not, as much as you like. Just don’t turn around and sell the services themselves.'],
    ],
  },

  /** The names the mechanical scans check. Joined at read time by every `key_env` a
   * configured job names — typed data the registry cannot know in advance. */
  scans: {
    keys: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
    tools: ['gh', 'tailscale', 'chromium'],
  },

  /** What a choice still needs — judged against the record per read (the `needed[]`
   * family), met items do not exist. Seed: services finish over the email link, alone. */
  requires: [
    {
      leaf: 'services',
      applies: { kind: 'set', path: 'services.email' },
      met: { kind: 'set', path: 'services.verified' },
      needs: 'the verified email',
      how: 'click the link in the services email, paste the code',
    },
  ],
};

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

/* ------------------------------------------------------------------ the record */

/** The half that persists, read back from where it actually lives. */
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
    (await listAgentAvailability()).map((a) => [a.id, { installed: a.installed, path: a.path || null }]),
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
      return {
        name: p.name,
        dir,
        brain: p.provider && p.model ? `${p.provider}/${p.model}` : 'none set — uses the install default',
      };
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
    routes: [{ what: 'coworkspace', at: r.url, state: 'answering', exposure }],
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

/** The whole record. One call, one answer, no writes — schema included, because the
 * schema of the object is part of the object and a renderer needs nothing else. */
export async function readSettei(): Promise<SetteiRecord> {
  const set = await readSet();
  const jobs = ((set.agents as Record<string, unknown>).jobs ?? {}) as Record<string, SetteiJob>;
  const jobKeyNames = Object.values(jobs)
    .map((j) => j?.key_env)
    .filter((k): k is string => typeof k === 'string' && k.length > 0);
  const observed = await readObserved(jobKeyNames);
  return { set, observed, status: await computeStatus(set, observed), schema: SETTEI_SCHEMA };
}
