export type Reach = 'open' | 'discuss' | 'plan' | 'execute';
export type Recruit = 'open' | 'nobody' | 'propose agents' | 'staff agents';
export type Output = 'open' | 'a plan' | 'ideas' | 'code' | 'an artifact' | 'the team' | 'no code';
export type LaunchMode = 'configured' | 'live_dangerously';
export interface Mandate { reach: Reach; recruit: Recruit; output: Output[] }

export interface AgentDefaults {
  provider: string;
  model: string;
  reach: Reach;
  recruit: Recruit;
  output: Output[];
  behaviours: string[];
  launch_mode: LaunchMode;
}

/** A Team's own defaults. The model is not one: Models > Defaults owns it (owner, 2026-10-21). */
export type TeamAgentDefaults = Omit<AgentDefaults, 'behaviours' | 'provider' | 'model' | 'launch_mode'>;

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

const books = (value: unknown): string[] => Array.isArray(value)
  ? value.map((entry) => text(entry, 160)).filter((entry) => Boolean(entry) && entry !== 'mandates')
  : [];

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
    behaviours: books(input.behaviours),
    launch_mode: oneOf(input.launch_mode, ['configured', 'live_dangerously'], 'configured'),
  };
}

export function mandate(value: unknown): Mandate {
  const defaults = agentDefaults(value);
  return { reach: defaults.reach, recruit: defaults.recruit, output: defaults.output };
}

export function teamAgentDefaults(value: unknown): TeamAgentDefaults {
  const { behaviours: _behaviours, provider: _provider, model: _model, launch_mode: _mode, ...defaults } = agentDefaults(value);
  return defaults;
}
