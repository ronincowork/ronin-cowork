/**
 * JIKAN (時間, "time") — the house's one clock, and the Cron jobs on it.
 *
 * THE CLOCK is the rails for everything timed (owner, 2026-09-03): the message queue's
 * retry, the sessions broadcast, the Tomodachi sweep and the Cron jobs are each a tick on
 * it. A tick is an interval that never overlaps itself and never throws out. That is all.
 *
 * A CRON JOB is a ping, not infrastructure (owner, 2026-09-03: "if it misses one beat, it
 * doesn't matter"). One request, one session (or `lead`), one `due` date. Every minute the
 * clock asks: is anything due at or before now? If yes, deliver it through the ordinary
 * message door and mark it — done for a one-time job, or the next due for a repeat.
 * "Run now" sets `due` to now; it fires at the next tick. The list is one Markdown file
 * per team in the `jikan` store, hand-editable, and the owner's.
 *
 * Timing words:  once 2026-09-04 08:00 · daily 08:00 · weekdays 08:00 · weekly mon 08:00
 *                monthly 1 09:00 · hourly · every 30m · or a five-field cron line
 */
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { entryValue, splitSections } from './catalog.js';
import { storeDir } from './stores.js';

/* ---------- the clock ---------- */

const running = new Set<string>();

/** A rhythm on the house clock: never two runs of one name at once, a throw swallowed, never holds the process open. */
export function onClock(name: string, everyMs: number, run: () => Promise<void>): () => void {
  const timer = setInterval(() => {
    if (running.has(name)) return;
    running.add(name);
    void run().catch(() => {}).finally(() => running.delete(name));
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}

/* ---------- timing words ---------- */

export type Spec = { kind: 'once'; at: number } | { kind: 'every'; ms: number } | { kind: 'cron'; f: Set<number>[]; anyDom: boolean; anyDow: boolean };

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function field(raw: string, min: number, max: number, names: string[] = []): Set<number> | null {
  const out = new Set<number>();
  const value = (s: string): number => { const i = names.indexOf(s.slice(0, 3)); return i !== -1 ? (names === DAYS ? i : i + 1) : Number(s); };
  for (const part of raw.toLowerCase().split(',')) {
    const m = /^(\*|[a-z0-9]+(?:-[a-z0-9]+)?)(?:\/(\d+))?$/.exec(part.trim());
    if (!m) return null;
    const step = m[2] ? Number(m[2]) : 1;
    let [lo, hi] = [min, max];
    if (m[1] !== '*') {
      const [a, b] = m[1].split('-');
      lo = value(a); hi = b === undefined ? (m[2] ? max : lo) : value(b);
      if (names === DAYS) { if (lo === 7) lo = 0; if (hi === 7) hi = 0; }
      if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) return null;
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out.size ? out : null;
}

function cron(line: string): Spec | null {
  const p = line.trim().split(/\s+/);
  if (p.length !== 5) return null;
  const f = [field(p[0], 0, 59), field(p[1], 0, 23), field(p[2], 1, 31), field(p[3], 1, 12, MONTHS), field(p[4], 0, 7, DAYS)];
  return f.every(Boolean) ? { kind: 'cron', f: f as Set<number>[], anyDom: p[2] === '*', anyDow: p[4] === '*' } : null;
}

const clock = (s: string | undefined): { h: number; m: number } | null => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s ?? '');
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
};

/** The timing words → a spec, or null. Local clock. */
export function parseWhen(raw: string): Spec | null {
  const words = raw.trim().replace(/\s+/g, ' ');
  const lower = words.toLowerCase();
  let m: RegExpExecArray | null;
  if ((m = /^(?:once|at) (\d{4})-(\d{2})-(\d{2})(?:[ t](\d{1,2}:\d{2}))?$/i.exec(words))) {
    const t = clock(m[4] ?? '00:00');
    if (!t) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), t.h, t.m);
    return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? { kind: 'once', at: d.getTime() } : null;
  }
  if (lower === 'hourly') return cron('0 * * * *');
  if ((m = /^every (\d+) ?(m|min|mins|minutes?|h|hrs?|hours?|d|days?)$/.exec(lower))) {
    const ms = Number(m[1]) * (m[2][0] === 'm' ? 60_000 : m[2][0] === 'h' ? 3_600_000 : 86_400_000);
    return ms >= 60_000 ? { kind: 'every', ms } : null;
  }
  const at = (t: { h: number; m: number } | null, rest: string) => (t ? cron(`${t.m} ${t.h} ${rest}`) : null);
  if ((m = /^daily (\S+)$/.exec(lower))) return at(clock(m[1]), '* * *');
  if ((m = /^weekdays (\S+)$/.exec(lower))) return at(clock(m[1]), '* * 1-5');
  if ((m = /^weekends (\S+)$/.exec(lower))) return at(clock(m[1]), '* * 0,6');
  if ((m = /^weekly ([a-z,]+) (\S+)$/.exec(lower))) return at(clock(m[2]), `* * ${m[1]}`);
  if ((m = /^monthly (\d{1,2}) (\S+)$/.exec(lower))) return at(clock(m[2]), `${m[1]} * *`);
  return cron(words);
}

/** The first moment strictly after `after` the spec means, or null (a once that has passed). */
export function nextRun(spec: Spec, after: number): number | null {
  if (spec.kind === 'once') return spec.at > after ? spec.at : null;
  if (spec.kind === 'every') return after + spec.ms;
  const [minute, hour, dom, month, dow] = spec.f;
  const d = new Date(after);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    const dayOk = spec.anyDom || spec.anyDow ? dom.has(d.getDate()) && dow.has(d.getDay()) : dom.has(d.getDate()) || dow.has(d.getDay());
    if (!month.has(d.getMonth() + 1)) { d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0); continue; }
    if (!dayOk) { d.setDate(d.getDate() + 1); d.setHours(0, 0); continue; }
    if (!hour.has(d.getHours())) { d.setHours(d.getHours() + 1, 0); continue; }
    if (minute.has(d.getMinutes())) return d.getTime();
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

/* ---------- the list ---------- */

export type JobState = 'active' | 'paused' | 'done';

export interface Job {
  id: string;
  /** The words delivered, exactly. */
  request: string;
  /** A session name on the team, or `lead`. */
  to: string;
  /** The timing words as written. */
  when: string;
  /** ISO — fires at the first tick at or after this. '' when done or paused. */
  due: string;
  state: JobState;
  /** The last firing: `<iso> delivered` · `<iso> queued` · `<iso> refused: …`, or ''. */
  last: string;
  by: string;
}

const TOKEN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const isValidTeam = (team: string): boolean => TOKEN.test(team);
export const isValidJobId = (id: string): boolean => /^j[a-z0-9]{6}$/.test(id);
const fileOf = (team: string) => path.join(storeDir('jikan'), `${team}.md`);

function parseJobs(raw: string): Job[] {
  return splitSections(raw, 'user').filter((s) => isValidJobId(s.name)).map((s) => {
    const get = (k: string) => entryValue(s.lines, k);
    const state = get('state');
    return { id: s.name, request: get('request'), to: get('to') || 'lead', when: get('when'), due: get('due'), state: state === 'paused' || state === 'done' ? state : 'active', last: get('last'), by: get('by') || 'owner' };
  });
}

const render = (team: string, jobs: Job[]): string =>
  `# ${team} — Cron jobs (JIKAN)\n\n> Ronin checks every minute and delivers what is due to the session named, or to whoever leads the team. Hand-edit freely: \`state: paused\` holds a job; \`due\` is when it next fires.\n\n${jobs.map((j) =>
    `## ${j.id}\n- **request:** ${j.request}\n- **to:** ${j.to}\n- **when:** ${j.when}\n- **due:** ${j.due}\n- **state:** ${j.state}\n- **last:** ${j.last}\n- **by:** ${j.by}\n`).join('\n')}`;

export async function listJobs(team: string): Promise<Job[]> {
  if (!isValidTeam(team)) return [];
  try { return parseJobs(await readFile(fileOf(team), 'utf8')); } catch { return []; }
}

async function writeJobs(team: string, jobs: Job[]): Promise<void> {
  await mkdir(storeDir('jikan'), { recursive: true });
  const target = fileOf(team);
  await writeFile(`${target}.tmp`, render(team, jobs), 'utf8');
  await rename(`${target}.tmp`, target);
}

const teamsWithJobs = async (): Promise<string[]> => {
  try { return (await readdir(storeDir('jikan'))).filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3)).filter(isValidTeam); } catch { return []; }
};

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const iso = (ms: number): string => new Date(ms).toISOString();

export interface JobDraft { request: unknown; to?: unknown; when: unknown; by?: unknown }

export async function addJob(team: string, draft: JobDraft, now = Date.now()): Promise<Job> {
  if (!isValidTeam(team)) throw new Error('A team name is lowercase letters, digits, _ and -.');
  const request = text(draft.request, 2000);
  if (!request) throw new Error('A job says what the request is.');
  const to = text(draft.to, 64) || 'lead';
  if (to !== 'lead' && !/^[A-Za-z0-9][\w.-]{0,63}$/.test(to)) throw new Error('A job goes to a session by name, or to `lead`.');
  const when = text(draft.when, 120);
  const spec = parseWhen(when);
  if (!spec) throw new Error('Timing is `once 2026-09-04 08:00`, `daily 08:00`, `weekdays 08:00`, `weekly mon 08:00`, `monthly 1 09:00`, `hourly`, `every 30m`, or a five-field cron line.');
  const next = nextRun(spec, now);
  if (next === null) throw new Error('That time has already passed.');
  const job: Job = { id: `j${randomBytes(4).toString('hex').slice(0, 6)}`, request, to, when, due: iso(next), state: 'active', last: '', by: text(draft.by, 64) || 'owner' };
  await writeJobs(team, [...(await listJobs(team)), job]);
  return job;
}

/** `active` (from now), `paused` (held), or `now` (due at the next tick). */
export async function setJob(team: string, id: string, verb: 'active' | 'paused' | 'now', now = Date.now()): Promise<Job> {
  const jobs = await listJobs(team);
  const job = jobs.find((j) => j.id === id);
  if (!job) throw new Error('No such job.');
  const spec = parseWhen(job.when);
  const next = spec ? nextRun(spec, now) : null;
  const out: Job = verb === 'paused'
    ? { ...job, state: 'paused', due: '' }
    : verb === 'now'
      ? { ...job, state: 'active', due: iso(now) }
      : { ...job, state: 'active', due: next === null ? '' : iso(next) };
  if (verb === 'active' && next === null) throw new Error('That time has already passed; set a new time.');
  await writeJobs(team, jobs.map((j) => (j.id === id ? out : j)));
  return out;
}

export async function removeJob(team: string, id: string): Promise<boolean> {
  const jobs = await listJobs(team);
  if (!jobs.some((j) => j.id === id)) return false;
  await writeJobs(team, jobs.filter((j) => j.id !== id));
  return true;
}

/* ---------- the tick ---------- */

export interface TeamSession { name: string; tags: string[]; leads: string[] }
export interface Door {
  now: () => number;
  sessions: () => Promise<TeamSession[]>;
  deliver: (target: string, text: string) => Promise<'delivered' | 'queued'>;
}

export const deliveryText = (job: Job): string => `from the schedule (job ${job.id}, set by ${job.by}): ${job.request}`;

async function fire(team: string, job: Job, door: Door): Promise<Job> {
  const now = door.now();
  const members = (await door.sessions()).filter((s) => s.tags.includes(team));
  const target = job.to === 'lead' ? members.find((s) => s.leads.includes(team))?.name : members.find((s) => s.name === job.to)?.name;
  let outcome: string;
  if (!target) outcome = job.to === 'lead' ? `refused: ${team} has no lead` : `refused: ${job.to} is not on ${team}`;
  else outcome = await door.deliver(target, deliveryText(job)).catch((e: Error) => `refused: ${e.message}`);
  const spec = parseWhen(job.when);
  const next = spec && spec.kind !== 'once' ? nextRun(spec, now) : null;
  return { ...job, last: `${iso(now)} ${outcome}`, due: next === null ? '' : iso(next), state: next === null ? 'done' : job.state };
}

/** One tick: anything due at or before now, on any team, fires. */
export async function tick(door: Door): Promise<Job[]> {
  const fired: Job[] = [];
  for (const team of await teamsWithJobs()) {
    const jobs = await listJobs(team);
    const after: Job[] = [];
    let changed = false;
    for (const job of jobs) {
      if (job.state !== 'active' || !job.due || Date.parse(job.due) > door.now()) { after.push(job); continue; }
      const out = await fire(team, job, door);
      after.push(out);
      fired.push(out);
      changed = true;
    }
    if (changed) await writeJobs(team, after);
  }
  return fired;
}

/** The Cron jobs on the clock: every minute. Returns the stop. */
export const startJikan = (door: Door, everyMs = 60_000): (() => void) => onClock('jikan', everyMs, () => tick(door).then(() => {}));
