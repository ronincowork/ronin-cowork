# Model providers

For Gateway, OpenRouter, private API connections and their named models, see [Model services](model_services_README.md).

For native CLI launches, Ronin joins three records in one place (`harnessRows`,
`src/harness-catalog.ts`). Each CLI in `src/agents.ts` names the vendor it serves. Which
models can launch is each signed-in CLI's own list, in the Campaign's **measured provider
summary**. What each model is for is **HQ's model catalog**: the harness models on HQ's admin
Models page, each one's tier, its "use it for" line and its facts, sent to every office through
its park (plan `ronin_hosted/model-catalog`, KAN-827).

Adding a model must not add a route, UI branch, parser branch, or spawn branch: a CLI lists
it, and Glen rates it in HQ's table.

Provider setup has these records, with deliberately different contents:

| Record | Holds |
|---|---|
| this document | the provider/model extension contract |
| `src/agents.ts`, `vendor` | per CLI: the vendor id a launch names, the vendor's name, its transcript source, an optional maturity |
| HQ's model catalog (`src/model-catalog.ts`) | per harness model (harness + id): tier, "use it for" line, facts; and the OpenRouter starters |
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
| `label` | the vendor's name, as the pickers and `GET /api/setup/runtime` (`harnesses[].from`) show it |
| `transcript_source` | dated, descriptive journal location and write discipline; availability requires a supported adapter and verified launch identity, not merely a file at that path |
| `maturity` | optional: `beta`, or `comingSoon`, which shows the provider and never launches it |

`listHarnesses()` reads them; `GET /api/setup/runtime` keeps `harnesses[].provider` and
`.from` by these names, and the park reads them. The join lives here and nowhere else — no
command-word match, no map in a client. The CLI's own particulars are its
[Agent page](../agents/README.md).

## HQ's model catalog

Glen rates harness models on HQ's admin Models page: every model each harness offers, `harness` +
`id` exactly as that CLI lists it, in his order, with its tier (`light` · `standard` ·
`frontier`), a "use it for" line in his words, and its facts. The same page keeps the OpenRouter
starters. The park carries both to each office; the kohai writes `office_unit/models.json`
(KAN-895):

```text
{ at,
  harness_models: [ { harness, id, name, tier, use_for, context, output,
                      price: { input, output }, released, knowledge, reasoning, tools } ],
  openrouter_starters: [ { name, id } ] }
```

Price is USD per million tokens. A fact HQ doesn't have is absent, never guessed. The
Services `model_catalog` part reads the file at start and on every change and hands it whole
to Cowork (`setModels` on the Sockets); `src/model-catalog.ts` keeps the last one in the
`model_catalog` store, so a restart or a stopped park still has it. No catalog yet is no
rows: every listed model is then Unrated.

Ronin Gateway's models are not in this file. The Gateway's own list says each one's `id`,
`name`, `tier` and `use_for`, and Ronin reads them there ([Model services](model_services_README.md)).

**Why two sources, and who keeps each.** What a harness can launch is a fact the machine can read,
so Ronin measures it: the CLI's version and its own model list, dated, never inferred. What a model
is good for (tier, "use it for", price) is a judgement no vendor publishes, so it cannot be fetched,
only written: that is HQ's standing work, and anything HQ must keep current reaches an office through
Ronin Services, never through a file someone edits on the machine. Nobody opens a file to make a
mainstream model appear: the CLI lists it after its update, and it is offered at once, Unrated until
HQ rates it. When a model is missing, the usual cause is an old CLI; HQ moves the CLIs.

A model is offered because its CLI lists it, and a catalog row the CLI doesn't list is not
offered. The one exception (owner, 2026-11-28; KAN-993): while a signed-in harness's CLI has no
list yet (Claude Code writes its list only once it has run), HQ's rows for that harness are its
list, in tier order, until the CLI's own list is read. With neither, the entries say the models
are on their way from Ronin HQ.

**Two names per listed model, and no more (owner, 2026-09-25).** `model` is the id every
new picker choice uses. The name shown beside it is the CLI's own display name,
read with its list — "Opus 5.5", "GPT-5.6-Sol" — so the version is always in the title;
a CLI that gives no name shows the id. A third name is what hid the version until 2026-09-25. There is no default column either: Model: Native
is every provider's default in every path, and a preference is ⚙ Configuration's to hold.
A saved or explicitly supplied CLI model name absent from the refreshed list is passed
unchanged to the named provider. Ronin does not maintain or rewrite an alias map.

`harnessRows` joins each CLI's vendor, what the CLI listed, HQ's catalog row on harness + id,
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

HQ Admin publishes OpenRouter starter names and exact model IDs as the models file's `openrouter_starters` list. A newly connected OpenRouter service seeds the intersection of those rows and the authenticated `/models/user` list. Once seeded, users can edit or remove those model entries on their OpenRouter connection. Refreshing, rotating a key or receiving another catalog preserves edits and removals. Before the first starter catalog arrives, a new connection remains eligible. Inference uses the key configured for that OpenRouter connection at OpenRouter.

## Hermes connections and model entries

Hermes is one provider in the existing Model provider dropdown. Its Model dropdown
lists Ronin-owned setup names, identified by stable UUIDs. Each setup references an API
connection and pins an actual model, reasoning effort and approvals. Connection discovery
asks the selected endpoint's `/models`; personal services also accept an explicitly entered model ID.
This proves model-list access, not per-model inference compatibility.

The Ronin Gateway's model entries are its own list: one per model Ronin Gateway last listed,
carrying its display name and API model ID, with default reasoning and approvals off. They are never saved or edited; their id is
`<connection id>/<model id>` (`withGatewayOptions`, src/model-service-store.ts). The list is read at start-up
and on Refresh, and a failed read keeps the last one. Saved setups are only the ones people name, on an
API key or OpenRouter.

`model-service-store.ts` owns validation, serialized mutation, secret-free projection and fresh
home provisioning. `GET /api/model-services` reads the projection; POST `/api/model-services/{save,
discover,delete,save-model,delete-model}` owns writes, for the pages and the `harness` tool alike. The credential store holds metadata plus one
private dotenv credential file per connection. Keys never enter catalog or route answers.
Hermes's page in Settings has no Authenticate or Ready: only Models.
Provider-key environment pairs are reconciled on read and appear automatically, without
an import action. Environment credentials remain authoritative for those connections.

The launch join keeps the setup identity until process start and resolves it to the upstream model there. Cowork launch creates
`<session-record>/cli-home`, saves immutable settings and links the connection credential.
Two agents using the same setup have independent histories and memories. Setup changes
apply to future launches; key rotation reaches existing homes on process restart. Removing
a referenced connection is refused; removed connection credentials are retained for live
agents. Hosted tenant isolation is not supplied by these local profiles.

## The Gateway relay

Ronin Gateway is a model service and nothing else ([Model services](model_services_README.md)); it
is never an entry beside the harnesses. In a hosted office a Codex launch on it goes through
Services' relay (`ronin_models`), so the office's house token stays in Ronin's process: the part
hands Core one function (`src/gateway-relay.ts`), and `serviceLaunch` calls it at every process
start, a restore included, with the launching person's email for the `X-Ronin-Person` header
(KAN-659, as Hermes's house calls carry it, KAN-621). Self-hosted, nothing registers.

## One read for the client

`GET /api/harness-catalog` answers the record's dates, when HQ's catalog was made, and every
provider with its rows already joined —
`{ measured_at, refreshed_at, catalog_at, harnesses: [{ provider, cli, label, cli_label, launchable, operational, off, native, launch_modes, part?, models: [rows] }] }`
(`harnessCatalogAnswer`) — the only provider route there is, and the only
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
| `refreshed_at` | when the last refresh read every activated CLI's list; `''` when never |
| `installed` | CLI ids found on the login-shell PATH, with `paths` saying where |
| `signed_in` | CLI ids whose own credential file is on this machine — presence only, never read |
| `operational` | CLI ids that can launch: installed, signed in or recorded through **Done**, not turned off, and its vendor is not `comingSoon` |
| `off` | installed CLI ids the owner turned off; the sign-in is kept |
| `activated_count` | the size of `operational` — a provider with nothing to launch does not count |
| `versions` | what each operational/activated CLI said to the registry's `operations.version` argv, per CLI id; an installed but unactivated CLI is not run |
| `models` | per CLI id, its own model list as the last refresh read it: `{ read_at, by, rows: [{ id, name }] }` in the CLI's order, `by` the CLI version installed at the read; or `{ read_at, by, rows: [], unavailable }` saying why there is none. Never guessed, never inferred from the catalog |

`src/harness-summary.ts` has two writers and one record:

- `measureAndRecordHarnesses` — the machine facts; the recorded lists and `refreshed_at`
  ride along unchanged. At every Ronin start, after **Cancel** on a sign-in (a sign-in closed
  without Done may still have left a credential file), and after Turn off / on.
- `refreshHarnesses` — the same facts, then every activated CLI's own list read again and
  the Ronin Gateway's list. **HQ drives it** (owner, 2026-11-27; KAN-972): HQ moves the CLIs on
  a hosted office, and the park then calls `POST /api/setup/harnesses/refresh` over the unit's
  socket (`ronin_cloud` office_kohai); the park reports `GET /api/setup/runtime`'s
  `harnesses[].model_list`, `version` and `refreshed_at` back to HQ as `cli_models`
  (`ronin_shiwake` contracts/v1/park.md). The one other caller is a sign-in's **Done**. No
  page, no press, no start-up refresh, never a timer. Ronin asks no package source for a
  newer release and offers no Update: the CLIs' versions are HQ's.

**How a list is read is the registry's declaration.** `AGENTS[].operations.models` in
`src/agents.ts` names the reader: `claude-cache` (`~/.claude/cache/model-catalog/*-cc.json`,
`catalog.config.models[].id` and `.name`, only the `main` section its own picker offers — the
`overflow` generations are still served but not offered), `codex-cache` (`~/.codex/models_cache.json`,
`models[]` with `slug`, `display_name`, and `visibility: list`), `command` (run the CLI with
the argv and read the list under *Available models:* — Grok), or `model-entries` (Hermes: its model services' model entries), or `none` (Antigravity:
Model: Native only, and the surface says so). `readModels` walks that table; no CLI id
appears in it. A new way to read a list is a new key, never an `if`.

Everything else reads the record through `GET /api/setup/runtime`: Ronin Home's three
blocks and the selector summaries. A machine that
has never been measured is measured once on the first read, not guessed. A stale summary
shows its dates. `POST /api/setup/harnesses/:provider/install` uses the shared installer
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
  → GET /api/harness-catalog
  → the one picker (harnessModelPair, public/js/form-steps.js)
  → POST /api/launch { provider, model }
  → combine the Model choice and the Mode (Workspace's, else Campaign's, else Dangerously) into one complete command
  → run the resolved cmd in the new tile
  → recognize dialog or ready prompt
  → type the built brief
  → submit it and verify that it left the prompt
```

## Model defaults

One record says what model a launch gets when its form says Default (owner, 2026-10-21):
⚙ `agents.sessions` in `machine_settings.json`, set on **Settings → Agent defaults** and shown again
in ⚙ Configuration — the schema's `models` section, two views of one setting.

| Default | Key | Read by |
|---|---|---|
| Agent model | `sessions.default` | `spawn.ts` / `launch-command.ts` for every launch that names neither provider nor model; `launch-seed.ts`; Mika's provider |
| Team lead model | `sessions.lead` | the same, for a launch with `team` and `team_lead` (`sessionsFor`), and `GET /api/launch-seed?lead=1`, which New Agent re-reads when Make team lead changes so its Default names the model that launches; none set = the Agent model |
| Mika model level | `jobs.mikaassist.level` | `mika-runtime.ts`: the Agent model's provider, Light → Standard → Frontier upward |
| Preferred model per provider | `sessions.by_provider.<id>` | a launch that names a provider but no model (Configuration only) |

**The first sign-in is the default** (owner, 2026-11-19; KAN-725). While `sessions.default` names
no provider, the first CLI signed in becomes it, written once: the provider, its model blank (the
provider's own default). `settleFirstDefault` (`harness-summary.ts`) runs on every recorded
measure, and a launch with no default measures first (`spawn.ts`), so a sign-in made in Setup or
in a tile both count. A later sign-in never moves it; only Agent defaults does. A model service
is no sign-in and never becomes the default this way. With nothing signed in,
a Default launch takes the launch progression's first working harness and model service
([Model services](model_services_README.md), *A launch with no default*); with none, the registry's first CLI, into its own sign-in.

A Desk's `defaults.provider/model` used to outrank `sessions.default`; at start
`moveDeskModelDefault` (`campaign-scope.ts`) copies a set pair there once and clears it on the
Desk. A Team's `agent_defaults` carries no model.

## The one picker

Every place the product asks *which provider, and which model* is one control:
`harnessModelPair` in `public/js/form-steps.js`. New Agent, New Team, Add Agent to Team,
⚙ Configuration and Agent defaults (the Agent and Team lead models, each provider's
preferred model, and Mika's row) and cowork setup all call
it; none keeps a list, a join or a vendor's name of its own. The picker reads the rows the
server joined (`GET /api/harness-catalog`) and what this machine measured of each CLI
(`GET /api/setup/runtime`, which answers from the Campaign's recorded summary and never
probes), and it offers:

- every provider with Native and every model its CLI gave on the last refresh, the
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

## One harness panel (KAN-940, built KAN-941)

**Why.** Setup's Harness step and Settings' harness page draw the same server facts with two sets
of words and two layouts (owner, 27 Nov: "2 pieces doing the same job and not well... we need a
common set of code"). KAN-938 added a third module beside the two and was reverted (41d29476):
the fix is fewer modules, not another. The client gets one model and one panel.

**What the panel is for.** An installed harness runs; what it needs is access to models. So the
panel's main section is **Model services**, never "authentication" or "sign-in" (owner, 27 Nov).
Signing in is only what some services need on the way.

**How it reads (owner, 28 Nov; KAN-990).** One text size, one ink: the harness's name is the one
larger line (`--text-heading`); the section headings (Model services, Model entries) and a
service's name over its table are strong body text, never capitals; every line, note, link, code,
table cell and press is body text in `--fg`. Presses that are words (the sign-in link, Hide, Add or
change) read as words and underline on hover, never link blue. Only a status keeps a colour: a
fault (kaki), a hidden row (muted), the service it is on (the kaki fill). Each service under Model
entries is its own block: its name a band (inset ground, kaki edge, as All Hands' groups), its table
under it, a section's space before the next service. After the tables, Add or change is a small
outlined control, and Turn off is a footer ruled off from the panel, its sentence and button on one
line. The rules sit under `.harness-panel` in `style.css`.

### The state word

One function, `harnessState(provider)`, gives every harness one word, used on the stone, the panel
heading and Home's doors alike. It names the state, not what to do (owner, 25 Nov).

| Word | When | Replaces |
|---|---|---|
| **Not installed** | the CLI is not on this machine (an Install guide link when Ronin cannot install it) | Not installed, Manual install |
| **Installing** | its install tile is open | Installation open |
| **No model service** | installed, no service gives it models | Not set up, Needs sign-in, Hermes's No model service yet |
| **Signing in** | a service's sign-in is open: its link-and-code run or the terminal | Signing in, Sign-in open |
| **Active** | at least one model service gives it models | Active, Activated, Activated for Launch, Hermes's Ready |
| **Off** | turned off; every sign-in is kept | Off |

`activated` stays the CLI's own sign-in (it decides what Ronin measures and reads); beside it
`served` (`src/setup-runtime.ts`) says a configured model service is bound to the harness, and Active
is either, so a Codex on the Ronin Gateway alone reads Active and counts in `activated_count`. Hermes needs no
case of its own. The Installed / Signed in / Activated facts and the numbered Install →
Authenticate → Ready steps go: the word says it once.

### Model services, part 1: choose a service, sign in where needed

One row of stones: the in-harness ways the CLI has (its `login`), then the outside services it can use,
then Terminal. Several can be on at once; the in-harness ones are one at a time, as the CLI allows.

**One rule for every outside service** (owner, 27 Nov 2026; `src/model-services.ts`). A service speaks
request formats; a harness's launch adapter (`src/model-service-launch.ts`) speaks formats; a harness
can use a service wherever they share one, and its launch uses the harness's first shared format. No
special case per harness or per service.

| | Speaks |
|---|---|
| Ronin Gateway | Responses |
| OpenRouter | Responses · Chat Completions · Anthropic |
| API key | the format chosen when the key is added |
| Codex | Responses |
| Claude Code | Anthropic: the service's address without `/v1` as `ANTHROPIC_BASE_URL`, the key as `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY` blank |
| Hermes | Responses · Chat Completions |
| OpenCode | Chat Completions |

**One API key per harness** (owner, 27 Nov 2026): a harness with its own key login (Claude Code, Codex)
shows that one; a harness without one (Hermes, OpenCode) shows its key in the Ronin key vault. Nothing
is "Coming soon": a service is offered where it shares a format, or not shown.

| Harness | Its row |
|---|---|
| Claude Code | Subscription · API key · OpenRouter · Terminal *(Backup)* |
| Codex | Subscription · API key · Ronin Gateway · OpenRouter · Terminal *(Backup)* |
| Hermes | Ronin Gateway · API key · OpenRouter |
| OpenCode | API key · OpenRouter · Terminal *(Backup)* |
| Antigravity, Grok and the rest | Terminal |

- **Subscription** and **API key** (in harness) run the CLI's own login for that way (Claude Code
  `auth login --claudeai` or `--console`, Codex `login --device-auth` or `--with-api-key`); the panel
  shows the link and the code, or the box for the code or key, with **Send** and **Cancel**
  (`src/harness-sign-in.ts`, unchanged). The one it is on is filled (`readWays`).
- **Outside services** with no key yet read **No key in vault**; the press opens Model services on its
  tab to add the key. One signed in is filled when New Agent offers it; a press turns it off or on.
  The Ronin Gateway needs no key.
- **Terminal**: the CLI's own login in its terminal tile, its own menu, **Done** and **Cancel**,
  under the small word **Backup** where the harness has another way. Under the terminal, small stones
  from what the screen shows (`screenText` in `termview.js`; the terminal's own copy and links
  are untouched, for scrolling's sake): **Copy code**, the last device code seen, kept when it leaves the
  screen; **Copy link**, once a link is on screen, with the note *click in the terminal to show the URL* until then; **Go Back**, the key the screen names for going back (owner, 27 Nov 2026). While it is open, **Done**
  and **Cancel** stand in the service row in Terminal's place. The terminal is fitted once the panel is on the page, so the CLI draws at the size shown.

Keys and codes are typed only on the panel or into the Ronin key vault, never in chat.

**The Helpful Assistant.** Subscription and API key open her where the place puts her and tell her
`<cli> · Sign in with subscription|API key`. Terminal tells her `<cli> · Terminal` and does not open
her; no stone names her (owner, 27 Nov). **The place decides only where she opens**: the host passes
`openAgent`. Setup opens her in its work surface; Settings opens her chat in a window on the surface
with the kaki − (`models-surface.js`, over `createIrasshaiChat`).

**Warn before re-sign-in (w994)** stays on the three in-harness stones (Subscription, API key,
Terminal): on a harness already signed in the first press says *Signing in again signs out every {cli}
Agent until you finish*; the second goes ahead. The outside services touch no CLI sign-in, so they
never warn.

### Model services, part 2: model entries

Under the row, never above it (today Setup's link to Settings sits above the services): the
model entries of each service that is on, from `harness-model-entries.js` as it is: a table per
service, Name and Model ID, **Hide** or **Show** per row; for a key-vault key or OpenRouter, adding
or removing an entry. Its link to Model services in Settings sits here, at the end.

### One panel, both places

The phalanx of stones in both places (KAN-939: a pressed stone opens its panel in place of the
stones, kaki − top right). The same list in both: every registry CLI, then catalog-only vendors.
The panel, top to bottom, shows only the control that applies:

1. Name, vendor, the state word.
2. **Install** (or Install guide) when Not installed.
3. **Model services**: part 1, the service row and any run or terminal open; part 2, the model
   entries.
4. **Turn off** / **Turn on**, with its sentence.

Settings' Defaults surface is not this panel and stays.

### Ronin key vault

The owner's name for where Ronin keeps a secret, said everywhere a secret is asked for (owner,
27 Nov): the key box of a model service (`model-services-surface.js`, this panel), the page the
`secret` tool opens (`secret-ask.js`), an integration's key (`integrations-panel.js`), and
`docs/operating/secrets.md`. Words only: the store under it is unchanged.

### Files

| File | What happens |
|---|---|
| `public/js/harnesses-surface.js` | becomes the one module: `recordRuntime`, `harnessState`, `harnessStones`, `mountHarnessPanel(host, id, { openAgent })`, the service row, the sign-in run window, the attachment mount. `paintYours`, `installedState`, the facts and the old model table go. `stepItem` and `createRefreshAll` went with Settings' Refresh card (KAN-972) |
| `public/js/harness-model-entries.js` | part 2; its service stones move up into part 1's row, its tables stay |
| `public/js/setup-harness-surface.js` | deleted; Setup's surface definition (a phalanx over `mountHarnessPanel`, `openAgent` = work surface) moves into `setup-surfaces.js`, ~15 lines |
| `public/js/setup-harness-state.js` | deleted; its sentences become `harnessState`, `mountHarnessAttachment` moves into the one module |
| `public/js/setup-hermes-services.js` | deleted; Hermes uses the same row and entries |
| `public/js/models-surface.js` | `createModelStones` and `createModelHarness` mount `mountHarnessPanel` with the window `openAgent` |
| `src/setup-runtime.ts` | `activated` counts any model service on |
| `src/model-services.ts`, `src/model-service-launch.ts` | the format rule; Claude Code on the Anthropic format |
| `harness-setup-session.js`, `src/harness-sign-in.ts`, the sign-in routes | unchanged |
| `secret-ask.js`, `model-services-surface.js`, `integrations-panel.js` | say Ronin key vault |
| `public/style.css` | the `setup-harness-*` bar and `setup-provider-step*`/`-facts`/`-models` rules the panel no longer uses go |
| lexicon (`ronin_stock/lexicons/professional_en.md`) | the unused `setup_harness.*` and `setup_surface.*` keys go; `harness.*` keys for the words and services |
| `docs/getting-started/harness-sign-in.md` | becomes the harness's Model services, one section for Setup and Settings |
| `docs/architecture/setup-workbench.md` *Harnesses*, `docs/operating/secrets.md` | one section pointing here; the key vault's name |
| `ronin_stock/behaviours/irasshai-harness.md` | she hears which service was pressed; helps with the panel's run; warns before a re-sign-in |

### Earlier rulings

| Ruling | Kept or changed |
|---|---|
| One in-harness way at a time, subscription or API key (24–25 Nov) | kept |
| Warn before re-sign-in (w994) | kept, on the in-harness stones |
| Ronin Gateway on Codex and Hermes, never Claude Code | kept, as a service in the row |
| Hermes's model services: Setup shows, Settings edits (25 Nov) | changed: the same row and entries in both (owner, 27 Nov) |
| The bar names the state (25 Nov) | kept: one word everywhere |
| Settings' three numbered steps | gone (owner, 27 Nov) |
| "Authenticate with Agent" (27 Nov) | gone: the service stones replace it |

### Decided

Owner, 27 Nov: one state word and the one control that applies; stones in both places; the section is
Model services, choose and sign in first, model entries under it; one rule by request format for every
outside service, so OpenRouter runs Codex and Claude Code; one API key per harness; Terminal last, under
Backup; no "Recommended", no "Coming soon"; Terminal tells the Helpful Assistant and never names her;
Ronin key vault is the name everywhere a secret is asked for. Nothing is open.

## The Harnesses surface

Settings' harness cards draw it (`public/js/harnesses-surface.js`, seated by `harnessKit` in
`door-workbenches.js` through `models-surface.js`): **Harness**, one stone per CLI the registry knows,
wearing its measured state and the vendor it serves with its model count. There is no Refresh
card: HQ drives the refresh (above).

A stone opens that harness's panel, the same in Setup and Settings (*One harness panel*, above). Its
terminal (sign-in or install) is mounted through the one shared mount
(`public/js/harness-setup-session.js`), which Setup and Settings both hand their environment. Showing
the surface paints the record; only the refresh reads.

**Activation is the one switch.** It decides whether Ronin spends anything on a
provider. **Turn off**, at the foot of its panel, writes Ronin's own `setup.providers.<cli>.off_at`
and nothing else: the provider is then not measured, greyed in every picker with the words *turned off*, and refused for new
launches with its own sentence — *turned off on this machine; your sign-in is kept*. No
vendor file is touched, the sign-in stays, and tiles already running run on; what the CLI
does on its own in the background is not Ronin's business. **Turn on** deletes the field,
and a provider still signed in by its file is operational again at once. `off_at` outranks
both the credential file and `activated_at`, because `operational` is derived from those
and neither can be unset. A provider never activated is not refused at launch; it opens
its own sign-in in the tile, as it always has.

**Versions and lists — for activated providers only.** A provider that is not activated gets
nothing spent on it (owner's rule, 2026-09-09): Ronin does not run it, does not read its list,
and offers no control; it says *Installed* and stops, never a stale version and never "not
read", since nothing was asked. An activated CLI's version is what it said at the last measure.

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
no vendor of its own: it is a model service a harness launches on (Settings → Model services,
[Model services](model_services_README.md)). Its credential follows `docs/operating/secrets.md`
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
5. Sign it in (its **Done** reads its list); ask Glen to rate its models in HQ's Models table.
6. Update the Agent page's complete command permutations and unsupported forms.
7. Run `npm run verify` ([verification guidance](../development/verification.md)).
8. Launch every new model through New Agent. Confirm the receipt's command, the agent
   and model visible in the tile, and the complete startup request received by the agent.


## Setup sessions and sign-in

`src/setup-session.ts` creates and identifies temporary setup sessions for provider
installation, sign-in and update, and GitHub installation and authentication. Each runtime
publishes the same explicit session attachment. Each opens a normal tmux shell and
runs the command inside it, so exiting the CLI returns to the shell prompt. Both UIs mount it through
`harness-setup-session.js`; Cancel ends the temporary tmux session.

Done records nothing but the sign-in itself: it re-measures, and the CLI's own credential file is
the record. Claude Code and Codex also sign in without a terminal (`src/harness-sign-in.ts`); see
*One harness panel*.
