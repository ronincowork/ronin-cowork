# MODEL_PROVIDERS — the provider catalog (stock; yours shadows it)

> **This file is stock, and an upgrade replaces it.** It is the one record of every model
> provider Ronin offers and optional descriptive metadata for
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
| `maturity` | optional display status: `beta` or `comingSoon`; a provider with no model rows remains visible only as an unavailable catalog card |

Then one table, one row per model, **in the order the picker offers them**:

| Column | Meaning |
|---|---|
| `model` | the model id passed to the CLI, unchanged — its real name, never a euphemism |
| `tier` | **light** · **standard** · **frontier**: the cost and capability band, as the vendor prices it |
| `default` | optional descriptive metadata retained for a reported model; it does not change what Model: Native means |
| `cost` | the vendor's public list price per million tokens, input · output, with the month it was read — a reading, not a contract |
| `good at` · `not good at` | one line each, from the vendor's own positioning and the public record |

Adding a provider is a section; adding model metadata is a row; never a code path. The
matching `docs/agents/<cli>.md` page owns bare, model, dangerous and resume commands. Model:
Native is always offered and means no model override. A named row is offered only when the CLI's captured inventory reports
that exact id; the row enriches it but never grants availability. A provider that fills no
`light` row simply offers none. Prices move: the date beside each cost says when it was
read, and a stale reading is dated, never guessed.

### Anthropic

- **provider:** `anthropic`
- **cli:** `claude`

Model ids are Claude Code's own aliases, passed unchanged to its `--model` option; each
resolves to the current model of that family.

| model | tier | default | cost | good at | not good at |
|---|---|---|---|---|---|
| `opus` | frontier | yes | $5 in · $25 out per M tokens (2026-06) | long agentic coding runs, hard reasoning, large refactors across a repository | quick throwaway questions where its price and latency buy nothing |
| `fable` | frontier | | $10 in · $50 out per M tokens (2026-06) | the hardest multi-step reasoning and long-horizon work; thinking is always on | cheap or latency-bound loops, and any task Opus already finishes reliably |
| `sonnet` | standard | | $2 in · $10 out per M tokens (2026-06) | everyday coding, review and writing at a fraction of the frontier price | the deepest reasoning chains, where the frontier rows pull ahead |
| `haiku` | light | | $1 in · $5 out per M tokens (2026-06) | fast sub-agents, classification, summaries and high-volume routine work | large refactors and subtle multi-file reasoning |

### OpenAI

- **provider:** `openai`
- **cli:** `codex`

Model ids are passed unchanged to Codex's `--model` option. Sol, Terra and Luna are
OpenAI's durable capability tiers; the generation number moves on its own cadence.
Availability belongs to the owner's OpenAI account: a model the account cannot use is
refused by Codex in the new tile, and Ronin never substitutes.

| model | tier | default | cost | good at | not good at |
|---|---|---|---|---|---|
| `gpt-6-astra` | frontier | | $10 in · $50 out per M tokens (2026-09) | the hardest end-to-end reasoning, coding, computer use, research and document creation | routine or bulk work where Sol or Terra burns less of the Codex subscription allowance |
| `gpt-5.6-sol` | frontier | yes | $5 in · $30 out per M tokens (2026-09) | the hardest coding and reasoning work; OpenAI's flagship tier | bulk or latency-sensitive loops where Terra matches it for less |
| `gpt-5.6-terra` | standard | | $2 in · $12 out per M tokens (2026-09) | everyday agentic coding at roughly half the flagship price | the very hardest problems, where Sol still leads |
| `gpt-5.6-luna` | light | | $0.20 in · $1.20 out per M tokens (2026-09) | fast, cheap sub-agents, drafts and high-volume routine tasks | deep multi-step reasoning and large refactors |
| `gpt-5.3-codex-spark` | light | | ChatGPT Pro research preview · separate usage limits (2026-09) | near-instant, real-time iteration on code | deep reasoning, non-text work, API-key launches, or accounts whose Codex model list does not include it |

### Google

- **provider:** `google`
- **cli:** `gemini`

Model ids are passed unchanged to Gemini CLI's `--model` option. The free tier serves
Flash models only; Pro needs a paid plan. These cells are written from Google's published CLI
reference and price list and have not yet been exercised end to end through Ronin; the
first real launch of each is the proof, per `docs/architecture/model-providers.md`.

| model | tier | default | cost | good at | not good at |
|---|---|---|---|---|---|
| `gemini-3.1-pro` | frontier | | $2 in · $12 out per M tokens, more above 200K context (2026-09) | long-context reasoning over very large inputs, multimodal work | the free tier, which does not serve it |
| `gemini-3.8-flash` | standard | yes | $0.75 in · $3.75 out per M tokens, promotional to 2026-12 (2026-09) | fast everyday coding and chat on the free tier | the deepest reasoning, where Pro leads |
| `gemini-2.5-flash-lite` | light | | $0.10 in · $0.40 out per M tokens (2026-09) | the cheapest high-volume classification and summaries | agentic coding of any depth |

### xAI

- **provider:** `xai`
- **cli:** `grok`

Model ids are passed unchanged to Grok Build's `-m` option. Its Agent page maps
Dangerously to Grok's canonical `--always-approve` spelling.
Written from xAI's published CLI overview and price list, not yet exercised through Ronin.

| model | tier | default | cost | good at | not good at |
|---|---|---|---|---|---|
| `grok-4.6` | frontier | yes | $2 in · $6 out per M tokens, double above 200K context (2026-09) | long-running agents, coding and research with a 500K context | the cheapest bulk work, where 4.3 costs less |
| `grok-4.3` | standard | | $1.25 in · $2.50 out per M tokens (2026-09) | everyday coding and chat at a low price | the hardest reasoning, where 4.6 leads |

### Nous Research

- **provider:** `nous`
- **cli:** `hermes`

Hermes Agent runs any provider; these rows are its own Hermes models through the Nous
Portal (`hermes setup --portal` signs in). Model ids are passed unchanged to
`hermes chat -m`. Its Agent page maps Dangerously to Hermes's `--yolo` spelling.
Written from Nous's published CLI reference; the Portal lists no public per-token price,
and none of these cells has yet been exercised through Ronin.

| model | tier | default | cost | good at | not good at |
|---|---|---|---|---|---|
| `nousresearch/hermes-4-405b` | standard | yes | Nous Portal subscription; no public per-token list price (2026-09) | open-weight reasoning and tool use with a steerable persona | frontier-class coding, where the closed flagships lead |
| `nousresearch/hermes-4.3-36b` | light | | Nous Portal subscription; no public per-token list price (2026-09) | fast open-weight chat and light agent work; runs locally on modest hardware | large refactors and long agentic runs |

### OpenRouter

- **provider:** `openrouter`
- **cli:** `openrouter`
- **maturity:** `comingSoon`

OpenRouter is listed for visibility only. It has no model rows yet, so it is not offered
by model selectors and cannot be launched.

Other providers (pi, perplexity, …) arrive the same way: a contributor PR adding a
section, or a row in your own shadow copy.

**Other launch settings** a spawn may carry (not role-level; chosen per session):
launch mode (`configured` / `live_dangerously`).
