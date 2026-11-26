# Model providers

For Gateway, OpenRouter, private API connections and their named models, see [Model services](model_services_README.md).

For native CLI launches, Ronin joins three records in one place (`providerRows`,
`src/model-providers.ts`). Each CLI in `src/agents.ts` names the vendor it serves. Which
models can launch is each signed-in CLI's own list, in the Campaign's **measured provider
summary**. What each model is for is **HQ's model catalog**: one Models table on HQ's admin
page, each CLI model's tier, its "use it for" line and its facts, sent to every office through
its park (plan `ronin_hosted/model-catalog`, KAN-827).

Adding a model must not add a route, UI branch, parser branch, or spawn branch: a CLI lists
it, and Glen rates it in HQ's table.

Provider setup has these records, with deliberately different contents:

| Record | Holds |
|---|---|
| this document | the provider/model extension contract |
| `src/agents.ts`, `vendor` | per CLI: the vendor id a launch names, the vendor's name, its transcript source, an optional maturity |
| HQ's model catalog (`src/model-catalog.ts`) | per CLI model (cli + id): tier, "use it for" line, facts |
| `docs/agents/<cli>.md` | the executable Native, Model, Dangerously and Resume command forms |
| `docs/operating/secrets.md` | how the owner supplies and audits the credential that pays |

Account identity is handled by `docs/operating/accounts.md`. Secret values never cross into
this document or any catalog.

For CLI-specific particulars and exact code ownership, use the
[Agent integration pages](../agents/README.md). Browser shortcuts belong only to
[Terminal controls](../using-ronin/terminal-controls.md).

## The vendor beside each CLI

Each `AGENTS` row in `src/agents.ts` carries its `vendor`:

| Field | Meaning |
|---|---|
| `provider` | the vendor id a launch names (`anthropic`, `openai`, `google`, `xai`, `hermes`, `github`, `opencode`, `moonshot`) and the key of `agents.sessions.by_provider` |
| `label` | the vendor's name, as the pickers and `GET /api/setup/runtime` (`providers[].from`) show it |
| `transcript_source` | dated, descriptive journal location and write discipline; availability requires a supported adapter and verified launch identity, not merely a file at that path |
| `maturity` | optional: `beta`, or `comingSoon`, which shows the provider and never launches it |

`listProviders()` reads them; `GET /api/setup/runtime` keeps `providers[].provider` and
`.from` by these names, and the park reads them. The join lives here and nowhere else — no
command-word match, no map in a client. The CLI's own particulars are its
[Agent page](../agents/README.md).

## HQ's model catalog

Glen keeps one Models table on HQ's admin page: every model each CLI offers, `cli` + `id`
exactly as that CLI lists it, in his order, with its tier (`light` · `standard` ·
`frontier`), a "use it for" line in his words, and its facts. The park carries it to each
office; the kohai writes `office_unit/models.json`:

```text
{ at, models: [ { cli, id, name, tier, use_for, context, output,
                  price: { input, output }, released, knowledge, reasoning, tools } ] }
```

Price is USD per million tokens. A fact HQ doesn't have is absent, never guessed. The
Services `model_catalog` part reads the file at start and on every change and hands it whole
to Cowork (`setModels` on the Sockets); `src/model-catalog.ts` keeps the last one in the
`model_catalog` store, so a restart or a stopped park still has it. No catalog yet is no
rows: every listed model is then Unrated.

The catalog never grants a model: a model is offered because its CLI lists it, and a catalog
row the CLI doesn't list is not offered.

**Two names per listed model, and no more (owner, 2026-09-25).** `model` is the id every
new picker choice uses. The name shown beside it is the CLI's own display name,
read with its list — "Opus 5.5", "GPT-5.6-Sol" — so the version is always in the title;
a CLI that gives no name shows the id. A third name is what hid the version until 2026-09-25. There is no default column either: Model: Native
is every provider's default in every path, and a preference is ⚙ Configuration's to hold.
A saved or explicitly supplied CLI model name absent from the refreshed list is passed
unchanged to the named provider. Ronin does not maintain or rewrite an alias map.

`providerRows` joins each CLI's vendor, what the CLI listed, HQ's catalog row on cli + id,
and the CLI's Agent page for the command. Neither record holds CLI syntax.

**The rows a provider offers (KAN-829).** Native first, then every model the CLI lists,
grouped by the catalog's tier — Frontier, Standard, Light, each in the catalog's order —
then **Unrated**: a listed model the catalog lacks, in the CLI's order, with no line. Each
rated row carries `tier`, `use_for` and `facts` (`context`, `output`, `price`, `released`,
`knowledge`, `reasoning`, `tools`, whichever HQ has). Several models may share a tier; Mika's
Light → Standard → Frontier cascade takes the first of each tier, the catalog's order.

## Model services

A service connection owns its endpoint, wire protocol, credential reference and named model setups. Each setup has a stable ID and an upstream model ID. Gateway discovery populates its service; personal services use owner-defined entries. GET /api/model-services groups these entries by connection. The on-disk store keeps its original name and IDs for compatibility. Catalog rows carry service_id and service_name for filtering. Native CLI authentication is independent.

### OpenRouter starters

HQ Admin publishes OpenRouter starter names and exact model IDs through the existing HQ model catalog as rows with `cli: "openrouter"`. A newly connected OpenRouter service seeds the intersection of those rows and the authenticated `/models/user` list. Once seeded, users can edit or remove those model options on their OpenRouter connection. Refreshing, rotating a key or receiving another catalog preserves edits and removals. Before the first starter catalog arrives, a new connection remains eligible. Inference uses the key configured for that OpenRouter connection at OpenRouter.

## Hermes connections and model options

Hermes is one provider in the existing Model provider dropdown. Its Model dropdown
lists Ronin-owned setup names, identified by stable UUIDs. Each setup references an API
connection and pins an actual model, reasoning effort and approvals. Connection discovery
asks the selected endpoint's `/models`; personal services also accept an explicitly entered model ID.
This proves model-list access, not per-model inference compatibility.

The Ronin Gateway's model options are its own list: one per model Ronin Gateway last listed,
named as it, with default reasoning and approvals off. They are never saved or edited; their id is
`<connection id>/<model id>` (`withGatewayOptions`, src/hermes-setups.ts). The list is read at start-up
and on Refresh, and a failed read keeps the last one. Saved setups are only the ones people name, on an
API key or OpenRouter.

`hermes-setups.ts` owns validation, serialized mutation, secret-free projection and fresh
home provisioning. `/api/hermes` reads the projection; POST `/api/hermes/{connection,
discover,setup,delete}` owns writes. The credential store holds metadata plus one
private dotenv credential file per connection. Keys never enter catalog or route answers.
The Models worksurface has connection and setup editors instead of Authenticate/Ready.
Provider-key environment pairs are reconciled on read and appear automatically, without
an import action. Environment credentials remain authoritative for those connections.

The launch join keeps the setup identity until process start and resolves it to the upstream model there. Cowork launch creates
`<session-record>/cli-home`, saves immutable settings and links the connection credential.
Two agents using the same setup have independent histories and memories. Setup changes
apply to future launches; key rotation reaches existing homes on process restart. Removing
a referenced connection is refused; removed connection credentials are retained for live
agents. Hosted tenant isolation is not supplied by these local profiles.

## Provider parts

A model provider a Services part serves, beside the CLIs (`src/provider-parts.ts`, KAN-650). In
a hosted office it is **Ronin models**, the house connection (Services `ronin_models`;
`samurai_lab/ronin_cloud/MODEL_MANAGEMENT.md` §1, §5): Light, Standard and Frontier first, the
office record's `tier` the default row, then the gateway model list's real models. A part
registers once with `addProviderPart`; `providerRows` puts its entry first, marked `part`, so
every picker offers it as its own provider and the Harnesses surface gives it its own
stone, never inside the list of the CLI it runs on. Its rows name a registry CLI (`cli`), so
launch, identity and resume are Core's; the part may wrap the argv of an Agent born on it
(`wrapLaunch`) and of its restore (`wrapResume`, with the model it was born on), both given the
launching person's email from the birth receipt so the part can label its house calls
(`X-Ronin-Person`, KAN-659, as Hermes's do, KAN-621). It is counted
as an activated provider when operational, and Refresh all asks it to read its list again
(`refresh`). Self-hosted, no part answers and nothing changes.

The office record (`src/office-record.ts`) carries `tier` (`light` | `standard` | `frontier`,
the office's tier), written by Cloud's park; Ronin asks the house connection for a tier or
`default`, never a model name, and the gateway serves the member's provider behind it (KAN-652).

## One read for the client

`GET /api/provider-catalog` answers the record's dates, when HQ's catalog was made, and every
provider with its rows already joined —
`{ measured_at, refreshed_at, catalog_at, providers: [{ provider, cli, label, cli_label, launchable, operational, off, native, launch_modes, part?, models: [rows] }] }`
(`providerCatalogAnswer`) — the only provider route there is, and the only
join: no client joins anything. Google, xAI and Nous have not yet been launched end to end
through Ronin; the first real launch of each is its proof, per the checklist below.

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
| `operational` | CLI ids that can launch: installed, signed in or recorded through **Done**, not turned off, and its vendor is not `comingSoon` |
| `off` | installed CLI ids the owner turned off; the sign-in is kept |
| `activated_count` | the size of `operational` — a provider with nothing to launch does not count |
| `versions` | what each operational/activated CLI said to the registry's `operations.version` argv, per CLI id; an installed but unactivated CLI is not run |
| `models` | per CLI id, its own model list as **Refresh all** last read it: `{ read_at, by, rows: [{ id, name }] }` in the CLI's order, `by` the CLI version installed at the read; or `{ read_at, by, rows: [], unavailable }` saying why there is none. Never guessed, never inferred from the catalog |
| `latest` | per CLI id, the newest release its npm package listed and when it was asked — asked only by **Refresh all**, never by an ordinary measure, since each ask is an outbound request with its own egress line; kept until the next; absent for a CLI with no npm package to ask |

`src/provider-summary.ts` has two writers and one record:

- `measureAndRecordProviders` — the machine facts; the recorded lists, the last npm answer
  and `refreshed_at` ride along unchanged. After **Cancel** on a sign-in (a
  sign-in closed without Done may still have left a credential file), and after Turn off / on.
- `refreshProviders` — **Refresh all**: the same facts, then every activated
  CLI's own list read again, each [provider part](#provider-parts)'s list, then npm asked.
  It runs at every Ronin start, so after every
  Update (which restarts Ronin), with nobody pressing anything (KAN-651); in a hosted office
  the park calls `POST /api/setup/providers/refresh` over the unit's socket when it moved the
  CLIs in place (`ronin_cloud` office_kohai); the member's press; and once on **Done**,
  because activating a provider is a press too (owner, 2026-09-25). Never a timer, never on open.

**How a list is read is the registry's declaration.** `AGENTS[].operations.models` in
`src/agents.ts` names the reader: `claude-cache` (`~/.claude/cache/model-catalog/*-cc.json`,
`catalog.config.models[].id` and `.name`, only the `main` section its own picker offers — the
`overflow` generations are still served but not offered), `codex-cache` (`~/.codex/models_cache.json`,
`models[]` with `slug`, `display_name`, and `visibility: list`), `command` (run the CLI with
the argv and read the list under *Available models:* — Grok), or `hermes-setups` (Hermes model options), or `none` (Antigravity:
Model: Native only, and the surface says so). `readModels` walks that table; no CLI id
appears in it. A new way to read a list is a new key, never an `if`.

Everything else reads the record through `GET /api/setup/runtime`: Ronin Home's three
blocks and the selector summaries. A machine that
has never been measured is measured once on the first read, not guessed. A stale summary
shows its dates. `POST /api/setup/providers/:provider/install` uses the shared installer
and returns the runtime with its explicit `install_open` session attachment. Setup and
Settings mount that attachment on the provider page, including first-run sign-in. It stays
available after the binary appears, until Cancel ends the session and measures again.
There is no completion hook in the installer; closing the tile, reopening Harnesses,
or restarting Ronin refreshes the measured installation and credential facts.

Every launchable provider's Agent page declares a bare command. Choosing Native in the
Model field passes no model choice to the CLI. A named model row exists only because that
CLI's list (`models[cli].rows`) reports its id, with the CLI's name. Its tier and line are
HQ's catalog row for it ([above](#hqs-model-catalog)); a new model is Unrated until Glen rates
it, and still offered. With no list read, Native is the only Model choice; Launch mode
remains an independent axis.

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
| provider | the vendor id shown before the dot in the picker; the CLI's `vendor.provider` |
| cli | the registry row that serves it |
| model | the provider's real model id, as its CLI lists it |
| cmd | the Agent page's Model command rendered with the model id |
| row order | grouped by HQ's tier, the catalog's order within a tier; Unrated last, in the CLI's order |
| default | Native: what answers when `agents.sessions.by_provider.<provider>` is unset. Not a stored default |

The model id and the command must agree: `openai · gpt-5.6-terra` resolves to a Codex
command carrying `--model gpt-5.6-terra`; it must never resolve to bare `codex` and
inherit an unseen local default. The internal `configured` launch mode is labelled Native, and is
only an explicit choice: anything else is `live_dangerously` ([Agent launches](agent-launches.md));
on that axis it means no permission override, independently of Model. `live_dangerously`
uses the Agent page's complete dangerous form and is unavailable when none is declared.

The launch path does no provider interpretation, but it does adapt to the agent's terminal
interface after starting the command:

```text
src/agents.ts vendor + CLI list + HQ's catalog + docs/agents/<cli>.md commands
  → GET /api/provider-catalog
  → the one picker (providerModelPair, public/js/form-steps.js)
  → POST /api/launch { provider, model }
  → combine the Model choice and the Mode (Workspace's, else Campaign's, else Dangerously) into one complete command
  → run the resolved cmd in the new tile
  → recognize dialog or ready prompt
  → type the built brief
  → submit it and verify that it left the prompt
```

## Model defaults

One record says what model a launch gets when its form says Default (owner, 2026-10-21):
⚙ `agents.sessions` in `machine_settings.json`, set on **Models > Defaults** and shown again
in ⚙ Configuration — the schema's `models` section, two views of one setting.

| Default | Key | Read by |
|---|---|---|
| Agent model | `sessions.default` | `spawn.ts` / `launch-command.ts` for every launch that names neither provider nor model; `launch-seed.ts`; Mika's provider |
| Team lead model | `sessions.lead` | the same, for a launch with `team` and `team_lead` (`sessionsFor`), and `GET /api/launch-seed?lead=1`, which New Agent re-reads when Make team lead changes so its Default names the model that launches; none set = the Agent model |
| Mika model level | `jobs.mikaassist.level` | `mika-runtime.ts`: the Agent model's provider, Light → Standard → Frontier upward |
| Preferred model per provider | `sessions.by_provider.<id>` | a launch that names a provider but no model (Configuration only) |

**The first sign-in is the default** (owner, 2026-11-19; KAN-725). While `sessions.default` names
no provider, the first CLI signed in becomes it, written once: the provider, its model blank (the
provider's own default). `settleFirstDefault` (`provider-summary.ts`) runs on every recorded
measure, and a launch with no default measures first (`spawn.ts`), so a sign-in made in Setup or
in a tile both count. A later sign-in never moves it; only Models > Defaults does. Ronin models
(a provider part) is no sign-in and never becomes the default this way. With nothing signed in,
a Default launch is the registry's first CLI, into its own sign-in.

A Desk's `defaults.provider/model` used to outrank `sessions.default`; at start
`moveDeskModelDefault` (`campaign-scope.ts`) copies a set pair there once and clears it on the
Desk. A Team's `agent_defaults` carries no model.

## The one picker

Every place the product asks *which provider, and which model* is one control:
`providerModelPair` in `public/js/form-steps.js`. New Agent, New Team, Add Agent to Team,
⚙ Configuration and Models > Defaults (the Agent and Team lead models, each provider's
preferred model, and Mika's row) and cowork setup all call
it; none keeps a list, a join or a vendor's name of its own. The picker reads the rows the
server joined (`GET /api/provider-catalog`) and what this machine measured of each CLI
(`GET /api/setup/runtime`, which answers from the Campaign's recorded summary and never
probes), and it offers:

- every provider with Native and every model its CLI gave on the last Refresh all, the
  providers this machine can launch first and the rest after, grouped Frontier, Standard,
  Light, Unrated within each;
- each model as `<name> · <tier> · <use_for>`, the id as the value;
- what this machine cannot launch **disabled, never hidden** — a greyed row says *not on
  this machine* or *turned off*. A provider whose list was never read offers Native alone.

Either pick may stand alone: a provider with Model set to Native resolves to the Agent
page's no-model command; both blank is the level above's answer (the Team's, the Campaign's,
the install's). A row whose provider is fixed (⚙'s *Preferred <provider> model*, Mika) is
the same control with the provider select dropped. The registry's seeds read the same
rows: `models:first` is the marked default of the first launchable provider, `models:light`
the first launchable **light** row — there is no name-pattern for "cheap".

## The Harnesses surface

One drawing (`public/js/provider-surface.js`), seated by two selector cards — Ronin Setup's
**Harnesses** and Ronin Settings' **Harnesses** — and drawn by Home's **Models**
door as one stone per provider (`public/js/models-surface.js`). The two cards read *N providers · M models · K activated here*. At the top sits the one door: **Refresh all model providers**,
with *Last ran <date>* beside it, or *Never run — every provider offers Native only until
it runs*. Ronin runs it at start too, never on a timer: it measures the machine, reads every
activated CLI's own model list, and asks npm for each one's newest release. Below it the
whole inventory on the shared stone work surface: first a stone per [provider part](#provider-parts)
(Ronin models, in a hosted office), then one stone per CLI the registry knows,
wearing its measured state and the vendor it serves with its model count. The Models workbench's **Model refresh** surface carries
the same door with its steps under it: Harnesses, then Accounts.

A stone opens that provider, top to bottom: **Yours**, the three measured steps (install ·
authenticate with the native sign-in tile, Done and Cancel · ready) read from the runtime
row (`docs/getting-started/setup-workbench.md`, *Activate a provider*); then **The catalog**, the three
measured facts, one line saying when its list was read and by which CLI version (or why
there is none, or that Refresh all has not run), and the model table. Model: Native is
first and marked as the default. Every named row is a model from the CLI's list, grouped
by tier, and its Model cell carries both names: the CLI's own in bold, the id
beneath. The table has two columns, Model and Tier; the Tier cell carries HQ's tier (or
*unrated*) and, beneath it, the model's "use it for" line. The native sign-in tile is mounted through the workbench environment's one
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
  carried on the session row. `asking` takes precedence ([Tile](../using-ronin/tile.md)): it
  comes from the CLI's hooks (`src/asking.ts`), and from the pane (`asksForInput`) where no
  hook tells, because a dialog writes no journal line in any CLI.
- `src/send.ts` reads the active prompt, types the brief, submits it, and verifies it left.
- `src/routes/launch.ts` builds the brief and runs that handshake after the CLI starts.

Pattern order is safety-critical: a selected dialog row must be recognized before a
generic prompt marker. Claude uses `❯`; Codex uses `›` for both its prompt and its selected
trust row. Treating either glyph as universally ready can answer a trust question and
discard the owner's brief.

An OpenAI-compatible provider using an already-supported Codex profile inherits this
contract and normally needs no source change. A provider's native CLI does not: capture
its real startup, trust dialog, empty prompt, typed prompt and working screen; add those
fixtures and the smallest corresponding patterns before adding its registry row.

## Adding a native provider

A native provider is a new CLI: its registry row in `src/agents.ts`, with its `vendor`
(the vendor id, its name, its transcript source), and its Agent page
`docs/agents/<cli>.md` with the complete command permutations. The command must start an
interactive coding agent in the current directory and remain alive to receive Ronin's
opening brief. A raw HTTP client or one-shot completion command is not a session agent.
Its models' tiers and lines are Glen's rows in HQ's catalog; until then they are Unrated.

## OpenAI-compatible services

A third-party API service (DigitalOcean, Hugging Face, OpenRouter) is not a harness and gets
no vendor of its own: it is an account a harness launches on (Harnesses workbench →
Accounts, `docs/operating/accounts.md`). Its credential follows `docs/operating/secrets.md`
and never belongs in this repository, a project_root, or a launch command.
OpenAI-compatible is a claim to verify: launch one real session through Ronin on it and
confirm that the tile reaches a prompt and receives the complete built brief.

## Addition checklist

1. Verify the provider's current first-party API and model documentation.
2. Decide whether this is a new provider profile for a supported agent CLI or a new agent
   terminal interface.
3. Configure and test the CLI/profile outside Ronin; keep credentials out of the repo.
4. For a new agent CLI, capture and test every new-session state in the contract above,
   and add its registry row to `src/agents.ts`, with its `vendor`.
5. Refresh all; ask Glen to rate its models in HQ's Models table.
6. Update the Agent page's complete command permutations and unsupported forms.
7. Run `npm run verify` ([verification guidance](../development/verification.md)).
8. Launch every new model through New Agent. Confirm the receipt's command, the agent
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
