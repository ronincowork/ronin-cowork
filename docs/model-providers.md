# Model providers

Ronin launches agents from **one provider catalog**: `ronin_catalogs/MODEL_PROVIDERS.md`.
It is the only place a provider or a model is named. Every picker, every launch and every
provider fact on screen reads from it, or from the Campaign's **measured provider
summary**, which says what this machine has and when that was measured.

This is intentionally data, not provider code. Adding a provider or model must not add a
route, UI branch, parser branch, or spawn branch.

Provider setup has three records with deliberately different contents:

| Record | Holds |
|---|---|
| this document | the provider/model extension contract |
| `ronin_catalogs/MODEL_PROVIDERS.md` | every provider and model: tier, cost, what it is good at and not, the complete launch command |
| `ronin_sops/secrets.md` | how the owner supplies and audits the credential that pays |

Account identity is handled by `ronin_sops/accounts.md`. Secret values never cross into
this document or the catalog.

## The catalog

The file's header carries one field of its own:

| Field | Meaning |
|---|---|
| `updated` | `YYYY-MM-DD`: the day the catalog's models, prices and descriptions were last read from the public record |

Then one `### <Vendor>` section per provider. The section's fields:

| Field | Meaning |
|---|---|
| `provider` | the vendor id a launch names (`anthropic`, `openai`, `google`, `xai`, `nous`) and the key of `agents.sessions.by_provider` |
| `cli` | the id of the CLI that serves it in `src/agents.ts` (`claude`, `codex`, `gemini`, `grok`, `hermes`) |
| `gbrain_disconnected` | the CLI's flag for a launch with no MCP servers; a provider without one cannot launch disconnected |
| `live_dangerously` | the CLI's additive flag for the Dangerously launch mode; a provider without one refuses that mode |

The `provider` and `cli` fields are the join between the two things Ronin knows about a
provider: the catalog (whose it is, what it offers) and the CLI registry (how it installs,
resumes and is recognised in a tile). The join lives in this data and nowhere else — no
command-word match, no map in a client.

Then a table, one row per model, in the order the picker offers them:

| Column | Meaning |
|---|---|
| `model` | the provider's real model id, passed to the CLI unchanged — never a euphemism |
| `tier` | **light** · **standard** · **frontier**: the vendor's own cost and capability band |
| `default` | `yes` on the one row a launch naming this provider and no model gets when ⚙ Configuration holds no preference for it; the first row when no row says so |
| `cost` | the public list price per million tokens, input · output, with the month it was read in parentheses — a dated reading, never a contract |
| `good at` · `not good at` | one line each, from the vendor's positioning and the public record |
| `launch` | the complete interactive command for that model: the `session_launch_spec` cell |

A section may spread the columns over two tables (facts in one, `launch` in another) or
keep one wide table; rows are joined by model id and the first table sets the order. A row
without a `launch` cell is a name in a list, not a launchable spec, and `npm run verify`
refuses it. `src/model-providers.ts` parses this shape and nothing else does.

**Shadowing.** The shipped file is stock and an upgrade replaces it. A copy at
`$(ronin-store catalogs)/MODEL_PROVIDERS.md` is an **overlay** on it, merged per
`### <Vendor>` section and keyed by the section's `provider` id — the entry-merge every
`## name` catalog gets (`docs/shadowing.md`), at this file's heading level. A user section
of a shipped id replaces that section whole and keeps its place; a new id appends after
the shipped ones; a user section carrying `- **hidden:** yes`, or whose every `launch` cell
is `—`, withdraws the shipped provider. Sections the owner did not write stay the shipped
ones and keep improving with each release. Every entry the catalog serves carries its
`origin` (`stock` | `user`) and `shadowed`, and the Model providers surface says it in
words under each provider — *Shipped catalog · updated …*, *Yours · not in the shipped
catalog*, or *Your copy of this section replaces the shipped one*, with the honest cost
beside it: a section replaces whole, so one edited price forks the vendor's section until
the owner takes the next shipped update. The catalog object carries both dates,
`stock_updated` and the owner's copy's `updated`, never borrowing one for the other, and
`withdrawn`, the shipped providers the copy set aside. Seed a copy with the house header
(`seedUserCatalog`) or copy one section out of the shipped file to start from.

**Keeping it fresh.** The catalog is a snapshot, not live data. The stock file is refreshed
with each Ronin release: the release order in `docs/tarball.md` carries the step *refresh
the provider catalog: re-read prices and models, bump `updated`*, and `npm run verify`
refuses a stock catalog with no `updated` line. A shadow copy in the owner's catalogs store
is the owner's to refresh and carries its own `updated` line. Ronin shows the date it has,
stale or not; it never hides it and never guesses a newer one. Each cost also carries the
month it was read.

**One read for the client.** `GET /api/provider-catalog` answers the catalog object whole,
`{ origin, path, updated, providers: [{ provider, cli, label, models: [...] }] }` — the same
object `readProviderCatalog()` gives the server, and the only catalog route there is. The Google, xAI and Nous
sections are written from their vendors' CLI references and price lists and have not yet
been launched end to end through Ronin; the first real launch of each cell is its proof,
per the checklist below.

## One command registry

`src/agents.ts` is the single executable registry for agent-provider CLI syntax. A route,
installer, archive lifecycle, or UI must not spell a provider command itself. It holds
CLI facts only — the vendor's name and its models are the catalog's. Each row owns:

| Field | Command contract |
|---|---|
| `operations.install` | Shell line used by Ronin's visible installer. Empty means Ronin cannot perform it. |
| `operations.update` | Either a package-manager shell line or argv for the installed CLI's native updater. |
| `operations.version` | Args used to read the installed CLI version. |
| `cmd` | Executable name resolved through the owner's login shell. |
| `credentials` | The CLI's own credential files under the home directory; Ronin reads only that one exists. |
| `initial` | Whether a new interactive launch accepts the brief positionally. |
| `operations.session.newIdFlag` | Optional flag for a Ronin-minted new conversation UUID. |
| `operations.session.resume` | Arguments before the provider conversation UUID. |
| `operations.session.discovery` | The exact identity-discovery adapter, or `unsupported`. |

Current verified lifecycle syntax:

| Agent CLI | New conversation identity | Resume | Archive support |
|---|---|---|---|
| Claude Code | `claude --session-id <uuid> …` | `claude --resume <uuid>` | yes; exact legacy fallback also exists |
| Codex | discovered from matching open rollout + writer-lock FDs | `codex resume <uuid>` | yes |
| Gemini CLI | CLI-managed UUID | `gemini --resume <uuid>` | command verified; identity discovery not yet integrated, so no |
| Grok Build | not verified | not verified | no |
| Hermes | not verified | not verified | no |

Upstream command references used for these rows: [Claude CLI and update reference](https://code.claude.com/docs/en/cli-reference),
[Codex CLI repository](https://github.com/openai/codex), [Gemini CLI reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md),
[Grok Build overview](https://docs.x.ai/build/overview)
and [Hermes CLI reference](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md).
They are evidence for maintainers; they are not runtime inputs. Runtime consumers read
`AGENTS[].operations` only.

“Not verified” and `discovery: unsupported` are executable behavior: archive refuses before
stopping tmux. Adding support means verifying the installed CLI's own help, locating its
exact current-session identity without ambiguity, and proving a real resume journey; then
change its one registry row and this table together. Do not infer syntax from another
provider.

## The measured summary

What this machine *has* is measured, not derived on every read. The Campaign record
(`campaigns.<id>.providers` in machine settings) keeps one dated summary:

| Field | Meaning |
|---|---|
| `measured_at` | when the machine was last asked |
| `installed` | CLI ids found on the login-shell PATH, with `paths` saying where |
| `signed_in` | CLI ids whose own credential file is on this machine — presence only, never read |
| `operational` | CLI ids that can launch: installed, signed in or recorded through **Done**, and holding at least one model in the catalog |
| `activated_count` | the size of `operational` — a provider with nothing to launch does not count |
| `versions` | what each operational/activated CLI said to the registry's `operations.version` argv, per CLI id; an installed but unactivated CLI is not run |
| `latest` | per CLI id, the newest release its npm package listed and when it was asked — asked only by **Refresh** on the Model providers surface, never by an ordinary measure, since each ask is an outbound request with its own egress line; kept until the next Refresh; absent for a CLI with no npm package to ask |

`src/provider-summary.ts` measures and records it. It is written:

- at Ronin start;
- after **Done** and after **Close** on the Setup Model providers surface (a sign-in
  closed without Done may still have left a credential file);
- whenever the Setup **Model providers** surface is opened — that surface paints the record
  first, then probes behind it with `POST /api/setup/providers/measure` and repaints.

Everything else reads the record through `GET /api/setup/runtime`: Ronin Home's three
blocks, the Presets gates, the gbrain next step and the selector summaries. A machine that
has never been measured is measured once on the first read, not guessed. A stale summary
shows its date. Agent installs run in a tile with no completion hook in the server, so a
freshly installed CLI shows on the next visit to Model providers or the next Ronin start;
a count that lags an install by that much is the measurement, not a bug.

## Provider and agent are different axes

The **provider** serves inference and bills the request. The **agent CLI** is the
interactive process in the tile. OpenAI through Codex, DigitalOcean through Codex, and
Hugging Face through Codex are three provider configurations but one agent interface.
They share Codex's new-session behavior. A provider with its own CLI introduces a new
agent interface and must satisfy the new-session contract below.

This distinction is what keeps an OpenAI-compatible addition small without pretending
every terminal agent behaves like Claude.

## The contract

| Part | Meaning |
|---|---|
| provider | the vendor id shown before the dot in the picker; the section's `provider` field |
| cli | the registry row that serves it; the section's `cli` field |
| model | the provider's real model id, from the row's `model` column |
| cmd | the complete interactive agent command in the row's `launch` cell |
| row order | the order the picker offers that provider's models in |
| default | the marked row, else the first: what answers when `agents.sessions.by_provider.<provider>` is unset. Not a stored default |

The model id and the command must agree: `openai · gpt-5.6-terra` resolves to a Codex
command carrying `--model gpt-5.6-terra`; it must never resolve to bare `codex` and
inherit an unseen local default. A provider also declares its additive `live_dangerously`
flag. The `configured` launch mode leaves the cell command unchanged; `live_dangerously`
appends that flag for this launch and refuses when none is declared.

The launch path does no provider interpretation, but it does adapt to the agent's terminal
interface after starting the command:

```text
MODEL_PROVIDERS.md row
  → GET /api/provider-catalog
  → the one picker (providerModelPair, public/js/form-steps.js)
  → POST /api/launch { cmd, launch_mode }
  → append the provider flag only for live_dangerously
  → run the resolved cmd in the new tile
  → recognize dialog or ready prompt
  → type the built brief
  → submit it and verify that it left the prompt
```

## The one picker

Every place the product asks *which provider, and which model* is one control:
`providerModelPair` in `public/js/form-steps.js`. New Agent, New Team, Add Agent to Team,
the Campaign's Agent defaults, Team Configuration, ⚙ Configuration (the general default,
each provider's preferred model, and Mika's row), cowork setup and the Presets rows all call
it; none keeps a list, a join or a vendor's name of its own. The picker reads the catalog
itself (`GET /api/provider-catalog`: its origin, its `updated` date, and one entry per
provider with the vendor's label and its model rows) and what this machine measured of each
CLI (`GET /api/setup/runtime`, which answers from the Campaign's recorded summary and never
probes), joined on the catalog's own `cli` field, and it offers:

- every provider and every model in the catalog, the providers this machine can launch
  first and the rest after, in catalog order within each group;
- each model as `<id> · <tier>`, and no further — the tier is the one descriptor carried
  into the choice. What a model is good at and not good at is the Model providers
  surface's to show, where the table has room for it; an option line does not, and a
  description squeezed into one is read by nobody;
- what this machine cannot launch **disabled, never hidden** — the list teaches what
  Ronin offers, and a greyed row says *not on this machine*.

Either pick may stand alone: a provider with no model resolves to that provider's marked
default server-side; both blank is the level above's answer (the Team's, the Campaign's,
the install's). A row whose provider is fixed (⚙'s *Preferred <provider> model*, Mika) is
the same control with the provider select dropped. The registry's seeds read the same
rows: `models:first` is the marked default of the first launchable provider, `models:light`
the first launchable **light** row — there is no name-pattern for "cheap".

## The Model providers surface, on two seats

One surface (`public/js/provider-surface.js`), one definition under one type, seated by two
selector cards: Ronin Setup's **Model providers** and Ronin Settings' **Model providers**
open the same thing, and both cards read *N providers · M models · K activated here ·
catalog updated <date>*. Its first face is the whole inventory on the shared stone work
surface: one stone per CLI the registry knows, wearing its measured state and the vendor it
serves with its model count, then any catalog provider no registry CLI serves. The header
says which catalog copy is shown and its date — the catalog is a snapshot, not live data:
*Catalog updated <date> · prices and models as read then; refreshed with each Ronin update*
for the stock file, *Your catalog copy, updated <date>* when the owner's store shadows it —
and when this machine was last measured.

A stone opens that provider, top to bottom: **Yours**, the three measured steps (install ·
authenticate with the native sign-in tile, Done and Close · ready) read from the runtime
row (`docs/setup-workbench.md`, *Activate a provider*); then **The catalog**, the three
measured facts, dated, and the model table — model, tier, cost as read, good at, not good
at — with the marked default said. The native sign-in tile is mounted through the
workbench environment's one shared mount (`public/js/provider-setup-session.js`), which
both Ronin Setup and Ronin Settings hand their environment, so it works on either seat.
This surface is the one client that measures: showing it paints the Campaign's recorded
summary immediately, then probes the machine behind that frame, writes the new summary and
repaints; its catalog rows are the one picker's read, so the surface and every picker cannot disagree.

**Activation is the one switch.** It decides whether Ronin spends anything on a
provider. **Turn off**, on the Ready step, writes Ronin's own `setup.providers.<cli>.off_at`
and nothing else: the provider is then not measured, not asked for its latest, not offered
an Update, greyed in every picker with the words *turned off*, and refused for new
launches with its own sentence — *turned off on this machine; your sign-in is kept*. No
vendor file is touched, the sign-in stays, and tiles already running run on; what the CLI
does on its own in the background is not Ronin's business. **Turn on** deletes the field,
and a provider still signed in by its file is operational again at once. `off_at` outranks
both the credential file and `activated_at`, because `operational` is derived from those
and neither can be unset. A provider never activated is not refused at launch; it opens
its own sign-in in the tile, as it always has.

**Versions, Refresh, Update — for activated providers only.** A provider that is not
activated gets nothing spent on it (owner's rule, 2026-09-09): Ronin does not run it, does
not ask its package source, and offers no control; its step says *Installed* and stops,
never a stale version and never "not read", since nothing was asked. An activated CLI's
Install step says its version, which binary said it, and, once **Refresh** has asked, the
newest release its package source lists: *Installed 0.151.0 · 0.153.4 available · ~/.local/bin/codex*, or *up to date*, or
*latest unknown: no package source to ask* when its install line names no npm package.
Refresh lives inside **Check dates**, the box of what is known and when: it measures the
machine again and asks the npm registry for each operational/activated CLI whose registry
install line names an npm package — one outbound request each, on the egress record, only
on this press — and then says what it found with the time, *Checked … — unchanged* or the
numbers that moved. **Update** runs the registry's `operations.update` line in a temporary
`provider_setup` session shown in the page exactly as a sign-in is. The same **Close** ends
all three temporary sessions — install, sign-in and update — through one teardown; npm is
pointed at the owner's own prefix, so no box needs root and the owner
answers nothing. It is the owner's press, never Ronin's. Tiles already running keep the
binary they started with until they turn over; every launch after the update reads the new
one, by absolute path from the login shell's resolution, and by name too, because a newborn's
PATH carries Ronin's install bin dir (`docs/operator-connection.md`). Some CLIs usually
update themselves; the row says so as information, but a failed self-update that leaves an
authenticated provider behind still offers the manual Update.

## New-session integration contract

Starting the right executable is only half of adding an agent. A usable
`session_launch_spec` must carry the owner's startup request into a ready agent exactly
once. Every distinct agent CLI must define and prove these terminal behaviors:

| Stage | Ronin must know |
|---|---|
| launch | The complete command, model selector, profile and required permission policy |
| dialog | How trust/login/choice screens appear, so Ronin waits and never answers for the owner |
| ready | The prompt marker that means the CLI can accept the initial brief |
| pending text | How typed-but-unsubmitted text is distinguished from dim suggestions |
| submit | Which key submits, and how Ronin can verify the prompt actually cleared |
| busy | What visible cue means the agent is working rather than ready |

The implementation seam is deliberately small:

- `src/status.ts` classifies visible terminal text as ready, working, or awaiting input.
- `src/send.ts` reads the active prompt, types the brief, submits it, and verifies it left.
- `src/routes/launch.ts` builds the brief and runs that handshake after the CLI starts.
- `tests/agent-prompts.test.ts` holds terminal fixtures for every supported prompt/dialog
  form.

Pattern order is safety-critical: a selected dialog row must be recognized before a
generic prompt marker. Claude uses `❯`; Codex uses `›` for both its prompt and its selected
trust row. Treating either glyph as universally ready can answer a trust question and
discard the owner's brief.

An OpenAI-compatible provider using an already-supported Codex profile inherits this
contract and normally needs no source change. A provider's native CLI does not: capture
its real startup, trust dialog, empty prompt, typed prompt and working screen; add those
fixtures and the smallest corresponding patterns before adding its catalog section.

## Adding a native provider

Give a provider its own section in `ronin_catalogs/MODEL_PROVIDERS.md` (or in your shadow
copy). Name its vendor id and the registry row that serves it, then one row per model with
the provider's real model ids and a complete command in each `launch` cell:

```markdown
### Example

- **provider:** `example`
- **cli:** `example`
- **live_dangerously:** `--yes`

| model | tier | default | cost | good at | not good at | launch |
|---|---|---|---|---|---|---|
| `model-a` | standard | yes | $1 in · $4 out per M tokens (2026-09) | everyday work | deep reasoning | `example-agent --model model-a` |
| `model-b` | light | | $0.20 in · $1 out per M tokens (2026-09) | bulk and speed | large refactors | `example-agent --model model-b` |
```

The command must start an interactive coding agent in the current directory and remain
alive to receive Ronin's opening brief. A raw HTTP client or one-shot completion command
is not a session agent. A new CLI also needs its registry row in `src/agents.ts`; the
catalog's `cli` must name an existing row, and `npm run verify` checks that it does.

## Adding an OpenAI-compatible provider

Protocol compatibility does not make the provider `openai`. Give DigitalOcean, Hugging
Face, or another service its own section so the picker states who receives the request
and whose account pays for it.

When Codex is the interactive client, keep endpoint/authentication configuration in a
named Codex profile and put only the profile plus model selection in the launch cells:

```markdown
### Example

- **provider:** `example`
- **cli:** `codex`

| model | tier | default | cost | good at | not good at | launch |
|---|---|---|---|---|---|---|
| `vendor/model-a` | standard | yes | … (2026-09) | … | … | `codex --profile example --model vendor/model-a` |
```

The profile owns the compatible endpoint and protocol settings. Its credential comes
from an environment variable or the provider's supported login store, following
`ronin_sops/secrets.md`. Neither the secret nor its value belongs in this repository, the
catalog, a project_root, or a launch command.

OpenAI-compatible is a claim to verify, not a blanket guarantee. Before adding rows,
prove that the provider supports the API shape the current Codex CLI uses, streaming,
tool calls, and the chosen model IDs. Then launch one real session through Ronin and
confirm that the tile reaches a prompt and receives the complete built brief.

## Candidate examples

- **DigitalOcean Gradient AI** documents `https://inference.do-ai.run` as its serverless
  inference base and explicitly describes Codex and other coding agents as supported
  clients. Its model access key stays outside Ronin. Add a `digitalocean` section only
  after a named Codex profile and at least one exact model ID have been exercised end to end.
- **Hugging Face Inference Providers** documents an OpenAI-compatible chat-completions
  endpoint at `https://router.huggingface.co/v1` and model IDs such as
  `openai/gpt-oss-120b:cerebras`. Its compatibility is currently described for chat
  completions, so do not assume it satisfies Codex's full agent/tool protocol; prove that
  with the installed CLI before adding a `huggingface` section.

These are examples, not stock catalog entries. A provider's rows are offered in the
picker whether or not this machine can launch them — the single picker says beside each
what this machine has — and its setup must be stateable without putting a credential in
the shipped catalog.

## Addition checklist

1. Verify the provider's current first-party API, model and price documentation; date the
   cost reading.
2. Decide whether this is a new provider profile for a supported agent CLI or a new agent
   terminal interface.
3. Configure and test the CLI/profile outside Ronin; keep credentials out of the repo.
4. For a new agent CLI, capture and test every new-session state in the contract above,
   and add its registry row to `src/agents.ts`.
5. Add one provider section with its `provider` and `cli` fields and one row per model,
   with real model ids; mark the default row; fill tier, cost, good at and not good at.
6. Make permission/sandbox policy explicit in the launch cell and declare the
   `live_dangerously` and `gbrain_disconnected` flags the CLI has.
7. Run `node scripts/check-tests.mjs`, `npx tsx scripts/check-catalogs.ts`, and
   `npm run verify`.
8. Launch every new row through ＋ New session. Confirm the receipt's command, the agent
   and model visible in the tile, and the complete startup request received by the agent.
