/**
 * THE CASCADE — one complete, validated launch profile, resolved before any tmux session
 * exists.
 *
 *   system default  <  family_role  <  session_task  <  explicit choice on this launch
 *
 * Neither axis owns a launch field exclusively, and that is the whole ruling (owner,
 * 2026-08-22). Both a role and a task may state defaults; the task wins over the role,
 * the role wins over the system, and the launch's own explicit pick wins over all three
 * wherever the field is not locked. The last step is `resolveForm`'s, in `src/spawn.ts` —
 * this module deliberately stops short of it, so the cascade is testable without a
 * machine.
 *
 * ABSENCE MEANS INHERIT, AND ONLY ABSENCE. `- **mcp:** off` is a real value that overrides
 * an inherited `on`; there is no way to spell "inherit" as a value, because a field you
 * can write is a field you have stated. A key line with an empty value is a half-written
 * line, and reads as absent (`Definition.has`).
 *
 * FOUR CLASSES OF FIELD, and every field is exactly one of them:
 *
 *   CASCADING    model · dial · permissions · lifecycle · mcp · cap · agent · dir ·
 *                ack · opening. The last layer to state it wins.
 *
 *   ADDITIVE     posture, and the boot shelf's reading levels. A role's posture and its
 *                task's posture are BOTH true of the session, so the task's does not
 *                displace the role's — it follows it. This is the inline half of the
 *                same rule the shelf obeys: `role/` and `task/` add up rather than
 *                override (src/session-boot.ts).
 *
 *   LOCKED       `mcp: always`. A layer may not contradict it and neither may the launch.
 *                `personalassistant` carries it: an assistant defined by its brain must
 *                not be launchable without the door to it.
 *
 *   INAPPLICABLE `agent: none` voids model, permissions, posture, opening and ack —
 *                there is no CLI to hold a permission mode, nobody to brief, and nobody
 *                to acknowledge. Values inherited from a layer BELOW the one that
 *                declared it are dropped in silence, because that layer could not have
 *                known; a value stated at or above it is a contradiction and is REFUSED,
 *                naming the file. That asymmetry is what lets `OpenShell` be shelved on
 *                any role without the role's ordinary defaults blowing it up.
 *
 * EVERY REFUSAL NAMES A FILE. A definition directory has many small files and a wrong
 * field is worth nothing to the owner if the message says only "the catalog".
 */
import type { Definition } from './definitions.js';

/** The dial a session is BORN on — a constant of the launch, never a live control. */
export type Dial = 'user' | 'read' | 'write';

/**
 * THE INSTALL'S OWN ANSWER for every cascading field — the bottom layer, and the one a
 * blank role and a blank task fall straight through to.
 *
 * They are the values the old combined catalog produced for a field it did not carry, so a
 * definition that states nothing resolves exactly as that entry did. `mcp: ''` is off by
 * the owner's ruling of 2026-08-22 — an ordinary session is born with no MCP servers, and
 * the owner turns the brain on for the launch that wants it.
 */
const SYSTEM: Record<string, string> = {
  model: '',
  dial: 'write',
  permissions: 'default',
  lifecycle: '',
  ack: '',
  opening: '{prompt}',
  agent: '',
  cap: '',
  dir: '',
  mcp: '',
};

/** Fields that describe an AGENT, and therefore mean nothing without one. */
const AGENT_ONLY = ['model', 'permissions', 'posture', 'opening', 'ack'] as const;

/** The one legal value of `dir:`. A literal path would be a shipped file naming a machine. */
const INSTALL_SENTINEL = '{install}';

export interface LaunchProfile {
  /** '' when the launch chose no role. A blank role is a first-class state. */
  family_role: string;
  /** '' when the launch chose no task. */
  session_task: string;
  /** Is a CLI launched at all? False for `agent: none` — a plain terminal. */
  agent: boolean;
  /** Bias only; the launch's explicit pick wins. Empty when inapplicable. */
  model: string;
  dial: Dial;
  permissions: string;
  lifecycle: string;
  /** Report understanding and wait, rather than starting work. */
  ack: boolean;
  /** First-message template; `{prompt}` is what the owner typed. */
  opening: string;
  /** Role posture then task posture, in that order — additive, never overriding. */
  posture: string[];
  /** Who the brief addresses: the role's label if there is a role, else the task's. */
  label: string;
  /** Born even at the session max. It still counts once it is. */
  capExempt: boolean;
  /** Born connected, and the toggle is not offered — a LOCK, not a default. */
  mcpAlways: boolean;
  /** Which way the ＋ New form's gbrain toggle opens. A default; the launch overrides it. */
  mcpDefault: boolean;
  /** `{install}` resolved by the caller, or '' — the working directory this launch fixes. */
  dir: string;
}

interface Layer {
  level: 'family_role' | 'session_task';
  def: Definition;
}

/** The last layer that STATES the key, or undefined when every layer is silent. */
function stated(layers: Layer[], key: string): Layer | undefined {
  for (let i = layers.length - 1; i >= 0; i--) if (layers[i].def.has(key)) return layers[i];
  return undefined;
}

/** The resolved raw value: the last layer to state it, else the system's answer. */
function pick(layers: Layer[], key: string): string {
  return stated(layers, key)?.def.get(key) ?? SYSTEM[key] ?? '';
}

/**
 * Resolve a role and a task into one profile, or refuse.
 *
 * Either may be undefined — a blank role, a blank task, or both. Blank contributes
 * nothing at all rather than contributing a blank: the layer simply is not there, so
 * everything below it stands.
 */
export function resolveLaunchProfile(
  role: Definition | undefined,
  task: Definition | undefined,
): LaunchProfile {
  const layers: Layer[] = [];
  if (role) layers.push({ level: 'family_role', def: role });
  if (task) layers.push({ level: 'session_task', def: task });

  // ---- LOCKED: `mcp: always` may not be contradicted from anywhere ----
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

  // ---- INAPPLICABLE: `agent: none` voids what describes an agent ----
  const agentLayer = stated(layers, 'agent');
  const agent = !(agentLayer && /^none$/i.test(agentLayer.def.get('agent')));
  if (!agent && agentLayer) {
    const from = layers.indexOf(agentLayer);
    // At or above the declaring layer is a contradiction — somebody asserted an agent
    // for a launch that has none. Below it is merely a default that cannot apply, and is
    // dropped without comment: that is what lets an agentless task sit on any role.
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

  // ---- `dir:` is a sentinel, and the sentinel is the whole vocabulary ----
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
  // Additive, and role first: the durable hat is stated before what it is doing today.
  const posture = layers.map((l) => l.def.get('posture').trim()).filter(Boolean);

  return {
    family_role: role?.name ?? '',
    session_task: task?.name ?? '',
    agent,
    model: agent ? pick(layers, 'model') : '',
    dial: (dial === 'user' || dial === 'read' ? dial : 'write') as Dial,
    permissions: agent ? pick(layers, 'permissions') || 'default' : '',
    lifecycle: (() => {
      const v = pick(layers, 'lifecycle');
      return v && v !== 'none' ? v : '';
    })(),
    ack: agent ? /^y/i.test(pick(layers, 'ack')) : false,
    opening: agent ? pick(layers, 'opening') : '',
    posture: agent ? posture : [],
    label: (role?.get('label') || role?.name || task?.get('label') || task?.name) ?? '',
    capExempt: /^exempt$/i.test(pick(layers, 'cap')),
    mcpAlways: mcp === 'always',
    // `always` opens it on and removes the choice; `on` opens it on; everything else,
    // absence included, opens it off.
    mcpDefault: mcp === 'always' || mcp === 'on',
    dir: dirValue,
  };
}
