# KOTOBA_GLOSSARY — the words to use with the person you work for

Use the plain words below with the owner.
[KOTOBA](KOTOBA.md) owns meanings; the lexicon owns displayed words. Tools execute;
behaviours guide; facts inform; skills adapt; UIs call (`docs/architecture/brief.md`).

## The names

| You will see | Say | What it is |
|---|---|---|
| JIKAN | **Cron jobs** | Scheduled requests to a named Agent or Team lead. Say "schedule a request". |
| TEGAMI | **work record** | The session's objective, repositories and the work items it holds, with their status. Say "update your work record". |
| RIREKI | the recording | Optional journal transcripts in Services, available when the session has a supported launch binding. Terminal output remains a separate view. |
| OBOERU | **memory** | Notes that outlive the session that wrote them. |
| TOMODACHI · SOROBAN | **Stats** | Counts of what sessions did, never content. |
| KOE | **Hotwords** | The dictation glossary. The mic is Voice; implementation ownership is in KOTOBA. |
| MODEL_SERVICES | **Model services** | Ronin-managed API connections such as Ronin Gateway, OpenRouter and private APIs. |
| Harness | **Harness** | The CLI that runs an Agent. |
| Model option | **Model option** | A named choice supplied by a model service or by the harness itself. |
| In-harness model | **In-harness model** | A model the harness itself offers for its current subscription or harness API key. Use the choices the CLI offers, such as those in its model picker. **CLI default** lets the harness choose. |
| Harness API key | **Harness API key** | An API key supplied to and managed by the CLI. Ronin does not receive the key. |
| Private API key | **Private API key** | An API key supplied to and stored by Ronin for a configured model service. Use **private key** as the short form in model settings. |
| API model ID | **API model ID** | The exact model identifier sent in an API request. |
| SETTEI | **Configuration** | Settings for the relevant scope. The gear opens cowork commons. |
| AGERU | **what gets sent** · **where Ronin has connected** | Ronin HQ packets and request history. Model-provider traffic is separate, not in this record. |
| ERABI | — | Shared selectors (`public/js/ask.js`). The owner sees a question, never this internal name. |
| KOTOBA · KOKUGO · DAIKUSAN · JUSHO · BYOIN · KYOKAI · SHIWAKE | — | Internal names; use the feature's plain word. |

## The space

| You will see | Say | What it is |
|---|---|---|
| `coworkspace` | **the coworkspace** | The whole UI. |
| root destination | **Ronin Home** | The root page and its browser title. |
| root layout | **Three Blocks** | Home's Settings, Teams, and New Project doors. |
| Setup workbench | **Ronin Setup** | First-use workbench. |
| Desk workbench | **Ronin Settings** | Ongoing Desk configuration workbench. |
| `office_unit` (the office record in `~/ronin/office_unit/`) | **hosted office** | Cowork running inside an office_unit on an office_park. It shows no account, billing, subscription, registration or machine settings; self-hosted Cowork is the one without the record. |
| Home side stone, hosted only | **Business Lounge** | A link from Home to https://hq.roninhosted.com/, where a hosted office's account, office and subscription are kept. Each person lands in their own lounge. |
| Ronin Hosted money | **balance**, **starter balance**, **top up**, **office limit**, **spent** | The account's money in dollars: a $5 starter balance at first rental, topped up by the person; an office limit caps one office's share. Never "credits" or "budget". |
| stone work surface | **stone work surface** | Select a collection item: stones move to a left rail, details open on the right. Reused by Workspaces and Harnesses. |
| tile | **tile** | One cell showing one session. Never "pane". |
| `workspace1`…`workspace4` | **tilespace** | One numbered slot of a workbench. It holds a tile or a commons. Never call it a workspace. |
| `campaign_commons` | **the commons** | The Desk's shared surface. |
| `team_commons` | **team commons** | Roster, Docs, Wipeboard, Messages, Cron jobs, Configuration. |
| `cowork_commons` | **cowork commons** | Machine, account, desk profile. |
| `admin_desk` | **the desk** | Everything about this install, behind ⚙. |
| `commons_tab` | **tab** | One section of a commons. Never "pane" or "panel". |
| `session_roster` | **the roster** | Every session on the machine. |
| `MDEDIT` | **the Docs tab** | The session's listed documents. Say "list a doc". |
| `wipeboard` | **wipeboard** | A Team's shared notes, for what everyone must see; posts expire once read. |
| 🔒 / 🔓 | **Locked / Unlocked** | Whether this view is attached to the live session. |

## Sessions and teams

| You will see | Say | What it is |
|---|---|---|
| team | **Team** | A set of sessions working together. |
| Ronin Lab | **Ronin Lab** | A place for ideas, research, plans, and notes before or across projects. The creators’ Lab is their own instance. |
| `team_roster` | **Team record** | Team identity, defaults, and held work items. Members and leads derive from sessions. |
| `wN` | **work item** | Stored once by id, matching Jira. Its level is an **epic** (1), a **story**, **task**, **bug** or any other work type (0, its kind; blank by default, no fixed list) or a **subtask** (-1). Its status is the item's state; **flagged** marks an impediment (`item flag`); **priority** is any name; **comments** are who, when and the text. Never "project". Ronin has no board: boards live in Jira or Trello. |
| `team_lead` | **team lead · 人** | Set by hand, never inferred from what a session does. |
| `session_type` | **session type** | **Cowork Agent** with its resolved Agent composition · **bare-metal Agent** a CLI started without it · **terminal** a shell with no agent. |
| `session_mandate` | **mandate** | **Reach** how far an Agent goes · **Recruit** how it builds a Team · **Output** what it hands back. |
| `brief` | **brief** | What an Agent is told: facts, behaviours and tools at a depth, from its work record. Installations enable; behaviours guide. |
| `message_queue` | **message queue** | Messages waiting to enter a live session. |
| `model_catalog` | **model catalog** | HQ's Models table: each CLI model's tier, "use it for" line and facts. |
| `project_root` | **workspace folder** | A repository or folder Ronin knows by name; a Workspace picks the ones its Agents use. |
| `workspace` (record) | **Workspace** | A project: objective, instructions, repositories, folders and Mode. Every Team works in one. |
| `desk_profile` | **desk profile** | The owner's standing defaults: skin, words, layout. |
| harakiri | **harakiri** | A session ends itself. |
| Desk | **Desk** | The engagement context containing Teams, Agents, and work. It is not a Git worktree. |
| worktree | **worktree** | A private working folder and branch with explicit custody for managed repository work. |
| hand-in | **hand in** | Admit committed work to Team review. Never say “push.” |
| commit | **commit** | A private checkpoint on a managed worktree; it publishes nothing. |
| push | **Git push** | Remote Git publication only; never the name for hand-in or promotion. |
