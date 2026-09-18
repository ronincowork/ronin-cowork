# KOTOBA_GLOSSARY — the words to use with the person you work for

Use the plain words below with the owner; **Koshi** is the existing UI-name exception.
[KOTOBA](KOTOBA.md) owns meanings; the lexicon owns displayed words. Tools execute;
capabilities teach; behaviors guide; skills adapt; UIs call. Services capabilities select
runtime parts, while Agent capabilities teach tools (`docs/architecture/tool-surface.md`).

<!-- RENDERED_FOR:START -->
> Template. A session receives this rendered with the owner's own desk words.
<!-- RENDERED_FOR:END -->

## The names

| You will see | Say | What it is |
|---|---|---|
| JIKAN | **Cron jobs**<!--g:glossary.cron_jobs--> | Scheduled requests to a named Agent or Team lead. Say "schedule a request". |
| MICHI · TEGAMI · SHINGO · `ladder` | **work record**<!--g:glossary.work_record--> | The session's authored work and evidence. Say "update your work record". |
| RIREKI | the recording | Readable transcripts in Services. Currently parked; live output is not a durable transcript. |
| OBOERU | **memory**<!--g:glossary.memory--> | Notes that outlive the session that wrote them. |
| TOMODACHI · SOROBAN | **Stats**<!--g:glossary.stats--> | Counts of what sessions did, never content. |
| KOSHI | Koshi | Ronin's helper agents; this name is on screen. |
| KOE | **Hotwords**<!--g:glossary.hotwords--> | The dictation glossary. The mic is Voice; implementation ownership is in KOTOBA. |
| SETTEI | **Configuration**<!--g:glossary.configuration--> | Settings for the relevant scope. The gear opens cowork commons. |
| AGERU | **what gets sent**<!--g:glossary.packet--> · **where Ronin has connected**<!--g:glossary.egress_log--> | Ronin HQ packets and request history. Model-provider traffic is separate, not in this record. |
| ERABI | — | Shared selectors (`public/js/ask.js`). The owner sees a question, never this internal name. |
| KOTOBA · KOKUGO · DAIKUSAN · JUSHO · BYOIN · KYOKAI · SHIWAKE | — | Internal names; use the feature's plain word. |

## The space

| You will see | Say | What it is |
|---|---|---|
| `coworkspace` | **the coworkspace**<!--g:glossary.coworkspace--> | The whole UI. |
| root destination | **Ronin Home** | The root page and its browser title. |
| root layout | **Three Blocks** | Home's Settings, Teams, and New Project doors. |
| Setup workbench | **Ronin Setup** | First-use workbench. |
| Desk workbench | **Ronin Settings** | Ongoing Desk configuration workbench. |
| stone work surface | **stone work surface** | Select a collection item: stones move to a left rail, details open on the right. Reused by Presets, Workspace Folders, and Model Providers. |
| tile | **tile**<!--g:glossary.tile--> | One cell showing one session. Never "pane". |
| `workspace` | **workspace**<!--g:glossary.workspace--> | One slot of the coworkspace. It holds a tile or a commons. |
| `campaign_commons` | **the commons**<!--g:glossary.campaign_commons--> | The Desk's shared surface. |
| `team_commons` | **team commons**<!--g:glossary.team_commons--> | Roster, Docs, Wipeboard, Messages, Cron jobs, Configuration. |
| `cowork_commons` | **cowork commons**<!--g:glossary.cowork_commons--> | Machine, account, desk profile, Workspace Folders. |
| `admin_desk` | **the desk**<!--g:glossary.desk--> | Everything about this install, behind ⚙. |
| `commons_tab` | **tab**<!--g:glossary.tab--> | One section of a commons. Never "pane" or "panel". |
| `session_roster` | **the roster**<!--g:glossary.roster--> | Every session on the machine. Never "the board". |
| `MDEDIT` | **the Docs tab**<!--g:glossary.docs--> | The session's listed documents. Say "list a doc". |
| `wipeboard` | **wipeboard**<!--g:glossary.wipeboard--> | A team's shared board file. Never "the board". |
| 🔒 / 🔓 | **Locked / Unlocked**<!--g:glossary.locked--> | Whether this view is attached to the live session. |

## Sessions and teams

| You will see | Say | What it is |
|---|---|---|
| team | **Team**<!--g:glossary.team--> | A set of sessions working together. |
| Ronin Lab | **Ronin Lab** | A place for ideas, research, plans, and notes before or across projects. The creators’ Lab is their own instance. |
| `team_roster` | **Team record**<!--g:glossary.team_roster--> | Team identity, defaults, and held Projects. Members and leads derive from sessions. |
| `team_lead` | **team lead · 人**<!--g:glossary.team_lead--> | Set by hand, never inferred from what a session does. |
| `session_type` | **session type**<!--g:glossary.session_type--> | **Cowork Agent**<!--g:glossary.cowork_agent--> with its resolved Agent composition · **bare-metal Agent**<!--g:glossary.bare_metal_agent--> a CLI started without it · **terminal**<!--g:glossary.terminal--> a shell with no agent. |
| `session_mandate` | **mandate**<!--g:glossary.mandate--> | **Reach**<!--g:glossary.reach--> how far an Agent goes · **Recruit**<!--g:glossary.recruit--> how it builds a Team · **Output**<!--g:glossary.output--> what it hands back. |
| instruction cascade | **installation**<!--g:glossary.installation--> · **behaviour**<!--g:glossary.behaviour--> | Installations enable; behaviors guide (floor, conditional, selected, sought). Mandate teaching is floor. |
| `message_queue` | **message queue**<!--g:glossary.message_queue--> | Messages waiting to enter a live session. |
| `project_root` | **workspace folder**<!--g:glossary.project_root--> | A registered folder Ronin may work in. Not a numbered browser workspace. |
| `desk_profile` | **desk profile**<!--g:glossary.desk_profile--> | The owner's standing defaults: skin, words, layout. |
| harakiri | **harakiri**<!--g:glossary.harakiri--> | A session ends itself. |
| `@ronin_note` | **Note**<!--g:glossary.note--> | The owner's one line about a session. |
| desk | **desk** | A managed private branch and worktree with explicit custody. |
| hand-in | **hand in** | Admit committed work to Team review. Never say “push.” |
| commit | **commit** | A private checkpoint on a managed worktree; it publishes nothing. |
| push | **Git push** | Remote Git publication only; never the name for hand-in or promotion. |
