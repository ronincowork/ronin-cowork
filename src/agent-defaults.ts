/** The Agent-form values a Campaign or Team may seed. One shape at both levels. */
export type Reach = 'open' | 'discuss' | 'plan' | 'execute';
export type Recruit = 'open' | 'nobody' | 'propose agents' | 'staff agents';
export type Output = 'open' | 'a plan' | 'ideas' | 'code' | 'an artifact' | 'the team' | 'no code';
export type AgentDial = 'user' | 'read' | 'write';
export type LaunchMode = 'configured' | 'live_dangerously';
export interface Mandate { reach: Reach; recruit: Recruit; output: Output[] }

export interface AgentDefaults {
  provider: string;
  model: string;
  reach: Reach;
  recruit: Recruit;
  output: Output[];
  routines: Record<string, boolean>;
  behaviours: string[];
  dial: AgentDial;
  launch_mode: LaunchMode;
}

export type TeamAgentDefaults = Omit<AgentDefaults, 'routines' | 'behaviours'>;

const text = (value: unknown, max = 120): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const oneOf = <T extends string>(value: unknown, choices: readonly T[], fallback: T): T =>
  choices.includes(value as T) ? value as T : fallback;

const outputs = (value: unknown): Output[] => {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const valid = values.filter((entry): entry is Output =>
    ['open', 'a plan', 'ideas', 'code', 'an artifact', 'the team', 'no code'].includes(entry as Output));
  return valid.length ? valid : ['open'];
};

const booleanMap = (value: unknown): Record<string, boolean> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [rawKey, enabled] of Object.entries(value)) {
    const key = text(rawKey, 64);
    if (key && typeof enabled === 'boolean') out[key] = enabled;
  }
  return out;
};

const books = (value: unknown): string[] => Array.isArray(value)
  ? value.map((entry) => text(entry, 160)).filter(Boolean)
  : [];

/** Validate a user-editable record without making its store unreadable on bad input. */
export function agentDefaults(value: unknown): AgentDefaults {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    provider: text(input.provider),
    model: text(input.model),
    reach: oneOf(input.reach, ['open', 'discuss', 'plan', 'execute'], 'plan'),
    recruit: oneOf(input.recruit, ['open', 'nobody', 'propose agents', 'staff agents'], 'propose agents'),
    output: outputs(input.output),
    routines: booleanMap(input.routines),
    behaviours: books(input.behaviours),
    dial: oneOf(input.dial, ['user', 'read', 'write'], 'write'),
    launch_mode: oneOf(input.launch_mode, ['configured', 'live_dangerously'], 'live_dangerously'),
  };
}

export function mandate(value: unknown): Mandate {
  const defaults = agentDefaults(value);
  return { reach: defaults.reach, recruit: defaults.recruit, output: defaults.output };
}

export function teamAgentDefaults(value: unknown): TeamAgentDefaults {
  const { routines: _routines, behaviours: _behaviours, ...defaults } = agentDefaults(value);
  return defaults;
}
