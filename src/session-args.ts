/**
 * THE BIRTH ARGUMENT VECTOR — the `tmux new-session` argv, pure and on its own so it can
 * be asserted without a live tmux. The forms in `tmux.ts` are the dangerous strings in
 * this tree (see that module's header); an argv exercised only through a real server is
 * an argv nobody checks, and this one carries a fix that was invisible for exactly that
 * reason.
 */
export type Control = 'user' | 'read' | 'write';

/** tmux user option holding a session's control dial (see ronin_catalogs/ACTIONS.md control-check). */
export const CONTROL_OPT = '@ronin-control';
export const SESSION_KEY_OPT = '@ronin-key';

/**
 * DELIVERED BY `env`, NOT BY `-e`. `-e` sets the SESSION environment, and tmux does not
 * apply that to the process it starts in the pane — measured on an isolated socket, not
 * assumed: an injected PATH reached neither the initial pane nor one opened later, while
 * both kept the tmux server's own inherited PATH. So for as long as `-e` was the only
 * delivery, every projected Routine tool (`routine-tools.ts`) was silently undelivered:
 * agents were picking `tejun-*` out of a login shell's rc file instead — the exact
 * fallback `routes/launch.ts` says it refuses to rely on, and one that does not exist on
 * a box whose profile `setup.sh` never touched. It also meant `bin/shim/systemctl` never
 * reached an Agent, so the refusal standing between an ordinary-looking command and
 * stopping the unit that owns every session simply never ran. This box lost every live
 * session twice in one day.
 *
 * Exec'ing through `env` is the form that actually binds. The `-e` is kept as well, for
 * panes a hand opens later in the same session.
 */
export function newSessionArgs(
  name: string,
  opts: {
    cwd?: string;
    env?: Readonly<Record<string, string>>;
    argv?: readonly string[];
    control?: Control;
    /** Stable per-session data key, stamped in the same tmux transaction as birth. */
    key?: string;
  } = {},
): string[] {
  const envPairs = Object.entries(opts.env ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  const a = ['new-session', '-d', '-s', name];
  for (const pair of envPairs) a.push('-e', pair);
  if (opts.cwd) a.push('-c', opts.cwd);
  if (opts.argv?.length) {
    const argv = envPairs.length ? ['env', ...envPairs, ...opts.argv] : opts.argv;
    a.push('--', ...argv, ';', 'set-option', '-w', '-t', name, 'remain-on-exit', 'on');
  }
  if (opts.control) a.push(';', 'set-option', '-t', name, CONTROL_OPT, opts.control);
  if (opts.key) a.push(';', 'set-option', '-t', name, SESSION_KEY_OPT, opts.key);
  return a;
}
