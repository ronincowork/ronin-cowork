import { config } from './machine-settings.js';
import { ensureTmuxServer } from './host-guard.js';
import { removeHandoff } from './handoff.js';
import { assertUnderMax } from './machine-state.js';
import { CONTROL_OPT, RIREKI_OPT, newSessionArgs } from './session-args.js';
export type { Control } from './session-args.js';
import type { Control } from './session-args.js';
import { tmux } from './tmux-client.js';

export interface SessionInfo {
  name: string;
  title: string;
  windows: number;
  attached: boolean;
  created: number;
  hasNote: boolean;
  tags: string[];
  leads: string[];
  control: Control;
  key: string;
  agent: string;
  campaign_id: string;
  activity: number;
  /** RIREKI's dial: false when the session was born with Ronin Services off — no tape, no unlocked views. */
  rireki: boolean;
}

const NOTE_OPT = '@ronin_note';
const TITLE_OPT = '@ronin-title';

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

export async function listSessions(): Promise<SessionInfo[]> {
  try {
    const stdout = await tmux.run([
      'list-sessions',
      '-F',
      `#{session_name}\t#{${TITLE_OPT}}\t#{session_windows}\t#{?session_attached,1,0}\t#{session_created}\t#{?${NOTE_OPT},1,0}\t#{${TAGS_OPT}}\t#{${LEAD_OPT}}\t#{@ronin-control}\t#{@ronin-key}\t#{${AGENT_OPT}}\t#{${CAMPAIGN_OPT}}\t#{${RIREKI_OPT}}\t#{window_activity}`,
    ]);
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, title, windows, attached, created, hasNote, tags, leads, control, key, agent, campaign, rireki, activity] = line.split('\t');
        return {
          name,
          title: title?.trim() || '',
          windows: Number(windows) || 0,
          attached: attached === '1',
          created: Number(created) || 0,
          hasNote: hasNote === '1',
          tags: parseTags(tags),
          leads: parseTags(leads),
          control: control === 'user' || control === 'read' ? (control as Control) : 'write',
          key: key?.trim() || `${name}-${Number(created) || 0}`,
          agent: agent?.trim() || '',
          campaign_id: campaign?.trim() || '',
          rireki: rireki?.trim() !== 'off',
          activity: Number(activity) || 0,
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

export interface CreateOpts {
  agent?: boolean;
  control?: Control;
  exempt?: boolean;
  argv?: readonly string[];
  env?: Readonly<Record<string, string>>;
  key?: string;
  rireki?: boolean;
}

export async function createSession(name: string, dir?: string, opts: CreateOpts = {}): Promise<void> {
  if (opts.agent !== false && !opts.exempt) await assertUnderMax();
  await ensureTmuxServer();
  const cwd = dir || config.newSessionDir;
  const build = (withDir: boolean) => newSessionArgs(name, {
    cwd: withDir ? cwd : undefined,
    env: opts.env,
    argv: opts.argv,
    control: opts.control,
    key: opts.key,
    rireki: opts.rireki,
  });
  try {
    await tmux.run(build(true));
  } catch (err) {
    if (cwd) {
      await tmux.run(build(false));
    } else {
      throw err;
    }
  }
}

export async function killSession(name: string): Promise<void> {
  try {
    await tmux.run(['kill-session', '-t', exactSession(name)]);
  } catch {
  }
}

async function groupedSessionTargets(name: string): Promise<Set<string>> {
  const targets = new Set<string>([name]);
  try {
    const stdout = await tmux.run(['list-sessions', '-F', '#{session_name}\t#{session_group}']);
    const rows = stdout.split('\n').filter(Boolean).map((line) => {
      const [sname, group] = line.split('\t');
      return { sname, group: group || '' };
    });
    const self = rows.find((row) => row.sname === name);
    if (self?.group) for (const row of rows) if (row.group === self.group) targets.add(row.sname);
  } catch {}
  return targets;
}

export async function killSessionTree(name: string): Promise<void> {
  await removeHandoff(name);
  const targets = await groupedSessionTargets(name);
  for (const s of targets) await killSession(s);
}

export async function stopSessionTree(name: string): Promise<void> {
  const targets = await groupedSessionTargets(name);
  for (const target of targets) await killSession(target);
  const survivors: string[] = [];
  for (const target of targets) if (await sessionExists(target)) survivors.push(target);
  if (survivors.length) throw new Error(`Could not stop tmux session tree: ${survivors.join(', ')}`);
}

export async function sessionRuntime(name: string): Promise<{ cwd: string; pid: number; command: string; agent: string }> {
  const stdout = await tmux.run([
    'display-message', '-p', '-t', exactPane(name),
    `#{pane_current_path}\t#{pane_pid}\t#{pane_start_command}\t#{${AGENT_OPT}}`,
  ]);
  const [cwd, pid, command, agent] = stdout.replace(/\r?\n$/, '').split('\t');
  return { cwd: cwd || '', pid: Number(pid) || 0, command: command || '', agent: agent || '' };
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

export async function getNote(name: string): Promise<string> {
  try {
    const stdout = await tmux.run(['show-options', '-t', exactPane(name), '-qv', NOTE_OPT]);
    return stdout.replace(/\n$/, ''); // show-options appends one trailing newline
  } catch {
    return '';
  }
}

export async function setNote(name: string, text: string): Promise<void> {
  if (text.trim()) {
    await tmux.run(['set-option', '-t', exactPane(name), NOTE_OPT, text]);
  } else {
    await tmux.run(['set-option', '-t', exactPane(name), '-u', NOTE_OPT]).catch(() => {});
  }
}

export async function getTags(name: string): Promise<string[]> {
  try {
    const stdout = await tmux.run(['show-options', '-t', exactPane(name), '-qv', TAGS_OPT]);
    return parseTags(stdout);
  } catch {
    return [];
  }
}

export async function setTags(name: string, tags: string[]): Promise<string[]> {
  const clean = parseTags(tags.join(','));
  if (clean.length) {
    await tmux.run(['set-option', '-t', exactPane(name), TAGS_OPT, clean.join(',')]);
  } else {
    await tmux.run(['set-option', '-t', exactPane(name), '-u', TAGS_OPT]).catch(() => {});
  }
  return clean;
}

export async function getLeads(name: string): Promise<string[]> {
  try {
    const stdout = await tmux.run(['show-options', '-t', exactPane(name), '-qv', LEAD_OPT]);
    return parseTags(stdout);
  } catch {
    return [];
  }
}

export async function setLeads(name: string, teams: string[]): Promise<string[]> {
  const clean = parseTags(teams.join(','));
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

export async function projectRootsOfSessions(): Promise<Record<string, string>> {
  try {
    const stdout = await tmux.run(['list-sessions', '-F', `#{session_name}\t#{${PROJECT_ROOT_OPT}}`]);
    const out: Record<string, string> = {};
    for (const line of stdout.split('\n').filter(Boolean)) {
      const [name, root] = line.split('\t');
      if (name && !name.startsWith('grid_')) out[name] = (root ?? '').trim();
    }
    return out;
  } catch {
    return {};
  }
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

export async function getControl(name: string): Promise<Control> {
  try {
    const stdout = await tmux.run(['show-options', '-t', exactPane(name), '-qv', CONTROL_OPT]);
    const v = stdout.trim();
    return v === 'user' || v === 'read' ? v : 'write';
  } catch {
    return 'write';
  }
}

export async function setControl(name: string, control: Control): Promise<void> {
  await tmux.run(['set-option', '-t', exactPane(name), CONTROL_OPT, control]);
}

export { capturePane, cleanupViewers, createViewer, jumpToBottom, sendRawKeys } from './viewer.js';
