/**
 * One startup check, for one specific way this app can destroy a whole box.
 *
 * A tmux server belongs to the systemd cgroup of whichever process started it.
 * Ronin starts sessions (`tmux new-session`) whenever a tile or the commons launcher
 * asks for one — so if no server is running at that moment, the server it forks
 * lands inside ronin.service. systemd's default KillMode=control-group then
 * SIGTERMs every process in that cgroup on stop, which means a routine
 * restarting Ronin silently kills the tmux server and with it
 * every session, agent and shell on the machine. It looks like tmux "resetting
 * itself on the regular"; nobody typed a kill command.
 *
 * deploy/tmux-server.service fixes it by owning the server in its own unit. This
 * check exists so the fix can never quietly come undone — it says so in the log
 * the moment ronin starts up holding the server.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

const pexec = promisify(execFile);

const cgroupOf = async (pid: string): Promise<string> =>
  (await readFile(`/proc/${pid}/cgroup`, 'utf8')).trim();

/** True if the running tmux server shares our cgroup (i.e. our restart kills it). */
export async function checkTmuxServerCgroup(): Promise<boolean> {
  if (process.platform !== 'linux') return false; // cgroups + systemd only
  try {
    const mine = await cgroupOf('self');
    if (!mine.includes('.service')) return false; // not run as a systemd unit — nothing kills us as a group
    const { stdout } = await pexec('tmux', ['display-message', '-p', '#{pid}']);
    const pid = stdout.trim();
    if (!/^\d+$/.test(pid)) return false;
    if ((await cgroupOf(pid)) !== mine) return false;
    console.error(
      [
        '',
        '[ronin] ⚠  THE TMUX SERVER IS INSIDE THIS SERVICE\'S CGROUP.',
        `[ronin]    tmux server pid ${pid} · cgroup ${mine}`,
        '[ronin]    restarting Ronin now will SIGTERM it and kill',
        '[ronin]    EVERY tmux session, agent and shell on this machine.',
        '[ronin]    This is the OWNER\'s to repair, when the box is quiet — not an',
        '[ronin]    agent\'s, and not now: the repair replaces the server, which ends',
        '[ronin]    every session it currently holds. Run ./setup.sh.',
        '[ronin]    Do NOT restart tmux-server to clear this warning.',
        '',
      ].join('\n'),
    );
    return true;
  } catch {
    return false; // no server, no /proc, no tmux — nothing to warn about
  }
}

/**
 * Called before Ronin creates a session. If there is no tmux server running, ask
 * systemd to start tmux-server.service rather than letting our own `new-session`
 * fork one — a server we fork is a server in OUR cgroup, and our next restart
 * kills it and every session on the box.
 *
 * This is the belt to tmux-server.service's braces: the unit covers boot, this
 * covers "the server died while we were up". Best effort by design — no systemd,
 * no unit installed, or not Linux and we simply fall through to plain tmux, which
 * is the pre-existing behaviour.
 */
type HostExec = (file: string, args: string[]) => Promise<unknown>;

export async function ensureTmuxServer(
  env: NodeJS.ProcessEnv = process.env,
  exec: HostExec = pexec,
): Promise<void> {
  if (process.platform !== 'linux') return;
  // An explicit tmux socket is a private/test server, not the machine's session
  // engine.  Managing the global systemd unit from here crosses those identities:
  // an empty TMUX_TMPDIR once made this branch restart tmux-server.service and end
  // every live production session on the box.  Let the following tmux command create
  // the explicitly selected private server itself; systemd owns only the default
  // production socket.
  if (env.TMUX || env.TMUX_TMPDIR) return;
  try {
    await exec('tmux', ['list-sessions']);
    return; // a server is running — whoever owns it, we're not about to fork one
  } catch {
    // no server (or no sessions and exit-empty left it down) — fall through
  }
  try {
    // restart, not start: the unit is Type=oneshot/RemainAfterExit, so after its
    // server dies it sits at "active (exited)" and `start` is a no-op. Safe here —
    // no server means no sessions to lose. Not run during our own activation
    // (that's ExecStartPre's --no-block job), so this cannot deadlock on After=.
    await exec('systemctl', ['--user', 'restart', 'tmux-server.service']);
    console.log('[ronin] no tmux server — started tmux-server.service (keeps it out of our cgroup)');
  } catch {
    console.warn(
      '[ronin] no tmux server and tmux-server.service is unavailable — the server ' +
        'about to be forked will live in this service\'s cgroup, so restarting ronin ' +
        'will kill every session. Report it to the owner.',
    );
  }
}
