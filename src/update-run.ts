import { join } from 'node:path';
import { REPO_ROOT } from './resources.js';
import { execFile } from './spawn-broker.js';

const UPDATER = join(REPO_ROOT, 'bin', 'ronin-update');

export type Package = 'cowork' | 'services';

export interface Started {
  via: 'systemd-run' | 'detached';
}

/** Where a run reports how it ended: its output, and its exit code once it has one. */
export interface RunResult {
  log: string;
  exit: string;
}

/**
 * Start the updater in the background. With `result`, the run writes its output to
 * `result.log` and its exit code to `result.exit` when it ends, so a caller can tell a
 * finished install from a failed one without holding the process.
 */
export function runUpdater(pkg: Package, result?: RunResult): Promise<Started> {
  const updater = pkg === 'services' ? [UPDATER, '--services'] : [UPDATER];
  // Paths travel as positional arguments, never spliced into the shell text.
  const args = result
    ? ['/bin/sh', '-c', '"$0" "$@" >"$RONIN_RUN_LOG" 2>&1; echo $? >"$RONIN_RUN_EXIT"', ...updater]
    : updater;
  const env = result ? { RONIN_RUN_LOG: result.log, RONIN_RUN_EXIT: result.exit } : {};
  const setenv = Object.entries(env).flatMap(([k, v]) => [`--setenv=${k}=${v}`]);
  return execFile('systemd-run', [
      '--user', '--collect', `--unit=ronin-update-${Date.now()}`, ...setenv,
      ...args,
    ], { timeout: 10000 }).then(
    () => ({ via: 'systemd-run' as const }),
    // No systemd: start the same command through the broker, its only door. setsid -f
    // leaves Ronin's process group as the old detached spawn did, and the redirect stops
    // execFile waiting on inherited pipes. (system_lead, 2026-11-06)
    () => execFile('/bin/sh', ['-c', 'setsid -f "$0" "$@" >/dev/null 2>&1', ...args],
      { timeout: 10000, env: { ...process.env, ...env } })
      .then(() => ({ via: 'detached' as const })),
  );
}
