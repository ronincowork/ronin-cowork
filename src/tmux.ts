import { processLaunch } from './launch-binding.js';
import path from 'node:path';
import { config } from './machine-settings.js';
import { ensureTmuxServer } from './host-guard.js';
import { removeHandoff } from './handoff.js';
import { assertUnderMax } from './machine-state.js';
import { RIREKI_OPT, newSessionArgs } from './session-args.js';
import { tmux } from './tmux-client.js';
import { listSeats, readSeat, setSeatField, type Seat } from './seats.js';
import { isPaneScope, liveScopeOps, recordScope, sessionFolders, stoppable, withNested } from './agent-scope.js';

export interface SessionIdentity {
  sessionType: string;
  cli: string;
  provider: string;
  model: string;
}

export interface SessionInfo {
  name: string;
  title: string;
  windows: number;
  attached: boolean;
  created: number;
  tags: string[];
  leads: string[];
  key: string;
  agent: string;
  identity?: SessionIdentity;
  campaign_id: string;
  activity: number;
  /** RIREKI's dial: false when the session was born with Ronin Services off — no tape, no unlocked views. */
  rireki: boolean;
  /** READY (KAN-694): when the Agent last ran `ready`, saying it is about to speak to the person (ISO, '' never).
   *  A chat that honours it draws only what follows; nothing is refused without it. */
  ready: string;
  /** A seat with no terminal (a daimyo, src/seats.ts): no pane to read, type into or end. */
  seat?: true;
}

const TITLE_OPT = '@ronin-title';
const READY_OPT = '@ronin-ready';

const TAGS_OPT = '@ronin-tags';

const LEAD_OPT = '@ronin-lead';

const TAG_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function parseTags(raw: string): string[] {
  return [...new Set(
    String(raw || '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => TAG_RE.test(t) && t.length <= 32),
  )].sort();
}

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function isValidName(name: string): boolean {
  return typeof name === 'string' && name.length > 0 && name.length <= 64 && NAME_RE.test(name);
}

export const exactSession = (name: string): string => `=${name}`;
export const exactPane = (name: string): string => `=${name}:`;

function noServer(err: unknown): boolean {
  const s = String((err as { stderr?: string })?.stderr ?? (err as Error)?.message ?? '');
  return s.includes('no server running') || s.includes('error connecting');
}

export async function sessionDir(name: string): Promise<string> {
  try {
    const stdout = await tmux.run(['display-message', '-t', exactPane(name), '-p', '#{pane_current_path}']);
    return stdout.trim();
  } catch {
    return '';
  }
}

/** A seat with no terminal (src/seats.ts) is listed with the Agents: notices, holds and the
 *  roster find it the same way. Only a terminal's own operations know it has none. */
const seatInfo = (seat: Seat): SessionInfo => ({
  name: seat.name, title: `${seat.name} · daimyo`, windows: 0, attached: false,
  created: Math.floor(Date.parse(seat.since) / 1000) || 0, tags: parseTags(seat.teams.join(',')), leads: parseTags(seat.leads.join(',')),
  // The key sessionKey answers for a name with no pane, so its work record (and holds) are found.
  key: seat.name, agent: 'daimyo', campaign_id: '', activity: 0, rireki: false, ready: '', seat: true,
});

export async function listSessions(): Promise<SessionInfo[]> {
  const [panes, seats] = await Promise.all([tmuxSessions(), listSeats()]);
  const taken = new Set(panes.map((s) => s.name));
  return [...panes, ...seats.filter((s) => !taken.has(s.name)).map(seatInfo)].sort((a, b) => a.name.localeCompare(b.name));
}

async function tmuxSessions(): Promise<SessionInfo[]> {
  try {
    const stdout = await tmux.run([
      'list-sessions',
      '-F',
      `#{session_name}\t#{${TITLE_OPT}}\t#{session_windows}\t#{?session_attached,1,0}\t#{session_created}\t#{${TAGS_OPT}}\t#{${LEAD_OPT}}\t#{@ronin-key}\t#{${AGENT_OPT}}\t#{${CAMPAIGN_OPT}}\t#{${RIREKI_OPT}}\t#{window_activity}\t#{@ronin-identity}\t#{${READY_OPT}}`,
    ]);
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, title, windows, attached, created, tags, leads, key, agent, campaign, rireki, activity, identity, ready] = line.split('\t');
        return {
          name,
          title: title?.trim() || '',
          windows: Number(windows) || 0,
          attached: attached === '1',
          created: Number(created) || 0,
          tags: parseTags(tags),
          leads: parseTags(leads),
          key: key?.trim() || `${name}-${Number(created) || 0}`,
          agent: agent?.trim() || '',
          identity: parseSessionIdentity(identity),
          campaign_id: campaign?.trim() || '',
          rireki: rireki?.trim() !== 'off',
          activity: Number(activity) || 0,
          ready: ready?.trim() || '',
        };
      })
      .filter((s) => !s.name.startsWith(config.viewerPrefix))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    if (noServer(err)) return [];
    throw err;
  }
}

export async function sessionExists(name: string): Promise<boolean> {
  if (await readSeat(name)) return true;
  try {
    await tmux.run(['has-session', '-t', `=${name}`]);
    return true;
  } catch {
    return false;
  }
}

export async function setSessionTitle(name: string, title: string): Promise<void> {
  const clean = title.trim();
  if (clean.length > 80 || /[\r\n\t]/.test(clean)) throw new Error('Agent title must be one line of 80 characters or fewer.');
  if (clean) await tmux.run(['set-option', '-t', exactPane(name), TITLE_OPT, clean]);
  else await tmux.run(['set-option', '-t', exactPane(name), '-u', TITLE_OPT]).catch(() => {});
}

/** The ready mark (KAN-694): this moment, on the session, the way its title is kept. */
export async function setSessionReady(name: string, at = new Date().toISOString()): Promise<string> {
  await tmux.run(['set-option', '-t', exactPane(name), READY_OPT, at]);
  return at;
}

export interface CreateOpts {
  agent?: boolean;
  exempt?: boolean;
  argv?: readonly string[];
  env?: Readonly<Record<string, string>>;
  key?: string;
  rireki?: boolean;
  /** House seats with a security-significant cwd must fail rather than fall back. */
  strictCwd?: boolean;
  cli?: string;
  team?: string;
  resume?: boolean;
}

export async function createSession(name: string, dir?: string, opts: CreateOpts = {}): Promise<void> {
  if (opts.agent !== false && !opts.exempt) await assertUnderMax();
  await ensureTmuxServer();
  const cwd = dir || config.newSessionDir;
  await processLaunch({ name, key: opts.key, cli: opts.cli ?? path.basename(opts.argv?.[0] ?? ''),
    argv: opts.argv ?? [], cwd, team: opts.team, env: opts.env, resume: opts.resume }, async (argv, env, identity) => {
    const build = (withDir: boolean) => newSessionArgs(name, {
      cwd: withDir ? cwd : undefined, env, argv, key: identity.key, rireki: opts.rireki,
    });
    try { await tmux.run(build(true)); }
    catch (err) {
      if (cwd && !opts.strictCwd) await tmux.run(build(false));
      else throw err;
    }
    if (identity.providerSession) await setProviderSessionId(name, identity.providerSession);
    await ownScope(name, identity.key);
  });
}

const SCOPE_OPT = '@ronin-scope';

/** Record the pane's systemd scope, put the memory ceiling on it, and stop it when the pane
 * dies: everything the Agent starts lives and ends there (src/agent-scope.ts). */
async function ownScope(name: string, key: string): Promise<void> {
  try {
    const pid = Number(await tmux.run(['display-message', '-p', '-t', exactPane(name), '#{pane_pid}']));
    const unit = await liveScopeOps.scopeOf(pid);
    if (!unit) return;
    await tmux.run(['set-option', '-t', exactPane(name), SCOPE_OPT, unit]);
    await recordScope(key, unit);
    const stop = `run-shell -b 'systemctl --user stop --no-block -- ${unit}'`;
    await tmux.run(['set-hook', '-t', exactPane(name), 'pane-died', stop]);
    await tmux.run(['set-hook', '-t', exactPane(name), 'pane-exited', stop]);
    await liveScopeOps.limit(unit);
  } catch (e) {
    console.error(`[scope] ${name}:`, (e as Error).message);
  }
}

/** The scopes of a session's panes (recorded at launch, and each pane's own now), and of every
 * process running from its session folder: a helper its CLI detached into a scope of its own. */
async function sessionScopes(name: string, timeoutMs?: number): Promise<string[]> {
  const units = new Set<string>();
  const key = (await tmux.run(['show-options', '-t', exactPane(name), '-qv', '@ronin-key'], { timeoutMs }).catch(() => '')).trim();
  if (key) for (const unit of await liveScopeOps.folderScopes(sessionFolders(key))) units.add(unit);
  const recorded = await tmux.run(['show-options', '-t', exactPane(name), '-qv', SCOPE_OPT], { timeoutMs }).catch(() => '');
  if (isPaneScope(recorded.trim())) units.add(recorded.trim());
  const pids = await tmux.run(['list-panes', '-s', '-t', exactSession(name), '-F', '#{pane_pid}'], { timeoutMs }).catch(() => '');
  for (const pid of pids.split('\n').filter(Boolean)) {
    const unit = await liveScopeOps.scopeOf(Number(pid));
    if (unit) units.add(unit);
  }
  return [...units];
}

/** Pids of every live pane on our server. */
export async function livePanePids(timeoutMs?: number): Promise<number[]> {
  const rows = await tmux.run(['list-panes', '-a', '-F', '#{pane_pid}\t#{pane_dead}'], { timeoutMs }).catch(() => '');
  return rows.split('\n').filter(Boolean).map((row) => row.split('\t'))
    .filter(([, dead]) => dead !== '1').map(([pid]) => Number(pid)).filter(Boolean);
}

/** Keys of sessions with a live pane: a session whose CLI has exited is not running anything. */
export async function liveSessionKeys(timeoutMs?: number): Promise<string[]> {
  const rows = await tmux.run(['list-panes', '-a', '-F', '#{@ronin-key}\t#{session_name}\t#{session_created}\t#{pane_dead}'], { timeoutMs }).catch(() => '');
  return [...new Set(rows.split('\n').filter(Boolean).map((row) => row.split('\t'))
    .filter(([, , , dead]) => dead !== '1').map(([key, name, born]) => key || `${name}-${born}`))];
}

/** After a kill: stop the session's scopes, and its rigs' panes, that no live pane still uses. */
async function stopScopes(units: string[], timeoutMs?: number): Promise<void> {
  if (!units.length) return;
  try { await liveScopeOps.stop(await stoppable(await withNested(units), await livePanePids(timeoutMs))); }
  catch (e) { console.error('[scope] stop:', (e as Error).message); }
}

/** A pane died (its CLI exited; remain-on-exit keeps the pane): stop what it left running.
 * The session stays, for a person to read or end. */
export async function stopLeftovers(name: string): Promise<void> {
  await stopScopes(await sessionScopes(name));
}

const PANE_DEAD_PREFIX = 'pane-dead';

/** Sessions whose pane is newly dead, from the pane-dead subscription's value. */
export function panesDied(value: string, last: Map<string, string>): string[] {
  const died: string[] = [];
  const now = new Map<string, string>();
  for (const entry of value.split(',')) {
    const at = entry.lastIndexOf('=');
    if (at <= 0) continue;
    const name = entry.slice(0, at);
    const dead = entry.slice(at + 1);
    now.set(name, dead);
    if (dead.includes('1') && last.get(name) !== dead) died.push(name);
  }
  last.clear();
  for (const [name, dead] of now) last.set(name, dead);
  return died;
}

/** Ride tmux's pane-dead push: each newly dead pane's leftovers are stopped, and `died` is told
 * (src/pane-death.ts: the Agent reads Stopped and its leads hear). */
export function stopLeftoversOnPaneDeath(died: (name: string) => Promise<void> = async () => {}): void {
  const last = new Map<string, string>();
  let first = true;
  tmux.on('subscription', (n) => {
    if (!n.subscription?.startsWith(PANE_DEAD_PREFIX)) return;
    const dead = panesDied(n.value ?? '', last);
    if (first) { first = false; return; } // the start sweep owns what was dead before we looked
    for (const name of dead) {
      if (name.startsWith(config.viewerPrefix)) continue;
      void stopLeftovers(name);
      void died(name).catch((e) => console.error(`[pane-death] ${name}:`, e));
    }
  });
}

interface StopOptions { signal?: AbortSignal; timeoutMs?: number }

export async function killSession(name: string, opts: StopOptions = {}): Promise<void> {
  opts.signal?.throwIfAborted();
  const viewer = name.startsWith(config.viewerPrefix);
  const units = viewer ? [] : await sessionScopes(name, opts.timeoutMs);
  try {
    await tmux.run(['kill-session', '-t', exactSession(name)], { timeoutMs: opts.timeoutMs });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
  }
  await stopScopes(units, opts.timeoutMs);
}

async function groupedSessionTargets(name: string, opts: StopOptions = {}): Promise<Set<string>> {
  opts.signal?.throwIfAborted();
  const targets = new Set<string>([name]);
  try {
    const stdout = await tmux.run(['list-sessions', '-F', '#{session_name}\t#{session_group}'], { timeoutMs: opts.timeoutMs });
    const rows = stdout.split('\n').filter(Boolean).map((line) => {
      const [sname, group] = line.split('\t');
      return { sname, group: group || '' };
    });
    const self = rows.find((row) => row.sname === name);
    if (self?.group) for (const row of rows) if (row.group === self.group) targets.add(row.sname);
  } catch {}
  return targets;
}

export async function killSessionTree(name: string, opts: StopOptions = {}): Promise<void> {
  opts.signal?.throwIfAborted();
  await removeHandoff(name);
  const targets = await groupedSessionTargets(name, opts);
  for (const s of targets) {
    opts.signal?.throwIfAborted();
    await killSession(s, opts);
  }
}

export async function stopSessionTree(name: string, opts: StopOptions = {}): Promise<void> {
  const targets = await groupedSessionTargets(name, opts);
  for (const target of targets) {
    opts.signal?.throwIfAborted();
    await killSession(target, opts);
  }
  const survivors: string[] = [];
  for (const target of targets) {
    opts.signal?.throwIfAborted();
    if (await sessionExists(target)) survivors.push(target);
  }
  if (survivors.length) throw new Error(`Could not stop tmux session tree: ${survivors.join(', ')}`);
}

export async function sessionRuntime(name: string): Promise<{ cwd: string; pid: number; command: string; agent: string }> {
  const stdout = await tmux.run([
    'display-message', '-p', '-t', exactPane(name),
    `#{pane_current_path}\t#{pane_pid}\t#{pane_start_command}\t#{${AGENT_OPT}}\t#{pane_start_path}`,
  ]);
  const [cwd, pid, command, agent, startPath] = stdout.replace(/\r?\n$/, '').split('\t');
  // A dead pane has no current path; it started where the Agent works.
  return { cwd: cwd || startPath || '', pid: Number(pid) || 0, command: command || '', agent: agent || '' };
}

export async function setSessionKey(name: string, key: string): Promise<void> {
  await tmux.run(['set-option', '-t', exactPane(name), '@ronin-key', key]);
}

export async function sessionOfPane(paneId: string): Promise<string | null> {
  try {
    const stdout = await tmux.run(['list-panes', '-a', '-F', '#{pane_id}\t#{session_name}']);
    const owners = stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t'))
      .filter(([pid]) => pid === paneId)
      .map(([, sname]) => sname);
    if (!owners.length) return null;
    return owners.find((s) => !s.startsWith(config.viewerPrefix)) ?? owners[0];
  } catch {
    return null; // no server, no panes — nothing to end
  }
}

export async function getTags(name: string): Promise<string[]> {
  const seat = await readSeat(name);
  if (seat) return parseTags(seat.teams.join(','));
  try {
    const stdout = await tmux.run(['show-options', '-t', exactPane(name), '-qv', TAGS_OPT]);
    return parseTags(stdout);
  } catch {
    return [];
  }
}

export async function setTags(name: string, tags: string[]): Promise<string[]> {
  const clean = parseTags(tags.join(','));
  if (await readSeat(name)) { await setSeatField(name, 'teams', clean); return clean; }
  if (clean.length) {
    await tmux.run(['set-option', '-t', exactPane(name), TAGS_OPT, clean.join(',')]);
  } else {
    await tmux.run(['set-option', '-t', exactPane(name), '-u', TAGS_OPT]).catch(() => {});
  }
  return clean;
}

export async function getLeads(name: string): Promise<string[]> {
  const seat = await readSeat(name);
  if (seat) return parseTags(seat.leads.join(','));
  try {
    const stdout = await tmux.run(['show-options', '-t', exactPane(name), '-qv', LEAD_OPT]);
    return parseTags(stdout);
  } catch {
    return [];
  }
}

export async function setLeads(name: string, teams: string[]): Promise<string[]> {
  const clean = parseTags(teams.join(','));
  if (await readSeat(name)) { await setSeatField(name, 'leads', clean); return clean; }
  if (clean.length) {
    await tmux.run(['set-option', '-t', exactPane(name), LEAD_OPT, clean.join(',')]);
  } else {
    await tmux.run(['set-option', '-t', exactPane(name), '-u', LEAD_OPT]).catch(() => {});
  }
  return clean;
}

export async function teamsInPlay(): Promise<string[]> {
  return [...new Set((await listSessions()).flatMap((s) => s.tags))].sort();
}

const WIPEBOARDS_OPT = '@ronin-wipeboards';

export async function getWipeboards(name: string): Promise<string[]> {
  try {
    const stdout = await tmux.run(['show-options', '-t', exactPane(name), '-qv', WIPEBOARDS_OPT]);
    return parseTags(stdout);
  } catch {
    return [];
  }
}

export async function setWipeboards(name: string, boards: string[]): Promise<string[]> {
  const clean = parseTags(boards.join(','));
  if (clean.length) {
    await tmux.run(['set-option', '-t', exactPane(name), WIPEBOARDS_OPT, clean.join(',')]);
  } else {
    await tmux.run(['set-option', '-t', exactPane(name), '-u', WIPEBOARDS_OPT]).catch(() => {});
  }
  return clean;
}

const PROJECT_ROOT_OPT = '@ronin-project_root';

export async function getProjectRoot(name: string): Promise<string> {
  try {
    const stdout = await tmux.run(['show-options', '-t', exactPane(name), '-qv', PROJECT_ROOT_OPT]);
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function setProjectRoot(name: string, root: string): Promise<string> {
  const clean = root.trim();
  if (clean) {
    await tmux.run(['set-option', '-t', exactPane(name), PROJECT_ROOT_OPT, clean]);
  } else {
    await tmux.run(['set-option', '-t', exactPane(name), '-u', PROJECT_ROOT_OPT]).catch(() => {});
  }
  return clean;
}

const CAMPAIGN_OPT = '@ronin-campaign';

export async function getCampaign(name: string): Promise<string> {
  try {
    const stdout = await tmux.run(['show-options', '-t', exactPane(name), '-qv', CAMPAIGN_OPT]);
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function setCampaign(name: string, campaign: string): Promise<string> {
  const clean = campaign.trim();
  if (clean) {
    await tmux.run(['set-option', '-t', exactPane(name), CAMPAIGN_OPT, clean]);
  } else {
    await tmux.run(['set-option', '-t', exactPane(name), '-u', CAMPAIGN_OPT]).catch(() => {});
  }
  return clean;
}

const AGENT_OPT = '@ronin-agent';
const PROVIDER_SESSION_OPT = '@ronin-provider-session';

export async function setLaunchStamp(name: string, agent: string): Promise<void> {
  if (!agent.trim()) return;
  await tmux.run(['set-option', '-t', exactPane(name), AGENT_OPT, agent.trim()]).catch(() => {});
}

export async function setProviderSessionId(name: string, id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid provider session id.');
  await tmux.run(['set-option', '-t', exactPane(name), PROVIDER_SESSION_OPT, id]);
}

export async function getProviderSessionId(name: string): Promise<string> {
  try {
    const stdout = await tmux.run(['show-options', '-t', exactPane(name), '-qv', PROVIDER_SESSION_OPT]);
    const id = stdout.trim();
    return /^[0-9a-f-]{36}$/i.test(id) ? id : '';
  } catch {
    return '';
  }
}

export { applyTileInput, capturePane, cleanupViewers, createViewer, jumpToBottom, paneMouseState, sendRawKeys, tileInputAction } from './viewer.js';

/** Launch metadata, never inferred from the terminal screen or a model label. */
export function parseSessionIdentity(raw: string | undefined): SessionIdentity | undefined {
  try {
    const value = JSON.parse(raw || 'null');
    if (value && ['sessionType', 'cli', 'provider', 'model'].every((key) => typeof value[key] === 'string')) return value;
  } catch {}
  return undefined;
}
export async function setSessionIdentity(name: string, identity: SessionIdentity): Promise<void> {
  await tmux.run(['set-option', '-t', exactPane(name), '@ronin-identity', JSON.stringify(identity)]);
  await setLaunchStamp(name, identity.cli);
}
