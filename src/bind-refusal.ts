import type { BindSource } from './machine-settings.js';

/** EX_CONFIG from sysexits.h. `deploy/ronin.service` names this in
 *  RestartPreventExitStatus, so a start that cannot have its address stops instead of
 *  repeating the same diagnostic every RestartSec seconds for as long as the box is up. */
export const EXIT_ADDRESS_UNUSABLE = 78;

export interface AddressRefusal {
  bind: string;
  port: number;
  envPath: string;
  bindSource: BindSource;
  code?: string;
  message?: string;
}

/** What to print when `listen` fails, as one line per console.error.
 *
 *  Kept pure and apart from index.ts because the only other way to reach this branch is
 *  to boot the whole operator, which connects to tmux and cleans up viewer sessions —
 *  far too much to set off in order to read an error message.
 */
export function addressRefusal(at: AddressRefusal): string[] {
  const where = `${at.bind}:${at.port}`;
  switch (at.code) {
    case 'EADDRINUSE':
      // Naming WHICH process holds it belongs to the installer-side preflight and its
      // shared helper (TMUX_COEXISTENCE, "Listener conflicts stop the unit"). This is the
      // runtime half, and it must not guess whose process it is.
      return [
        `${where} is already in use, so Ronin did not start.`,
        `Free that port, or set a different PORT in ${at.envPath}, then: systemctl --user restart ronin`,
      ];
    case 'EADDRNOTAVAIL':
      return [
        `${at.bind} is not an address on this machine, so Ronin did not start.`,
        at.bindSource === 'env'
          ? `${at.envPath} records BIND=${at.bind}. If this box's tailnet address has changed, delete that BIND line and re-run ./setup.sh to record the new one.`
          : `The address was worked out from ${at.bindSource} rather than recorded, and is already gone. Run ./setup.sh to record one.`,
      ];
    default:
      return [`could not listen on ${where}: ${[at.code, at.message].filter(Boolean).join(' ')}`.trim()];
  }
}
