import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { REPO_ROOT } from './resources.js';

const UPDATER = join(REPO_ROOT, 'bin', 'ronin-update');

export type Package = 'cowork' | 'services';

export interface Started {
  via: 'systemd-run' | 'detached';
}

export function runUpdater(pkg: Package): Promise<Started> {
  const args = pkg === 'services' ? [UPDATER, '--services'] : [UPDATER];
  return new Promise((resolve, reject) => {
    execFile('systemd-run', [
      '--user', '--collect', `--unit=ronin-update-${Date.now()}`,
      ...args,
    ], { timeout: 10000 }, (err) => {
      if (!err) return resolve({ via: 'systemd-run' });
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
