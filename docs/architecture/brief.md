# The brief: what an Agent is told, and how it is built

The construction contract for what a Cowork Agent (and Mika) is told. Adding a behaviour or a
tool is adding its file; nothing else changes. Agents know a little about a lot, and only what
is on their path. The words are defined in [KOTOBA](../../KOTOBA.md); how an owner changes what
Agents are told is in [Customize Ronin](../getting-started/customize.md).

## Three objects

| Object | What it is | Folder | How much is told |
|---|---|---|---|
| **Fact** | true about the user and the Agent's situation: the Agent's own lines (you, its Workspace, Team, model, task) and the office's suite (about_user, machine, account, workspaces, integrations_authentications, teams_agents, epics, defaults: `~/ronin/library/facts/<fact>.md`, src/facts.ts) | `ronin_catalogs/facts/` | in full by default; an office fact is at seed (its line and path), full gives its text at birth |
| **Behaviour** | how to work: guidance an Agent follows | `ronin_catalogs/behaviours/` | a depth (below) |
| **Tool** | something to call: one command, or a family (`session_*`) | `ronin_catalogs/tools/` | a depth (below) |

Integrations, bridges, Services, roles, desks and arrangements are not further kinds. They are
values on the work record that bring facts, behaviours and tools into play. A bridge is a
behaviour with its tools.

## Depths, and when an Agent is told

| Depth | What the Agent gets |
|---|---|
| **not told** (`none`) | nothing; the tool is still on its PATH |
| **seed** | one line: that it exists, and where to read more (`ronin-help <name>`) |
| **full** | the whole text, in the brief from the start |

**Seed first.** Agents skim. A well-written seed that says what lies underneath beats full
text: it names what the file is for and where the rest is, so the Agent reads the full text
only when it needs it. Give a file `full` only when an Agent needs all of it from the start.

A tool's seed is its one job (a family's names its members); the brief says once that every
tool answers `--help`. A tool in full adds its commands and whatever `--help` does not say.

An Agent is told at birth, then only when its configuration changes (by the user, or by an
Agent such as its lead: title, role, Team, lead, mandate, its own brief settings), and when it
asks (`ronin-help <name>` prints the full text of anything it holds a seed for). A file is told
once however many conditions or layers turn it on.

**Hide, never guard.** A depth, a block or a screen decides only what the Agent is told.
Nothing is taken off the PATH, refused or stopped: an Agent that finds a tool or behaviour it
was not told about can use it.

## The files and their header

One flat folder per object. The file name (no `.md`, kebab-case) is the id that `when:`,
`serves:`, brief settings and `ronin-help` use. Ids are one namespace across the three folders:
no two files share a name, so a tool whose command is a
behaviour's name takes another id (`ask-mika` is the `mika` command). Every file starts the same:

```
# Write it Down
- **seed:** WRITE IT DOWN: put what you work on on your work record.
- **when:** cowork
- **depth:** full
- **order:** 40

<the full text>
```

| Field | Files | Means |
|---|---|---|
| title (`#`) | all | the name the brief prints; for a tool, the command |
| `seed:` | behaviours, tools | the one line. A behaviour's seed stands on its own; a tool's is its one job. It may carry a record value, `{setting.mcp_lines}`, filled when the brief is built |
| `line:` | facts | the line the brief prints, with `{record.path}` placeholders; `{<lead> x}` prints `<lead>` and x only when x is set; `{x?yes\|no}` prints one of two texts |
| `when:` | all | the conditionals that must all hold, comma-separated; `!` for not; blank = every Agent. A tool that serves a behaviour needs none: it is in play when its behaviour is |
| `depth:` | all | `none`, `seed` or `full`: the stock depth (a fact's blank is full; a fact at seed prints its line only). Layers may raise it |
| `serves:` | tools | the behaviour ids it serves. Blank: it goes under Other tools |
| `mandate:` | behaviours | the mandate axis this file is a value of: `reach`, `recruit` or `output`; the title is the value |
| `with:` | mandate values | the behaviour(s) choosing this value puts in play, at their depth (Reach plan `with: planning`); the order never repeats that behaviour's text |
| `lists:` | behaviours | a catalog directory whose files `ronin-help <behaviour>` prints after its text, one line each, the user's own (`~/ronin/<dir>/`) over stock by name, in `order:`: adding a file adds it (new-workspace: `workspace_types/`) |
| `facts:` | bridges | the facts its Workspace entry takes, comma-separated (`netlify-bridge`: `site`); each is a field on the Workspace page's Integrations row, saved as `{provider, site}` ([integrations.md](integrations.md#the-pieces)) |
| `order:` | all | its place in its section, lower first |

Header lines run from the title to the first blank line. An unknown field is ignored; an
unknown conditional never holds. A fact may also carry placeholders in its body, and a fact
whose placeholders all come out empty is not printed.

- **Tools point at behaviours, never the reverse.** A behaviour never lists its tools; the
  brief lists, under each behaviour, the tools whose `serves:` names it. It may name a tool in
  its guidance ("hand in with `worktree-desk hand-in`").
- **No other list of tools is kept by hand.** The [Tools help page](../using-ronin/agent-tools.md)
  list is generated from the headers (`node scripts/tool-list.mjs`).
- **A hand-in that adds a tool adds its file**, as it adds its docs.

**The user's store.** `~/ronin/facts/`, `~/ronin/behaviours/` and `~/ronin/tools/` (beside the
user's own executables) add new files and replace stock ones by id, whole. They live outside
what an update replaces, so customisations survive updates; a replacement also stops later
stock changes reaching that file. Other catalogs follow [shadowing](shadowing.md).

## Conditionals

They read values on the work record.

| Conditional | Holds when |
|---|---|
| `cowork` · `bare` · `mika` · `irasshai` | the session type; `irasshai` is the Helpful Assistant, an ordinary Cowork launch with `agent_type: irasshai` |
| `owner` · `member` | the user's role in the office |
| `new-owner` | the Campaign has no Team yet |
| `experience:<non_technical\|some\|developer>` · `ai:<new\|some\|daily>` · `use:<coding\|…\|other>` | the user's Lounge answers (hosted) |
| `hosted` | a hosted office (else self-hosted) |
| `service:<part>` | that Ronin Services part is running |
| `integration:<name>` | that integration is on for the Agent |
| `mcp` | at least one MCP server is on for the Agent |
| `api` | at least one web API is on for the Agent |
| `pm` | project management is on |
| `team` · `lead` · `role:<coworker\|lead\|epic_lead\|coordinator>` | on a Team, its lead, its role |
| `desk` · `checkout` | a desk is cut, a repository is checked out |
| `workspace:<name>` | born in that Workspace |

The mandate is never a `when:`. A tool may say in its seed which mandate it
rides ("`session_create` rides Recruit: staff agents"); an Agent with Recruit `nobody` still
sees it and decides.

## Mandates

Each Reach, Recruit and Output value is a behaviour with
`mandate: <axis>` (`reach-plan.md`, `# Plan`). The New Agent and New Team forms list the files of
each axis, in `order:`; no list of values is kept by hand. Choosing a value brings its file into
play at its depth, and the behaviours its `with:` names. The server reads the value as the title
lower-cased (`# Propose agents`). A mandate file is an order, not how-to ("Plan; don't build."), and prints in
the brief's Mandate section, never among the behaviours. At `depth: full` its text follows the
order: only what holding that value always requires (Code: edit source through the harness's
edit, write or patch tool, never a shell rewrite). A value is added by adding its file
(stock or the user's store); blocking it takes it off the menu; a screen narrows the menu.

## The work record is the source of truth

Each session's work record holds every value its brief depends on; the brief is the work
record plus the files, nothing else.

| Part | Values |
|---|---|
| Session | name, title, type, the template it came from, objective, the task at birth |
| User | name and what to call them, role in the office, new owner, organization, technical level, AI experience, planned use, time zone, language, about, and the user's own intro text |
| People (hosted) | the office's owner and members: role, name, organization |
| Setting | hosted or self-hosted; Campaign; Workspace (its instructions, repositories, folders); integrations on; the MCP servers on; project management; the Services parts running |
| Agent | role and Team(s), and the integrations on for its Team; mandate (Reach, Recruit, Output); provider, model, harness, launch mode |
| Work | desk or checkout per repository; items held and watched |
| Brief settings | each layer's settings as born — add, block, only, integrations, pm: user, Campaign, Workspace, Team, this Agent |

**One authority, one builder** (KAN-605). The record above is one document on the work record,
the key `brief`, and it is the session's only authority for its brief.

- **Birth writes it whole.** The New Agent path (`composeBrief`, `src/brief-build.ts`) resolves
  user, machine, Campaign, Workspace, Team and Agent once into the complete document: the parts
  above (`session`, `user`, `people`, `setting`, `agent`, `work`, the shape of
  `src/brief-record.ts`), `setting.available` (the MCP server and web API records available to its Campaign; available is not on) and
  `brief_settings`, one `{brief, integrations, pm}` per layer. Once the work record exists,
  launch writes it as one key (`writeBriefRecord`, `src/tegami.ts`). The tile's Work record
  shows it by part.
- **The builder is pure.** `buildBrief(document, catalogs)` works out integrations on, project
  management, the MCP servers on and a lead's Team integrations from the document's layers, puts
  the catalog in play and renders the packet. Birth, the New Agent preview and the Configuration
  all use it. It reads nothing else: no machine setting, default, Service, receipt, snapshot or
  other work-record key.
- **Only an explicit configuration change edits it.** The Configuration's Send and being made
  lead (`configureBrief`, `src/agent-configuration.ts`) change title, role, lead, mandate and the
  Agent's own layer on the document. Then they build the old document and the new one, write
  `AGENT_BRIEF.md` and the document, and send the difference once if there is one. A move to
  another Team is the one change that reads outside the document: it takes that Team's values
  (its wipeboard, objective and Workspace, with the Workspace's repositories, folders and
  instructions, and the Team and Workspace settings), resolved the way birth resolves them.
  Provider, model, harness and launch mode stay as born.
- **A default never reaches a live Agent** (owner, 2026-11-16). A user, machine, Campaign,
  Workspace or Team default, a catalog file, an MCP record or a connection changed since birth
  reaches only Agents born after it.
- **Dynamic fields never rebuild it.** The objective, items, flags, watches, documents, desks
  and the `teams` block are on the work record but not in the brief document, so they send
  nothing.
- Who is talking now is never in the brief: the per-message From line (`src/message-queue.ts`)
  says it.

**Ronin's own lines on the record.** The mandate is written by `writeMandate`
(`src/tegami.ts`) at creation and on an Update. The `teams` block is one entry per Team
(`team`, `team_role` lead or member, the roster's `objective`; a lead's entry also lists
`members`); `teamChanged` derives it again on every roster write, join, leave, lead change,
restore and Team retire, and `memberEnded` drops an ended Agent from its leads' lists. The
`configuration` line (`{ title, project_root }`) is written by `writeConfiguration` at birth,
on a restore, and when the title or recorded Workspace changes. A write to the record by anyone
but the Agent pushes it one line, "Your work record changed; please read it (work-record
read)." (`ackRecord`); a change to an item it holds is not a record write, and its notice
names the item and the change (`ackHolders`, `src/work-items.ts`).

## Layers and brief settings

The layers, widest first: the stock file (its header), the user, the Campaign, the Workspace,
the Team, the Agent. Each layer's record holds the same three lists, naming only what it
changes:

| List | Names | Effect |
|---|---|---|
| **add** | facts, behaviours or tools, with a depth | brings them in, or raises their depth |
| **block** | facts, behaviours or tools | takes them out |
| **only** (a screen) | facts, behaviours, optionally single tools | when set, nothing else gets through |

The user's lists are in the user's store; the Campaign's in Campaign settings; the
Workspace's in the Workspace record; the Team's on the roster; the Agent's on its work record.

Applied in order:

1. Start from each file's header (`when:`, `depth:`).
2. **Add** from every layer; where two give a depth, the higher holds.
3. **Block** from every layer.
4. **Screen**: a screen covers its layer and every layer below; a lower screen only narrows it,
   and nothing below adds back what a screen above left out. A behaviour let through brings
   the tools that serve it; a tool that serves no behaviour comes through only if named.

Example, a Workspace that uses Netlify and wants More checkpoints for every Agent:
`add: netlify-bridge, more-checkpoints: full`. A tailored Agent is a screen on it or its
template: `only: base-agent, netlify-bridge`.

**Integrations cascade the same way**: on for a Campaign is on for its Workspaces, Teams and
Agents, and each may add its own. A layer may also turn off one that is on above it, for itself
and below (`integrations_off` in its brief settings; the pages show "On, from the <layer>" with
Off). MCP server and web API records cascade the same way: a record's Campaigns only make it
available (listed in the pickers); a layer's switch turns it on (KAN-607).
On for an Agent makes `integration:<name>` hold, so its bridge behaviour and that behaviour's
tools come into play.

**Jira is set at the Campaign and Workspace only** (the Campaign's Jira part, its switch
`services.parts.jira`, or the Workspace's integrations). A Team's or Agent's Jira entry is
ignored by the cascade, and the Team and New Agent forms don't show Jira. An Agent reaches work
items through `item` and never past the bridge, so it is not told of Jira, and Jira is not among
the integrations on its record.

**Project management is its own switch** (`pm` on each layer's record), apart from Jira: Jira
on or off never moves it (KAN-608). It is on at the Campaign unless the Campaign's record says
`pm: false`, so turning it off is always deliberate; below, each layer may say on or off, and
the narrowest layer that says one holds (`cascade`, `src/brief-settings.ts`). A form shows it on
or off with "On/Off, from the <layer>" while it follows the layer above; choosing the other
value sets it on that layer. Off: no item
behaviours and no `item` seed. On: the item model for everyone, role behaviours by role. The
Services part that runs project management keeps its own switch for running; the brief reads
`pm`.

## The brief

The birth brief, `~/.ronin/sessions/<name>-<ts>/AGENT_BIRTH_BRIEF.md`, is written once at
birth and never rewritten. Each update writes the brief as it is now beside it, as
`AGENT_BRIEF.md`. Both are generated top to bottom:

```
# Brief — <name>

## Facts
- You: …
- User: …
- Workspace: …
- Task: …

## Mandate
- <the order for each chosen value>

## Behaviours
Each in full: `ronin-help <name>`; all of Ronin's Help: `ronin-help`.

### <behaviour>
<full text, or its seed line and file name: <seed> (`<name>`)>
Tools:
- `<tool>`: <seed>

## Other tools
- `<tool>`: <seed>

Every tool is a command on your PATH; `<tool> --help` gives its syntax.

— end of packet for <name> —
```

- Facts, then the Mandate orders, then the behaviours in play (full text or seed, by `order:`), each with its tools,
  then Other tools, the one `--help` line and the end line.
- **Every Agent can read further.** The line under Behaviours says how to read each behaviour in
  full and all of Help; a behaviour told at seed depth prints its file name after the seed, so
  `ronin-help <name>` opens it. Tools say `<tool> --help`. All of this counts against the one-read budget.
- **One read.** Every supported provider caps one file read, so the brief is held to 30,000
  bytes and 380 lines (`src/birth-brief.ts`); a test compiles the fullest stock brief and
  fails over either. Do not raise the budget to fit prose: shorten the source, or lower its
  depth. An over-budget brief is still written, with a warning, and the read line tells the
  Agent to read it in parts.
- **The launch prompt** carries only the task, the read line — "Read first: `<path>` — N
  lines, N KB, one read; it ends with the line "— end of packet for `<name>` —". Do not act
  before you have seen that line." — and, where the launch profile asks for it, the
  acknowledgement (quote the end line). Team and Workspace are facts and the mandate its own section in the brief, so
  an update reaches them.
- **The birth receipt** (`birth-receipt.json`) records the brief's path, bytes, lines,
  terminator and over-budget state.
- **An update** (`configureBrief`, `src/agent-configuration.ts`) builds the document before
  and after the edit. If the brief comes out different, it sends "Your brief changed" with the
  facts whose line reads differently, the behaviours and tools that came into play (at their
  depth) or left it, and the path of `AGENT_BRIEF.md` (`briefChanges`, `src/brief.ts`, a pure
  comparison of the two builds). A mandate change sends the new mandate only. If nothing
  differs, nothing is sent.
- **Send** on the New Agent form sends only what changed; when nothing did, the form says "Its
  brief is unchanged: nothing was sent."
- **The brief shows at the bottom of the work record** on the tile: `AGENT_BRIEF.md` once an
  update wrote it, else the birth brief.
- **On the Agent's Docs**, first, are the birth brief and then (once it exists) `AGENT_BRIEF.md`,
  labelled Birth brief and Brief now; then the record's own documents and its items'
  attachments (`src/tegami-read.ts`).

There is no backward compatibility: the model is for new installs, and no old store or record
shape is read. A test or rig that starts the server sets `RONIN_USER_ROOT`, `RONIN_DATA_ROOT`
and `HOME` to its own folders (`tests/helpers/ronin.ts`), so it never writes the real stores.

## Where it is set in the UI

- **New Agent form, Behaviors step:** one list of cards, each on or off: Project management,
  each integration by name (never Jira), and the optional behaviours (Full or Seed once on; one
  already told can be raised to Full). A card on from a layer above reads "On, from the
  {layer}". Then Comes with this Agent (read-only: what is in play and why, from
  `POST /api/brief/preview`). It saves `{ brief, integrations, pm }` as before.
- **Mandate** (New Agent, New Team's Agent rows, Team, Campaign): Reach, Recruit and Output list
  the mandate files from the catalog, in `order:`, less the preview's off
  (`public/js/mandates.js`). No value is listed in the client.
- **Campaign, Workspace and Team pages** edit their Integrations, Project management, Add, Block
  and Only in the same compact form, with "An Agent here is told" (read-only) and "Set on"
  links to the layers above; one Save per page.
- **Behaviors page** (the user's own layer): every fact, behaviour and tool file, the mandate
  values grouped by axis; open one to read it; Edit / Make my version; New Behavior, New tool,
  New bridge (a bridge is a behaviour with `when: integration:<x>` plus its tools, in one
  Save). Its settings panel, "For every Agent you start", is the user layer.
- **The work record on the tile:** a closed Brief section, "What this Agent is told"
  (`GET /api/sessions/:name/brief`).

## The stock files

```
facts/       you, about_user, machine, account (hosted), workspace, workspaces,
             integrations_authentications, integrations-on (a lead: its Team's too), team (team),
             teams_agents, epics, defaults, model, work, task
behaviours/  base-agent (full) · cowork-agent, write-it-down (cowork, full)
             reach-*, recruit-*, output-* (mandate: one file per value)
             team-lead, planning (lead) · lead-worktrees (lead, desk) · canvases (cowork, seed)
             project-management (pm, full) · pm-coworker · pm-lead · pm-epic-lead ·
             pm-traffic-control (pm, by role, full)
             working-at-a-desk (desk) · checkout (checkout) · workspaces (cowork, full)
             integrations (every Agent, seed; brings `secret`, so keys are taught once)
             bridges: netlify-bridge, jira-bridge, perplexity-bridge
             (integration:<name>) · mcp-servers (mcp, seed: one line per MCP server on) ·
             web-apis (api, seed: one line per web API on)
             mika, install-check (mika) · irasshai, irasshai-voice (irasshai) · services-off (!service:ronin_services) · using-ronin
             optional (depth none): team-work, more-checkpoints, working-with-the-user,
             codebase-team
tools/       edges, work-record, agent-session (session_*), cowork-team (team), plan, canvas,
             work-item (item), worktree-desk, secret, netlify, preview, lookup, show,
             owner-view, ask-mika (mika), ronin-host, machine-settings, ronin-help ·
             workspace-command (workspace; depth none until the command exists) ·
             ronin-team, ronin-desk-settle (house, depth none)
```

Each file's header is the authority for its `when:`, depth and order; this list is a map.
Workspace-specific guidance is a user behaviour with `when: workspace:<name>`. Helpers that are
not tools (`ronin-url`, `ronin-http.sh`, `tool-path.sh`) get no file
(`ronin_bin/README.md`).

## Boundaries

- **Tool**: Ronin executable authority; its `--help` describes its callable contract. A
  **composite tool** coordinates guarded operations under one contract and outcome, reusing
  their validation and audit evidence; it is still a tool.
- **Behaviour**: provider-neutral guidance; it governs the work and any procedure around a tool.
- **Fact**: a value, told; what a value asks of the Agent is a behaviour (each mandate value's
  order).
- **Skill**: provider-native adaptation or teaching inside a provider shell. It never holds a
  Ronin rule or authority alone; another provider gets its own form, from the same Ronin file.
- **UI**: a client of the same tool and API contracts. None copies the choreography.

Docs explain Ronin and stay searchable; an Agent's operational instruction belongs in a
behaviour or a tool's file or help, never only in a docs page.

## Integrations and bridges

Any outside service a user brings is used one common way, the **Integrations** behaviour (every
Agent, seed): the Workspace's integrations through `work-record workspace list`, keys only
through `secret ask <provider>-<key>` and `secret path <name>`, a PR and its preview, and the
owner's choice before shipping. Keys are taught there once; a bridge never repeats them.

A **bridge** is a behaviour with `when: integration:<name>` and the tools that serve it, in play
while that integration is on for the Agent: `perplexity-bridge` (cited web research) and
`netlify-bridge` (the worked example, with `netlify` and `preview`). `jira-bridge` only lists
Jira on the Integrations panel; it is never told, because Jira is never on an Agent's record.

Every **MCP server** and **web API** is reached at run time through Ronin's broker, never at launch
([integrations.md](integrations.md)). A record's Campaigns make it available, which only lists it in the
pickers; it is on through the layers' integrations switches, the one cascade, like a bridge. One
behaviour, `mcp-servers` (seed, `when: mcp`), is in play when any MCP record is on for the Agent; its
seed is generated from the record values, one line per server, `<name>: <description>`, then how to
call it, with the `mcp` tool under it. `web-apis` (seed, `when: api`) does the same for web APIs, with
the `api` tool. A record
named as a bridge's integration is that bridge's way through the broker and gets no line.

## Workspaces

The `workspaces` behaviour (every Cowork Agent, full) says a Project is one Workspace: its
objective, instructions, repositories, folders, integrations, Teams and plans. The `workspace`
tool is `depth: none` until the command exists; it will list, read, create, edit and archive
Workspaces over `src/routes/workspaces-api.ts`.

## What comes next

The base of behaviours grows a file at a time: a curated bridge for an integration that earns
one, and the `workspace` command, which then gets its seed told.

## Change checkpoint

Any change to facts, behaviours, tools, brief settings or brief compilation answers:

1. Which file is it, and what `when:` brings it into play?
2. What depth, and does a layer need to change it?
3. Does a tool name the behaviour it serves, rather than a behaviour list the tool?
4. Does the user's store still replace it by id?
5. Does the fullest stock brief still fit one read?
6. Do the read line, the receipt and the acknowledgement still describe the same brief?

The reason for the budget is concrete: in September 2026 a vocabulary source was pointed at a
105 KB UI string table, the packet grew past 2,000 lines, and the working rules fell outside
the newborn's first read.
