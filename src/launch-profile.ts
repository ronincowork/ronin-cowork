
export type StatedLayer =
  | 'install' | 'installation' | 'campaign' | 'team' | 'agent' | 'conditional' | 'template' | 'launch'
  | 'system' | 'team_roster' | 'explicit_launch' | 'house';
export interface StatedBy {
  layer: StatedLayer;
  source: string;
}

const SYSTEM: Record<string, string> = {
  ack: '',
  opening: '{prompt}',
  agent: '',
  cap: '',
  dir: '',
};

export interface LaunchProfile {
  agent: boolean;
  ack: boolean;
  opening: string;
  posture: string[];
  label: string;
  capExempt: boolean;
  dir: string;
  stated_by: Record<string, StatedBy[]>;
}

const SYSTEM_SOURCE = 'src/launch-profile.ts';
const sourceOf = (): StatedBy[] => [{ layer: 'system', source: SYSTEM_SOURCE }];

export function resolveLaunchProfile(): LaunchProfile {
  return {
    agent: true,
    ack: /^y/i.test(SYSTEM.ack),
    opening: SYSTEM.opening,
    posture: [],
    label: '',
    capExempt: /^exempt$/i.test(SYSTEM.cap),
    dir: SYSTEM.dir,
    stated_by: {
      agent: sourceOf(), ack: sourceOf(), opening: sourceOf(),
      posture: sourceOf(), label: sourceOf(), capExempt: sourceOf(),
      dir: sourceOf(),
    },
  };
}
