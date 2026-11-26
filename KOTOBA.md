# KOTOBA — Ronin vocabulary

This is the contributor authority for what Ronin's terms mean. The linked contracts own
behavior and implementation; this page names them without copying their rules.

## Meaning, wording, and teaching

| Source | Owns |
|---|---|
| This page | Canonical terms, distinctions, and the contract for each |
| [Stock lexicon](ronin_stock/lexicons/professional_en.md) | Default UI strings; other lexicons may replace wording |
| [Agent glossary](KOTOBA_GLOSSARY.md) | How an Agent refers to those concepts when speaking to the owner; `ronin-help <word>` prints it |

Change a meaning here and in its owning contract together. Change a displayed word in the
lexicon and the glossary together. A lexicon changes wording, never saved
identity, authority, or behavior. Historical vocabulary in another repository is not a
second authority for current Cowork or Services.

## Agent composition and tools

These terms follow [the brief](docs/architecture/brief.md) and
[ronin_stock/stock_readme.md](ronin_stock/stock_readme.md). One hyphenated term per concept, so no
bare word carries two meanings.

| Term | Meaning |
|---|---|
| Foundation (`foundation`) | One of the four kinds an Agent and its work are built from: behaviour, tool, fact, playbook |
| Stock-foundation (`stock-foundation`) | Ronin's foundation file, in `ronin_stock/<kind>/`; an image update replaces it, nothing writes it at run time |
| Custom-foundation (`custom-foundation`) | The person's foundation file, in `~/ronin/custom/<kind>/`, which replaces the stock one of the same id whole, or adds one |
| Fact | What is true about the user and the Agent's situation, printed in the brief from the work record |
| Fact-print (`fact-print`) | A fact's foundation file (`ronin_stock/facts/<id>.md`): how the brief prints it, not the fact itself |
| Office-fact (`office-fact`) | One of the nine facts about the office as built, `~/ronin/office/facts/<id>.md`, rewritten when its sources change |
| Office-output (`office-output`) | Everything in `~/ronin/office/`: the office-facts, `MACHINE_STATUS.md`, `ABOUT_USER.md` |
| Playbook (`playbook`) | A reusable plan of work, work items with ids `PLAYBOOK-n` (folder `playbooks/`), checked out into live items with no link back ([Playbooks](docs/using-ronin/playbooks.md)) |
| Agent-kind (`agent-kind`) | A condition a foundation's `when:` reacts to: irasshai, mika, a role |
| Tool | Ronin executable authority; its help describes its callable contract; its file in `ronin_stock/tools/` says what the brief tells about it |
| Composite tool | A tool coordinating guarded operations under one contract |
| Behaviour | Provider-neutral working guidance an Agent follows (`ronin_stock/behaviours/`) |
| Seed | The one line a behaviour or tool is told by: that it exists, and where to read more |
| Depth | How much of a behaviour or tool an Agent is told: not told, seed, or full |
| Full | The whole text, in the brief from the start |
| Conditional | A value on the work record that a file's `when:` names: cowork, lead, desk, hosted, integration:<name> … |
| Layer | Where brief settings are kept, widest first: user, Campaign, Workspace, Team, Agent |
| Brief settings | A layer's three lists: add, block and only |
| Block | Brief settings: takes facts, behaviours or tools out |
| Screen (only) | Brief settings: when set, nothing else gets through, at that layer and below |
| Brief | What an Agent is told: its facts, the behaviours in play with their tools, then other tools; rebuilt when its work record changes |
| Work record | The session's record, and the source of every value its brief depends on |
| Mandate | Reach, Recruit, and Output: the assignment's boundaries; told as a fact |
| Skill | Provider-native teaching or adaptation, without unique Ronin business authority |
| Assignment | The work and explicit designations given to an Agent, including Team lead |
| Agent composition | The facts, behaviours and tools an Agent is told, with its mandate and assignment |
| Scope | Where a fact or rule applies; distinguish Desk/Team inheritance and resource storage/shadowing |
| Installation | An installed facility that can make tools, guidance, or service parts available; see [Installations](docs/architecture/installations.md) |

Macro, action, SOP, and Agent role are not additional composition layers. “Action” and
“procedure” remain ordinary prose. Team lead is an explicit designation.

## Coworkspace and work

| Term | Meaning and contract |
|---|---|
| Ronin | The product; a repository, artifact, installed copy, and running operator are distinct things ([Release](docs/development/release.md)) |
| Coworkspace | The whole browser UI ([Workbench](docs/using-ronin/workbench.md)) |
| Surface | A visible UI held in a tilespace; contributor change areas are navigation categories, not UI objects or directories |
| Phalanx | A shared collection surface: stones stand in formation at rest, then move into a side rail when one is selected so that stone's detail can occupy the surface ([Workbench](docs/architecture/workbench.md)) |
| Tilespace | A numbered slot of a workbench holding a tile or another surface; `workspace1`…`workspace4` in code. Not a Workspace |
| Workspace | A project: its objective (the one place that says what the project is), instructions, its folders and Mode; every Team works in one ([Workspaces](docs/using-ronin/workspaces.md)) |
| Explorer (Files) | The machine's file browser from the home folder: copyparty at `/files/`, where Ronin finds Python at start; `/files/<path>` is `$HOME/<path>`. Explorer is the card, Files the code (`ronin.files`, `src/files.ts`) ([Explorer](docs/using-ronin/explorer.md)) |
| Model services (`MODEL_SERVICES`) | Office API connections such as Ronin Gateway, OpenRouter and a private API. A compatible harness can use a model service to request a model by ID. See [Model services](docs/architecture/model_services_README.md). |
| Harness | The CLI that runs an Agent, such as Hermes, Claude Code or Codex. A harness can use its native sign-in or a compatible model service. Use only “harness”, never “model provider” or “Agent Harness”. Ronin’s house models are not a harness. |
| Model option | A named choice a person can select in New Agent. A model service or the harness itself supplies it. A model option has a display name and a launch identity. |
| API model ID | The exact identifier sent to a model service in an API request. A model option’s display name can differ from its API model ID. |
| Tile | The UI for one session; a tmux pane is the terminal underneath ([Tile](docs/using-ronin/tile.md)) |
| Ronin Home / Ronin Setup / Ronin Settings | Home destination, the setup workbench (hosted: Harness, Workspace, Team, any order, never a gate), and ongoing Desk configuration workbench |
| Ask Ronin | A hosted Setup's panel beside every step: the step's lines, then the Helpful Assistant's chat |
| Desk | Engagement context for Teams and inherited configuration; internal compatibility identifiers retain `campaign` ([Desks](docs/using-ronin/campaigns.md)) |
| Team (`team`) | A group of sessions; stock UI says Team, with Team Commons for its shared surfaces |
| Team record (`team_roster`) | Durable Team identity, defaults, and held work; membership and leads derive from sessions ([Team workspace](docs/architecture/team-workspace.md)) |
| Session | A running Cowork Agent, bare-metal Agent, or terminal; archived sessions have separate restore manifests ([Session identity](docs/architecture/session-identity.md)) |
| Work record | An Agent's objective, repositories, and the work items it holds, each with its status ([Work records](docs/using-ronin/what-agents-write-down.md)) |
| Work item | One object stored once by id, matching Jira: title, objective, `level`, `kind`, `status`, `flagged`, `priority`, `comments`, `attachments`, `links`, `external` keys and a trail; **held by** one Team, Agent or Workspace, or by nobody (`item handoff` moves the id between holders' lists), and **under** one parent or none. Holding is never permission. The `item` tool does Jira's item acts (create, read, search, edit, transition, flag, handoff, comment, attach, link, delete), the item named. Never called a project ([Work items](docs/using-ronin/work-items.md)) |
| Level | Stored on the item: `1` epic, `0` story/task/bug, `-1` subtask. The kind follows the parent (an epic's child is level 0, a level-0 item's child -1), `0` with none unless an Epic is named; adding a child never changes it |
| Epic | A work item at level 1. It keeps its own fields; its status is set by hand |
| Story / Task / Bug | A work item at level 0; story, task, bug or feature is its `kind`, any work type name, blank by default, with no fixed list |
| Subtask | A work item at level -1, under a level-0 item. Nothing goes under a Subtask: a create or move there is refused, the reply naming its Task |
| Status | A work item's state, a Jira status name (To Do, In Progress, In Review, Done, or the space's own); `item transition <id> "<status>"`, any to any; a hand-in naming the item moves it to In Review, the promotion carrying it to Done (a Jira pair is left for the Jira user) |
| Flagged | An impediment on a work item, as Jira's flag: `item flag <id> "<why>"`, the reason kept as a comment; `item unflag <id>` |
| Priority | A work item's priority, as Jira's: any name, or blank. Set with `item edit <id> --priority <name>` |
| Comment | One remark on a work item, as Jira's: who, when and the text. `item comment <id> <text>` adds one and `--edit <n>` changes one; a comment by someone else tells the holding Agent its work record changed |
| Team work items | The work items a Team and its members hold, children under their parent, read in the Team's Work items; a Team holds, it does not contain. Never another store ([Work items](docs/using-ronin/work-items.md)) |
| Board | Ronin has none; a user who wants one uses Jira or Trello |
| Wipeboard / message queue / Cron jobs | Team announcements, pending session delivery, and scheduled requests; distinct stores and delivery lifecycles |
| Ronin Lab | A Workspace (and its folder) for ideas, research, plans, and notes across or before projects, off the code repositories; self-hosted install makes it, a hosted office only when the person wants it |
| Workspace folder | A folder or repository a Workspace holds, as a row of its record; Ronin keeps no other folder list; not a tilespace ([Workspaces](docs/using-ronin/workspaces.md)) |
| Worktree | Private working folder and branch with explicit custody for managed repository work; distinct from an engagement Desk and a Desk profile ([Worktrees](docs/architecture/worktrees.md)) |
| Commit / hand-in / promotion / Git push | Private checkpoint / admission to Team review / admission to global dev / remote publication; not synonyms |
| Desk profile | Owner-selected presentation defaults ([Desk profiles](docs/architecture/desk-profiles.md)) |
| Transcript (`transcript`) | Ronin's copy of an Agent's conversation as its CLI wrote it; one file per session in the session folder. Readings are views of it; terminal output is not a transcript ([Tile](docs/using-ronin/tile.md)) |
| Transcript reading (`transcript_view`) | A filter over the transcript, named by the server and offered by the tile in order, never a rewrite; adding a reading is adding a row. Stock readings are `chat_view`, `notes_view`, `work_view`, `all_view` ([Tile](docs/using-ronin/tile.md)) |
| Chat view (`chat_view`) | Only what the person and the Agent said; what Koe speaks; the only reading on a phone ([Tile](docs/using-ronin/tile.md)) |
| Notes view (`notes_view`) | Chat plus the gaps: session start, interruption, segment seams ([Tile](docs/using-ronin/tile.md)) |
| Work view (`work_view`) | Notes plus each tool call and code block as one line, output collapsed ([Tile](docs/using-ronin/tile.md)) |
| All view (`all_view`) | Everything the journal holds, injected lines and tool output included; the complete view ([Tile](docs/using-ronin/tile.md)) |
| Term (`term_view`) | The live terminal in the tile; not a reading, and what the view toggle returns to ([Tile](docs/using-ronin/tile.md)) |
| View toggle (`view_toggle`) | The tile-head control cycling `term_view` → `chat_view` → `notes_view` → `work_view` → `all_view` → `term_view` on a desk, and `term_view` ↔ `chat_view` on a phone; it names where you are, goes opaque when the Agent has nothing to show, and says why on press ([Tile](docs/using-ronin/tile.md)) |
| Agent stance (`agent_stance`) | What an Agent is doing now: working, awaiting you, asking, unknown. The newest line of the Agent's output, sent by the backend; the tile never infers it ([Tile](docs/using-ronin/tile.md)) |

## Services and state

| Term | Meaning and contract |
|---|---|
| Service part | Optional runtime module with one `register(sockets)` entry; canonical source is in `ronin_services` |
| Socket | Cowork-owned extension interface; missing Services is a supported configuration ([Connector contract](https://github.com/ronincowork/ronin-services/blob/dev/connector-contract.md)) |
| Service capability | A selectable Services feature expanded to runtime parts by `src/parts.ts`; distinct from an Agent's tool capability bundle |
| Parked part | Present on disk but not loaded, because of its marker or startup selection; the feature does not run |
| Authority / projection | The writer-owned truth / a derived reading of it; browser caches and readings such as Work items do not become additional server authorities |
| Store / shadow | A resolved persistence location / owner resources replacing shipped resources according to their format ([Shadowing](docs/architecture/shadowing.md)) |

The Services repository's `services.json` maps parts to routes and resources. Its connector
and install contracts describe integration and removal. Cowork owns browser surfaces and
the host; Services owns each part's implementation and its use of the named stores.

## Internal names

Internal identifiers are useful in source and exact commands. In owner-facing explanations,
use the glossary's plain terms.

| Name | Current meaning |
|---|---|
| TEGAMI | The stored work record letter; the Project management part (`project_management`) serves it and the tile reads it |
| RIREKI | Optional transcript service: reads provider journals through launch identity into the per-session transcript and serves its readings. The former terminal recorder is retained on disk as the future source for CLIs with no journal |
| OBOERU | Memory terminology; not an active part in the Services manifest |
| TOMODACHI / SOROBAN | Stats and counting contracts |
| KOE | Hotwords part; dictation's HTTP relay is currently in the counting part |
| SETTEI | Configuration terminology |
| AGERU | Ronin HQ request transport and its egress record; model-provider traffic is separate ([Services activation](docs/getting-started/services-activation.md)) |
| JIKAN | Cron jobs |
| ERABI | Shared selector UI in `public/js/ask.js` |
| KOTOBA / KOKUGO | Canonical vocabulary / UI wording and translation |
| DAIKUSAN / JUSHO | Resource placement / location terminology; follow current resource and store code |
| BYOIN | Installed-user customization checks |
| KYOKAI | Internal boundary checks; not an owner-facing feature |
| SHIWAKE | Ronin HQ activation and entitlement service; distinct from optional local Services parts |

Retired names such as TEJUN do not reintroduce macros or SOPs as current architectural
categories. Use the tool and composition terms above.

## Ronin Cloud

These terms name the hosted offer's surfaces. Current reference: `samurai_lab/ronin_cloud/README_RONIN_CLOUD.md`.
Implementation proposal: `plan read ronin_hosted/hosted-first-office` (Draft).
Every physical or fleet surface carries the `office_` prefix; `model_gateway` and
`kill_switch` stand alone because nothing else shares the word. In prose the plain word office
stays; what the customer hears for a unit is not settled (owner, 6 Nov 2026).

| Term | Meaning |
|---|---|
| Ronin as a Service (`raas`) | The whole hosted offering: office_units on office_parks, each park's office_kohai, sign-in, billing and office_export. The house name; Ronin Cloud is the same offering as the customer hears it |
| Office unit (`office_unit`) | The product unit: one customer's virtual machine with its own kernel and disk, carved from an office_park. A ronin_install runs inside it. This is what the customer buys, with Agents running, never the machinery; what the customer calls it is not settled (was `office`; owner, 6 Nov 2026) |
| Ronin install (`ronin_install`) | One installed, running copy of Ronin: inside an office_unit, or self-hosted on the customer's own machine. Ronin is the software; the unit is where one copy of it lives. Registration, the entitlement and the account view all belong to a ronin_install |
| Office park (`office_park`) | The physical machine Ronin rents, carved into office_units under one hypervisor. Ronin administers it; no customer touches it (was `office_host`; owner, 6 Nov 2026) |
| Hypervisor (`hypervisor`) | The software on an office_park that carves it into office_units and exposes the API the office_kohai drives: Proxmox VE |
| Office kohai (`office_kohai`) | The head of an office_park: HQ-controlled (it polls HQ's `park_state`; HQ never calls it), living on the park beside gateway_office, never reachable by customers. It creates the park's units, keeps the office_registry, and starts, stops, deletes and updates them as HQ's state says (was `control_plane`, a separate machine; owner, 6 Nov 2026) |
| Office registry (`office_registry`) | The office_kohai's record of its park's units: unit, VM id, private address, guard port, state. Accounts, the stop_clock and which park an account's unit is on are HQ's to know |
| Office network (`office_network`) | The private network on an office_park; offices reach out through NAT, never each other, the office_park or the office_kohai |
| Office image (`office_image`) | The Ronin image an office boots from once; after that Ronin updates itself |
| Office disk (`office_disk`) | The whole disk of one office, the one persistence unit; its backup is an `office_snapshot` |
| Office record (`office_record`) | The one file in a ronin_install that says which office_unit it lives in: `office_record.json` in the `office_unit` store, written once by the office_kohai, never by Ronin. Present means an office_unit on an office_park (office_id, office_park, gateway_office, provisioned_at); absent means self-hosted. Everything that behaves differently when hosted asks this record and nothing else |
| Stop clock (`stop_clock`) | The 30 days a stopped office is kept before deletion |
| Kill switch (`kill_switch`) | The stops from outside an office: the office_kohai stops it, cuts its network and drops its tunnel route; Shiwake has gateway_base revoke its house_token. Works when control inside the office is lost |
| Model gateway (`model_gateway`) | Holds Ronin's provider key outside every office; an office speaks to it with its house_token |
| House token (`house_token`) | One office's credential for the model_gateway; revoking it is part of the kill_switch |
| Office export (`office_export`) | The off-ramp: the office as self-hosted Ronin on the customer's own computer |
| Office lease (`office_lease`) | One office's lease: its kind's rent plus one optional lease_plan, billed monthly. The $5 starter is $5 off the first month's lease |
| Lease plan (`lease_plan`) | The lease's plan: Free (every office starts on it), Basic, Premium or Platinum; Max is kept for an office that has it. A paper offer: shown, never checked; integrations, CLIs and Jira are open to every office |
| Allowance | A plan's month of house-model or voice use for one office, kept in dollars by HQ and shown as a meter (percent, stopped, resets) |
| Lease status (`lease_status`) | trial, active, paused or ended; anything else reads as unknown |
| Provider subscription (`provider_subscription`) | A harness provider's paid plan (Claude Pro/Max, ChatGPT Plus/Pro…). "Subscription" means only this |
| Spent | What has been charged, this month and in total; per office and per person |

Server, host, guest, VM, workspace, customer machine and edge are not Cloud terms. "VM" named
two layers at once, the rented machine and the customer's slice; say office_park and office.
Ronin Hosted money is never "credits", "budget", "balance" or "subscription"; price, cost and margin are in
`samurai_lab/ronin_cloud/PRICING_POLICY.md` §5.
"Edge" is the `edges` message tool.
