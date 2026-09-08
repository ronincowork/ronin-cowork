# MODEL_PROVIDERS — the provider catalog (stock; yours shadows it)

> **This file is stock, and an upgrade replaces it.** It is the one record of every model
> provider Ronin offers and every model each provides, whether or not this machine has
> the provider installed. Every picker, every launch and every provider fact on screen
> reads from here or from the Campaign's measured provider summary; no other file names
> a provider or a model. Nothing in here executes.
>
> **To keep names fresh without a code release,** copy this file to your catalogs store
> (`$(ronin-store catalogs)/MODEL_PROVIDERS.md`) and edit it there. A copy in the store
> wins over this one whole, file for file; an upgrade never touches it.

## How to read a provider

One `### <Vendor label>` section per provider. Its fields:

| Field | Meaning |
|---|---|
| `provider` | the vendor id a launch names (`anthropic`, `openai`, …) and the key of `agents.sessions.by_provider` |
| `cli` | the id of the CLI that serves it in `src/agents.ts` (`claude`, `codex`, …) — the join between this catalog and what the machine measures |
| `gbrain_disconnected` | the CLI's flag that launches with zero MCP servers; a provider without one cannot launch disconnected |
| `live_dangerously` | the CLI's additive flag for the Dangerously launch mode; a provider without one refuses that mode |

Then one table, one row per model, **in the order the picker offers them**:

| Column | Meaning |
|---|---|
| `model` | the model id passed to the CLI, unchanged — its real name, never a euphemism |
| `tier` | **light** · **standard** · **frontier**: the cost and capability band, as the vendor prices it |
| `default` | `yes` on the one row a launch that names this provider and no model gets when ⚙ Configuration holds no preference for it; the first row when no row says so |
| `cost` | the vendor's public list price per million tokens, input · output, with the month it was read — a reading, not a contract |
| `good at` · `not good at` | one line each, from the vendor's own positioning and the public record |
| `launch` | the complete interactive command for that model — the `session_launch_spec` cell |

Adding a provider is a section; adding a model is a row; never a code path. A provider that
fills no `light` row simply offers none. Prices move: the date beside each cost says when
it was read, and a stale reading is dated, never guessed.

### Anthropic

- **provider:** `anthropic`
- **cli:** `claude`
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
- **gbrain_disconnected:** `-c mcp_servers.gbrain.enabled=false`
- **live_dangerously:** `--dangerously-bypass-approvals-and-sandbox`

Model ids are passed unchanged to Codex's `--model` option. Sol, Terra and Luna are
OpenAI's durable capability tiers; the generation number moves on its own cadence.
Availability belongs to the owner's OpenAI account: a model the account cannot use is
refused by Codex in the new tile, and Ronin never substitutes.

| model | tier | default | cost | good at | not good at | launch |
|---|---|---|---|---|---|---|
| `gpt-5.6-sol` | frontier | yes | $5 in · $30 out per M tokens (2026-09) | the hardest coding and reasoning work; OpenAI's flagship tier | bulk or latency-sensitive loops where Terra matches it for less |
| `gpt-5.6-terra` | standard | | $2 in · $12 out per M tokens (2026-09) | everyday agentic coding at roughly half the flagship price | the very hardest problems, where Sol still leads |
| `gpt-5.6-luna` | light | | $0.20 in · $1.20 out per M tokens (2026-09) | fast, cheap sub-agents, drafts and high-volume routine tasks | deep multi-step reasoning and large refactors |

| model | launch |
|---|---|
| `gpt-5.6-sol` | `codex --model gpt-5.6-sol` |
| `gpt-5.6-terra` | `codex --model gpt-5.6-terra` |
| `gpt-5.6-luna` | `codex --model gpt-5.6-luna` |

### Google

- **provider:** `google`
- **cli:** `gemini`
- **live_dangerously:** `--yolo`

Model ids are passed unchanged to Gemini CLI's `--model` option. The free tier serves
Flash models only; Pro needs a paid plan. Gemini CLI declares no MCP-off flag, so it
cannot launch disconnected. These cells are written from Google's published CLI
reference and price list and have not yet been exercised end to end through Ronin; the
first real launch of each is the proof, per `docs/model-providers.md`.

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

Other providers (pi, perplexity, …) arrive the same way: a contributor PR adding a
section, or a row in your own shadow copy.

**Other launch settings** a spawn may carry (not role-level; chosen per session):
launch mode (`configured` / `live_dangerously`) and the `@ronin-control` dial the
session is born with (`user` / `read` / `write` — see `docs/session-control-dials.md`).
