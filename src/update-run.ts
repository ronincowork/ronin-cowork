import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { REPO_ROOT } from './resources.js';
import { execFile } from './spawn-broker.js';

const UPDATER = join(REPO_ROOT, 'bin', 'ronin-update');

export type Package = 'cowork' | 'services';

export interface Started {
  via: 'systemd-run' | 'detached';
}

export function runUpdater(pkg: Package): Promise<Started> {
  const args = pkg === 'services' ? [UPDATER, '--services'] : [UPDATER];
  return execFile('systemd-run', [
      '--user', '--collect', `--unit=ronin-update-${Date.now()}`,
      ...args,
    ], { timeout: 10000 }).then(
    () => ({ via: 'systemd-run' as const }),
    () => {
      try {
        const child = spawn(args[0]!, args.slice(1), { detached: true, stdio: 'ignore' });
        child.unref();
        return { via: 'detached' as const };
      } catch (e) {
        throw e;
      }
    },
  );
}
