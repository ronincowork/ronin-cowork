# Agent integrations

Each CLI has one maintained integration page:

- [Codex](codex.md)
- [Claude Code](claude.md)
- [Gemini CLI](gemini.md)
- [Grok](grok.md)
- [Hermes](hermes.md)

These pages own each CLI's Ronin-specific explanation and code map. Shared browser
shortcuts belong only to [Terminal controls](../using-ronin/terminal-controls.md).

The CLI and inference provider are separate: several inference providers can use one
CLI. Models, prices, launch rows and owner overrides belong to the
[provider catalog](../../ronin_catalogs/MODEL_PROVIDERS.md), parsed only by
`src/model-providers.ts`. Do not copy model tables into these pages.

`src/agents.ts` owns executable install/update/version/resume syntax. Each Agent page
owns its executable `stop_keys` and `clear_keys` fields. Ronin reads that page when an
action is requested. Values are tmux key names (`C-c` means Ctrl+C); multiple keys are
space-separated and sent in order. Change the Agent page to change its mapping.
The catalog currently owns additive launch-mode flags. Integration
pages link those definitions rather than creating another executable command table.
Services own service installation/removal; their provider-specific registration syntax
is identified from the integration pages below. Moving that syntax across repositories
requires a separate versioned interface, not a second local command registry.

When a CLI changes: update its owning definition, this integration page's explanation
and tested version, and the focused behavior tests together. Unsupported behavior stays
explicit. Authentication Behaviors express owner policy and link here for CLI mechanics.

## Code ownership

- `src/agents.ts`: executable CLI install/update/version/resume commands.
- `src/spawn.ts`, `src/routes/launch.ts`: resolve catalog entries and persist launch identity.
- `src/tmux.ts`, `src/session-archive.ts`, `src/routes/sessions-api.ts`: live identity and archive/resume.
- `src/terminal-controls.ts`: read the Agent document and dispatch using persisted CLI identity; no screen detection.
- [Provider contract](../architecture/model-providers.md): extension and owner-overlay rules.
- Tests: `tests/terminal-controls.test.ts`, `tests/model-providers.test.ts`,
  `tests/agent-prompts.test.ts`, and archive lifecycle tests. These check Ronin;
  they do not certify a live CLI journey unless that journey is explicitly documented.
