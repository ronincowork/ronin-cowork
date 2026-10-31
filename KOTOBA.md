# KOTOBA — Ronin vocabulary

This is the contributor authority for what Ronin's terms mean. The linked contracts own
behavior and implementation; this page names them without copying their rules.

## Meaning, wording, and teaching

| Source | Owns |
|---|---|
| This page | Canonical terms, distinctions, and the contract for each |
| [Stock lexicon](ronin_catalogs/lexicons/professional_en.md) | Default UI strings; other lexicons may replace wording |
| [Agent glossary](KOTOBA_GLOSSARY.md) | How an Agent refers to those concepts when speaking to the owner; `ronin-help <word>` prints it |

Change a meaning here and in its owning contract together. Change a displayed word in the
lexicon and the glossary together. A lexicon changes wording, never saved
identity, authority, or behavior. Historical vocabulary in another repository is not a
second authority for current Cowork or Services.

## Agent composition and tools

These terms follow [Tools and Agent capabilities](docs/architecture/tool-surface.md) and
[Agent composition](docs/architecture/agent-composition.md).

| Term | Meaning |
|---|---|
| Tool | Ronin executable authority; its help describes its callable contract |
| Composite tool | A tool coordinating guarded operations under one contract |
| Capability | Provider-neutral teaching that groups tools around an operational question |
| Behavior (`behaviour` in paths and saved fields) | Provider-neutral working guidance, delivered as floor, conditional, selected, or sought |
| Mandate | Reach, Recruit, and Output: the assignment's boundaries; its teaching is floor |
| Skill | Provider-native teaching or adaptation, without unique Ronin business authority |
| Assignment | The work and explicit designations given to an Agent, including Team lead |
| Agent composition | Resolved tool capabilities, behaviors, mandate, skills, and assignment, with provenance and teaching |
| Scope | Where a fact or rule applies; distinguish Desk/Team inheritance, behavior delivery scope, and resource storage/shadowing |
| Installation | An installed facility that can make tools, guidance, or service parts available; see [Installations](docs/architecture/installations.md) |
| Preset / template | Editable starting values for a launch; see [Templates](docs/architecture/templates.md) |

Macro, action, SOP, and Agent role are not additional composition layers. “Action” and
“procedure” remain ordinary prose. Team lead is an explicit designation.

## Coworkspace and work

| Term | Meaning and contract |
|---|---|
| Ronin | The product; a repository, artifact, installed copy, and running operator are distinct things ([Release](docs/development/release.md)) |
| Coworkspace | The whole browser UI ([Workbench](docs/using-ronin/workbench.md)) |
| Surface | A visible UI held in a workspace; contributor change areas are navigation categories, not UI objects or directories |
| Phalanx | A shared collection surface: stones stand in formation at rest, then move into a side rail when one is selected so that stone's detail can occupy the surface ([Workbench](docs/architecture/workbench.md)) |
| Workspace | A numbered browser slot holding a tile or another surface |
| Tile | The UI for one session; a tmux pane is the terminal underneath ([Tile](docs/using-ronin/tile.md)) |
| Ronin Home / Ronin Setup / Ronin Settings | Home destination, first-use workbench, and ongoing Desk configuration workbench |
| Desk | Engagement context for Teams and inherited configuration; internal compatibility identifiers retain `campaign` ([Desks](docs/using-ronin/campaigns.md)) |
| Team (`team`) | A group of sessions; stock UI says Team, with Team Commons for its shared surfaces |
| Team record (`team_roster`) | Durable Team identity, defaults, and held work; membership and leads derive from sessions ([Team workspace](docs/architecture/team-workspace.md)) |
| Session | A running Cowork Agent, bare-metal Agent, or terminal; archived sessions have separate restore manifests ([Session identity](docs/architecture/session-identity.md)) |
| Work record | An Agent's objective, repositories, and the work items it holds, each with its status ([Work records](docs/using-ronin/what-agents-write-down.md)) |
| Work item | One object stored once by id, matching Jira: title, objective, `level`, `kind`, `status`, `flagged`, `priority`, `comments`, `attachments`, `links`, `external` keys and a trail; **held by** one Team or Agent, or by nobody (`item assign` moves the id between holders' lists), and **under** one parent or none. Holding is never permission. The `item` tool does Jira's item acts (create, read, search, edit, transition, flag, assign, comment, attach, link, delete), the item named. Never called a project ([Work items](docs/using-ronin/work-items.md)) |
| Level | Stored on the item: `1` epic, `0` story/task/bug, `-1` subtask. A new item is one below its parent, `0` with none; adding a child never changes it. A default, never a guard |
| Epic | A work item at level 1. It keeps its own fields; its status is set by hand |
| Story / Task / Bug | A work item at level 0; story, task, bug or feature is its `kind`, any work type name, blank by default, with no fixed list |
| Subtask | A work item at level -1, under a level-0 item. The one rule: nothing goes below -1; children follow their parent's new level, and a change that would put any below -1 fails with "w39 can't go there." |
| Status | A work item's state, a Jira status name (To Do, In Progress, In Review, Done, or the space's own); `item transition <id> "<status>"`, any to any; a hand-in naming the item moves it to In Review, the promotion carrying it to Done (a Jira pair is left for the Jira user) |
| Flagged | An impediment on a work item, as Jira's flag: `item flag <id> "<why>"`, the reason kept as a comment; `item unflag <id>` |
| Priority | A work item's priority, as Jira's: any name, or blank. Set with `item edit <id> --priority <name>` |
| Comment | One remark on a work item, as Jira's: who, when and the text. `item comment <id> <text>` adds one and `--edit <n>` changes one; a comment by someone else tells the holding Agent its work record changed |
| Team work items | The work items a Team and its members hold, children under their parent, read in the Team's Work items; a Team holds, it does not contain. Never another store ([Work items](docs/using-ronin/work-items.md)) |
| Board | Ronin has none; a user who wants one uses Jira or Trello |
| Wipeboard / message queue / Cron jobs | Team announcements, pending session delivery, and scheduled requests; distinct stores and delivery lifecycles |
| Ronin Lab | A Workspace Folder for ideas, research, plans, and notes across or before projects; users and Ronin creators each have their own Lab, rather than a code repository for one specific project |
| Workspace Folder (`project_root`) | A registered folder Ronin may work in; not a browser workspace ([Workspace folders](docs/architecture/project-roots.md)) |
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
| Agent stance (`agent_stance`) | What an Agent is doing now: working, replying, awaiting you, asking, unknown. Derived by the backend and sent; the tile never infers it ([Tile](docs/using-ronin/tile.md)) |

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
use the glossary's plain terms. **Koshi** is an existing UI name and an explicit exception.

| Name | Current meaning |
|---|---|
| TEGAMI | The stored work record letter; the Project management part (`project_management`) serves it and the tile reads it |
| RIREKI | Optional transcript service: reads provider journals through launch identity into the per-session transcript and serves its readings. The former terminal recorder is retained on disk as the future source for CLIs with no journal |
| OBOERU | Memory terminology; not an active part in the Services manifest |
| TOMODACHI / SOROBAN | Stats and counting contracts |
| KOSHI | Ronin's helper jobs; parked, with the Koshi tab naming each job's model |
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

These terms name the hosted offer's surfaces; the plan is
`samurai_lab/wip/ronin_cloud/RONIN_CLOUD.md` and the build is `MVP_ARCHITECTURE.md` beside it.
Every physical or fleet surface carries the `office_` prefix; `control_plane`, `front_door`,
`model_gateway` and `kill_switch` stand alone because nothing else shares the word.

| Term | Meaning |
|---|---|
| Office (`office`) | The product unit: one customer's full Ronin with its own kernel and disk, running on an office_host. The customer sees and buys offices and Agents running, never the machinery |
| Office host (`office_host`) | The physical machine Ronin rents, running many offices under one hypervisor. Ronin administers it; no customer touches it |
| Hypervisor (`hypervisor`) | The software on an office_host that carves it into offices and exposes the API the control_plane drives: Proxmox VE |
| Control plane (`control_plane`) | The separate small machine that runs the fleet from outside every office over a private link: office_registry, provisioner, kill_switch, meter, fleet updates |
| Office registry (`office_registry`) | The control_plane's record: account, office, office_host, private address, state, stop_clock |
| Front door (`front_door`) | The public entry on an office_host: Caddy, OAuth2 Proxy and Keycloak. Maps the hostname to an office, then checks that the signed-in user owns it; signing in alone opens nothing |
| SSH gateway (`ssh_gateway`) | SSH entry at the same name as the front_door; no office address is ever shown |
| Office network (`office_network`) | The private network on an office_host; offices reach out through NAT, never each other, the office_host or the control_plane |
| Office image (`office_image`) | The Ronin image an office boots from once; after that Ronin updates itself |
| Office disk (`office_disk`) | The whole disk of one office, the one persistence unit; its backup is an `office_snapshot` |
| Stop clock (`stop_clock`) | The 30 days a stopped office is kept before deletion |
| Kill switch (`kill_switch`) | The control_plane's stops from outside an office: stop it, cut its network, drop its front_door route, revoke its house_token. Works when control inside the office is lost |
| Model gateway (`model_gateway`) | Holds Ronin's provider key outside every office; an office speaks to it with its house_token |
| House token (`house_token`) | One office's credential for the model_gateway; revoking it is part of the kill_switch |
| Office export (`office_export`) | The off-ramp: the office as self-hosted Ronin on the customer's own computer |

Server, host, guest, VM, workspace, customer machine and edge are not Cloud terms. "VM" named
two layers at once, the rented machine and the customer's slice; say office_host and office.
"Edge" is the `edges` message tool.
