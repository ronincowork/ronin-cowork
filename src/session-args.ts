export type Control = 'user' | 'read' | 'write';

export const CONTROL_OPT = '@ronin-control';
export const SESSION_KEY_OPT = '@ronin-key';

export function newSessionArgs(
  name: string,
  opts: {
    cwd?: string;
    env?: Readonly<Record<string, string>>;
    argv?: readonly string[];
    control?: Control;
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
