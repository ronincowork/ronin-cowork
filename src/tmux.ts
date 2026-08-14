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
  /** Groups this session belongs to (see TAGS_OPT). Empty = ungrouped. */
  tags: string[];
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
    const { stdout } = await pexec('tmux', [
      'list-sessions',
      '-F',
      `#{session_name}\t#{session_windows}\t#{?session_attached,1,0}\t#{session_created}\t#{?${NOTE_OPT},1,0}\t#{${TAGS_OPT}}`,
    ]);
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, windows, attached, created, hasNote, tags] = line.split('\t');
        return {
          name,
          windows: Number(windows) || 0,
          attached: attached === '1',
          created: Number(created) || 0,
          hasNote: hasNote === '1',
          tags: parseTags(tags),
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
   * `cap: exempt` in SESSION_JOBS.md — create it even at the max. It still COUNTS
   * afterwards, so the NEXT spawn is the one refused; this exempts the spawn, never the
   * census. Nothing is evicted to make room.
   *
   * Distinct from `agent: false`, which happens to skip the check too: that one says
   * "a shell is not what fills a box". This one says "refusing this would be wrong even
   * though the box is full", and the only kind carrying it is the assistant you ask for
   * help. Two reasons, two flags — one flag would make the comment on either a lie.
   */
  exempt?: boolean;
}

export async function createSession(name: string, dir?: string, opts: CreateOpts = {}): Promise<void> {
  // THE SESSION MAX, guarded here rather than at the route, because `/api/launch` has two
  // handlers — launch_job falls through to launch_bare when the body carries no
  // session_job — and a check in the first one is bypassed by omitting a field. Both
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
  const args = ['new-session', '-d', '-s', name];
  if (cwd) args.push('-c', cwd);
  try {
    await pexec('tmux', args);
  } catch (err) {
    // A missing/inaccessible start-directory makes new-session fail; retry
    // without -c so session creation still works (falls back to ronin's cwd).
    if (cwd) {
      await pexec('tmux', ['new-session', '-d', '-s', name]);
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
  const targets = new Set<string>([name]);
  try {
    const { stdout } = await pexec('tmux', [
      'list-sessions',
      '-F',
      '#{session_name}\t#{session_group}',
    ]);
    const rows = stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sname, group] = line.split('\t');
        return { sname, group: group || '' };
      });
    const self = rows.find((r) => r.sname === name);
    if (self?.group) {
      for (const r of rows) if (r.group === self.group) targets.add(r.sname);
    }
  } catch {
    // no server / older tmux without session_group — fall back to killing just `name`
  }
  for (const s of targets) await killSession(s);
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

/**
 * tmux user option holding the WIPEBOARDS a session is on — comma-separated, exactly
 * like TAGS_OPT and for exactly the same reason: membership lives on the session, so it
 * dies with the session and no roster can ever drift from reality. The file half of a
 * wipeboard lives in src/wipeboards.ts; this is the "who is on it" half.
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
 * NO OPTION HOLDS `session_job`, deliberately — and `@ronin-lead` (the 人) is retired
 * without one taking its place here.
 *
 * What a session is DOING lives in its LETTER: `Tegami.session_job`, which the session
 * itself keeps current with `write_tegami` as it migrates. That is michi's field, michi
 * puts the whole letter on every roster row through the ROW socket, and the client reads
 * the mark off `tegami.session_job`. A tmux option beside it would be a second copy of
 * one fact, drifting the moment an agent re-marked itself in the file — and cowork
 * storing a service's data is exactly the seam KYOKAI exists to hold.
 *
 * The launcher's job still travels: `emitSessionBorn({ job })` hands it to whoever is
 * listening at birth, which is how the letter gets seeded knowing what it is for.
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

/**
 * Snap a viewer's pane to the live bottom. Wheel-scroll bursts only page partway when
 * scrollback is deep; exiting copy mode always returns the pane to the live output.
 * Harmless no-op (errors swallowed) if the pane isn't in copy mode.
 */
export async function jumpToBottom(name: string): Promise<void> {
  await pexec('tmux', ['send-keys', '-t', exactPane(name), '-X', 'cancel']).catch(() => {});
}

/**
 * Grab a pane's visible screen plus up to `lines` of scrollback. `esc` keeps
 * colors/attributes (-e) — used for stream-mode seeds; plain text serves the
 * legacy {t:'hist'} RPC and the smoke test.
 */
export async function capturePane(name: string, lines: number, esc = false): Promise<string> {
  const args = ['capture-pane', '-p', '-t', exactPane(name), '-S', String(-Math.abs(lines))];
  if (esc) args.push('-e');
  const { stdout } = await pexec('tmux', args, { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

/**
 * @service — RIREKI's stream handler types through this; nothing in cowork calls it.
 *
 * Type raw bytes into a session's active pane — the input path for a tape-fed tile.
 *
 * A tape-fed tile holds NO tmux connection: it renders from the tape and types through
 * here, so tmux never learns the viewer exists. `-l` sends the string literally, so
 * control characters and escape sequences (Enter, ^C, arrow keys) arrive as themselves.
 */
export async function sendRawKeys(session: string, data: string): Promise<void> {
  if (!data) return;
  await pexec('tmux', ['send-keys', '-t', exactPane(session), '-l', '--', data]);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Visible pane text only (no history) — cheap state probe for sendText. */
async function paneScreen(name: string): Promise<string> {
  const { stdout } = await pexec('tmux', ['capture-pane', '-p', '-t', exactPane(name)], {
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Compose "send to session": type `text` into a session's active pane and submit it.
 * Built from the R1/R2 actions (co-working/user_repo/wip/RECIPES.md): literal text and Enter as SEPARATE
 * send-keys calls (TUIs treat the Enter as a real submit); if the pane looks identical
 * after Enter, the Enter was lost (observed in the wild) — re-send it once; report
 * whether the pane reacted at all (confirm-started). Pre-send policy for a prompt that
 * already holds text is append-and-submit (what R2 did deliberately — both messages
 * deliver as one).
 */
export async function sendText(
  name: string,
  text: string,
): Promise<{ resent: boolean; started: boolean }> {
  await pexec('tmux', ['send-keys', '-t', exactPane(name), '-l', '--', text]);
  await sleep(200);
  const beforeEnter = await paneScreen(name);
  await pexec('tmux', ['send-keys', '-t', exactPane(name), 'Enter']);
  await sleep(600);
  let after = await paneScreen(name);
  let resent = false;
  if (after === beforeEnter) {
    await pexec('tmux', ['send-keys', '-t', exactPane(name), 'Enter']);
    resent = true;
    await sleep(600);
    after = await paneScreen(name);
  }
  return { resent, started: after !== beforeEnter };
}

/** Run a shell command in a session's active pane (the home-panel launcher's boot step). */
export async function runCommand(name: string, cmd: string): Promise<void> {
  await pexec('tmux', ['send-keys', '-t', exactPane(name), '-l', '--', cmd]);
  await pexec('tmux', ['send-keys', '-t', exactPane(name), 'Enter']);
}

let viewerCounter = 0;

/**
 * Create a grouped "viewer" session that shares the target's windows but has its
 * own current-window pointer and size policy. This is what a browser tile attaches
 * to, so the tile doesn't hijack the window selection of another client viewing
 * the same session. Returns the viewer session name.
 */
export async function createViewer(target: string, tag: string): Promise<string> {
  const safe = target.replace(/[^A-Za-z0-9_-]/g, '');
  const viewer = `${config.viewerPrefix}${safe}_${tag}_${++viewerCounter}`;
  // Grouped (-t target), detached (-d): shares windows with target.
  await pexec('tmux', ['new-session', '-d', '-s', viewer, '-t', exactSession(target)]);
  // Size policy + don't let tmux auto-destroy it in the brief detached window.
  await pexec('tmux', ['set-option', '-t', exactPane(viewer), 'window-size', config.windowSize]).catch(() => {});
  await pexec('tmux', ['set-option', '-t', exactPane(viewer), 'destroy-unattached', 'off']).catch(() => {});
  // Mouse on => the browser's trackpad/wheel scrolls tmux scrollback instead of
  // being translated into Up/Down arrows (history recall). Scoped to this viewer.
  await pexec('tmux', ['set-option', '-t', exactPane(viewer), 'mouse', config.mouse]).catch(() => {});
  return viewer;
}

/** Kill any leftover viewer sessions (e.g. from a previous crash). */
export async function cleanupViewers(): Promise<number> {
  let stdout = '';
  try {
    ({ stdout } = await pexec('tmux', ['list-sessions', '-F', '#{session_name}']));
  } catch {
    return 0;
  }
  const stale = stdout.split('\n').filter((n) => n.startsWith(config.viewerPrefix));
  for (const n of stale) await killSession(n);
  return stale.length;
}
