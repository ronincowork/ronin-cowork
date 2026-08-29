/**
 * WHICH COMMAND THIS SESSION IS BORN ON — the whole of it, in one place.
 *
 * Three things can decide it, and they are ranked once here rather than argued about at
 * each call site:
 *
 *   1. THIS LAUNCH said so — a whole `cmd`, or a `model` name, or a `provider`.
 *   2. THE OWNER said so — ⚙ Configuration, `agents.sessions`.
 *   3. NOBODY said so — the launch table's own last resort.
 *
 * A MODEL IS ALWAYS A NAME, NEVER A COMMAND STRING. Every layer that names one resolves
 * it through the launch table (`ronin_catalogs/PROJECT_ROOTS.md`), because the table is
 * the one place a provider is a row and a model is a column. A stored command would
 * freeze a vendor's flags into the owner's config where no table edit could reach them.
 *
 * TWO OWNER DEFAULTS, AND THEY ANSWER DIFFERENT QUESTIONS (owner, 2026-08-29).
 * `sessions.default` names a provider AND a model and answers a launch that named
 * neither. `sessions.by_provider.<provider>` names a model only and answers a launch that
 * named the provider and no model — *"give me Anthropic"*, which had no spelling before,
 * because naming a vendor used to mean naming one of its models.
 *
 * NO ROLE-MODEL BIAS SITS BETWEEN THEM. A `session_role` could once state `model:` and it
 * resolved into a command OUTRANKING the owner's own default; matched by model NAME, it
 * silently switched an OpenAI box onto Anthropic. Removed 2026-08-29, field and path
 * together — a definition may not put itself between the owner and their own default.
 *
 * CONTRADICTIONS ARE REFUSED, NOT RANKED. A `cmd` already carries both a vendor and a
 * model, so naming a `model` or a `provider` beside one is two answers to one question
 * (owner, 2026-08-26: *"it shouldn't be overwriting anything, it should just be one of
 * the fields"*). Every refusal names what the box actually offers, because a caller can
 * act on that and cannot act on "invalid".
 */
import type { SessionLaunchSpec } from './project-roots.js';
import { defaultAgentCommand } from './agents.js';

/** The `agents.sessions` block of the owner's config, as the launch path reads it. */
export interface SessionsDefaults {
  default?: { provider?: string; model?: string };
  /** One preferred model per provider; null or absent means no preference. */
  by_provider?: Record<string, string | null>;
}

/**
 * WHO DECIDED. Not cosmetic — it is published as the launch's `stated_by.cmd`, and a
 * reading the owner configured must not read as though the code chose it.
 * `settei_provider` is the half-explicit case: this launch named the vendor, ⚙ named
 * the model.
 */
export type CommandSource = 'explicit_launch' | 'settei_provider' | 'system';

export interface CommandRequest {
  /** False for `agent: none` — a plain terminal, which is born on no command at all. */
  agent: boolean;
  cmd?: string;
  model?: string;
  provider?: string;
  specs: SessionLaunchSpec[];
  sessions?: SessionsDefaults;
}

const offer = (names: string[]): string => names.join(', ') || 'nothing yet (see ⚙ Configuration)';

/** Resolve one launch's command, or refuse naming what this box offers. */
export function resolveLaunchCommand(req: CommandRequest): { cmd: string; source: CommandSource } {
  const { agent, cmd, model, provider, specs } = req;

  if (model && cmd) {
    throw new Error('Name a model OR a cmd, not both — the cmd already says which model it runs.');
  }
  if (provider && cmd) {
    throw new Error('Name a provider OR a cmd, not both — the cmd already says whose CLI it runs.');
  }
  // An agentless launch is born on nothing. An explicit command for one is a
  // contradiction somebody typed, and is refused where the empty answer is decided.
  if (!agent) {
    if (cmd) {
      throw new Error(`This launch starts no agent (\`agent: none\`), so it cannot be given the command "${cmd}".`);
    }
    return { cmd: '', source: 'system' };
  }
  if (cmd) return { cmd, source: 'explicit_launch' };

  const dflt = req.sessions?.default;
  // A provider narrows the search. The owner's default provider is only a tie-breaker
  // for a model two vendors both offer, and only when this launch named no provider.
  let within = specs;
  if (provider) {
    within = specs.filter((s) => s.provider === provider);
    if (!within.length) {
      throw new Error(`Unknown provider "${provider}" — this box's launch table offers: ${offer([...new Set(specs.map((s) => s.provider))])}.`);
    }
  }

  if (model) {
    const named = (within.find((s) => s.model === model && s.provider === dflt?.provider)
      ?? within.find((s) => s.model === model))?.cmd;
    if (!named) {
      const whose = provider ? `${provider} offers` : "this box's launch table offers";
      throw new Error(`Unknown model "${model}" — ${whose}: ${offer([...new Set(within.map((s) => s.model))])}.`);
    }
    return { cmd: named, source: 'explicit_launch' };
  }

  if (provider) {
    // The owner's preference for this vendor, else its FIRST COLUMN — which is what makes
    // the setting optional rather than something you must fill in before naming a
    // provider works at all. The fallback is the one thing column order decides.
    const preferred = req.sessions?.by_provider?.[provider] ?? '';
    const chosen = preferred ? within.find((s) => s.model === preferred)?.cmd : undefined;
    if (chosen) return { cmd: chosen, source: 'settei_provider' };
    return { cmd: within[0]!.cmd, source: 'system' };
  }

  // NOBODY NAMED ANYTHING. The install's own default, resolved through the table.
  //
  // Before this existed the fallback was a bare `claude` — a string matching no table
  // row, so MCP-off refused it and a fresh box launched wrong. The bare literal stays as
  // the last resort for a box with no table at all, and that is the only reason an
  // Anthropic name appears anywhere on this path.
  const installed = dflt?.provider && dflt?.model
    ? specs.find((s) => s.provider === dflt.provider && s.model === dflt.model)?.cmd
    : undefined;
  return { cmd: installed ?? defaultAgentCommand(), source: 'system' };
}
