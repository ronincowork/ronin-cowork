# Model providers

Ronin launches agents from **one provider catalog**: `ronin_catalogs/MODEL_PROVIDERS.md`.
It owns the provider/model inventory. Every picker, every launch and every
provider fact on screen reads from it, or from the Campaign's **measured provider
summary**, which says what this machine has and when that was measured.

This is intentionally data, not provider code. Adding a provider or model must not add a
route, UI branch, parser branch, or spawn branch.

Provider setup has three records with deliberately different contents:

| Record | Holds |
|---|---|
| this document | the provider/model extension contract |
| `ronin_catalogs/MODEL_PROVIDERS.md` | provider/model facts: tier, cost, what each model is good at and not |
| `docs/agents/<cli>.md` | the executable Native, Model, Dangerously and Resume command forms |
| `docs/operating/secrets.md` | how the owner supplies and audits the credential that pays |

Account identity is handled by `docs/operating/accounts.md`. Secret values never cross into
this document or the catalog.

For CLI-specific particulars and exact code ownership, use the
[Agent integration pages](../agents/README.md). Browser shortcuts belong only to
[Terminal controls](../using-ronin/terminal-controls.md).

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

The `provider` and `cli` fields are the join between the two things Ronin knows about a
provider: the catalog (whose it is, what it offers) and the CLI registry (how it installs,
resumes and is recognised in a tile). The join lives in this data and nowhere else — no
command-word match, no map in a client.

Then a table, one row per model id. It is descriptive metadata keyed by the id the CLI
reports; it never says what is available, and it carries no name of its own:

| Column | Meaning |
|---|---|
| `model` | the provider's concrete model id, passed to the CLI unchanged — the one key |
| `tier` | **light** · **standard** · **frontier**: the vendor's own cost and capability band |
| `cost` | the public list price per million tokens, input · output, with the month it was read in parentheses — a dated reading, never a contract |
| `good at` · `not good at` | one line each, from the vendor's positioning and the public record |

**Two names per model, and no more (owner, 2026-09-25).** `model` is the id every launch
and every saved preference uses. The name shown beside it is the CLI's own display name,
read with its list — "Opus 5.5", "GPT-5.6-Sol" — so the version is always in the title;
a CLI that gives no name shows the id. The catalog carries no display column: a third name
is what hid the version until 2026-09-25. There is no default column either: Model: Native
is every provider's default in every path, and a preference is ⚙ Configuration's to hold.

`src/model-providers.ts` parses this shape and, in `providerRows`, joins it to what each
CLI listed and to the CLI's Agent page for the command. The catalog deliberately contains
no CLI syntax.

**Shadowing.** The shipped file is stock and an upgrade replaces it. A copy at
`$(ronin-store catalogs)/MODEL_PROVIDERS.md` is an **overlay** on it, merged per
`### <Vendor>` section and keyed by the section's `provider` id — the entry-merge every
`## name` catalog gets (`docs/architecture/shadowing.md`), at this file's heading level. A user section
of a shipped id replaces that section whole and keeps its place; a new id appends after
the shipped ones; a user section carrying `- **hidden:** yes` withdraws the shipped
provider. Sections the owner did not write stay the shipped
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
with each Ronin release: the release order in `docs/development/tarball.md` carries the step *refresh
the provider catalog: re-read prices and models, bump `updated`*, and `npm run verify`
refuses a stock catalog with no `updated` line. A shadow copy in the owner's catalogs store
is the owner's to refresh and carries its own `updated` line. Ronin shows the date it has,
stale or not; it never hides it and never guesses a newer one. Each cost also carries the
month it was read.

**One read for the client.** `GET /api/provider-catalog` answers the catalog's own facts,
the record's dates and every provider with its rows already joined —
`{ origin, path, updated, stock_updated, withdrawn, measured_at, refreshed_at, providers: [{ provider, cli, label, cli_label, operational, off, native, launch_modes, models: [rows] }] }`
(`providerCatalogAnswer`) — the only catalog route there is, and since 2026-09-25 the only
join: no client joins anything. The Google, xAI and Nous
sections are written from their vendors' CLI references and price lists and have not yet
been launched end to end through Ronin; the first real launch of each cell is its proof,
per the checklist below.

## One command authority per Agent

The matching `docs/agents/<cli>.md` page owns launch and resume argv. See
[Agent launches](agent-launches.md) for the standard permutations and drift-review method.
`src/agent-launches.ts` reads those fields. `src/agents.ts` retains installation,
version and identity-discovery adapters:

| Field | Command contract |
|---|---|
| `operations.install` | Shell line used by Ronin's visible installer. Empty means Ronin cannot perform it. |
| `operations.update` | Either a package-manager shell line or argv for the installed CLI's native updater. |
| `operations.version` | Args used to read the installed CLI version. |
| `cmd` | Executable name resolved through the owner's login shell. |
| `credentials` | The CLI's own credential files under the home directory; Ronin reads only that one exists. |
| `operations.session.discovery` | The exact identity-discovery adapter, or `unsupported`. |

Current lifecycle particulars and verification limits live in the
[Agent integration pages](../agents/README.md), one page per CLI. Read the CLI's registry
row for executable syntax. A declared resume command does not imply implemented identity
discovery: `discovery: unsupported` makes archive refuse before stopping tmux. Adding
support requires proof of exact conversation identity and a real resume journey.

## The measured summary

What this machine *has* is measured, not derived on every read. The Campaign record
(`campaigns.<id>.providers` in machine settings) keeps one dated summary:

| Field | Meaning |
|---|---|
| `measured_at` | when the machine was last asked |
| `refreshed_at` | when **Refresh all** last ran — every activated CLI's list read, npm asked; `''` when never |
| `installed` | CLI ids found on the login-shell PATH, with `paths` saying where |
| `signed_in` | CLI ids whose own credential file is on this machine — presence only, never read |
| `operational` | CLI ids that can launch: installed, signed in or recorded through **Done**, not turned off, and holding at least one model in the catalog |
| `off` | installed CLI ids the owner turned off; the sign-in is kept |
| `activated_count` | the size of `operational` — a provider with nothing to launch does not count |
| `versions` | what each operational/activated CLI said to the registry's `operations.version` argv, per CLI id; an installed but unactivated CLI is not run |
| `models` | per CLI id, its own model list as **Refresh all** last read it: `{ read_at, by, rows: [{ id, name }] }` in the CLI's order, `by` the CLI version installed at the read; or `{ read_at, by, rows: [], unavailable }` saying why there is none. Never guessed, never inferred from the catalog |
| `latest` | per CLI id, the newest release its npm package listed and when it was asked — asked only by **Refresh all**, never by an ordinary measure, since each ask is an outbound request with its own egress line; kept until the next; absent for a CLI with no npm package to ask |

`src/provider-summary.ts` has two writers and one record:

- `measureAndRecordProviders` — the machine facts; the recorded lists, the last npm answer
  and `refreshed_at` ride along unchanged. At Ronin start, after **Cancel** on a sign-in (a
  sign-in closed without Done may still have left a credential file), after Turn off / on,
  and in the Setup scan.
- `refreshProviders` — **Refresh all**: the same facts, then every activated CLI's own list
  read again, then npm asked. The owner's press (`POST /api/setup/providers/refresh`), and
  once on **Done**, because activating a provider is a press too (owner, 2026-09-25).
  Never a timer, never on open.

**How a list is read is the registry's declaration.** `AGENTS[].operations.models` in
`src/agents.ts` names the reader: `claude-cache` (`~/.claude/cache/model-catalog/*-cc.json`,
`catalog.config.models[].id` and `.name`), `codex-cache` (`~/.codex/models_cache.json`,
`models[]` with `slug`, `display_name`, and `visibility: list`), `command` (run the CLI with
the argv and read the list under *Available models:* — Grok), or `none` (Gemini, Hermes:
Model: Native only, and the surface says so). `readModels` walks that table; no CLI id
appears in it. A new way to read a list is a new key, never an `if`.

Everything else reads the record through `GET /api/setup/runtime`: Ronin Home's three
blocks, the Presets gates, the gbrain next step and the selector summaries. A machine that
has never been measured is measured once on the first read, not guessed. A stale summary
shows its dates. `POST /api/setup/providers/:provider/install` uses the shared installer
and returns the runtime with its explicit `install_open` session attachment. Setup and
Settings mount that attachment on the provider page, including first-run sign-in. It stays
available after the binary appears, until Cancel ends the session and measures again.
There is no completion hook in the installer; closing the tile, reopening Model providers,
or restarting Ronin refreshes the measured installation and credential facts.

Every launchable provider's Agent page declares a bare command. Choosing Native in the
Model field passes no model choice to the CLI. A named model row exists only because that
CLI's list (`models[cli].rows`) reports its id; the catalog may enrich the id with tier,
cost and descriptions, but cannot make an unreported model available, and a row the CLI
lists that the catalog does not describe is offered all the same, with the CLI's name and
no tier. With no list read, Native is the only Model choice; Launch mode remains an
independent axis.

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
| cmd | the Agent page's Model command rendered with the row's model id |
| row order | the order the picker offers that provider's models in |
| default | the marked row, else the first: what answers when `agents.sessions.by_provider.<provider>` is unset. Not a stored default |

The model id and the command must agree: `openai · gpt-5.6-terra` resolves to a Codex
command carrying `--model gpt-5.6-terra`; it must never resolve to bare `codex` and
inherit an unseen local default. The internal `configured` launch mode is labelled Native;
on that axis it means no permission override, independently of Model. `live_dangerously`
uses the Agent page's complete dangerous form and is unavailable when none is declared.

The launch path does no provider interpretation, but it does adapt to the agent's terminal
interface after starting the command:

```text
MODEL_PROVIDERS.md facts + docs/agents/<cli>.md commands
  → GET /api/provider-catalog
  → the one picker (providerModelPair, public/js/form-steps.js)
  → POST /api/launch { cmd, launch_mode }
  → combine the Model and Launch mode choices into one complete command
  → run the resolved cmd in the new tile
  → recognize dialog or ready prompt
  → type the built brief
  → submit it and verify that it left the prompt
```

## The one picker

Every place the product asks *which provider, and which model* is one control:
`providerModelPair` in `public/js/form-steps.js`. New Agent, New Team, Add Agent to Team,
the Campaign's Team and Agent defaults, Team Configuration, ⚙ Configuration (the general default,
each provider's preferred model, and Mika's row), cowork setup and the Presets rows all call
it; none keeps a list, a join or a vendor's name of its own. The picker reads the rows the
server joined (`GET /api/provider-catalog`) and what this machine measured of each CLI
(`GET /api/setup/runtime`, which answers from the Campaign's recorded summary and never
probes), and it offers:

- every provider in the catalog with Native and every model its CLI listed on the last
  Refresh all, the providers this machine can launch first and the rest after, the
  CLI's own order within each;
- each model as `<name> · <tier>`, the id as the value, and no further — the tier is the
  one descriptor carried into the choice. What a model is good at and not good at is the
  Model providers surface's to show, where the table has room for it; an option line does
  not, and a description squeezed into one is read by nobody;
- what this machine cannot launch **disabled, never hidden** — a greyed row says *not on
  this machine* or *turned off*. A provider whose list was never read offers Native alone.

Either pick may stand alone: a provider with Model set to Native resolves to the Agent
page's no-model command; both blank is the level above's answer (the Team's, the Campaign's,
the install's). A row whose provider is fixed (⚙'s *Preferred <provider> model*, Mika) is
the same control with the provider select dropped. The registry's seeds read the same
rows: `models:first` is the marked default of the first launchable provider, `models:light`
the first launchable **light** row — there is no name-pattern for "cheap".

## The Model providers surface, on two seats

One surface (`public/js/provider-surface.js`), one definition under one type, seated by two
selector cards: Ronin Setup's **Model providers** and Ronin Settings' **Model providers**
open the same thing, and both cards read *N providers · M models · K activated here ·
catalog updated <date>*. At the top sits the one door: **Refresh all model providers**,
with *Last ran <date>* beside it, or *Never run — every provider offers Native only until
it runs*. It is the owner's press, never a timer: it measures the machine, reads every
activated CLI's own model list, and asks npm for each one's newest release. Below it the
whole inventory on the shared stone work surface: one stone per CLI the registry knows,
wearing its measured state and the vendor it serves with its model count, then any catalog
provider no registry CLI serves. The header says which catalog copy is shown and its date —
the catalog is a snapshot, not live data.

A stone opens that provider, top to bottom: **Yours**, the three measured steps (install ·
authenticate with the native sign-in tile, Done and Cancel · ready) read from the runtime
row (`docs/getting-started/setup-workbench.md`, *Activate a provider*); then **The catalog**, the three
measured facts, one line saying when its list was read and by which CLI version (or why
there is none, or that Refresh all has not run), and the model table. Model: Native is
first and marked as the default. Every named row came from the CLI's list, in the CLI's
order, and its Model cell carries both names: the CLI's own in bold, the id beneath.
Matching catalog metadata adds tier, cost, good-at and not-good-at; a model the catalog
does not describe is in the table all the same. Catalog-only names never enter this table
or a selector. The native sign-in tile is mounted through the workbench environment's one
shared mount (`public/js/provider-setup-session.js`), which both Ronin Setup and Ronin
Settings hand their environment, so it works on either seat. Showing the surface paints
the record; only Refresh all reads. Its rows are the one picker's read, so the surface and
every picker cannot disagree.

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

**Versions, Refresh all, Update — for activated providers only.** A provider that is not
activated gets nothing spent on it (owner's rule, 2026-09-09): Ronin does not run it, does
not ask its package source, does not read its list, and offers no control; its step says
*Installed* and stops, never a stale version and never "not read", since nothing was asked.
An activated CLI's Install step says its version, which binary said it, and, once **Refresh
all** has asked, the newest release its package source lists: *Installed 0.151.0 · 0.153.4
available · ~/.local/bin/codex*, or *up to date*, or *latest unknown: no package source to
ask* when its install line names no npm package. Refresh all asks the npm registry for each
activated CLI whose registry install line names an npm package — one outbound request
each, on the egress record, only on this press. **Update** runs the registry's `operations.update` line in a temporary
`provider_setup` session shown in the page exactly as a sign-in is. The same **Cancel** ends
all three temporary sessions — install, sign-in and update — through one teardown; npm is
pointed at the owner's own prefix, so no box needs root and the owner
answers nothing. It is the owner's press, never Ronin's. Tiles already running keep the
binary they started with until they turn over; every launch after the update reads the new
one, by absolute path from the login shell's resolution, and by name too, because a newborn's
PATH carries Ronin's install bin dir (`docs/architecture/operator-connection.md`). Some CLIs usually
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
  Delivery and Mika's startup read use the whole table; the board does not. What an Agent is
  doing on the roster is its **stance**, derived from the journal by the transcript part and
  carried on the session row — the one thing still read off the pane for it is `asking`
  (`asksForInput`), because a dialog writes no journal line in any CLI, and it takes
  precedence ([Tile](../using-ronin/tile.md)).
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
the provider's real model ids:

```markdown
### Example

- **provider:** `example`
- **cli:** `example`
| model | tier | default | cost | good at | not good at |
|---|---|---|---|---|---|
| `model-a` | standard | yes | $1 in · $4 out per M tokens (2026-09) | everyday work | deep reasoning |
| `model-b` | light | | $0.20 in · $1 out per M tokens (2026-09) | bulk and speed | large refactors |
```

The command must start an interactive coding agent in the current directory and remain
alive to receive Ronin's opening brief. A raw HTTP client or one-shot completion command
is not a session agent. Record its complete permutations in `docs/agents/example.md`.
A new CLI also needs its registry row in `src/agents.ts`; the
catalog's `cli` must name an existing row, and `npm run verify` checks that it does.

## Adding an OpenAI-compatible provider

Protocol compatibility does not make the provider `openai`. Give DigitalOcean, Hugging
Face, or another service its own section so the picker states who receives the request
and whose account pays for it.

When Codex is the interactive client, keep endpoint/authentication configuration in a
named Codex profile. Before offering it, extend Codex's Agent command grammar to represent
the profile explicitly; provider-specific command syntax never belongs in the fact table:

```markdown
### Example

- **provider:** `example`
- **cli:** `codex`

| model | tier | default | cost | good at | not good at |
|---|---|---|---|---|---|
| `vendor/model-a` | standard | yes | … (2026-09) | … | … |
```

The profile owns the compatible endpoint and protocol settings. Its credential comes
from an environment variable or the provider's supported login store, following
`docs/operating/secrets.md`. Neither the secret nor its value belongs in this repository, the
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
6. Update the Agent page's complete command permutations and unsupported forms.
7. Run `npm run check:catalogs` and the focused provider tests affected by the change.
   Leave full `npm run verify` to the lead's combined gate unless an earlier run is
   explicitly requested ([verification guidance](../development/verification.md)).
8. Launch every new row through ＋ New session. Confirm the receipt's command, the agent
   and model visible in the tile, and the complete startup request received by the agent.


## Setup sessions and sign-in descriptions

`src/setup-session.ts` creates and identifies temporary setup sessions for provider
installation, sign-in and update, and GitHub installation and authentication. Each runtime
publishes the same explicit session attachment. Each opens a normal tmux shell and
runs the command inside it, so exiting the CLI returns to the shell prompt. Both UIs mount it through
`provider-setup-session.js`; Cancel ends the temporary tmux session.

Done saves an owner-described `sign_in` record under
`setup.providers.<cli>.sign_in` in machine settings: `method` (`subscription`, `api_key`,
`third_party`), `label`, and `recorded_at`. An explicit null clears that description.
It contains no credentials and does not establish authentication, change the CLI's
configuration, or select an account for future launches. Activation preserves the record.
