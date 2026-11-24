# MODEL_PROVIDERS — the provider catalog (stock; yours shadows it)

> **This file is stock, and an upgrade replaces it.** It is the one record of every model
> provider Ronin offers: the vendor id a launch names, the CLI that serves it, and the family
> words that give each model its tier. It holds no model facts. The signed-in provider CLI
> owns the live model list; every refresh (Ronin's start, **Refresh all** on the Model
> providers surface) reads each activated CLI's own list into the Campaign record.
> Nothing in here executes.
>
> **To change a section without a code release,** copy this file to
> `~/ronin/custom/MODEL_PROVIDERS.md` and edit it there. Each provider section in the owner copy
> replaces that provider section; other shipped providers keep receiving updates; an upgrade never touches it.

## How to read a provider

One `### <Vendor label>` section per provider. Its fields:

| Field | Meaning |
|---|---|
| `provider` | the vendor id a launch names (`anthropic`, `openai`, …) and the key of `agents.sessions.by_provider` |
| `cli` | the id of the CLI that serves it in `src/agents.ts` (`claude`, `codex`, …) — the join between this catalog and what the machine measures |
| `transcript_source` | dated descriptive journal location and write discipline; availability requires a supported adapter and verified launch identity, not merely a file at that path |
| `maturity` | optional display status: `beta` or `comingSoon`; a `comingSoon` provider is shown and never launched |
| `families` | space-separated `word=tier` pairs, tier **light** · **standard** · **frontier**: a model the CLI lists takes the tier of the longest word standing whole in its id, so a new generation keeps its band the day it is listed. Order matters: see [One model per tier](#one-model-per-tier) |

## One model per tier

Every provider's picker offers Native and at most one model per tier, Frontier, then
Standard, then Light. A tier's model is the **newest id of the first family listed for that
tier** that the CLI lists (newest: the numbers in the id compared in order, `gpt-6.2` over
`gpt-6.1`; a tie goes to the CLI's own order). Older versions, a later family of the same
tier and ids no family word fits are not offered and do not launch. To offer a different
family in a tier, list its word first. A provider with no `families` keeps its CLI's list
whole. Mika's cascade (Light → Standard → Frontier) reads the same tiers.

## Tiers

What each tier is good at, shown beside every model in the pickers, for every provider:

| Tier | Strengths |
|---|---|
| frontier | deepest reasoning, slower |
| standard | strong, everyday work |
| light | fastest, simple tasks |

Transcript-source observations above were recorded by the transcript investigation on
2026-09-22. Mint/claim capability belongs only to `docs/agents/<cli>.md` and is not
duplicated in this catalog.

Adding a provider is a section, never a code path. The matching `docs/agents/<cli>.md`
page owns bare, model, dangerous and resume commands. Model: Native is always offered, is
every provider's default, and means no model override. A model is offered when the CLI's
list read by Refresh all reports its id and it is its tier's model; model info enriches
it, never grants availability.

### Anthropic

- **provider:** `anthropic`
- **cli:** `claude`
- **transcript_source:** Observed 2026-09-22: `~/.claude/projects/<cwd-slug>/<uuid>.jsonl`; one record per completed message. Journal adapter exists; exact launch identity is required.
- **families:** `haiku=light sonnet=standard opus=frontier fable=frontier`

Ronin offers what Claude Code's own picker offers: its catalog's `main` section. The older
generations it files under `overflow` are still served but not offered. Opus is listed
before Fable, so the newest Opus is the Frontier model. Saved CLI names such
as `sonnet` pass through unchanged and are never rewritten by Ronin.

### OpenAI

- **provider:** `openai`
- **cli:** `codex`
- **families:** `astra=frontier sol=standard luna=light terra=light spark=light`
- **transcript_source:** Observed 2026-09-22: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`; ordinal-sequenced records with a session metadata header. Journal adapter exists; fresh Ronin launches isolate the journal home; the id comes from its header.

Model ids are passed unchanged to Codex's `--model` option. Astra, Sol, Luna and Terra are
OpenAI's durable families; the generation number moves on its own cadence. Codex's own
list calls Astra its most capable, Sol its go-to for everyday coding, and Terra and Luna
its efficient ones, so Astra is Frontier, Sol Standard and Luna Light (Terra when no Luna
is listed).
Availability belongs to the owner's OpenAI account: a model the account cannot use is
refused by Codex in the new tile, and Ronin never substitutes.

### Google

- **provider:** `google`
- **cli:** `agy`
- **families:** `pro=frontier flash=standard flash-lite=light`
- **transcript_source:** Reported, not yet observed here: `~/.gemini/antigravity-cli/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`. No adapter yet.

Model ids are passed unchanged to Antigravity CLI's `--model` option. Not yet exercised
end to end through Ronin; the first real launch of each model is the proof, per
`docs/architecture/model-providers.md`.

### xAI

- **provider:** `xai`
- **cli:** `grok`
- **families:** `grok-4.7=frontier grok-4.6=frontier grok-4.5=standard grok-4.3=standard`
- **transcript_source:** No conversation journal found in the 2026-09-22 investigation. The sessions SQLite file was an empty FTS index; memtrace was memory profiling and logs/unified.jsonl telemetry. No transcript adapter available.

Model ids are passed unchanged to Grok Build's `-m` option. Its Agent page maps
Dangerously to Grok's canonical `--always-approve` spelling.
xAI names no durable family, so its families are the versions themselves. Not yet
exercised through Ronin.

### Hermes

- **provider:** `hermes`
- **cli:** `hermes`
- **transcript_source:** Not established; no transcript availability promised.

Hermes uses Ronin-managed API connections and named setups. The Model dropdown lists
setup names; each setup pins a connection, actual API model, reasoning and approvals.
Each Cowork launch receives a separate Hermes home. Credentials belong to the API
connection, not the setup. See `docs/agents/hermes.md` for setup and current limits.

### GitHub Copilot

- **provider:** `github`
- **cli:** `copilot`
- **families:** `opus=frontier sonnet=standard haiku=light gpt=frontier mini=light pro=frontier flash=standard`
- **transcript_source:** From docs, not yet seen on a real run: `$COPILOT_HOME/session-state/<session-id>/events.jsonl`, one session event per line, first `session.start` carrying `data.sessionId` (schema: `@github/copilot-sdk` `session-events.schema.json`). Adapter `copilot-events`; fresh Ronin launches isolate `session-state`.

Model ids are passed unchanged to Copilot CLI's `--model` option; they are the ones its own
`/model` picker shows, from several vendors, as the account's Copilot plan allows. Copilot
publishes no list Ronin can read. Not yet exercised end to end through Ronin.

### OpenCode

- **provider:** `opencode`
- **cli:** `opencode`
- **families:** `opus=frontier sonnet=standard haiku=light gpt=frontier mini=light pro=frontier flash=standard free=light`
- **transcript_source:** One SQLite store for every session, `~/.local/share/opencode/opencode.db`; schema unpublished. No adapter; Chat shows the terminal.

Model ids are `provider/model` as `opencode models` lists them, passed unchanged to
`--model`. OpenCode launches on any provider it is signed in to, and on OpenCode Zen's free
models with none. Not yet exercised end to end through Ronin.

### Moonshot AI

- **provider:** `moonshot`
- **cli:** `kimi`
- **families:** `kimi=frontier`
- **transcript_source:** `~/.kimi-code/sessions/<workspace>/<session-id>/agents/main/wire.jsonl`; line format unpublished. No adapter; Chat shows the terminal.

Model ids are Kimi Code's aliases from its `config.toml`, passed unchanged to `--model`.
Kimi Code has no launch-and-stay-open prompt, so its brief arrives as its first message.
Not yet exercised end to end through Ronin.

Other providers (pi, perplexity, …) arrive the same way: a contributor PR adding a
section, or a section in your own shadow copy. A third-party API service such as
OpenRouter is not a harness and gets no section: it is an account a harness launches on
(Harnesses workbench → Accounts).

**Other launch settings** a spawn may carry (not role-level; chosen per session):
launch mode (`configured` / `live_dangerously`).
