/**
 * STARTING THE UPDATER — one implementation, two callers.
 *
 * The ⚙ gear's "run update" and the Services activation flow must start the SAME thing in
 * the same way. Two launchers would drift, and the one that drifts is the one nobody
 * presses until the day it matters.
 *
 * Extracted from update-api.ts rather than copied. Its route keeps its behaviour exactly;
 * this is where the behaviour now lives.
 */
import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { REPO_ROOT } from './resources.js';

// The same path update-api.ts used, from the same source of truth. A second way to find
// the repo root is a second answer waiting to disagree.
const UPDATER = join(REPO_ROOT, 'bin', 'ronin-update');

export type Package = 'cowork' | 'services';

export interface Started {
  /** How it was launched, said plainly rather than hidden — the two differ in reaping. */
  via: 'systemd-run' | 'detached';
}

/**
 * Launch the updater for one package. Resolves once it has STARTED, not once it has
 * finished: installation outlives the request that asked for it, and the journal carries
 * the transcript (`journalctl --user -u 'ronin-update-*'`).
 */
export function runUpdater(pkg: Package): Promise<Started> {
  const args = pkg === 'services' ? [UPDATER, '--services'] : [UPDATER];
  return new Promise((resolve, reject) => {
    execFile('systemd-run', [
      '--user', '--collect', `--unit=ronin-update-${Date.now()}`,
      ...args,
    ], { timeout: 10000 }, (err) => {
      if (!err) return resolve({ via: 'systemd-run' });
      // No systemd on this host: detached is the honest best effort — the child shares no
      // controlling terminal, but a launchd-style supervisor could still reap it with us.
      try {
        const child = spawn(args[0]!, args.slice(1), { detached: true, stdio: 'ignore' });
        child.unref();
        resolve({ via: 'detached' });
      } catch (e) {
        reject(e);
      }
    });
  });
}
