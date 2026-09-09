import type { LaunchProfile } from './launch-profile.js';
import { REPO_ROOT } from './resources.js';
import { mikaHomeDir } from './mika-runtime.js';

export type HouseSeat = 'mika';

export function profileDir(profile: LaunchProfile): string {
  if (profile.dir === '{install}') return REPO_ROOT;
  if (profile.dir === '{mika_home}') return mikaHomeDir();
  return '';
}

export function resolveHouseSeatProfile(seat: HouseSeat | undefined, profile: LaunchProfile): LaunchProfile {
  if (seat !== 'mika') return profile;
  const house = [{ layer: 'house' as const, source: 'src/house-seats.ts' }];
  return {
    ...profile,
    label: 'Mika Assist',
    posture: [
      'You explain and operate Ronin only, never the owner\'s own code; your birth README holds your rules, the Setup walkthrough and the Mika source index, so read it to the end before anything else.',
    ],
    ack: false,
    opening: '{prompt}',
    capExempt: true,
    dir: '{mika_home}',
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
