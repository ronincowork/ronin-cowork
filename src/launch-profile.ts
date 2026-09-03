import type { Definition } from './resource-adapters.js';

export type Dial = 'user' | 'read' | 'write';

export type StatedLayer =
  | 'install' | 'campaign' | 'team' | 'template' | 'launch'
  | 'system' | 'team_roster' | 'session_role' | 'explicit_launch' | 'house';
export interface StatedBy {
  layer: StatedLayer;
  source: string;
}

const SYSTEM: Record<string, string> = {
  dial: 'write',
  ack: '',
  opening: '{prompt}',
  agent: '',
  cap: '',
  dir: '',
  mcp: '',
};

const AGENT_ONLY = ['posture', 'opening', 'ack'] as const;

const INSTALL_SENTINEL = '{install}';

export interface LaunchProfile {
  session_role: string;
  agent: boolean;
  dial: Dial;
  ack: boolean;
  opening: string;
  posture: string[];
  label: string;
  capExempt: boolean;
  mcpAlways: boolean;
  mcpDefault: boolean;
  dir: string;
  stated_by: Record<string, StatedBy[]>;
}

interface Layer {
  level: 'session_role';
  def: Definition;
}

function stated(layers: Layer[], key: string): Layer | undefined {
  for (let i = layers.length - 1; i >= 0; i--) if (layers[i].def.has(key)) return layers[i];
  return undefined;
}

function pick(layers: Layer[], key: string): string {
  return stated(layers, key)?.def.get(key) ?? SYSTEM[key] ?? '';
}

const SYSTEM_SOURCE = 'src/launch-profile.ts';
const sourceOf = (layers: Layer[], key: string): StatedBy[] => {
  const layer = stated(layers, key);
  return layer
    ? [{ layer: layer.level, source: layer.def.file }]
    : [{ layer: 'system', source: SYSTEM_SOURCE }];
};

export function resolveLaunchProfile(task: Definition | undefined): LaunchProfile {
  const layers: Layer[] = [];
  if (task) layers.push({ level: 'session_role', def: task });

  const isAlways = (l: Layer) => /^always$/i.test(l.def.get('mcp'));
  const mcpLayers = layers.filter((l) => l.def.has('mcp'));
  const lock = mcpLayers.find(isAlways);
  if (lock) {
    const clash = mcpLayers.find((l) => l !== lock && !isAlways(l));
    if (clash) {
      throw new Error(
        `${lock.def.name} is born connected (\`mcp: always\` in ${lock.def.file}), so ` +
          `${clash.def.name} may not set \`mcp: ${clash.def.get('mcp')}\` in ${clash.def.file}.`,
      );
    }
  }

  const agentLayer = stated(layers, 'agent');
  const agent = !(agentLayer && /^none$/i.test(agentLayer.def.get('agent')));
  if (!agent && agentLayer) {
    const from = layers.indexOf(agentLayer);
    for (let i = from; i < layers.length; i++) {
      for (const key of AGENT_ONLY) {
        if (layers[i].def.has(key)) {
          throw new Error(
            `${agentLayer.def.name} launches no agent (\`agent: none\` in ${agentLayer.def.file}), ` +
              `so \`${key}:\` in ${layers[i].def.file} cannot apply.`,
          );
        }
      }
    }
  }

  const dirLayer = stated(layers, 'dir');
  const dirValue = dirLayer?.def.get('dir').trim() ?? '';
  if (dirLayer && dirValue !== INSTALL_SENTINEL) {
    throw new Error(
      `\`dir: ${dirValue}\` in ${dirLayer.def.file} is not legal — ` +
        `\`${INSTALL_SENTINEL}\` is the only value, because a literal path here would be a shipped file naming a machine.`,
    );
  }

  const dial = pick(layers, 'dial').toLowerCase();
  const mcp = pick(layers, 'mcp').toLowerCase();
  const posture = layers.map((l) => l.def.get('posture').trim()).filter(Boolean);

  return {
    session_role: task?.name ?? '',
    agent,
    dial: (dial === 'user' || dial === 'read' ? dial : 'write') as Dial,
    ack: agent ? /^y/i.test(pick(layers, 'ack')) : false,
    opening: agent ? pick(layers, 'opening') : '',
    posture: agent ? posture : [],
    label: (task?.get('label') || task?.name) ?? '',
    capExempt: /^exempt$/i.test(pick(layers, 'cap')),
    mcpAlways: mcp === 'always',
    mcpDefault: mcp === 'always' || mcp === 'on',
    dir: dirValue,
    stated_by: {
      session_role: task
        ? [{ layer: 'session_role', source: task.file }]
        : [{ layer: 'system', source: SYSTEM_SOURCE }],
      agent: sourceOf(layers, 'agent'),
      dial: sourceOf(layers, 'dial'),
      ack: sourceOf(layers, 'ack'),
      opening: sourceOf(layers, 'opening'),
      posture: task?.has('posture')
        ? [{ layer: 'session_role', source: task.file }]
        : [{ layer: 'system', source: SYSTEM_SOURCE }],
      label: task
        ? [{ layer: 'session_role', source: task.file }]
        : [{ layer: 'system', source: SYSTEM_SOURCE }],
      capExempt: sourceOf(layers, 'cap'),
      mcpAlways: sourceOf(layers, 'mcp'),
      mcpDefault: sourceOf(layers, 'mcp'),
      dir: sourceOf(layers, 'dir'),
    },
  };
}
