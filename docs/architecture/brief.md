# The brief: what an Agent is told, and how it is built

How a Cowork Agent (Mika and the Helpful Assistant included) learns who it is, how to work, what
it can call and what the office is like. Every Agent is built the same way, bottom up: its
foundations (behaviours, tools, facts and playbooks), each file saying when it applies, and one
configuration per Agent that picks among them. There are no templates and no per-Agent code.
Adding a fact, behaviour or tool is adding its file. The words are defined in [KOTOBA](../../KOTOBA.md); how an owner changes what Agents
are told is in [Customize Ronin](../getting-started/customize.md).

## The model in one picture

```
 sources of truth                 office-facts (src/facts.ts)        foundations (ronin_stock/)
 members.json, workspaces,  ──►   ~/ronin/office/facts/<fact>.md     facts/  behaviours/  tools/
 providers, items, rosters…       rewritten when a source changes    each file: when:, depth:
                                           │                                   │
                                           ▼                                   ▼
            the Agent's configuration: the `brief` key on its work record (tegami.md)
            session type, user, setting, agent, work, brief settings per layer, facts at birth
                                           │
                                           ▼  buildBrief (pure)
                        AGENT_BIRTH_BRIEF.md: Facts · Mandate · Behaviours (+ tools) · Other tools
                                           │
                                           ▼
                        launch prompt: the task line and "read your brief first"
```

- **Facts** say what is true: the office (nine docs, the same for every Agent) and the Agent's own
  lines (its name, Workspace, Team, model, task).
- **Behaviours** say how to work.
- **Tools** are what it can call.
- **Playbooks** are reusable plans of work. They are never told: an Agent checks one out when
  its behaviour or task says so ([playbooks](../using-ronin/playbooks.md)).
- **The configuration** is one document per Agent, written whole at birth. The brief is that
  document plus the foundation files, nothing else.

## The files: three places, four foundations

**Three places, each with one meaning.** `ronin_stock/` (in the image) is everything Ronin
ships; an image update replaces it whole, and nothing in it is written at run time.
`~/ronin/custom/` is the person's own files, in the same folders, empty on a new office.
`~/ronin/office/` is office-output: the office-facts, `MACHINE_STATUS.md` and `ABOUT_USER.md`. **The one rule for every reader:** a file in `~/ronin/custom/<folder>/`
replaces the file of the same id in `ronin_stock/<folder>/`, whole, or adds one. Nothing is
seeded, copied or merged. The full map is [stock_readme.md](../../ronin_stock/stock_readme.md).

**The four foundations** are what an Agent and its work are built from. A stock-foundation is
Ronin's file in `ronin_stock/<kind>/`; a custom-foundation is the person's, in
`~/ronin/custom/<kind>/`.

| Foundation | What it is | Folder | How much is told |
|---|---|---|---|
| **Fact** | what is true: the nine office-facts (below) and the Agent's own lines; its file is its fact-print | `facts/` | an office-fact at seed is its line and its file's path; at full, its text at birth. The Agent's own lines print in full |
| **Behaviour** | how to work: guidance an Agent follows | `behaviours/` | a depth (below) |
| **Tool** | something to call: one command, or a family (`session_*`) | `tools/` | a depth (below) |
| **Playbook** | a reusable plan of work, work items checked out into live ones | `playbooks/` | never told ([Playbooks](#playbooks)) |

Integrations, bridges, Services, roles, desks and arrangements are not further kinds. They are
values on the work record that bring facts, behaviours and tools into play. A bridge is a
behaviour with its tools.

## Session types

Every Agent has one session type, on its configuration as `session.type`. Files pick their
Agents with it, through `when:`.

| Type | Who | How it is launched |
|---|---|---|
| `cowork` | every Agent made in New Agent, New Team or `session_create`, leads included | the ordinary launch |
| `bare` | a bare metal Agent: the provider's CLI with no Ronin brief beyond its prompt | `session_type: bare_metal_agent` |
| `mika` | Mika, Ronin's help Agent | Mika's own seat (`src/house-seats.ts`) |
| `irasshai` | the Helpful Assistant, the welcome Agent | the ordinary launch with `agent_type: irasshai` (Services' `irasshai` part) |

Lead, epic lead and coordinator are **roles**, not types: a lead is a `cowork` Agent whose role
is `lead`, and its files say `when: lead` or `role:epic_lead`.

A type is only a value the files read. The Helpful Assistant shows the pattern. Her behaviour
(`irasshai`), her voice (`irasshai-voice`, Ronin's website) and one behaviour per Setup
step (`irasshai-harness`, `irasshai-workspace`, `irasshai-team`, depth seed, each read in full as
she takes the step) say `when: irasshai`. The coding behaviours say `when: cowork` (or
`!irasshai`), so they never reach her. The tools she needs (`item`, `workspace`, `show`,
`owner-view`, `session_create`, `ready`) list her behaviour in `serves:`. Her
launcher sets only her name, model, mandate and a task line; everything she is told comes from
the files.

## Depths, and when an Agent is told

| Depth | What the Agent gets |
|---|---|
| **not told** (`none`) | nothing; the tool is still on its PATH |
| **seed** | one line: that it exists, and where to read more (`ronin-help <name>`, or a fact's path) |
| **full** | the whole text, in the brief from the start |

**Seed first.** Agents skim. A well-written seed that says what lies underneath beats full
text: it names what the file is for and where the rest is, so the Agent reads the full text
only when it needs it. Give a file `full` only when an Agent needs all of it from the start.

A tool's seed is its one job (a family's names its members); the brief says once that every
tool answers `--help`. A tool in full adds its commands and whatever `--help` does not say.

An Agent is told at birth, then only when its configuration changes (by the user, or by an
Agent such as its lead: title, role, Team, lead, mandate, its own brief settings), and when it
asks (`ronin-help <name>` prints the full text of anything it holds a seed for). The office's
facts are different: their files are kept current, so an Agent reads the office as it is now
by reading a file again (see [Facts](#facts)). A file is told once however many conditions or
layers turn it on.

**Hide, never guard.** A depth, a block or a screen decides only what the Agent is told.
Nothing is taken off the PATH, refused or stopped: an Agent that finds a tool or behaviour it
was not told about can use it.

## The files and their header

One flat folder per Markdown foundation. The file name (no `.md`, kebab-case) is the id that
`when:`, `serves:`, brief settings and `ronin-help` use. Ids are one namespace across the three folders:
no two files share a name, so a tool whose command is a behaviour's name takes another id
(`ask-mika` is the `mika` command), and the Workspaces fact is `office-workspaces` because the
`workspaces` behaviour has that id. Every file starts the same:

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
| `line:` | facts | the line the brief prints, with `{record.path}` placeholders; `{<lead> x}` prints `<lead>` and x only when x is set; `{x?yes\|no}` prints one of two texts. An office fact's line is `{office.<fact>.line} · {office.<fact>.path}` |
| `when:` | all | the conditionals that must all hold, comma-separated; `!` for not; blank = every Agent. A tool that serves a behaviour needs none: it is in play when its behaviour is |
| `depth:` | all | `none`, `seed` or `full`: the stock depth (a fact's blank is full; a fact at seed prints its line only). Layers may raise it |
| `serves:` | tools | the behaviour ids it serves. Blank: it goes under Other tools |
| `mandate:` | behaviours | the mandate axis this file is a value of: `reach`, `recruit` or `output`; the title is the value |
| `with:` | mandate values | the behaviour(s) choosing this value puts in play, at their depth (Reach plan `with: planning`); the order never repeats that behaviour's text |
| `lists:` | behaviours | a stock folder whose files `ronin-help <behaviour>` prints after its text, one line each, the person's own (`~/ronin/custom/<dir>/`) over stock by name, in `order:`: adding a file adds it (new-workspace: `workspace_types/`) |
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

**Custom-foundations.** `~/ronin/custom/facts/`, `~/ronin/custom/behaviours/` and
`~/ronin/custom/tools/` (beside the person's own executables) add new files and replace stock
ones by id, whole, under the one rule. They live outside what an update replaces, so they
survive updates; a replacement also stops later stock changes reaching that file. The
section-merged registries (`MODEL_PROVIDERS.md`, `SKINS.md`) follow [shadowing](shadowing.md).

## Conditionals

They read values on the configuration (`src/conditionals.ts`; the list there is the authority).

| Conditional | Holds when |
|---|---|
| `cowork` · `bare` · `mika` · `irasshai` | the session type (above) |
| `owner` · `member` | the user's role in the office |
| `new-owner` | the Campaign has no Team yet |
| `experience:<non_technical\|some\|developer>` · `ai:<new\|some\|daily>` · `use:<coding\|…\|other>` | the user's Lounge answers (hosted) |
| `account:<x>` | the account's state, from the Lounge (hosted) |
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

## Facts

**One common suite of docs on the office, the same for every Agent** (owner, 2026-11-22;
KAN-768). An Agent learns the office by reading, never by running a tool, and anyone who reads
the docs knows the office: the owner, an Agent, a lead, the Helpful Assistant, a gecko.

### The nine

| Fact | What it says | Its sources of truth |
|---|---|---|
| `about_user` | the person and the office's people; the Helpful Assistant's notes on them | hosted: `office_unit/members.json` (the Business Lounge's About you, written by the park); self-hosted: the owner's intro (`~/ronin/custom/facts/user-intro.md`); both: `~/ronin/office/ABOUT_USER.md` |
| `machine` | hosting, Ronin's release, disk, the Services parts running, parked or failed, installations on, browser access, Tailscale, the no-password setting, registration | the office record, machine settings, Services' parts, the Campaign |
| `account` | hosted: subscription, balance, tiers, the Lounge's settings | `office_unit/lounge.json`, written by the park (Services' `account` part adds this fact) |
| `office-workspaces` | each Workspace: its objective (what the project is), folders, repositories, integrations, plans, canvases | the Workspace store |
| `integrations_authentications` | every harness (installed, signed in, Activated, off) and Ronin's house models, kept apart, GitHub, integrations, MCP servers and web APIs, Hermes accounts | the provider summary, `gh`, integrations and secrets |
| `epics` | open epics, their tasks, who holds what; onboarding's progress | work items, work records, rosters |
| `teams_agents` | Teams, leads, members; Agents live and archived; gecko seats | rosters, work records, the archive, seats |
| `defaults` | what a new Agent gets: default model, the Campaign's mandate and Mode | the Campaign, machine config |
| `you` | the Agent's own configuration | its work record (not a file) |

The facts are not the sources of truth: they read them. Each fact has one builder
(`src/facts.ts`), and nothing else summarises that part of the office.

### How a fact stays fresh

- **A file per fact.** Each office-fact is written to `~/ronin/office/facts/<fact>.md`: its title, its seed
  line, then its text.
- **Rebuilt when a source changes.** Each fact names the stores it reads. A write in one of them
  rebuilds that fact only, never all nine. A burst of writes (an Agent moving ten items) is one
  rebuild about a second later.
- **GitHub is asked on read.** `gh` keeps its sign-in in its own files, which no store watcher
  sees, so every read through Ronin (`office read`, `GET /api/facts/<fact>`, Settings, a brief at
  birth) asks GitHub first. Reading the file directly can lag a `gh auth login` typed in a shell
  until then.
- **Nothing is pushed to live Agents.** A live Agent reads the file again when it needs the
  office as it is now.

### Where the facts are read

- **In the brief.** Each office-fact has a fact-print (`ronin_stock/facts/<fact>.md`) with
  the usual `when:` and `depth:`. Stock is seed: the line and the path, so every Agent knows the
  fact exists and where to read it. At full, the brief carries the fact's text as it was at
  birth. The configuration keeps those birth values under `office` (`briefFacts`,
  `src/facts.ts`).
- **`office read`** prints every fact as one; `office read <fact>` prints one
  (`GET /api/facts/<fact>`). `~/ronin/office/MACHINE_STATUS.md` is all of them in one file, rewritten
  with each fact; Settings' Machine status shows it.
- **Screens.** Setup's step ticks, Machine settings and the account card read the same builders,
  so a screen and an Agent never disagree.

### No stored answers

A screen never records a press ("No thank you", "Keep these", "dealt with") as office state
(owner, 2026-11-22). A choice that matters is a real setting (Tailscale only, no password:
`machine.no_password`); anything else is dropped. Setup's ticks come from facts, the same on every office: Harness
when one of the person's own harnesses is Activated (never the house models), Workspace when a
Workspace of theirs other than Ronin Lab has an objective, Team when a Team has a live lead; and
nothing decides onboarding is over. What a person tells an Agent lives in that Agent's notes (`ABOUT_USER.md`), never
in a screen.

### The Agent's own lines

Besides the nine, a few facts print the Agent's own values from its configuration, in full:
`you` (name, type, who it works for), `workspace` (with its repositories and folders), `work`
(where it works: desk or checkout), `team`, `integrations-on`, `model` and `task`.

## Mandates

Each Reach, Recruit and Output value is a behaviour with
`mandate: <axis>` (`reach-plan.md`, `# Plan`). The New Agent and New Team forms list the files of
each axis, in `order:`; no list of values is kept by hand. Choosing a value brings its file into
play at its depth, and the behaviours its `with:` names. The server reads the value as the title
lower-cased (`# Propose agents`). A mandate file is an order, not how-to ("Plan; don't build."),
and prints in the brief's Mandate section, never among the behaviours. At `depth: full` its text
follows the order: only what holding that value always requires (Code: edit source through the
harness's edit, write or patch tool, never a shell rewrite). A value is added by adding its file
(stock or the user's store); blocking it takes it off the menu; a screen narrows the menu.

## The work record is the source of truth

Each session's work record holds every value its brief depends on; the brief is the work
record plus the files, nothing else. That document is the Agent's **configuration**.

| Part | Values |
|---|---|
| Session | name, title, type (`cowork`, `bare`, `mika`, `irasshai`), objective, the task at birth |
| User | name and what to call them, role in the office, new owner, organization, technical level, AI experience, planned use, time zone, language, about |
| People (hosted) | the office's owner and members: role, name, organization |
| Setting | hosted or self-hosted; Campaign; Workspace (its instructions, repositories, folders); integrations on; the MCP servers and web APIs on and available; project management; the Services parts running |
| Agent | role and Team(s), and the integrations on for its Team; mandate (Reach, Recruit, Output); provider, model, harness, launch mode |
| Work | desk or checkout per repository |
| Office | each office fact at birth: its line, path and text |
| Brief settings | each layer's settings as born — add, block, only, integrations, pm: user, Campaign, Workspace, Team, this Agent |

**One authority, one builder** (KAN-605). The record above is one document on the work record,
the key `brief`, and it is the session's only authority for its brief.

- **Birth writes it whole.** The launch (`composeBrief`, `src/brief-build.ts`) resolves user,
  machine, Campaign, Workspace, Team and Agent once into the complete document (the shape of
  `src/brief-record.ts`), reads the office's facts as they are then, and the launch writes it as
  one key (`writeBriefRecord`, `src/tegami.ts`). The tile's Work record shows it by part.
- **The builder is pure.** `buildBrief(document, catalogs)` works out integrations on, project
  management, the MCP servers on and a lead's Team integrations from the document's layers, puts
  the catalog in play and renders the packet. Birth, the New Agent preview and the Configuration
  all use it. It reads nothing else.
- **Only an explicit configuration change edits it.** The Configuration's Send and being made
  lead (`configureBrief`, `src/agent-configuration.ts`) change title, role, lead, mandate and the
  Agent's own layer on the document, build the old and the new, write `AGENT_BRIEF.md` and the
  document, and send the difference once if there is one. A move to another Team is the one
  change that reads outside the document: it takes that Team's values (its wipeboard, objective
  and Workspace, with the Workspace's repositories, folders and instructions, and the Team and
  Workspace settings), resolved the way birth resolves them. Provider, model, harness and launch
  mode stay as born.
- **A default never reaches a live Agent** (owner, 2026-11-16). A user, machine, Campaign,
  Workspace or Team default, a catalog file, an MCP record or a connection changed since birth
  reaches only Agents born after it. The office as it is now reaches anyone through the fact
  files.
- **Dynamic fields never rebuild it.** The objective, items held and watched, flags, documents,
  desks and the `teams` block are on the work record but not in the brief document, so they send
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
`add: netlify-bridge, more-checkpoints: full`. A tailored Agent is a screen on it:
`only: base-agent, netlify-bridge`. Who an Agent *is* (a welcome Agent, a help Agent) is its
session type, never a layer's lists.

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
value sets it on that layer. Off: no item behaviours and no `item` seed. On: the item model for
everyone, role behaviours by role. The Services part that runs project management keeps its own
switch for running; the brief reads `pm`.

## The brief

The birth brief, `~/.ronin/sessions/<name>-<ts>/AGENT_BIRTH_BRIEF.md`, is written once at
birth and never rewritten. Each update writes the brief as it is now beside it, as
`AGENT_BRIEF.md`. Both are generated top to bottom:

```
# Brief — <name>

## Facts
- You: …
- User: <about_user's line> · ~/ronin/office/facts/about_user.md
- Machine: … · ~/ronin/office/facts/machine.md
- …
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

- Facts, then the Mandate orders, then the behaviours in play (full text or seed, by
  `order:`), each with its tools, then Other tools, the one `--help` line and the end line.
- **Every Agent can read further.** A fact at seed gives its file's path; a behaviour at seed
  prints its file name, so `ronin-help <name>` opens it; tools say `<tool> --help`.
- **One read.** Every supported provider caps one file read, so the brief is held to 30,000
  bytes and 380 lines (`src/birth-brief.ts`); a test compiles the fullest stock brief and
  fails over either. Do not raise the budget to fit prose: shorten the source, or lower its
  depth. An over-budget brief is still written, with a warning, and the read line tells the
  Agent to read it in parts. This is why office facts ship at seed.
- **The launch prompt** carries only the task, the read line — "Read first: `<path>` — N
  lines, N KB, one read; it ends with the line "— end of packet for `<name>` —". Do not act
  before you have seen that line." — and, where the launch profile asks for it, the
  acknowledgement (quote the end line). The task is the launcher's one sentence (the Helpful
  Assistant's says whether Setup is open, and in which tab); everything else is in the brief.
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
and `HOME` to its own folders, so it never writes the real stores.

## Playbooks

A playbook is a reusable plan of work: work items, stored as live ones are (one JSON file per
item, `PLAYBOOK-n.json`, a child's `parent` its PLAYBOOK-n parent, status `Playbook`), never told
and on no live list ([playbooks](../using-ronin/playbooks.md), `src/work-items.ts` PLAYBOOKS,
`src/playbooks.ts`).

- Ronin's ship in `ronin_stock/playbooks/` (PLAYBOOK-1 onboarding, PLAYBOOK-2 a Workspace's
  objective, PLAYBOOK-3 mapping a project, and their tasks); the person's own are in
  `~/ronin/custom/playbooks/` and replace Ronin's by id. The ordinary item reader reads them;
  an edit writes the person's copy.
- `item checkout PLAYBOOK-n [<agent>|team:<name>]` makes plain live items from it and everything
  under it, and gives them to the caller or the named receiver. The copy has no link back: a later
  playbook change never reaches it.
- An Agent is pointed at one by its behaviour or task ("check out PLAYBOOK-1"), as the Helpful
  Assistant is for onboarding. Find Item reads a playbook as any item: its children open on a
  press, with Assign to agent and Customize.

## Where it is set in the UI

- **New Agent form, Behaviors step:** one list of cards, each on or off: Project management,
  each integration by name (never Jira), and the optional behaviours (Full or Seed once on; one
  already told can be raised to Full). A card on from a layer above reads "On, from the
  {layer}". Then Comes with this Agent (read-only: what is in play and why, from
  `POST /api/brief/preview`). It saves `{ brief, integrations, pm }`.
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
- **Settings → Machine status:** the facts as one (`MACHINE_STATUS.md`).
- **The work record on the tile:** a closed Brief section, "What this Agent is told"
  (`GET /api/sessions/:name/brief`).

## The stock files

The stock-foundations in `ronin_stock/` (the three places and the one rule:
[The files](#the-files-three-places-four-foundations)):

```
facts/       office: about_user, machine, account (hosted), office-workspaces,
             integrations_authentications, epics, teams_agents, defaults (seed: line and path)
             the Agent's own: you, workspace, work, team (team), integrations-on, model, task
behaviours/  base-agent (full) · cowork-agent, flags, write-it-down, workspaces (cowork, full)
             reach-*, recruit-*, output-* (mandate: one file per value)
             team-lead, planning (lead) · lead-worktrees (lead, desk) · canvases (cowork, seed)
             project-management (pm, !irasshai, full) · pm-coworker · pm-lead · pm-epic-lead ·
             pm-traffic-control (pm, by role, full)
             working-at-a-desk (desk) · checkout (checkout)
             integrations (every Agent, seed; brings `secret`, so keys are taught once)
             bridges: netlify-bridge, jira-bridge, perplexity-bridge (integration:<name>) ·
             mcp-servers (mcp, seed: one line per MCP server on) ·
             web-apis (api, seed: one line per web API on)
             mika, install-check (mika) · irasshai, irasshai-voice, irasshai-harness,
             irasshai-workspace, irasshai-team (irasshai) ·
             services-off (!service:ronin_services) · syncthing (!irasshai, seed) ·
             linux-tools (every Agent, seed) · using-ronin
             optional (depth none): team-work, more-checkpoints, working-with-the-user,
             codebase-team, new-workspace, documents
tools/       edges, work-record, agent-session (session_*), cowork-team (team), plan, canvas,
             work-item (item), worktree-desk, secret, netlify, preview, lookup, show,
             owner-view, ready, office, ask-mika (mika), ronin-host,
             machine-settings, ronin-help · workspace (serves irasshai, team-lead) ·
             ronin-team, ronin-desk-settle (house, depth none)
playbooks/   PLAYBOOK-1 onboarding (Your setup, Harness, Workspace, Team), PLAYBOOK-2 a
             Workspace's objective, PLAYBOOK-3 mapping a project, each with its tasks
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
  order). An office-fact summarises its sources; it is never itself a source.
- **Playbook**: a reusable plan of work, work items; checked out, it becomes ordinary live items.
- **Skill**: provider-native adaptation or teaching inside a provider shell. It never holds a
  Ronin rule or authority alone; another provider gets its own form, from the same Ronin file.
- **UI**: a client of the same tool and API contracts. None copies the choreography, and none
  keeps its own copy of office state.

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

Every **MCP server** and **web API** is reached at run time through Ronin's broker, never at
launch ([integrations.md](integrations.md)). A record's Campaigns make it available, which only
lists it in the pickers; it is on through the layers' integrations switches, the one cascade,
like a bridge. One behaviour, `mcp-servers` (seed, `when: mcp`), is in play when any MCP record
is on for the Agent; its seed is generated from the record values, one line per server,
`<name>: <description>`, then how to call it, with the `mcp` tool under it. `web-apis` (seed,
`when: api`) does the same for web APIs, with the `api` tool. A record named as a bridge's
integration is that bridge's way through the broker and gets no line.

## Workspaces

The `workspaces` behaviour (every Cowork Agent, full) says a Project is one Workspace: its
objective, instructions, repositories, folders, integrations, Teams and plans. The
`office-workspaces` fact is every Workspace as it is now. The `workspace` tool (serves
`irasshai` and `team-lead`) lists, reads and creates Workspaces, writes their objective and
instructions, and adds a folder or a cloned repository, over the Workspace page's own routes
(`/api/workspaces`, `/api/folders`, `/api/setup/git/clone`). The objective is the one place that
says what the project is; there is no other Workspace doc.

## What comes next

The base grows a file at a time: a curated bridge for an integration that earns one, and a
playbook for each piece of work worth repeating.

## Change checkpoint

Any change to facts, behaviours, tools, brief settings or brief compilation answers:

1. Which file is it, and what `when:` brings it into play? If it is for one kind of Agent, is
   that a session type the file names, not code?
2. What depth, and does a layer need to change it?
3. Does a tool name the behaviour it serves, rather than a behaviour list the tool?
4. Does the user's store still replace it by id?
5. Does the fullest stock brief still fit one read?
6. Do the read line, the receipt and the acknowledgement still describe the same brief?
7. Does it summarise office state? Then it is one of the nine facts' builders, or reads them.
   Does it store a press? Then it is a setting, or it goes.

The reason for the budget is concrete: in September 2026 a vocabulary source was pointed at a
105 KB UI string table, the packet grew past 2,000 lines, and the working rules fell outside
the newborn's first read.
