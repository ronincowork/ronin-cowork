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
CLI. Models, prices and owner overrides belong to the
[provider catalog](../../ronin_catalogs/MODEL_PROVIDERS.md), parsed only by
`src/model-providers.ts`. Do not copy model tables into these pages.

Each Agent page is the executable authority for its no-model/model and
native-approval/dangerous command combinations, plus Resume, new-session-id and
initial-prompt forms. `src/agent-launches.ts` reads those argv
fields; unsupported forms are `—`. A nonempty `launch_new_session_id` chooses command-owned
identity (`minted`); an existing explicitly named id is kept, never minted over. Otherwise
`launch_isolation` declares an environment variable, its default home, and the one journal
subdirectory to keep private (`isolated`). With neither capability, the outcome is
`unbound`. Every process start, including restore and plain shells, passes through
`src/launch-binding.ts`; the strategy table prepares identity before starting the process.

`launch_isolation` mirrors every existing home entry by symlink except its declared
private journal directory, which is a real directory under the Ronin session store.
There is no per-file inheritance list. `transcript_journal` declares the source format,
root, filename pattern, header id field and child-record marker. The model catalog carries
descriptive source observations; executable CLI mechanics live here. This keeps the commands we use in one auditable place
beside the upstream alternatives we deliberately do not use. `src/agents.ts` owns
install/update/version and identity-discovery adapters. Each Agent page also owns its
executable `stop_keys` and `clear_keys` fields. Ronin reads that page when an
action is requested. Values are tmux key names (`C-c` means Ctrl+C); multiple keys are
space-separated and sent in order. Change the Agent page to change its mapping.
Services own service installation/removal; their provider-specific registration syntax
is identified from the integration pages below. Moving that syntax across repositories
requires a separate versioned interface, not a second local command registry.

When a CLI changes: update its owning definition, this integration page's explanation
and tested version, and the focused behavior tests together. Unsupported behavior stays
explicit. Authentication Behaviors express owner policy and link here for CLI mechanics.

## Code ownership

- `src/agent-launches.ts` and these pages: executable launch and resume commands.
- `src/agents.ts`: CLI install/update/version and session-discovery adapters.
- `src/spawn.ts`, `src/routes/launch.ts`: resolve catalog entries and persist launch identity.
- `src/tmux.ts`, `src/session-archive.ts`, `src/routes/sessions-api.ts`: live identity and archive/resume.
- `src/terminal-controls.ts`: read the Agent document and dispatch using persisted CLI identity; no screen detection.
- [Provider contract](../architecture/model-providers.md): extension and owner-overlay rules.
- Tests: `tests/terminal-controls.test.ts`, `tests/model-providers.test.ts`,
  `tests/agent-prompts.test.ts`, and archive lifecycle tests. These check Ronin;
  they do not certify a live CLI journey unless that journey is explicitly documented.
