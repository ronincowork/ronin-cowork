export type Control = 'user' | 'read' | 'write';

export const CONTROL_OPT = '@ronin-control';
export const SESSION_KEY_OPT = '@ronin-key';
/**
 * RIREKI's per-session dial. Its sweep (libexec/rireki/rireki-sweep) arms a recorder on
 * every pane unless the session says `off` here, so the word is set IN the new-session
 * chain — never after it, where a sweep could land first. Ronin Services off at birth
 * means no tape, no unlocked views: as if the record part were not installed.
 */
export const RIREKI_OPT = '@ronin-rireki';

export function newSessionArgs(
  name: string,
  opts: {
    cwd?: string;
    env?: Readonly<Record<string, string>>;
    argv?: readonly string[];
    control?: Control;
    key?: string;
    rireki?: boolean;
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
  if (opts.rireki === false) a.push(';', 'set-option', '-t', name, RIREKI_OPT, 'off');
  return a;
}
