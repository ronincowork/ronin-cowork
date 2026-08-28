import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';
import { ensureTmuxServer } from './host-guard.js';
import { removeHandoff } from './handoff.js';
import { assertUnderMax } from './user-config.js';

const pexec = promisify(execFile);

export interface SessionInfo {
  name: string;
  windows: number;
  attached: boolean;
  created: number;
  /** Whether this session has a post-it note attached (stored as a tmux user option). */
  hasNote: boolean;
  /** Teams this session belongs to (see TAGS_OPT). Empty = a rōnin. */
  tags: string[];
  /** Teams this session is DESIGNATED to lead (see LEAD_OPT). Always ⊆ its teams. */
  leads: string[];
  /** The dial, off the same single exec — 'write' when unset, as everywhere. */
  control: Control;
  /** The durable identity (`<name>-<created-epoch>`), stamped copy preferred — off the
   *  same exec, so callers stop paying one `sessionKey` subprocess per session. */
  key: string;
  /** CLI selected for this Agent, stamped at birth (codex, claude, gemini…). */
  agent: string;
}

/** tmux user option holding a session's post-it note. Lives and dies with the session. */
const NOTE_OPT = '@ronin_note';

/** tmux SERVER option holding Ronin's own base URL, for tools running inside a pane. */
const URL_OPT = '@ronin-url';

/**
 * tmux user option holding a session's GROUP TAGS — comma-separated, e.g. `kojinsa,review`.
 * A "group" is just the set of sessions carrying the same tag; there is no group object
 * anywhere, which is the point: nothing to create, nothing to garbage-collect, and a tag
 * dies with its session. Multi-valued on purpose — a session can be in several groups.
 *
 * NOTE the near-collision: tmux has its own `session_group` (grouped sessions — that's
 * what browser viewers use, see killSessionTree). Unrelated. Ours is always spelled
 * "tags" in code; "group" is only the user- and agent-facing word for a set of them.
 */
const TAGS_OPT = '@ronin-tags';

/**
 * THE 人, UN-RETIRED (owner, 2026-08-23, R35). `@ronin-lead` holds the teams this
 * session is hand-marked as LEADING — a designation, never a derivation. It was retired
 * on the theory that the work already implied the coordinator (the QuarterBack); the
 * owner has since separated the two facts — the secretary can be team lead — so the
 * designation returns to the option that was built for it. Comma-separated team names,
 * beside the tags and dying with the session, exactly like membership.
 */
const LEAD_OPT = '@ronin-lead';

/** Tags are addresses an agent types, so keep them boring: lowercase, no separators. */
const TAG_RE = /^[a-z0-9][a-z0-9_-]*$/;

/** Parse the stored option into a clean, de-duplicated, sorted tag list. */
export function parseTags(raw: string): string[] {
  return [...new Set(
    String(raw || '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => TAG_RE.test(t) && t.length <= 32),
  )].sort();
}

/** tmux session names can't contain '.' or ':' and we keep them shell-safe. */
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function isValidName(name: string): boolean {
  return typeof name === 'string' && name.length > 0 && name.length <= 64 && NAME_RE.test(name);
}

/**
 * A session name as an EXACT tmux target. Never pass a bare name to `-t`.
 *
 * `-t name` is a PATTERN, not an identity: tmux tries exact, then PREFIX, then fnmatch.
 * So a name that no longer exists silently resolves to a NEIGHBOUR, exit code 0. Measured
 * on tmux 3.6 with `beta` dead and `betagamma` alive:
 *
 *   kill-session   -t beta          ->  killed betagamma
 *   display-message -t beta         ->  betagamma's @ronin-key
 *   set-option     -t beta @k PWNED ->  wrote it onto betagamma
 *
 * Which is every kind of damage at once: the wrong session ended, the wrong directory
 * rm -rf'd (deleteSession keys off that answer), the wrong session's dial/tags stamped,
 * and a lead's send-keys typed into someone else's agent.
 *
 * "The caller checked it exists" is not a defence — sessions here die on their own
 * between two commands, because the OOM killer takes one whenever the box runs tight
 * (three on 2026-08-13). The window is real and it is being hit.
 *
 * TWO forms, because tmux parses the two target kinds differently, and getting this
 * wrong fails closed but loudly ("can't find pane: =beta"):
 *   - `exactSession` -> `=name`   where a target-SESSION is expected: kill-session,
 *     new-session -t, attach -t.
 *   - `exactPane`    -> `=name:`  where a target-PANE or -WINDOW is expected: send-keys,
 *     capture-pane, display-message, show-options, set-option, pipe-pane. The trailing
 *     colon is what makes tmux read the string as `session:` rather than as a pane spec.
 */
export const exactSession = (name: string): string => `=${name}`;
export const exactPane = (name: string): string => `=${name}:`;

function noServer(err: unknown): boolean {
  const s = String((err as { stderr?: string })?.stderr ?? (err as Error)?.message ?? '');
  return s.includes('no server running') || s.includes('error connecting');
}

/** Real, user-facing sessions (viewer sessions are filtered out). */
/** Where a session is working — used to expand a "point at that one" reference. */
export async function sessionDir(name: string): Promise<string> {
  try {
    const { stdout } = await pexec('tmux', ['display-message', '-t', exactPane(name), '-p', '#{pane_current_path}']);
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function listSessions(): Promise<SessionInfo[]> {
  try {
    // ONE EXEC CARRIES EVERYTHING. The wipeboard surfaces used to pay one subprocess
    // per session for the dial and another for the key — ~15 spawns per 2s browser poll
    // on a 22-session box, which is how a GET reached 2.9 seconds (owner, 2026-08-25:
    // "deathly slow"). The list format is the one place tmux answers for every session
    // at once, so the dial and the key ride it.
    const { stdout } = await pexec('tmux', [
      'list-sessions',
      '-F',
      `#{session_name}\t#{session_windows}\t#{?session_attached,1,0}\t#{session_created}\t#{?${NOTE_OPT},1,0}\t#{${TAGS_OPT}}\t#{${LEAD_OPT}}\t#{@ronin-control}\t#{@ronin-key}\t#{${AGENT_OPT}}`,
    ]);
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, windows, attached, created, hasNote, tags, leads, control, key, agent] = line.split('\t');
        return {
          name,
          windows: Number(windows) || 0,
          attached: attached === '1',
          created: Number(created) || 0,
          hasNote: hasNote === '1',
          tags: parseTags(tags),
          leads: parseTags(leads),
          control: control === 'user' || control === 'read' ? (control as Control) : 'write',
          key: key?.trim() || `${name}-${Number(created) || 0}`,
          agent: agent?.trim() || '',
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
    // `=` forces an exact match — without it, `has-session -t kojin` would
    // prefix-match an existing `kojinsa` and wrongly report the name as taken.
    await pexec('tmux', ['has-session', '-t', `=${name}`]);
    return true;
  } catch {
    return false;
  }
}

/** Rename one real tmux session exactly. Ronin identity and team options move with it. */
export async function renameSession(name: string, next: string): Promise<void> {
  await pexec('tmux', ['rename-session', '-t', exactSession(name), next]);
}

/**
 * `agent` — will something be launched into this pane, or is it a bare shell?
 *
 * Only agent sessions are refused at the session max. A shell is a few MB of bash and is
 * never what fills a box, so `OpenShell` and the tile picker keep working at the ceiling —
 * you can always get a terminal to go and end something. A shell still COUNTS toward the
 * number, because the roster shows one figure and it has to be the one you can see.
 */
export interface CreateOpts {
  agent?: boolean;
  /**
   * `cap: exempt` in the resolved launch profile — create it even at the max. It still COUNTS
   * afterwards, so the NEXT spawn is the one refused; this exempts the spawn, never the
   * census. Nothing is evicted to make room.
   *
   * Distinct from `agent: false`, which happens to skip the check too: that one says
   * "a shell is not what fills a box". This one says "refusing this would be wrong even
   * though the box is full", and the only kind carrying it is the assistant you ask for
   * help. Two reasons, two flags — one flag would make the comment on either a lie.
   */
  exempt?: boolean;
  /**
   * THE PROCESS THE TILE RUNS, as argv — the vendor binary and its arguments, absolute
   * path first. Given, the CLI IS the tile: tmux execs it directly, there is no shell in
   * the tile, and so there is nothing for a machine to type at. Absent, the tile is the
   * login shell, which is what `OpenShell` is for and is unchanged.
   *
   * MEASURED, not assumed (2026-08-20): `tmux new-session -- prog a b` execs prog with
   * those arguments LITERALLY — an argument containing `; $USER \`date\` & "q"` arrived
   * intact, and the pane's parent is the tmux server with no shell between. That is what
   * makes it safe to hand an agent its whole brief on the command line.
   */
  argv?: readonly string[];
}

export async function createSession(name: string, dir?: string, opts: CreateOpts = {}): Promise<void> {
  // THE SESSION MAX, guarded here rather than at the route, because `/api/launch` has two
  // handlers — launch_job falls through to launch_bare when the body carries no
  // launch axis — and a check in the first one is bypassed by omitting a field. Both
  // funnel through this function. Note it execs new-session TWICE (below, and again
  // without -c on failure); guarding the execs would be two edits and one future bug.
  //
  // Browser tiles are unaffected: they are made by createViewer(), a different function,
  // so grouped `grid_*` viewers are never counted and never refused.
  if (opts.agent !== false && !opts.exempt) await assertUnderMax();
  // Never be the process that forks the tmux server — it would land in our systemd
  // cgroup and our next restart would kill every session. See docs/tmux-server-cgroup.md.
  await ensureTmuxServer();
  // An explicit dir (a role's, from ROLES.md) wins over the configured default.
  const cwd = dir || config.newSessionDir;
  /**
   * REMAIN-ON-EXIT, SET IN THE SAME TMUX INVOCATION as the session is created — a chained
   * command, not a second call, because a CLI that dies on its first line would otherwise
   * take the session with it before the option landed. That is not a hypothetical: it is
   * the measured case (codex, on a trust dialog it could not read). With this, a dead CLI
   * leaves its last screen frozen and readable under the session's own name instead of a
   * live shell wearing it, and `#{pane_dead}` says so out loud.
   *
   * Only for a session that runs a CLI. A shell tile that exits is finished, and freezing
   * a dead prompt would leave litter nobody asked for.
   */
  const build = (withDir: boolean) => {
    const a = ['new-session', '-d', '-s', name];
    if (withDir && cwd) a.push('-c', cwd);
    if (opts.argv?.length) a.push('--', ...opts.argv, ';', 'set-option', '-w', '-t', name, 'remain-on-exit', 'on');
    return a;
  };
  try {
    await pexec('tmux', build(true));
  } catch (err) {
    // A missing/inaccessible start-directory makes new-session fail; retry
    // without -c so session creation still works (falls back to ronin's cwd).
    if (cwd) {
      await pexec('tmux', build(false));
    } else {
      throw err;
    }
  }
}

export async function killSession(name: string): Promise<void> {
  try {
    await pexec('tmux', ['kill-session', '-t', exactSession(name)]);
  } catch {
    // already gone — fine
  }
}

async function groupedSessionTargets(name: string): Promise<Set<string>> {
  const targets = new Set<string>([name]);
  try {
    const { stdout } = await pexec('tmux', ['list-sessions', '-F', '#{session_name}\t#{session_group}']);
    const rows = stdout.split('\n').filter(Boolean).map((line) => {
      const [sname, group] = line.split('\t');
      return { sname, group: group || '' };
    });
    const self = rows.find((row) => row.sname === name);
    if (self?.group) for (const row of rows) if (row.group === self.group) targets.add(row.sname);
  } catch {}
  return targets;
}

/**
 * Kill a real session AND every viewer grouped with it. Browser viewers are grouped
 * sessions (created with `new-session -t name`), so they share tmux's session_group;
 * we match on that to find them exactly (no fragile name-prefix guessing). Without
 * this, killing a session leaves its `grid_*` viewers behind.
 *
 * The session's handoff — its birth letter — is removed here too, so it has the same
 * lifetime as the session and as TEGAMI, its living letter. See `src/handoff.ts`; it
 * cannot throw, and the kill proceeds regardless.
 */
export async function killSessionTree(name: string): Promise<void> {
  // Before the kill, while `name` is still meaningful. Never awaited for permission:
  // removeHandoff swallows its own errors precisely so this line cannot block a kill.
  await removeHandoff(name);
  const targets = await groupedSessionTargets(name);
  for (const s of targets) await killSession(s);
}

/** Stop a session and its grouped viewers without applying deletion lifecycle cleanup. */
export async function stopSessionTree(name: string): Promise<void> {
  const targets = await groupedSessionTargets(name);
  for (const target of targets) await killSession(target);
  const survivors: string[] = [];
  for (const target of targets) if (await sessionExists(target)) survivors.push(target);
  if (survivors.length) throw new Error(`Could not stop tmux session tree: ${survivors.join(', ')}`);
}

/** Runtime facts that must be captured before tmux is stopped. */
export async function sessionRuntime(name: string): Promise<{ cwd: string; pid: number; command: string; agent: string }> {
  const { stdout } = await pexec('tmux', [
    'display-message', '-p', '-t', exactPane(name),
    `#{pane_current_path}\t#{pane_pid}\t#{pane_start_command}\t#{${AGENT_OPT}}`,
  ]);
  const [cwd, pid, command, agent] = stdout.replace(/\r?\n$/, '').split('\t');
  return { cwd: cwd || '', pid: Number(pid) || 0, command: command || '', agent: agent || '' };
}

/** Reattach durable Ronin identity to a newly-created runtime. */
export async function setSessionKey(name: string, key: string): Promise<void> {
  await pexec('tmux', ['set-option', '-t', exactPane(name), '@ronin-key', key]);
}

/**
 * The real session a pane belongs to — the one that is not a browser viewer.
 *
 * This is how harakiri stays self-inflicted without anyone naming a session: a caller
 * can only offer the pane it is sitting in, and Ronin decides what that means.
 *
 * `display-message -p '#S'` is the wrong answer here. When a browser tile is watching,
 * Ronin has attached a grouped viewer (`grid_<name>_…`) that shares this pane, and tmux
 * resolves '#S' to whichever session the asking client is attached to — the viewer.
 * Ending that would close the browser's view and leave the agent running: the opposite
 * of what was asked. Grouped sessions share windows, so the pane appears in both; we
 * take the one without the viewer prefix.
 */
export async function sessionOfPane(paneId: string): Promise<string | null> {
  try {
    const { stdout } = await pexec('tmux', ['list-panes', '-a', '-F', '#{pane_id}\t#{session_name}']);
    const owners = stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t'))
      .filter(([pid]) => pid === paneId)
      .map(([, sname]) => sname);
    if (!owners.length) return null;
    // No non-viewer owner means a bare tmux with no tile watching: the only owner is it.
    return owners.find((s) => !s.startsWith(config.viewerPrefix)) ?? owners[0];
  } catch {
    return null; // no server, no panes — nothing to end
  }
}

/**
 * Publish where Ronin is listening, as a tmux SERVER option, so tools running inside a
 * pane can find the API without duplicating config.ts's bind logic (tailnet IP, PORT).
 * Server-scoped, so it is visible from every session and costs nothing to keep current.
 */
export async function publishRoninUrl(url: string): Promise<void> {
  try {
    await pexec('tmux', ['set-option', '-s', URL_OPT, url]);
  } catch {
    // no tmux server yet — tools fall back to RONIN_URL / the default
  }
}

/**
 * Read a session's post-it note (empty string if none). Stored as a tmux user option
 * on the session itself, so it needs no separate storage and vanishes with the session.
 * Plain `-t name` is safe: tmux prefers an exact name match over a prefix, so `kojin`
 * and `kojinsa` keep distinct notes (callers validate the session exists first).
 */
export async function getNote(name: string): Promise<string> {
  try {
    const { stdout } = await pexec('tmux', ['show-options', '-t', exactPane(name), '-qv', NOTE_OPT]);
    return stdout.replace(/\n$/, ''); // show-options appends one trailing newline
  } catch {
    return '';
  }
}

/** Set (or, when blank, clear) a session's post-it note. */
export async function setNote(name: string, text: string): Promise<void> {
  if (text.trim()) {
    await pexec('tmux', ['set-option', '-t', exactPane(name), NOTE_OPT, text]);
  } else {
    await pexec('tmux', ['set-option', '-t', exactPane(name), '-u', NOTE_OPT]).catch(() => {});
  }
}

/** Read a session's group tags (empty array if none). */
export async function getTags(name: string): Promise<string[]> {
  try {
    const { stdout } = await pexec('tmux', ['show-options', '-t', exactPane(name), '-qv', TAGS_OPT]);
    return parseTags(stdout);
  } catch {
    return [];
  }
}

/** Set (or, when empty, clear) a session's group tags. Returns what was actually stored. */
export async function setTags(name: string, tags: string[]): Promise<string[]> {
  const clean = parseTags(tags.join(','));
  if (clean.length) {
    await pexec('tmux', ['set-option', '-t', exactPane(name), TAGS_OPT, clean.join(',')]);
  } else {
    await pexec('tmux', ['set-option', '-t', exactPane(name), '-u', TAGS_OPT]).catch(() => {});
  }
  return clean;
}

/** Read the teams a session is designated to lead (empty array if none). */
export async function getLeads(name: string): Promise<string[]> {
  try {
    const { stdout } = await pexec('tmux', ['show-options', '-t', exactPane(name), '-qv', LEAD_OPT]);
    return parseTags(stdout);
  } catch {
    return [];
  }
}

/** Set (or, when empty, clear) the teams a session leads. Returns what was stored. */
export async function setLeads(name: string, teams: string[]): Promise<string[]> {
  const clean = parseTags(teams.join(','));
  if (clean.length) {
    await pexec('tmux', ['set-option', '-t', exactPane(name), LEAD_OPT, clean.join(',')]);
  } else {
    await pexec('tmux', ['set-option', '-t', exactPane(name), '-u', LEAD_OPT]).catch(() => {});
  }
  return clean;
}

/**
 * TEAMS IN PLAY — every team with at least one live member. A team is nothing
 * but the sessions carrying the same tag (see TAGS_OPT); this is the one derivation,
 * shared so every answer to "the <name> team" is the same answer. Team wipeboards lean
 * on it: where a live team bears a wipeboard's name, the team IS the membership.
 */
export async function teamsInPlay(): Promise<string[]> {
  return [...new Set((await listSessions()).flatMap((s) => s.tags))].sort();
}

/**
 * tmux user option holding the CUSTOM WIPEBOARDS a session is on — comma-separated,
 * exactly like TAGS_OPT and for exactly the same reason: membership lives on the
 * session, so it dies with the session and no roster can ever drift from reality. The
 * file half of a wipeboard lives in src/wipeboards.ts; this is the "who is on it" half
 * — for CUSTOM boards only. A TEAM wipeboard stores no membership anywhere: its members
 * are the team (teamMembers above), and where a live team bears a board's name this
 * option is not consulted for it. See docs/wipeboards.md.
 *
 * Board names obey the tag rules (lowercase, boring, typeable), so parseTags cleans both.
 */
const WIPEBOARDS_OPT = '@ronin-wipeboards';

/** Read the wipeboards a session is on (empty array if none). */
export async function getWipeboards(name: string): Promise<string[]> {
  try {
    const { stdout } = await pexec('tmux', ['show-options', '-t', exactPane(name), '-qv', WIPEBOARDS_OPT]);
    return parseTags(stdout);
  } catch {
    return [];
  }
}

/** Set (or, when empty, clear) the wipeboards a session is on. Returns what was stored. */
export async function setWipeboards(name: string, boards: string[]): Promise<string[]> {
  const clean = parseTags(boards.join(','));
  if (clean.length) {
    await pexec('tmux', ['set-option', '-t', exactPane(name), WIPEBOARDS_OPT, clean.join(',')]);
  } else {
    await pexec('tmux', ['set-option', '-t', exactPane(name), '-u', WIPEBOARDS_OPT]).catch(() => {});
  }
  return clean;
}

/**
 * NO OPTION HOLDS THE SESSION_ROLE, deliberately. What a session is DOING lives in its
 * LETTER: `Tegami.session_role`, kept current by the session itself with `write_tegami`
 * as it migrates. Michi puts the whole letter on every roster row through the ROW
 * socket, and the client reads the mark off `tegami.session_role`. A tmux option beside
 * it would be a second copy of one fact, drifting the moment an agent re-marked itself
 * in the file. (Membership and leadership are the OPPOSITE case: they are session-borne
 * facts with no letter authority — the letter's `teams` block is derived FROM the
 * options — so TAGS_OPT and LEAD_OPT are the one home each has.)
 */

/**
 * The project_root a session serves — ONE value, not many.
 *
 * Deliberately its own option rather than a reserved `@ronin-tags` value: a session
 * serves one project_root and belongs to any number of groups, so the cardinality
 * differs. `ronin_bin/tejun-recall` and `ronin_bin/tejun-remember` already read this exact string
 * to scope a memory; until 2026-08-09 nothing wrote it, so every session on the box
 * answered "which project_root?" with silence and recall could not self-scope.
 *
 * Empty means UNTAGGED, and untagged is a real answer that must stay visible — never
 * infer one silently from the working directory. See docs/project-roots.md.
 */
const PROJECT_ROOT_OPT = '@ronin-project_root';

/** The project_root a session serves, or '' when nobody has said. */
export async function getProjectRoot(name: string): Promise<string> {
  try {
    const { stdout } = await pexec('tmux', ['show-options', '-t', exactPane(name), '-qv', PROJECT_ROOT_OPT]);
    return stdout.trim();
  } catch {
    return '';
  }
}

/** Set (or, when empty, clear) the project_root a session serves. */
export async function setProjectRoot(name: string, root: string): Promise<string> {
  const clean = root.trim();
  if (clean) {
    await pexec('tmux', ['set-option', '-t', exactPane(name), PROJECT_ROOT_OPT, clean]);
  } else {
    await pexec('tmux', ['set-option', '-t', exactPane(name), '-u', PROJECT_ROOT_OPT]).catch(() => {});
  }
  return clean;
}

/**
 * Every live session's project_root in one call — `name → root`, '' for untagged.
 * One tmux invocation rather than one per session, and untagged sessions are IN the
 * map with an empty value: the tab has to be able to show untagged as untagged.
 */
export async function projectRootsOfSessions(): Promise<Record<string, string>> {
  try {
    const { stdout } = await pexec('tmux', ['list-sessions', '-F', `#{session_name}\t#{${PROJECT_ROOT_OPT}}`]);
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

/**
 * WHAT WAS LAUNCHED INTO THE PANE — the agent (the CLI: `claude`, `codex`) and the
 * provider whose model it is talking to (`anthropic`, `openai`). Two options, written
 * ONCE, at spawn, because spawn is the only moment anything knows: the resolver is
 * holding a whole session_launch_spec (`{provider, model, cmd}`) and what it hands the
 * pane is a command string nobody downstream can read the vendor back out of.
 *
 * `#{pane_current_command}` IS NOT THE SHORTCUT, and that is the whole reason a stamp
 * exists. Measured on this box, 2026-08-17: a Codex session answers `node`, because the
 * Codex CLI is a node script. It answers `claude` correctly for Anthropic — which is
 * exactly the shape of bug that ships, right on the machine it was written on and wrong
 * on half the sessions.
 *
 * `@ronin-agent` WAS DESIGNED BEFORE IT WAS WRITTEN. RIREKI's `vendorOf()` has read it as
 * the first and most trusted link in its identity chain since that function existed —
 * "stamped at spawn, commons knows exactly what it launched" — and nothing had ever set
 * it, so every session on every box silently fell through to step 2 (`pane_current_command`,
 * i.e. `node`) and then to sniffing the tape. So the name and the value shape are RIREKI's,
 * not ours: a bare decoder key, `claude` / `codex`, never a label and never a path.
 *
 * THE MODEL IS DELIBERATELY NOT STAMPED beside them. It is scraped live off the pane's own
 * status line (`scanModel`, src/ctx.ts), which keeps it true when the model is switched
 * mid-session — and makes it the one of the three a session born before this shipped can
 * still show. See § NUANCE in KOTOBA.md: the CLI, the model and this run of it are three
 * things the house can feel apart and has one word for.
 */
const AGENT_OPT = '@ronin-agent';
const PROVIDER_SESSION_OPT = '@ronin-provider-session';

/**
 * Stamp WHICH CLI a session was launched as — called at birth, beside the tags and the
 * project_root. A blank value is NOT written: an unset option and an option set to ''
 * read back identically, so writing the empty one would only be a second way to say
 * nothing. Failures are swallowed for the same reason a note or a tag failure is — a
 * label must never cost the owner their session.
 *
 * A PROVIDER STAMP STOOD BESIDE THIS for one commit on 2026-08-17 and is gone with the
 * roster column that was its only reader: the owner cut that column to the model alone,
 * because `opus 5` already says Claude and `gpt-5.6-sol` already says Codex. This one
 * stays because it has a reader of its own, and had one before the roster ever asked:
 * RIREKI picks a tape decoder from it (`vendorOf`, services/rireki/scroll.ts), where it
 * is the top of a four-step identity chain and the only step that is not a guess.
 */
export async function setLaunchStamp(name: string, agent: string): Promise<void> {
  if (!agent.trim()) return;
  await pexec('tmux', ['set-option', '-t', exactPane(name), AGENT_OPT, agent.trim()]).catch(() => {});
}

/** Provider conversation UUID, minted by Ronin for new launches when the CLI supports it. */
export async function setProviderSessionId(name: string, id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid provider session id.');
  await pexec('tmux', ['set-option', '-t', exactPane(name), PROVIDER_SESSION_OPT, id]);
}

export async function getProviderSessionId(name: string): Promise<string> {
  try {
    const { stdout } = await pexec('tmux', ['show-options', '-t', exactPane(name), '-qv', PROVIDER_SESSION_OPT]);
    const id = stdout.trim();
    return /^[0-9a-f-]{36}$/i.test(id) ? id : '';
  } catch {
    return '';
  }
}

/** tmux user option holding a session's control dial (see ronin_catalogs/ACTIONS.md control-check). */
const CONTROL_OPT = '@ronin-control';

export type Control = 'user' | 'read' | 'write';

/**
 * Read a session's control dial: who may drive it. `user` = agents get nothing,
 * `read` = agents watch only, `write` = full agent access. Unset and legacy values
 * (`agent`/`shared`) mean `write`.
 */
export async function getControl(name: string): Promise<Control> {
  try {
    const { stdout } = await pexec('tmux', ['show-options', '-t', exactPane(name), '-qv', CONTROL_OPT]);
    const v = stdout.trim();
    return v === 'user' || v === 'read' ? v : 'write';
  } catch {
    return 'write';
  }
}

/** Flip a session's control dial (owner's path — the browser UI). */
export async function setControl(name: string, control: Control): Promise<void> {
  await pexec('tmux', ['set-option', '-t', exactPane(name), CONTROL_OPT, control]);
}

/* ------------------------------------------------------------------ the viewer seam */
/* The viewer machinery lives in src/viewer.ts (split 2026-08-25 at the 700-line
 * ceiling). These re-exports keep every existing import path working — above all the
 * INSTALLED SERVICE CODE (rireki, koshi), which imports capturePane, sendRawKeys and
 * jumpToBottom from this module by path, ships from the RONIN_SERVICES repo, and must
 * not be broken by a tidy-up on this side of the KYOKAI line. In-repo callers may use
 * either path; the services migrate on their own release, or never. */
export { capturePane, cleanupViewers, createViewer, jumpToBottom, sendRawKeys } from './viewer.js';
