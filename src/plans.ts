/**
 * PLANS (KAN-256; docs/using-ronin/planning.md). A plan is written once with the user,
 * then ordered. The tool steers nothing: the planning doc and the
 * briefs say the flow (the plan isn't rewritten: the work runs on the epics). It lives on the Workspace, at
 * `<ronin_lab>/<campaign>/<workspace>/plans/<name>.md` unless the Workspace names another place
 * (`plans: { location, path }`, src/workspaces.ts). No Agent sees the path: everything goes through
 * `ronin_bin/plan` over /api/plans (src/routes/plans-api.ts).
 *
 * The header is the tool's, the line under the title: `Status: <Draft|Ordered> · <date> · <by>`.
 * Where the plans folder is in a Git repository, each write and order commits that one file
 * only, and pushes once when the branch has an upstream.
 */
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from './spawn-broker.js';
import { discoverExecutable } from './agents.js';
import { rootDir } from './resources.js';
import { listProjectRoots, type ProjectRootInfo } from './project-roots.js';
import { listTeamRosters } from './team-rosters.js';
import { listSessions } from './tmux.js';
import { listWorkspaces, readWorkspace, type Workspace, type WorkspacePlans } from './workspaces.js';

export class PlanRefused extends Error {}
export class PlanMissing extends Error {}
export class PlanBadInput extends Error {}

export const PLAN_STATUSES = ['Draft', 'Ordered'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export interface PlanHeader { status: PlanStatus; date: string; by: string }
export interface PlanRow extends PlanHeader { name: string; workspace: string; title: string }
export interface Plan extends PlanRow { text: string; path: string }
/** Where a Workspace's plans are: the folder, and what it is named by. */
export interface PlansPlace { dir: string; location: string; path: string; recommended: boolean }

export const isValidPlanName = (s: string): boolean => /^[a-z0-9][a-z0-9-]{0,63}$/.test(s);

const DEFAULT_LOCATION = 'ronin_lab';
const today = (): string => new Date().toISOString().slice(0, 10);
const HEADER = /^Status: (Draft|Ordered) · (\S+) · (.+)$/;
export const headerLine = (h: PlanHeader): string => `Status: ${h.status} · ${h.date} · ${h.by}`;

/* ---------- where ---------- */

const rootsByName = async (): Promise<Map<string, ProjectRootInfo>> => new Map((await listProjectRoots()).map((root) => [root.name, root]));

/** A subfolder named on the Workspace: relative, inside its Location. */
export function cleanSubpath(sub: string): string {
  const parts = String(sub ?? '').trim().replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) throw new PlanBadInput(`"${sub}" leaves its Location; name a folder inside it.`);
  return parts.join('/');
}

/** The default: Ronin Lab (Setup makes it), then the Campaign, the Workspace, plans. */
export const defaultPlansPath = (campaign: string, workspace: string): string => `${campaign}/${workspace}/plans`;

export async function plansPlace(campaign: string, workspace: string, plans?: WorkspacePlans | null): Promise<PlansPlace> {
  const roots = await rootsByName();
  if (plans?.location) {
    const root = roots.get(plans.location);
    if (!root) throw new PlanMissing(`The Workspace ${workspace} keeps its plans in ${plans.location}, which is not a Workspace Folder now.`);
    const sub = cleanSubpath(plans.path);
    return { dir: path.join(root.dir, sub), location: plans.location, path: sub, recommended: false };
  }
  const lab = roots.get(DEFAULT_LOCATION)?.dir ?? path.join(rootDir('user'), DEFAULT_LOCATION);
  const sub = defaultPlansPath(campaign, workspace);
  return { dir: path.join(lab, sub), location: DEFAULT_LOCATION, path: sub, recommended: true };
}

/** The folder a Workspace's plans are in, its own place or the default. */
export async function plansDir(campaign: string, workspace: string): Promise<string> {
  const w = await readWorkspace(campaign, workspace);
  return (await plansPlace(campaign, workspace, w?.plans)).dir;
}

/* ---------- which Workspace ---------- */

export interface Caller { campaign: string; by: string }

/** The Workspace a command means: the one named, else the Workspace of the caller's Team when it is
 * on exactly one Team with a Workspace (a lead's Teams included); otherwise it asks for one by name. */
export async function whichWorkspace(caller: Caller, stated?: string): Promise<Workspace> {
  const named = String(stated ?? '').trim();
  if (named) {
    const w = await readWorkspace(caller.campaign, named);
    if (!w) throw new PlanMissing(`No Workspace ${named} in ${caller.campaign}. ${await choose(caller.campaign)}`);
    return w;
  }
  const session = (await listSessions()).find((one) => one.name === caller.by);
  const teams = new Set([...(session?.tags ?? []), ...(session?.leads ?? [])]);
  const rosters = (await listTeamRosters()).filter((roster) => teams.has(roster.name) && roster.state !== 'archived'
    && roster.workspace && (!roster.campaign_id || roster.campaign_id === caller.campaign));
  const spaces = [...new Set(rosters.map((roster) => roster.workspace))];
  if (spaces.length === 1) {
    const w = await readWorkspace(caller.campaign, spaces[0]!);
    if (w) return w;
  }
  if (spaces.length > 1) throw new PlanRefused(`Your Teams are in ${spaces.sort().join(', ')}; name one with --workspace <name>.`);
  throw new PlanRefused(`No Team of yours has a Workspace; name one with --workspace <name>. ${await choose(caller.campaign)}`);
}

async function choose(campaign: string): Promise<string> {
  const names = (await listWorkspaces(campaign)).map((w) => w.name);
  return names.length ? `Workspaces: ${names.join(', ')}.` : 'This Campaign has no Workspaces yet.';
}

/** `<name>` in the Workspace the caller means, or `<workspace>/<name>` anywhere in its Campaign. */
export async function planTarget(caller: Caller, ref: string, stated?: string): Promise<{ workspace: Workspace; name: string }> {
  const given = String(ref ?? '').trim().replace(/^plan:/, '');
  const [first, second, ...rest] = given.split('/');
  if (rest.length || !first) throw new PlanBadInput(`A plan is <name> or <workspace>/<name>: "${ref}".`);
  const name = second ?? first;
  if (!isValidPlanName(name)) throw new PlanBadInput(`A plan name is lowercase letters, digits and -: "${name}".`);
  return { workspace: await whichWorkspace(caller, second !== undefined ? first : stated), name };
}

/* ---------- the file ---------- */

export function parsePlan(text: string): { title: string; header: PlanHeader | null } {
  const lines = text.split('\n');
  const title = (lines.find((line) => /^# /.test(line)) ?? '').replace(/^# +/, '').trim();
  const at = lines.findIndex((line) => HEADER.test(line.trim()));
  const m = at === -1 ? null : HEADER.exec(lines[at]!.trim());
  return { title, header: m ? { status: m[1] as PlanStatus, date: m[2]!, by: m[3]!.trim() } : null };
}

/** The writer's text with the tool's header under its title: a writer's own Status line goes. */
export function withHeader(text: string, header: PlanHeader, name: string): string {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n').filter((line) => !/^Status:/.test(line.trim()));
  let at = lines.findIndex((line) => /^# /.test(line));
  if (at === -1) { lines.unshift(`# ${name}`, ''); at = 0; }
  const rest = lines.slice(at + 1);
  while (rest.length && !rest[0]!.trim()) rest.shift();
  const body = [...lines.slice(0, at + 1), '', headerLine(header), '', ...rest].join('\n').replace(/\n*$/, '\n');
  return body;
}

const fileOf = (dir: string, name: string): string => path.join(dir, `${name}.md`);

async function readAt(dir: string, workspace: string, name: string): Promise<Plan | null> {
  const at = fileOf(dir, name);
  let text: string;
  try { text = await readFile(at, 'utf8'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  const { title, header } = parsePlan(text);
  return { name, workspace, title, text, path: at, ...(header ?? { status: 'Draft', date: '', by: '' }) };
}

/* ---------- history ---------- */

async function gitAt(dir: string): Promise<{ git: string; top: string } | null> {
  const git = await discoverExecutable('git');
  if (!git) return null;
  try {
    const { stdout } = await execFile(git, ['-C', dir, 'rev-parse', '--show-toplevel'], { timeout: 4000 });
    const top = stdout.trim();
    return top ? { git, top } : null;
  } catch { return null; }
}

const say = (e: unknown): string => String((e as { stderr?: unknown })?.stderr || (e as Error)?.message || e).trim().split('\n').pop()!.slice(0, 300);

/** Commit these files only (`git commit -- <paths>`), never anything else staged in a shared
 * checkout, and push once when the branch has an upstream. Answers what happened, '' outside Git. */
export async function commitOnly(dir: string, files: string[], message: string): Promise<string> {
  const repo = await gitAt(dir);
  if (!repo || !files.length) return '';
  const { git, top } = repo;
  const run = (args: string[], timeout = 10_000) => execFile(git, ['-C', top, ...args], { timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  // A file that is neither on disk nor tracked (an untracked plan moved away) has nothing to commit.
  const tracked = new Set((await run(['ls-files', '--', ...files.map((file) => path.relative(top, file))]).then((r) => r.stdout, () => '')).split('\n').filter(Boolean));
  const rel = (await Promise.all(files.map(async (file) => {
    const at = path.relative(top, file);
    return tracked.has(at) || await stat(file).then(() => true, () => false) ? at : '';
  }))).filter(Boolean);
  if (!rel.length) return '';
  try {
    await run(['add', '-A', '--', ...rel]);
    const changed = await run(['diff', '--cached', '--quiet', '--', ...rel]).then(() => false, () => true);
    if (!changed) return '';
    const named = await run(['config', 'user.email']).then((r) => !!r.stdout.trim(), () => false);
    await run([...(named ? [] : ['-c', 'user.name=Ronin', '-c', 'user.email=ronin@localhost']), 'commit', '-q', '-m', message, '--', ...rel]);
  } catch (e) { return `Not committed: ${say(e)}`; }
  const upstream = await run(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).then((r) => r.stdout.trim(), () => '');
  if (!upstream) return 'Committed.';
  try { await run(['push', '-q'], 30_000); return `Committed and pushed to ${upstream}.`; }
  catch (e) { return `Committed; the push to ${upstream} failed: ${say(e)}`; }
}

/* ---------- the acts ---------- */

let chain: Promise<unknown> = Promise.resolve();
/** One plan write at a time in this process. */
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.catch(() => undefined);
  return next;
}

export interface PlanAnswer { line: string; plan: Plan; history: string }

const answer = (line: string, plan: Plan, history: string): PlanAnswer => ({ line, plan, history });

async function placeOf(w: Workspace): Promise<PlansPlace> { return plansPlace(w.campaign_id, w.name, w.plans); }

export async function listPlans(w: Workspace, status?: string): Promise<PlanRow[]> {
  const wanted = String(status ?? '').trim();
  if (wanted && !PLAN_STATUSES.includes(wanted as PlanStatus)) throw new PlanBadInput(`A plan's status is ${PLAN_STATUSES.join(', ')}: "${wanted}".`);
  const { dir } = await placeOf(w);
  const names = (await readdir(dir).catch(() => [] as string[])).filter((file) => file.endsWith('.md')).map((file) => file.slice(0, -3)).filter(isValidPlanName).sort();
  const plans = (await Promise.all(names.map((name) => readAt(dir, w.name, name)))).filter((plan): plan is Plan => !!plan);
  return plans.filter((plan) => !wanted || plan.status === wanted).map(({ name, workspace, title, status: s, date, by }) => ({ name, workspace, title, status: s, date, by }));
}

export async function readPlan(w: Workspace, name: string): Promise<Plan> {
  const plan = await readAt((await placeOf(w)).dir, w.name, name);
  if (!plan) throw new PlanMissing(`No plan ${w.name}/${name}. plan ls lists them.`);
  return plan;
}

/** Where `plan:<workspace>/<name>` is now, in the item's Campaign; null when it no longer resolves. */
export async function resolvePlanRef(campaign: string, ref: string): Promise<string | null> {
  const [workspace, name, ...rest] = String(ref ?? '').replace(/^plan:/, '').split('/');
  if (!workspace || !name || rest.length || !isValidPlanName(name)) return null;
  try {
    const w = await readWorkspace(campaign, workspace);
    if (!w) return null;
    const at = fileOf((await placeOf(w)).dir, name);
    return (await stat(at)).isFile() ? at : null;
  } catch { return null; }
}

export function writePlan(w: Workspace, name: string, text: string, by: string): Promise<PlanAnswer> {
  if (!String(text ?? '').trim()) throw new PlanBadInput('The plan is empty: give its text with --file <path> or on stdin. plan read --template is the blank.');
  return serial(async () => {
    const { dir } = await placeOf(w);
    // A write keeps the status the plan has; a new plan is a Draft.
    const was = await readAt(dir, w.name, name);
    const status = was?.status ?? 'Draft';
    await mkdir(dir, { recursive: true });
    const at = fileOf(dir, name);
    await writeFile(at, withHeader(text, { status, date: today(), by }, name), 'utf8');
    const history = await commitOnly(dir, [at], `plan ${name}: write`);
    return answer(`${was ? 'Rewrote' : 'Wrote'} ${w.name}/${name} (${status}).`, (await readAt(dir, w.name, name))!, history);
  });
}

export function orderPlan(w: Workspace, name: string, by: string): Promise<PlanAnswer> {
  return serial(async () => {
    const plan = await readPlan(w, name);
    const { dir } = await placeOf(w);
    await writeFile(plan.path, withHeader(plan.text, { status: 'Ordered', date: today(), by }, name), 'utf8');
    const history = await commitOnly(dir, [plan.path], `plan ${name}: order`);
    return answer(`Ordered ${w.name}/${name}. Make each epic from its row and item attach <epic> plan:${w.name}/${name}.`, (await readAt(dir, w.name, name))!, history);
  });
}

/* ---------- the template ---------- */

const PRODUCT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLANNING_DOC = path.join(PRODUCT, 'docs', 'using-ronin', 'planning.md');

/** The blank: the one markdown block under "The template" in docs/using-ronin/planning.md. */
export async function planTemplate(doc = PLANNING_DOC): Promise<string> {
  const text = await readFile(doc, 'utf8');
  const from = text.search(/^## +The template\b/m);
  const block = from === -1 ? null : /```markdown\n([\s\S]*?)\n```/.exec(text.slice(from));
  if (!block) throw new PlanMissing(`${path.basename(doc)} has no template block.`);
  return `${block[1]}\n`;
}

/* ---------- a changed place ---------- */

const moveFile = async (from: string, to: string): Promise<void> => {
  try { await rename(from, to); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await copyFile(from, to); await unlink(from);
  }
};

/** A Workspace's plans move with its Plans place: stopped, moving nothing, when a name already exists
 * at the new place (one plan file must not overwrite another); else every plan file moves, a commit on each side where there is Git. */
export function movePlans(campaign: string, workspace: string, from: WorkspacePlans | null | undefined, to: WorkspacePlans | null | undefined): Promise<{ moved: string[]; history: string[] }> {
  return serial(async () => {
    const old = await plansPlace(campaign, workspace, from).catch(() => null);
    const next = await plansPlace(campaign, workspace, to);
    if (!old || path.resolve(old.dir) === path.resolve(next.dir)) return { moved: [], history: [] };
    const files = (await readdir(old.dir).catch(() => [] as string[])).filter((file) => file.endsWith('.md'));
    if (!files.length) return { moved: [], history: [] };
    const there = new Set(await readdir(next.dir).catch(() => [] as string[]));
    const clashes = files.filter((file) => there.has(file));
    if (clashes.length) throw new PlanRefused(`Not saved: ${next.location}/${next.path} already has ${clashes.map((file) => file.slice(0, -3)).join(', ')}. Rename or remove them there first.`);
    await mkdir(next.dir, { recursive: true });
    for (const file of files) await moveFile(path.join(old.dir, file), path.join(next.dir, file));
    const history = [
      await commitOnly(old.dir, files.map((file) => path.join(old.dir, file)), `plans: moved to ${next.location}/${next.path}`),
      await commitOnly(next.dir, files.map((file) => path.join(next.dir, file)), `plans: moved from ${old.location}/${old.path}`),
    ].filter(Boolean);
    return { moved: files.map((file) => file.slice(0, -3)), history };
  });
}
