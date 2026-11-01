# MODEL_PROVIDERS — the provider catalog (stock; yours shadows it)

> **This file is stock, and an upgrade replaces it.** It is the one record of every model
> provider Ronin offers: the vendor id a launch names, the CLI that serves it, the family
> words that give each model its tier, and the key its models are filed under at
> models.dev. It holds no model facts. The signed-in provider CLI owns the live model
> list; **Refresh all** on the Model providers surface reads each activated CLI's own list
> into the Campaign record. What each model is — its name, description, prices, limits and
> dates — is **model info**, fetched from models.dev by the same press and used only once
> the owner accepts it (`ronin_catalogs/MODEL_INFO.json` is the snapshot a release ships).
> Nothing in here executes.
>
> **To change a section without a code release,** copy this file to your catalogs store
> (`$(ronin-store catalogs)/MODEL_PROVIDERS.md`) and edit it there. Each provider section in the owner copy
> replaces that provider section; other shipped providers keep receiving updates; an upgrade never touches it.

## How to read a provider

One `### <Vendor label>` section per provider. Its fields:

| Field | Meaning |
|---|---|
| `provider` | the vendor id a launch names (`anthropic`, `openai`, …) and the key of `agents.sessions.by_provider` |
| `cli` | the id of the CLI that serves it in `src/agents.ts` (`claude`, `codex`, …) — the join between this catalog and what the machine measures |
| `models_dev` | optional: the provider key models.dev files this vendor's models under; a provider without one shows no model info |
| `transcript_source` | dated descriptive journal location and write discipline; availability requires a supported adapter and verified launch identity, not merely a file at that path |
| `maturity` | optional display status: `beta` or `comingSoon`; a `comingSoon` provider is shown and never launched |
| `families` | space-separated `word=tier` pairs, tier **light** · **standard** · **frontier**: a model the CLI lists takes the tier of the longest word standing whole in its id, else in its models.dev family, so a new generation keeps its band the day it is listed |

Transcript-source observations above were recorded by the transcript investigation on
2026-09-22. Mint/claim capability belongs only to `docs/agents/<cli>.md` and is not
duplicated in this catalog.

Adding a provider is a section, never a code path. The matching `docs/agents/<cli>.md`
page owns bare, model, dangerous and resume commands. Model: Native is always offered, is
every provider's default, and means no model override. A model is offered when the CLI's
list read by Refresh all reports its id; model info enriches it, never grants
availability.

### Anthropic

- **provider:** `anthropic`
- **cli:** `claude`
- **models_dev:** `anthropic`
- **transcript_source:** Observed 2026-09-22: `~/.claude/projects/<cwd-slug>/<uuid>.jsonl`; one record per completed message. Journal adapter exists; exact launch identity is required.
- **families:** `haiku=light sonnet=standard opus=frontier fable=frontier`

Ronin offers what Claude Code's own picker offers: its catalog's `main` section. The older
generations it files under `overflow` are still served but not offered. Saved CLI names such
as `sonnet` pass through unchanged and are never rewritten by Ronin.

### OpenAI

- **provider:** `openai`
- **cli:** `codex`
- **models_dev:** `openai`
- **families:** `astra=frontier sol=frontier terra=standard luna=light spark=light`
- **transcript_source:** Observed 2026-09-22: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`; ordinal-sequenced records with a session metadata header. Journal adapter exists; fresh Ronin launches isolate the journal home; the id comes from its header.

Model ids are passed unchanged to Codex's `--model` option. Sol, Terra and Luna are
OpenAI's durable capability tiers; the generation number moves on its own cadence.
Availability belongs to the owner's OpenAI account: a model the account cannot use is
refused by Codex in the new tile, and Ronin never substitutes.

### Google

- **provider:** `google`
- **cli:** `gemini`
- **models_dev:** `google`
- **families:** `pro=frontier flash=standard flash-lite=light`
- **transcript_source:** Observed 2026-09-22: `~/.gemini/tmp/<project>/chats/session-*.jsonl`; appended `$set` mutations replace the complete messages array. An adapter must apply mutations and diff messages, not map each line to a message; not implemented here.

Model ids are passed unchanged to Gemini CLI's `--model` option. The free tier serves
Flash models only; Pro needs a paid plan. Not yet exercised end to end through Ronin; the
first real launch of each model is the proof, per `docs/architecture/model-providers.md`.

### xAI

- **provider:** `xai`
- **cli:** `grok`
- **models_dev:** `xai`
- **families:** `grok-4.7=frontier grok-4.6=frontier grok-4.5=standard grok-4.3=standard`
- **transcript_source:** No conversation journal found in the 2026-09-22 investigation. The sessions SQLite file was an empty FTS index; memtrace was memory profiling and logs/unified.jsonl telemetry. No transcript adapter available.

Model ids are passed unchanged to Grok Build's `-m` option. Its Agent page maps
Dangerously to Grok's canonical `--always-approve` spelling.
xAI names no durable family, so its families are the versions themselves. Not yet
exercised through Ronin.

### Hermes API connections

- **provider:** `nous`
- **cli:** `hermes`
- **connections:** `configured`
- **families:** `405b=standard 36b=light`
- **transcript_source:** Not established by the 2026-09-22 transcript investigation; no transcript availability promised.

Hermes is a harness with zero or more configured API connections. `connections: configured`
expands this template from the CLI's saved connection/model inventory on Refresh all.
The retained `nous` id is the legacy empty template, not an inference choice when no
connection is configured. Each measured connection has its own stable Ronin route id;
its actual inference-provider id is passed unchanged to Hermes. Endpoint and credential
configuration remain in Hermes. See `docs/agents/hermes.md` for setup and current limits.

### OpenRouter

- **provider:** `openrouter`
- **cli:** `openrouter`
- **transcript_source:** No launchable CLI integration or verified transcript source declared.
- **maturity:** `comingSoon`

OpenRouter is listed for visibility only: it is not offered by model selectors and
cannot be launched.

Other providers (pi, perplexity, …) arrive the same way: a contributor PR adding a
section, or a section in your own shadow copy.

**Other launch settings** a spawn may carry (not role-level; chosen per session):
launch mode (`configured` / `live_dangerously`).
