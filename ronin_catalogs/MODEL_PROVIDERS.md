# MODEL_PROVIDERS — the provider catalog (stock; yours shadows it)

> **This file is stock, and an upgrade replaces it.** It is the one record of every model
> provider Ronin offers, its launch mechanics, and optional descriptive metadata for
> models Ronin knows how to describe. The signed-in provider CLI owns the live model
> inventory; Refresh captures that account-specific list in Campaign settings. Pickers
> and launches use the captured CLI list, enriched by matching rows here. Nothing in here executes.
>
> **To keep names fresh without a code release,** copy this file to your catalogs store
> (`$(ronin-store catalogs)/MODEL_PROVIDERS.md`) and edit it there. Each provider section in the owner copy
> replaces that provider section; other shipped providers keep receiving updates; an upgrade never touches it.

- **updated:** 2026-09-18

## Keeping it fresh

Everything below is descriptive metadata, not an availability list: prices and the words
about what each known model is good at were read on the date above.
The stock catalog is refreshed with each Ronin release (the release order in
`docs/development/tarball.md` has the step: re-read prices and models, bump `updated`). A shadow copy
in your catalogs store is yours to refresh, and carries its own `updated` line. Ronin
shows the date it has, stale or not; it never hides it and never guesses a newer one.

## How to read a provider

The file's own header field:

| Field | Meaning |
|---|---|
| `updated` | the day this catalog's models, prices and descriptions were last read from the public record, `YYYY-MM-DD` |

One `### <Vendor label>` section per provider. Its fields:

| Field | Meaning |
|---|---|
| `provider` | the vendor id a launch names (`anthropic`, `openai`, …) and the key of `agents.sessions.by_provider` |
| `cli` | the id of the CLI that serves it in `src/agents.ts` (`claude`, `codex`, …) — the join between this catalog and what the machine measures |
| `native` | the complete ordinary CLI command with model choice delegated to that CLI |
| `gbrain_disconnected` | the CLI's disconnected-launch flag; scope varies by CLI (see docs/agents), and absence refuses explicit disconnected launches |
| `live_dangerously` | the CLI's additive flag for the Dangerously launch mode; a provider without one refuses that mode |
| `maturity` | optional display status: `beta` or `comingSoon`; a provider with no launch rows remains visible only as an unavailable catalog card |

Then one table, one row per model, **in the order the picker offers them**:

| Column | Meaning |
|---|---|
| `model` | the model id passed to the CLI, unchanged — its real name, never a euphemism |
| `tier` | **light** · **standard** · **frontier**: the cost and capability band, as the vendor prices it |
| `default` | optional descriptive metadata retained for a reported model; Native, not this marker, is the provider's launch default |
| `cost` | the vendor's public list price per million tokens, input · output, with the month it was read — a reading, not a contract |
| `good at` · `not good at` | one line each, from the vendor's own positioning and the public record |
| `launch` | the complete interactive command for that model — the `session_launch_spec` cell |

Adding a provider is a section; adding model metadata is a row; never a code path. Native
is always offered. A named row is offered only when the CLI's captured inventory reports
that exact id; the row enriches it but never grants availability. A provider that fills no
`light` row simply offers none. Prices move: the date beside each cost says when it was
read, and a stale reading is dated, never guessed.

### Anthropic

- **provider:** `anthropic`
- **cli:** `claude`
- **native:** `claude`
- **gbrain_disconnected:** `--strict-mcp-config`
- **live_dangerously:** `--dangerously-skip-permissions`

Model ids are Claude Code's own aliases, passed unchanged to its `--model` option; each
resolves to the current model of that family.

| model | tier | default | cost | good at | not good at | launch |
|---|---|---|---|---|---|---|
| `opus` | frontier | yes | $5 in · $25 out per M tokens (2026-06) | long agentic coding runs, hard reasoning, large refactors across a repository | quick throwaway questions where its price and latency buy nothing |
| `fable` | frontier | | $10 in · $50 out per M tokens (2026-06) | the hardest multi-step reasoning and long-horizon work; thinking is always on | cheap or latency-bound loops, and any task Opus already finishes reliably |
| `sonnet` | standard | | $2 in · $10 out per M tokens (2026-06) | everyday coding, review and writing at a fraction of the frontier price | the deepest reasoning chains, where the frontier rows pull ahead |
| `haiku` | light | | $1 in · $5 out per M tokens (2026-06) | fast sub-agents, classification, summaries and high-volume routine work | large refactors and subtle multi-file reasoning |

The `launch` column, in the same row order:

| model | launch |
|---|---|
| `opus` | `claude --model opus` |
| `fable` | `claude --model fable` |
| `sonnet` | `claude --model sonnet` |
| `haiku` | `claude --model haiku` |

**Anthropic warning:** its MCP control is coarse. Disconnected disables **all** MCP for
that Claude launch, not only gbrain.

### OpenAI

- **provider:** `openai`
- **cli:** `codex`
- **native:** `codex`
- **gbrain_disconnected:** `-c mcp_servers.gbrain.enabled=false`
- **live_dangerously:** `--dangerously-bypass-approvals-and-sandbox`

Model ids are passed unchanged to Codex's `--model` option. Sol, Terra and Luna are
OpenAI's durable capability tiers; the generation number moves on its own cadence.
Availability belongs to the owner's OpenAI account: a model the account cannot use is
refused by Codex in the new tile, and Ronin never substitutes.

| model | tier | default | cost | good at | not good at | launch |
|---|---|---|---|---|---|---|
| `gpt-6-astra` | frontier | | $10 in · $50 out per M tokens (2026-09) | the hardest end-to-end reasoning, coding, computer use, research and document creation | routine or bulk work where Sol or Terra burns less of the Codex subscription allowance |
| `gpt-5.6-sol` | frontier | yes | $5 in · $30 out per M tokens (2026-09) | the hardest coding and reasoning work; OpenAI's flagship tier | bulk or latency-sensitive loops where Terra matches it for less |
| `gpt-5.6-terra` | standard | | $2 in · $12 out per M tokens (2026-09) | everyday agentic coding at roughly half the flagship price | the very hardest problems, where Sol still leads |
| `gpt-5.6-luna` | light | | $0.20 in · $1.20 out per M tokens (2026-09) | fast, cheap sub-agents, drafts and high-volume routine tasks | deep multi-step reasoning and large refactors |
| `gpt-5.3-codex-spark` | light | | ChatGPT Pro research preview · separate usage limits (2026-09) | near-instant, real-time iteration on code | deep reasoning, non-text work, API-key launches, or accounts whose Codex model list does not include it |

| model | launch |
|---|---|
| `gpt-6-astra` | `codex --model gpt-6-astra` |
| `gpt-5.6-sol` | `codex --model gpt-5.6-sol` |
| `gpt-5.6-terra` | `codex --model gpt-5.6-terra` |
| `gpt-5.6-luna` | `codex --model gpt-5.6-luna` |
| `gpt-5.3-codex-spark` | `codex --model gpt-5.3-codex-spark` |

### Google

- **provider:** `google`
- **cli:** `gemini`
- **native:** `gemini`
- **live_dangerously:** `--yolo`

Model ids are passed unchanged to Gemini CLI's `--model` option. The free tier serves
Flash models only; Pro needs a paid plan. Gemini CLI declares no MCP-off flag, so it
cannot launch disconnected. These cells are written from Google's published CLI
reference and price list and have not yet been exercised end to end through Ronin; the
first real launch of each is the proof, per `docs/architecture/model-providers.md`.

| model | tier | default | cost | good at | not good at | launch |
|---|---|---|---|---|---|---|
| `gemini-3.1-pro` | frontier | | $2 in · $12 out per M tokens, more above 200K context (2026-09) | long-context reasoning over very large inputs, multimodal work | the free tier, which does not serve it |
| `gemini-3.8-flash` | standard | yes | $0.75 in · $3.75 out per M tokens, promotional to 2026-12 (2026-09) | fast everyday coding and chat on the free tier | the deepest reasoning, where Pro leads |
| `gemini-2.5-flash-lite` | light | | $0.10 in · $0.40 out per M tokens (2026-09) | the cheapest high-volume classification and summaries | agentic coding of any depth |

| model | launch |
|---|---|
| `gemini-3.1-pro` | `gemini --model gemini-3.1-pro` |
| `gemini-3.8-flash` | `gemini --model gemini-3.8-flash` |
| `gemini-2.5-flash-lite` | `gemini --model gemini-2.5-flash-lite` |

### xAI

- **provider:** `xai`
- **cli:** `grok`
- **native:** `grok`

Model ids are passed unchanged to Grok Build's `-m` option. Grok Build declares neither
an MCP-off flag nor a Dangerously flag, so it launches configured and connected only.
Written from xAI's published CLI overview and price list, not yet exercised through Ronin.

| model | tier | default | cost | good at | not good at | launch |
|---|---|---|---|---|---|---|
| `grok-4.6` | frontier | yes | $2 in · $6 out per M tokens, double above 200K context (2026-09) | long-running agents, coding and research with a 500K context | the cheapest bulk work, where 4.3 costs less |
| `grok-4.3` | standard | | $1.25 in · $2.50 out per M tokens (2026-09) | everyday coding and chat at a low price | the hardest reasoning, where 4.6 leads |

| model | launch |
|---|---|
| `grok-4.6` | `grok -m grok-4.6` |
| `grok-4.3` | `grok -m grok-4.3` |

### Nous Research

- **provider:** `nous`
- **cli:** `hermes`
- **native:** `hermes chat --provider nous`

Hermes Agent runs any provider; these rows are its own Hermes models through the Nous
Portal (`hermes setup --portal` signs in). Model ids are passed unchanged to
`hermes chat -m`. Hermes declares neither an MCP-off flag nor a Dangerously flag.
Written from Nous's published CLI reference; the Portal lists no public per-token price,
and none of these cells has yet been exercised through Ronin.

| model | tier | default | cost | good at | not good at | launch |
|---|---|---|---|---|---|---|
| `nousresearch/hermes-4-405b` | standard | yes | Nous Portal subscription; no public per-token list price (2026-09) | open-weight reasoning and tool use with a steerable persona | frontier-class coding, where the closed flagships lead |
| `nousresearch/hermes-4.3-36b` | light | | Nous Portal subscription; no public per-token list price (2026-09) | fast open-weight chat and light agent work; runs locally on modest hardware | large refactors and long agentic runs |

| model | launch |
|---|---|
| `nousresearch/hermes-4-405b` | `hermes chat --provider nous -m nousresearch/hermes-4-405b` |
| `nousresearch/hermes-4.3-36b` | `hermes chat --provider nous -m nousresearch/hermes-4.3-36b` |

### OpenRouter

- **provider:** `openrouter`
- **cli:** `openrouter`
- **maturity:** `comingSoon`

OpenRouter is listed for visibility only. It has no launch rows yet, so it is not offered
by model selectors and cannot be launched.

Other providers (pi, perplexity, …) arrive the same way: a contributor PR adding a
section, or a row in your own shadow copy.

**Other launch settings** a spawn may carry (not role-level; chosen per session):
launch mode (`configured` / `live_dangerously`).
