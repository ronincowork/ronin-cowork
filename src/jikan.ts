/**
 * JIKAN (時間, "time") — the house's clock, and a team's scheduled requests on it.
 *
 * JIKAN IS THE RAILS FOR EVERYTHING TIMED (owner, 2026-09-03). Before it, every timed thing
 * in the server wrote its own loop — the message queue's retry (2 s), the Tomodachi sweep
 * (hourly, plus one after boot), the sessions broadcast (2 s) — four `setInterval`s, four
 * re-entrancy guards of three shapes, and no one place that could say what was ticking.
 * Now there is one clock (§ THE CLOCK, below) and every rhythm is a tick on it: never two
 * runs of one tick at once (a slow job is skipped, not stacked), a throw recorded and never
 * escaping, nothing holding the process open, one boot-run rule for the machine that was
 * off when its moment came, and one face that says what is on the clock. One fix fixes all.
 *
 * The rest of this file is the first thing built ON those rails:
 *
 * The owner's word is **Cron jobs**. A job is one request — the words that will be
 * delivered — addressed to one session of an ACTIVE team by name, or to whoever leads it
 * (`to: lead`), on a schedule that is one-time or repeating. Ronin is always on, so the
 * server checks every team's list once a minute and delivers what is due through the SAME
 * door every other message takes (src/message-queue.ts): the dial is honoured, a session
 * that cannot take input right now gets it queued, and the Messages tab shows it like any
 * other line. Nothing here births a session or a team (owner, 2026-09-03): a job whose
 * session is gone is reported as such and left standing.
 *
 * THE LIST IS THE OWNER'S — one Markdown file per team in the `jikan` store, the house's
 * `## id` + `- **key:** value` shape, hand-editable, kept across upgrades. Two writers
 * share it — the server's tick and the agent's tool — so every write takes a directory
 * lock and rewrites the file whole; the tick re-reads before every run.
 *
 * MISSED IS ONCE, NEVER A BACKLOG. `next_run` is stored beside the job. If Ronin was down
 * when a job was due, the next tick sees a `next_run` in the past and fires it once, then
 * computes the next one from now. A one-time job is `done` after it fires.
 *
 * THE TIMING WORDS — the owner's, compiled to the same thing a cron line says:
 *
 *   once 2026-09-04 08:00            one time, local clock; `at …` is the same
 *   daily 08:00 · weekdays 08:00     every day / Monday to Friday, at that time
 *   weekly mon 08:00                 one day a week (mon … sun, or a list: mon,thu)
 *   monthly 1 09:00                  one day of the month
 *   hourly · every 30m · every 2h    on a period, from when it was set
 *   0 8 * * 1-5                      a five-field cron line, when the words are not enough
 */
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { entryValue, splitSections } from './catalog.js';
import { storeDir } from './stores.js';

/* ======================================================================================
 * THE CLOCK — every timed thing in the house rides this, and nothing else sets a timer.
 * ====================================================================================== */

export interface Tick {
  /** A house name: `message_queue`, `tomodachi`, `jikan`. */
  name: string;
  everyMs: number;
  run: () => Promise<void>;
  /** Run once this many ms after start, before the first period elapses. Omit for none. */
  atBoot?: number;
}

export interface TickState {
  name: string;
  everyMs: number;
  running: boolean;
  runs: number;
  last_started: string;
  last_finished: string;
  /** '' while it has never failed; the last error's message otherwise, cleared on a clean run. */
  last_error: string;
}

const onTheClock = new Map<string, { tick: Tick; state: TickState; timers: NodeJS.Timeout[] }>();


async function runOnce(entry: { tick: Tick; state: TickState }): Promise<void> {
  const { tick, state } = entry;
  if (state.running) return; // a slow job is skipped this period, never stacked
  state.running = true;
  state.last_started = new Date().toISOString();
  try {
    await tick.run();
    state.last_error = '';
  } catch (e) {
    state.last_error = String((e as Error)?.message ?? e).slice(0, 200);
  } finally {
    state.running = false;
    state.runs += 1;
    state.last_finished = new Date().toISOString();
  }
}

/**
 * Put a tick on JIKAN's clock. Returns the stop. A second tick of the same name replaces
 * the first (its timers stopped), so a module may be restarted in a test without leaking.
 */
export function onClock(tick: Tick): () => void {
  offClock(tick.name);
  const state: TickState = { name: tick.name, everyMs: tick.everyMs, running: false, runs: 0, last_started: '', last_finished: '', last_error: '' };
  const entry = { tick, state, timers: [] as NodeJS.Timeout[] };
  const interval = setInterval(() => { void runOnce(entry); }, tick.everyMs);
  interval.unref();
  entry.timers.push(interval);
  if (tick.atBoot !== undefined) {
    const boot = setTimeout(() => { void runOnce(entry); }, tick.atBoot);
    boot.unref();
    entry.timers.push(boot);
  }
  onTheClock.set(tick.name, entry);
  return () => offClock(tick.name);
}

export function offClock(name: string): void {
  const entry = onTheClock.get(name);
  if (!entry) return;
  for (const timer of entry.timers) clearTimeout(timer);
  onTheClock.delete(name);
}

/** The clock's face: every tick on it, as it stands — what the Cron jobs tab shows as alive. */
export const clockFace = (): TickState[] => [...onTheClock.values()].map((e) => ({ ...e.state }));

/* ======================================================================================
 * SCHEDULED REQUESTS — the Cron jobs, on the clock above.
 * ====================================================================================== */

export type JobState = 'active' | 'paused' | 'done';

export interface Job {
  id: string;
  /** The words delivered, exactly. */
  request: string;
  /** A session name, or `lead` for whoever is designated to lead the team when it fires. */
  to: string;
  /** The timing words as written. */
  when: string;
  state: JobState;
  /** Who asked: a session name, or `owner`. */
  by: string;
  created: string;
  /** ISO, or '' — the tick fires when this is at or before now. */
  next_run: string;
  last_run: string;
  /** What the last run came to: `delivered` · `queued` · `refused: …`. */
  last_outcome: string;
  runs: number;
}

/* ---------- timing ---------- */

export type Spec =
  | { kind: 'once'; at: number }
  | { kind: 'every'; ms: number }
  | { kind: 'cron'; minute: Set<number>; hour: Set<number>; dom: Set<number>; month: Set<number>; dow: Set<number>; domAny: boolean; dowAny: boolean };

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function field(raw: string, min: number, max: number, names: string[] = []): Set<number> | null {
  const out = new Set<number>();
  const value = (s: string): number => {
    const i = names.indexOf(s.toLowerCase().slice(0, 3));
    if (i !== -1) return names === DAYS ? i : i + 1;
    const n = Number(s);
    return Number.isInteger(n) ? n : NaN;
  };
  for (const part of raw.split(',')) {
    const m = /^(\*|[a-z0-9]+(?:-[a-z0-9]+)?)(?:\/(\d+))?$/i.exec(part.trim());
    if (!m) return null;
    const step = m[2] ? Number(m[2]) : 1;
    if (!(step >= 1)) return null;
    let lo = min;
    let hi = max;
    if (m[1] !== '*') {
      const [a, b] = m[1].split('-');
      lo = value(a);
      hi = b === undefined ? (m[2] ? max : lo) : value(b);
      if (Number.isNaN(lo) || Number.isNaN(hi)) return null;
      if (names === DAYS && lo === 7) lo = 0;
      if (names === DAYS && hi === 7) hi = 0;
      if (lo < min || hi > max || lo > hi) return null;
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out.size ? out : null;
}

function cron(line: string): Spec | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const minute = field(parts[0], 0, 59);
  const hour = field(parts[1], 0, 23);
  const dom = field(parts[2], 1, 31);
  const month = field(parts[3], 1, 12, MONTHS);
  const dow = field(parts[4], 0, 7, DAYS);
  if (!minute || !hour || !dom || !month || !dow) return null;
  return { kind: 'cron', minute, hour, dom, month, dow, domAny: parts[2] === '*', dowAny: parts[4] === '*' };
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const clock = (s: string): { h: number; m: number } | null => {
  const m = HHMM.exec(s);
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
};

/** The timing words → a spec, or null when they are not timing words. Local clock. */
export function parseWhen(raw: string): Spec | null {
  const words = raw.trim().replace(/\s+/g, ' ');
  const lower = words.toLowerCase();
  let m: RegExpExecArray | null;
  if ((m = /^(?:once|at) (\d{4}-\d{2}-\d{2})(?:[ t](\d{1,2}:\d{2}))?$/i.exec(words))) {
    const t = clock(m[2] ?? '00:00');
    if (!t) return null;
    const [y, mo, d] = m[1].split('-').map(Number);
    const at = new Date(y, mo - 1, d, t.h, t.m, 0, 0);
    if (at.getFullYear() !== y || at.getMonth() !== mo - 1 || at.getDate() !== d) return null;
    return { kind: 'once', at: at.getTime() };
  }
  if (lower === 'hourly') return cron('0 * * * *');
  if ((m = /^every (\d+) ?(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/.exec(lower))) {
    const n = Number(m[1]);
    const unit = m[2][0];
    const ms = n * (unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000);
    return n >= 1 && ms >= 60_000 ? { kind: 'every', ms } : null;
  }
  if ((m = /^daily (\S+)$/.exec(lower))) { const t = clock(m[1]); return t ? cron(`${t.m} ${t.h} * * *`) : null; }
  if ((m = /^weekdays (\S+)$/.exec(lower))) { const t = clock(m[1]); return t ? cron(`${t.m} ${t.h} * * 1-5`) : null; }
  if ((m = /^weekends (\S+)$/.exec(lower))) { const t = clock(m[1]); return t ? cron(`${t.m} ${t.h} * * 0,6`) : null; }
  if ((m = /^weekly ([a-z,]+) (\S+)$/.exec(lower))) { const t = clock(m[2]); return t ? cron(`${t.m} ${t.h} * * ${m[1]}`) : null; }
  if ((m = /^monthly (\d{1,2}) (\S+)$/.exec(lower))) { const t = clock(m[2]); return t ? cron(`${t.m} ${t.h} ${m[1]} * *`) : null; }
  return cron(words);
}

const matches = (s: Extract<Spec, { kind: 'cron' }>, d: Date): boolean => {
  if (!s.minute.has(d.getMinutes()) || !s.hour.has(d.getHours()) || !s.month.has(d.getMonth() + 1)) return false;
  const dom = s.dom.has(d.getDate());
  const dow = s.dow.has(d.getDay());
  // Vixie's rule: when both the day-of-month and day-of-week are restricted, either matches.
  if (!s.domAny && !s.dowAny) return dom || dow;
  return dom && dow;
};

/**
 * The first moment strictly after `after` (ms) the spec fires, or null when it never will.
 * A once in the past is null; a period counts from `from` (when the job was set or last ran).
 */
export function nextRun(spec: Spec, after: number, from = after): number | null {
  if (spec.kind === 'once') return spec.at > after ? spec.at : null;
  if (spec.kind === 'every') {
    let t = from + spec.ms;
    while (t <= after) t += spec.ms;
    return t;
  }
  const d = new Date(after);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const limit = after + 366 * 86_400_000;
  while (d.getTime() <= limit) {
    if (!spec.month.has(d.getMonth() + 1)) { d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0, 0, 0); continue; }
    const dayOk = (!spec.domAny && !spec.dowAny) ? (spec.dom.has(d.getDate()) || spec.dow.has(d.getDay())) : (spec.dom.has(d.getDate()) && spec.dow.has(d.getDay()));
    if (!dayOk) { d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); continue; }
    if (!spec.hour.has(d.getHours())) { d.setHours(d.getHours() + 1, 0, 0, 0); continue; }
    if (matches(spec, d)) return d.getTime();
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

/** The timing words, read back for a person: "every weekday at 08:00", "once, 4 Sep 08:00". */
export function describeWhen(raw: string): string {
  const spec = parseWhen(raw);
  if (!spec) return raw;
  if (spec.kind === 'once') return `once, ${new Date(spec.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
  if (spec.kind === 'every') {
    const min = spec.ms / 60_000;
    return min % 1440 === 0 ? `every ${min / 1440} day${min === 1440 ? '' : 's'}` : min % 60 === 0 ? `every ${min / 60} hour${min === 60 ? '' : 's'}` : `every ${min} minutes`;
  }
  return raw.trim();
}

/* ---------- the list ---------- */

const TOKEN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const DIR = () => storeDir('jikan');
const fileOf = (team: string) => path.join(DIR(), `${team}.md`);
export const isValidTeam = (team: string): boolean => TOKEN.test(team);
export const isValidJobId = (id: string): boolean => /^j[a-z0-9]{6}$/.test(id);
const newId = (): string => `j${randomBytes(4).toString('hex').slice(0, 6)}`;

function parseJobs(raw: string): Job[] {
  return splitSections(raw, 'user')
    .filter((s) => isValidJobId(s.name))
    .map((s) => {
      const get = (k: string) => entryValue(s.lines, k);
      const state = get('state');
      return {
        id: s.name,
        request: get('request'),
        to: get('to') || 'lead',
        when: get('when'),
        state: state === 'paused' || state === 'done' ? state : 'active',
        by: get('by') || 'owner',
        created: get('created'),
        next_run: get('next_run'),
        last_run: get('last_run'),
        last_outcome: get('last_outcome'),
        runs: Number(get('runs')) || 0,
      } satisfies Job;
    });
}

function render(team: string, jobs: Job[]): string {
  const head = `# ${team} — scheduled requests (JIKAN)

> Ronin checks this list every minute and delivers what is due to the session named, or
> to whoever leads the team (\`to: lead\`), through the ordinary message door. Hand-edit
> freely: \`state: paused\` holds a job, \`state: active\` releases it, deleting the block
> removes it. \`next_run\` is Ronin's and is recomputed when \`when\` changes.
`;
  const one = (j: Job) => [
    `## ${j.id}`,
    `- **request:** ${j.request}`,
    `- **to:** ${j.to}`,
    `- **when:** ${j.when}`,
    `- **state:** ${j.state}`,
    `- **by:** ${j.by}`,
    `- **created:** ${j.created}`,
    `- **next_run:** ${j.next_run}`,
    `- **last_run:** ${j.last_run}`,
    `- **last_outcome:** ${j.last_outcome}`,
    `- **runs:** ${j.runs}`,
  ].join('\n');
  return `${head}\n${jobs.map(one).join('\n\n')}\n`.replace(/\n{3,}/g, '\n\n');
}

/** A directory lock the tool and the server share: whoever holds it rewrites the file whole. */
async function locked<T>(team: string, work: () => Promise<T>): Promise<T> {
  await mkdir(DIR(), { recursive: true });
  const lock = path.join(DIR(), `${team}.lock`);
  const started = Date.now();
  for (;;) {
    try {
      await mkdir(lock);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      if (Date.now() - started > 5_000) { await rm(lock, { recursive: true, force: true }); continue; }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  try {
    return await work();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

export async function listJobs(team: string): Promise<Job[]> {
  if (!isValidTeam(team)) return [];
  try {
    return parseJobs(await readFile(fileOf(team), 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

async function writeJobs(team: string, jobs: Job[]): Promise<void> {
  const target = fileOf(team);
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, render(team, jobs), 'utf8');
  await rename(tmp, target);
}

/** Every team with a list. */
export async function listTeamsWithJobs(): Promise<string[]> {
  try {
    return (await readdir(DIR())).filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3)).filter(isValidTeam).sort();
  } catch {
    return [];
  }
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export interface JobDraft { request: unknown; to?: unknown; when: unknown; by?: unknown }

/** Hold a draft to the shape, or throw the one sentence that says what is wrong. */
export function checkDraft(draft: JobDraft, now = Date.now()): { request: string; to: string; when: string; by: string; next_run: string } {
  const request = text(draft.request, 2000);
  if (!request) throw new Error('A job says what the request is.');
  const to = text(draft.to, 64) || 'lead';
  if (to !== 'lead' && !/^[A-Za-z0-9][\w.-]{0,63}$/.test(to)) throw new Error('A job goes to a session by name, or to `lead`.');
  const when = text(draft.when, 120);
  const spec = parseWhen(when);
  if (!spec) throw new Error('Timing is `once 2026-09-04 08:00`, `daily 08:00`, `weekdays 08:00`, `weekly mon 08:00`, `monthly 1 09:00`, `hourly`, `every 30m`, or a five-field cron line.');
  const next = nextRun(spec, now, now);
  if (next === null) throw new Error('That time has already passed.');
  return { request, to, when, by: text(draft.by, 64) || 'owner', next_run: new Date(next).toISOString() };
}

export async function addJob(team: string, draft: JobDraft, now = Date.now()): Promise<Job> {
  if (!isValidTeam(team)) throw new Error('A team name is lowercase letters, digits, _ and -.');
  const held = checkDraft(draft, now);
  const job: Job = { id: newId(), ...held, state: 'active', created: new Date(now).toISOString(), last_run: '', last_outcome: '', runs: 0 };
  await locked(team, async () => { await writeJobs(team, [...(await listJobs(team)), job]); });
  return job;
}

export type JobEdit = Partial<Pick<Job, 'request' | 'to' | 'when' | 'state'>>;

/** Change what a job says, where it goes, when, or whether it is held. `done` is the clock's alone. */
export async function editJob(team: string, id: string, edit: JobEdit, now = Date.now()): Promise<Job> {
  if (!isValidJobId(id)) throw new Error('No such job.');
  return locked(team, async () => {
    const jobs = await listJobs(team);
    const job = jobs.find((j) => j.id === id);
    if (!job) throw new Error('No such job.');
    const next: Job = { ...job };
    if (edit.state !== undefined) {
      if (edit.state !== 'active' && edit.state !== 'paused') throw new Error('A job is set active or paused; done is the clock\'s to say.');
      next.state = edit.state;
    }
    if (edit.request !== undefined || edit.to !== undefined || edit.when !== undefined) {
      const held = checkDraft({ request: edit.request ?? job.request, to: edit.to ?? job.to, when: edit.when ?? job.when, by: job.by }, now);
      next.request = held.request; next.to = held.to;
      if (edit.when !== undefined && held.when !== job.when) { next.when = held.when; next.next_run = held.next_run; }
    }
    // Releasing a held job whose moment passed while it was paused: from now, never a backlog.
    if (next.state === 'active' && job.state !== 'active') {
      const spec = parseWhen(next.when);
      const n = spec ? nextRun(spec, now, now) : null;
      if (n === null) throw new Error('That time has already passed; set a new time.');
      next.next_run = new Date(n).toISOString();
    }
    await writeJobs(team, jobs.map((j) => (j.id === id ? next : j)));
    return next;
  });
}

export async function removeJob(team: string, id: string): Promise<boolean> {
  if (!isValidJobId(id)) return false;
  return locked(team, async () => {
    const jobs = await listJobs(team);
    if (!jobs.some((j) => j.id === id)) return false;
    await writeJobs(team, jobs.filter((j) => j.id !== id));
    return true;
  });
}

/* ---------- the clock ---------- */

export interface TeamSession { name: string; tags: string[]; leads: string[] }

/** What the clock needs from the house — injected so the unit floor never shells tmux. */
export interface Clock {
  now: () => number;
  sessions: () => Promise<TeamSession[]>;
  /** Put the words through the message door; answers delivered or queued (a reason). */
  deliver: (target: string, text: string, from: string) => Promise<'delivered' | 'queued'>;
}

export interface RunOutcome { team: string; id: string; target: string; outcome: string }

/** The line as it lands in the session: the request, and where it came from. */
export const deliveryText = (job: Job): string => `from the schedule (job ${job.id}, set by ${job.by}): ${job.request}`;

/** Resolve `lead` or a name to a live member of the team, or say why not. */
export function resolveTarget(job: Job, team: string, sessions: TeamSession[]): { target: string } | { refused: string } {
  const members = sessions.filter((s) => s.tags.includes(team));
  if (job.to === 'lead') {
    const lead = members.find((s) => s.leads.includes(team));
    return lead ? { target: lead.name } : { refused: `refused: ${team} has no lead right now` };
  }
  const hit = members.find((s) => s.name === job.to);
  return hit ? { target: hit.name } : { refused: `refused: ${job.to} is not a live session on ${team}` };
}

/** Fire one job now, whatever its clock says, and record the outcome. */
export async function runJob(team: string, id: string, clock: Clock): Promise<RunOutcome> {
  return locked(team, async () => {
    const jobs = await listJobs(team);
    const job = jobs.find((j) => j.id === id);
    if (!job) throw new Error('No such job.');
    const out = await fire(team, job, clock);
    await writeJobs(team, jobs.map((j) => (j.id === id ? out.job : j)));
    return out.outcome;
  });
}

async function fire(team: string, job: Job, clock: Clock): Promise<{ job: Job; outcome: RunOutcome }> {
  const now = clock.now();
  const resolved = resolveTarget(job, team, await clock.sessions());
  let outcome: string;
  let target = '';
  if ('refused' in resolved) outcome = resolved.refused;
  else {
    target = resolved.target;
    try {
      outcome = await clock.deliver(target, deliveryText(job), 'Cron jobs');
    } catch (e) {
      outcome = `refused: ${(e as Error).message}`;
    }
  }
  const spec = parseWhen(job.when);
  const next = spec && spec.kind !== 'once' ? nextRun(spec, now, now) : null;
  const after: Job = {
    ...job,
    last_run: new Date(now).toISOString(),
    last_outcome: outcome,
    runs: job.runs + 1,
    next_run: next === null ? '' : new Date(next).toISOString(),
    state: spec?.kind === 'once' || next === null ? 'done' : job.state,
  };
  return { job: after, outcome: { team, id: job.id, target, outcome } };
}

/** One tick: every team's list, every active job whose moment has come. */
export async function tick(clock: Clock): Promise<RunOutcome[]> {
  const outcomes: RunOutcome[] = [];
  for (const team of await listTeamsWithJobs()) {
    await locked(team, async () => {
      const jobs = await listJobs(team);
      let changed = false;
      const after: Job[] = [];
      for (const job of jobs) {
        const due = job.state === 'active' && job.next_run && Date.parse(job.next_run) <= clock.now();
        if (!due) { after.push(job); continue; }
        const out = await fire(team, job, clock);
        after.push(out.job);
        outcomes.push(out.outcome);
        changed = true;
      }
      if (changed) await writeJobs(team, after);
    });
  }
  return outcomes;
}

/** JIKAN on the house clock (src/house-clock.ts): every minute, and once shortly after boot
 *  for the moments that passed while Ronin was down. Returns the stop. */
export function startJikan(clock: Clock, everyMs = 60_000): () => void {
  return onClock({ name: 'jikan', everyMs, atBoot: 5_000, run: async () => { await tick(clock); } });
}
