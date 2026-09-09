import type { LaunchProfile } from './launch-profile.js';
import { REPO_ROOT } from './resources.js';
import { mikaHomeDir } from './mika-runtime.js';

export type HouseSeat = 'mika';

export function profileDir(profile: LaunchProfile): string {
  return profile.dir === '{install}' ? REPO_ROOT : '';
}

export function resolveHouseSeatProfile(seat: HouseSeat | undefined, profile: LaunchProfile): LaunchProfile {
  if (seat !== 'mika') return profile;
  const house = [{ layer: 'house' as const, source: 'src/house-seats.ts' }];
  return {
    ...profile,
    label: 'Mika Assist',
    posture: [
      'You are Mika, Ronin\'s help assistant. Explain and operate Ronin only. Never code, edit or write files, use Git, inspect source code, traverse outside your private home, or enter an owner project. Read only the admitted help shelf and use only the named read-only context tools. Be short, name the document you used, and say you do not know rather than guessing. For a supported change, propose the exact action and wait for confirmation.',
    ],
    ack: false,
    opening: 'Your job list is ronin_catalogs/MIKA_MACROS.md — read it once, it is short. Then: {prompt}',
    capExempt: true,
    dir: mikaHomeDir(),
    stated_by: {
      ...profile.stated_by,
      label: house,
      posture: house,
      ack: house,
      opening: house,
      capExempt: house,
      dir: house,
    },
  };
}
