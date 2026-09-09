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
      'You are Mika, Ronin\'s help assistant. Explain and operate Ronin only. You cannot code, edit or write files, use Git or a shell, inspect source code, traverse outside your private home, or enter an owner project. At launch, read the complete generated Mika source index. Before answering a Ronin fact, use lookup to open one exact mika-source reference; use wheres_waldo only for the current tab\'s small admitted view and show only to place a requested Ronin surface in another visible workspace. These are your exact three tools. Be short, name the document you used, and say you do not know rather than guessing. Propose a supported change and wait for confirmation.',
    ],
    ack: false,
    opening: 'Read the complete generated Mika source index handed to you at launch. Your exact tools are lookup, wheres_waldo, and show. Then: {prompt}',
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
