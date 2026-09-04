import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { tmux } from './tmux-client.js';

const execAsync = promisify(execFile);

const cgroupOf = async (pid: string): Promise<string> =>
  (await readFile(`/proc/${pid}/cgroup`, 'utf8')).trim();

export async function checkTmuxServerCgroup(): Promise<boolean> {
  if (process.platform !== 'linux') return false; // cgroups + systemd only
  try {
    const mine = await cgroupOf('self');
    if (!mine.includes('.service')) return false; // not run as a systemd unit — nothing kills us as a group
    const stdout = await tmux.run(['display-message', '-p', '#{pid}']);
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

type HostExec = (file: string, args: string[]) => Promise<unknown>;
const hostExec: HostExec = (file, args) => file === 'tmux' ? tmux.run(args) : execAsync(file, args);

export async function ensureTmuxServer(
  env: NodeJS.ProcessEnv = process.env,
  exec: HostExec = hostExec,
): Promise<void> {
  if (process.platform !== 'linux') return;
  if (env.TMUX || env.TMUX_TMPDIR) return;
  try {
    await exec('tmux', ['list-sessions']);
    return; // a server is running — whoever owns it, we're not about to fork one
  } catch {
  }
  try {
    // This call ends our cgroup; it must not wait for a broker child that dies with us.
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
