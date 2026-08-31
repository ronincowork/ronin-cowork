/** Server-owned launch mechanics that are not public launch fields or catalog roles. */
import type { LaunchProfile } from './launch-profile.js';
import { REPO_ROOT } from './config.js';

export type HouseSeat = 'mika';

/** Resolve the only profile directory sentinel without putting a machine path in data. */
export function profileDir(profile: LaunchProfile): string {
  return profile.dir === '{install}' ? REPO_ROOT : '';
}

/** Apply the fixed mechanics for a named house seat to an ordinary launch profile. */
export function resolveHouseSeatProfile(seat: HouseSeat | undefined, profile: LaunchProfile): LaunchProfile {
  if (seat !== 'mika') return profile;
  const house = [{ layer: 'house' as const, source: 'src/house-seats.ts' }];
  return {
    ...profile,
    label: 'Mika Assist',
    posture: [
      'You assist rather than build. Answer from what you can actually check, name what you used, and say you do not know rather than guessing. A helpful assistant for Ronin itself, never the owner\'s own code. Be short. Answer from the house\'s documents and name the one you used; say you don\'t know rather than guessing. Propose, never write: show a change as what it will become and wait for a yes.',
    ],
    ack: false,
    opening: 'Your job list is ronin_catalogs/MIKA_MACROS.md — read it once, it is short. Then: {prompt}',
    capExempt: true,
    dir: '{install}',
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
