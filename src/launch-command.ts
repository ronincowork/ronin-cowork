import { providerDefault, type SessionLaunchSpec } from './model-providers.js';
import { defaultAgentCommand } from './agents.js';

export interface SessionsDefaults {
  default?: { provider?: string; model?: string };
  by_provider?: Record<string, string | null>;
}

export type CommandSource = 'explicit_launch' | 'settei_provider' | 'system';

export interface CommandRequest {
  agent: boolean;
  cmd?: string;
  model?: string;
  provider?: string;
  specs: SessionLaunchSpec[];
  sessions?: SessionsDefaults;
}

const offer = (names: string[]): string => names.join(', ') || 'nothing yet (see ⚙ Configuration)';
// Exact refreshed ids resolve to their joined row. A CLI-supported name saved before the
// refresh inventory existed is not Ronin's alias to rewrite; it is passed to that CLI.
const matchingModel = (specs: readonly SessionLaunchSpec[], value: string): SessionLaunchSpec | undefined => {
  return specs.find((spec) => spec.model === value);
};

const passthroughModel = (specs: readonly SessionLaunchSpec[], value: string): string | undefined => {
  if (!/^[A-Za-z0-9._:/@+-]+$/.test(value)) return undefined;
  const template = specs.find((spec) => spec.model !== 'native')?.cmd;
  const argv = template?.match(/^(.*?\s(?:--model|-m)(?:=|\s+))(\S+)(.*)$/);
  return argv ? `${argv[1]}${value}${argv[3]}` : undefined;
};

export interface MergedSessionsDefaults {
  sessions: SessionsDefaults;
  defaultOwn: boolean;
  providerOwn: (provider: string) => boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const bucket = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function mergeSessionDefaults(house: SessionsDefaults | undefined, campaign: unknown): MergedSessionsDefaults {
  const mine = bucket(campaign);
  const provider = str(mine.provider);
  const model = str(mine.model);
  const defaultOwn = !!(provider && model);
  const by_provider: Record<string, string | null> = { ...(house?.by_provider ?? {}) };
  if (defaultOwn) by_provider[provider] = model;
  return {
    sessions: { default: defaultOwn ? { provider, model } : house?.default, by_provider },
    defaultOwn,
    providerOwn: (p) => defaultOwn && p === provider,
  };
}

export function resolveLaunchCommand(req: CommandRequest): { cmd: string; source: CommandSource } {
  const { agent, cmd, model, provider, specs } = req;

  if (model && cmd) {
    throw new Error('Name a model OR a cmd, not both — the cmd already says which model it runs.');
  }
  if (provider && cmd) {
    throw new Error('Name a provider OR a cmd, not both — the cmd already says whose CLI it runs.');
  }
  if (!agent) {
    if (cmd) {
      throw new Error(`This launch starts no agent (\`agent: none\`), so it cannot be given the command "${cmd}".`);
    }
    return { cmd: '', source: 'system' };
  }
  if (cmd) return { cmd, source: 'explicit_launch' };

  const dflt = req.sessions?.default;
  let within = specs;
  if (provider) {
    within = specs.filter((s) => s.provider === provider);
    if (!within.length) {
      throw new Error(`Unknown provider "${provider}" — this box's provider catalog offers: ${offer([...new Set(specs.map((s) => s.provider))])}.`);
    }
  }

  if (model) {
    const preferred = within.filter((s) => s.provider === dflt?.provider);
    const named = matchingModel(preferred, model)?.cmd ?? matchingModel(within, model)?.cmd
      ?? (provider ? passthroughModel(within, model) : undefined);
    if (!named) {
      const whose = provider ? `${provider} offers` : "this box's provider catalog offers";
      throw new Error(`Unknown model "${model}" — ${whose}: ${offer([...new Set(within.map((s) => s.model))])}.`);
    }
    return { cmd: named, source: 'explicit_launch' };
  }

  if (provider) {
    const preferred = req.sessions?.by_provider?.[provider] ?? '';
    const chosen = preferred ? matchingModel(within, preferred)?.cmd ?? passthroughModel(within, preferred) : undefined;
    if (chosen) return { cmd: chosen, source: 'settei_provider' };
    return { cmd: providerDefault(within, provider)!.cmd, source: 'system' };
  }

  const installed = dflt?.provider && dflt?.model
    ? matchingModel(specs.filter((s) => s.provider === dflt.provider), dflt.model)?.cmd
      ?? passthroughModel(specs.filter((s) => s.provider === dflt.provider), dflt.model)
    : undefined;
  const providerNative = dflt?.provider ? providerDefault(specs, dflt.provider)?.cmd : undefined;
  return { cmd: installed ?? providerNative ?? defaultAgentCommand(), source: 'system' };
}
