# KOTOBA — Ronin vocabulary

This is the contributor authority for what Ronin's terms mean. The linked contracts own
behavior and implementation; this page names them without copying their rules.

## Meaning, wording, and teaching

| Source | Owns |
|---|---|
| This page | Canonical terms, distinctions, and the contract for each |
| [Stock lexicon](ronin_catalogs/lexicons/professional_en.md) | Default UI strings, including `glossary.*` words; other lexicons may replace wording |
| [Agent glossary](KOTOBA_GLOSSARY.md) | How an Agent refers to those concepts when speaking to the owner; keyed words render from the desk lexicon at birth |

Change a meaning here and in its owning contract together. Change a displayed word in the
lexicon and the glossary's stock fallback together. A lexicon changes wording, never saved
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
| Workspace | A numbered browser slot holding a tile or another surface |
| Tile | The UI for one session; a tmux pane is the terminal underneath ([Tile](docs/using-ronin/tile.md)) |
| Ronin Home / Ronin Setup / Ronin Settings | Home destination, first-use workbench, and ongoing Desk configuration workbench |
| Desk | Engagement context for Teams and inherited configuration; internal compatibility identifiers retain `campaign` ([Desks](docs/using-ronin/campaigns.md)) |
| Team (`team`) | A group of sessions; stock UI says Team, with Team Commons for its shared surfaces |
| Team record (`team_roster`) | Durable Team identity, defaults, and held work; membership and leads derive from sessions ([Team workspace](docs/architecture/team-workspace.md)) |
| Session | A running Cowork Agent, bare-metal Agent, or terminal; archived sessions have separate restore manifests ([Session identity](docs/architecture/session-identity.md)) |
| Work record | An Agent's authored work, tracked documents, and held Projects ([Work record](docs/using-ronin/work-record.md)) |
| Project | Work with stable identity, an objective, and a completion condition; Team-held and Agent-held records have explicit custody ([Team Kanban](docs/using-ronin/team-kanban.md)) |
| Team Kanban | A derived view of Projects and delivery evidence, never another workflow store |
| Wipeboard / message queue / Cron jobs | Team announcements, pending session delivery, and scheduled requests; distinct stores and delivery lifecycles |
| Ronin Lab | A Workspace Folder for ideas, research, plans, and notes across or before projects; users and Ronin creators each have their own Lab, rather than a code repository for one specific project |
| Workspace Folder (`project_root`) | A registered folder Ronin may work in; not a browser workspace ([Workspace folders](docs/architecture/project-roots.md)) |
| Worktree | Private working folder and branch with explicit custody for managed repository work; distinct from an engagement Desk and a Desk profile ([Worktrees](docs/architecture/worktrees.md)) |
| Commit / hand-in / promotion / Git push | Private checkpoint / admission to Team review / admission to global dev / remote publication; not synonyms |
| Desk profile | Owner-selected presentation defaults ([Desk profiles](docs/architecture/desk-profiles.md)) |

## Services and state

| Term | Meaning and contract |
|---|---|
| Service part | Optional runtime module with one `register(sockets)` entry; canonical source is in `ronin_services` |
| Socket | Cowork-owned extension interface; missing Services is a supported configuration ([Connector contract](https://github.com/ronincowork/ronin-services/blob/dev/connector-contract.md)) |
| Service capability | A selectable Services feature expanded to runtime parts by `src/parts.ts`; distinct from an Agent's tool capability bundle |
| Parked part | Present on disk but not loaded, because of its marker or startup selection; not evidence of a running feature |
| Authority / projection | The writer-owned truth / a derived reading of it; browser caches and Kanban do not become additional server authorities |
| Store / shadow | A resolved persistence location / owner resources replacing shipped resources according to their format ([Shadowing](docs/architecture/shadowing.md)) |

The Services repository's `services.json` maps parts to routes and resources. Its connector
and install contracts describe integration and removal. Cowork owns browser surfaces and
the host; Services owns each part's implementation and its use of the named stores.

## Internal names

Internal identifiers are useful in source and exact commands. In owner-facing explanations,
use the glossary's plain terms. **Koshi** is an existing UI name and an explicit exception.

| Name | Current meaning |
|---|---|
| MICHI / TEGAMI / SHINGO | Work-record service contribution / stored record / UI reading |
| RIREKI | Readable-transcript implementation; currently parked, so do not promise a recording |
| OBOERU | Memory terminology; not an active part in the Services manifest |
| TOMODACHI / SOROBAN | Stats and counting contracts |
| KOSHI | Ronin's helper agents |
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
