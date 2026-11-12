# Project management: contents

Every file behind Ronin's project management, and who reads it. Start with the README,
[Project management, the Ronin way](../using-ronin/project-management.md); everything below is
where it is built or taught.

## For people

| Doc | What it holds |
|---|---|
| [Project management](../using-ronin/project-management.md) | **The README.** Plan, epic, item; how an item lives; the three signals; the six notices; where the work shows (Jira Kanban or Scrum, Epics, the item island) |
| [Writing a plan](../using-ronin/planning.md) | the plan: who writes it, Draft and Ordered, the `plan` tool, from plan to epics, Park it (the Icebox), and the one copy of the template (`plan read --template` reads it) |
| [Work items](../using-ronin/work-items.md) | the fields, levels, statuses and every `item` command |
| [Jira](../using-ronin/jira.md) | connecting a space: the panel, the switches, Connect, Jira wins |
| [Workbench](../using-ronin/workbench.md#epics-on-a-team) | Epics on the Team workbench |
| [The tile](../using-ronin/tile.md#the-item-island) | the item island: a pill per open item, Subtasks folded under their Task; an item's reading |

## For Agents: the briefs

The birth packet compiles them (`src/agent-composition.ts`). Project management is the selected
behaviour `project-management`: on in a Campaign's defaults, off per Team with `team-roster-write
<team> --deselect project-management`. With it off an Agent gets none of these. Each brief is one
cell of topic × audience; an Agent reads only its own cells.

| Brief (`ronin_catalogs/`) | Read by | `requires` |
|---|---|---|
| `behaviours/selected/project-management.md` | every Agent: the five reasons, structure, objectives in the user's words, status, notices, the hand-in note, don'ts | (selected) |
| `behaviours/conditional/project-management-coworker.md` | coworkers: take, start, side work, hand in, hand over at the end, end when accepted | `behaviour:project-management, role:coworker` |
| `behaviours/conditional/project-management-lead.md` | Team leads: the three kinds of ask, when to offer a plan (`ronin-help planning`), giving out work, deciding what an ending handed over or flagged, promote in batches | `behaviour:project-management, lead` |
| `behaviours/conditional/project-management-epic-lead.md` | an epic_lead on Steerco | `behaviour:project-management, role:epic_lead` |
| `behaviours/conditional/project-management-traffic-control.md` | traffic_control on Steerco: placing Jira's unheld items | `behaviour:project-management, role:coordinator` |
| `capabilities/work-item.md` | every Agent, in YOUR TOOLS: the `item` tools table and syntax only | `behaviour:project-management` |

`behaviours/conditional/cowork-agent.md` and `team-lead.md` carry no item text. The role comes
from the session's behaviours (`currentRoleAt` in `src/agent-composition.ts`; a role file wins, then the Steerco cell names, then lead or coworker); `behaviour:` is a
predicate in `src/behaviours.ts`.

## For Agents: the tools

| Tool | Does |
|---|---|
| `item` (`ronin_bin/item`) | create, read, search (`--text`, `--archived`), edit, transition (`--note` on a hand-in), flag, unflag, handoff (`--from`, `--keep-holding`), handover, archive (`<ids>`, `--done [--team]`), watch, comment, attach (a path, a link or `plan:<name>`), link, delete; `item --help` |
| `plan` (`ronin_bin/plan`) | ls (`--status Draft\|Ordered`), read (`<workspace>/<name>`, `--template`), write, park (`--idea`: the Draft plan and its Icebox item, `/api/plans/park`), order, over `/api/plans`; the Workspace is the caller's Team's unless `--workspace`; `plan --help`. Taught by `ronin-help planning`, which `conditional/cowork-agent.md` points to when an Agent is asked to plan |
| `worktree-desk hand-in <repo> --item <id> --note "<what they can try>"` | the hand-in signal: In Review, the Agent keeping the hold, recorded in `hand_ins`, the note posted as the **Handed in** comment, the review line the Epics bar leads with. Missing or long, never refused: the reply prompts for it (`reviewPrompt`, `src/work-items.ts`; `src/commands/desk.ts`, `src/desks/hand-in.ts`) |
| `bin/ronin-promote <team>` | the promotion signal: marks each carried item `on_dev`, no status change (`src/promotion/promote.ts`) |
| `session_end` | settles To Do back to the Team, then refuses while the Agent holds anything In Progress or In Review; NEXT is `item handover` (`src/routes/sessions-api.ts`, `settleToDo`, `unfinishedHolds`) |
| `team-roster-write --select / --deselect` | turns project management on or off for a Team (`libexec/team-roster-write`) |

## The code

| File | Holds |
|---|---|
| `src/work-items.ts` | the store. Shapes Jira refuses (`jiraShape`); every id resolving (`resolveId`); the hand-in (`handInUnlocked`, `handInStage`, the Handed in note); `markOnDev`; Send back; the handover (`handoverItem`), To Do settling (`settleToDo`), an ending without a handover (`releaseHolder`: to the Team, flagged, the lead told once) and the crash sweep (`releaseEndedHolders`); the six notices (`noticesOf`, one per person per command); Done by name (`DONE`); the archive (`archiveDone`, `ARCHIVE_AFTER_MS`, five days from `doneSince`); delete; `plan:` attachments |
| `src/index.ts` | the five-minute sweeps: crashed holders, the archive, then every Workspace's Icebox (`ensureEveryIcebox`) |
| `src/work-items.ts`, the Icebox | a Workspace as a holder (`Holder` kind `workspace`, `heldLists`, `listFor`); `ensureIcebox`, `iceboxIds`, `parkIdea`; `takenUp` (an epic attaching a parked plan moves its Icebox item to Done, from `attachDoc`) |
| `src/workspaces.ts`, the holds | `<workspaces>/<campaign>/<name>.holds.json`: the Workspace's `holds` and its `icebox` id, beside the record so a page Save never races an item write (`readWorkspaceHolds`, `writeWorkspaceHolds`, `listWorkspaceHolds`) |
| `src/work-items-index.ts`, `src/holds-hook.ts` | the live index (below): its rows, its upkeep from every item and holds-list write, its rebuild |
| `src/work-items-read.ts` | the readings, from rows: an Agent's, a Team's (its epics: a root a Workspace holds, its Icebox, on none), every item's, the Epics push (rows only), `epicCards` (the picked Epic's bar words, from bodies) |
| `src/routes/work-items-api.ts` | `/api/work-items`: CRUD, `many/:act`, `:id/on-dev`, `:id/send-back`, `:id/handover`, `:id/cards`, comment, attach, link; search reads rows, `?text` opens the bodies the other filters leave, archived only with `?archived=1` |
| `src/routes/promotions-api.ts` | `GET /api/promotions/:id/live`: a read of the promotion ledger receipt (`readReceipt`), live = complete, restart ok, health passed; the item reader's Handed in line ends "· live" by it (KAN-311) |
| `src/routes/sessions-api.ts` | `session_end`'s refusal and its NEXT |
| `src/tegami-read.ts`, `libexec/work-record-read` | the work record's items, for the tile and `work-record read` (Done shown with how long ago) |
| `src/team-layers.ts` | a Team in four layers (KAN-331): Workspace, Plans, Canvases, Epics read live for every member (`teamLayers`, in `agentReading`'s `layers`); the lead's grouped "work record changed" (`layersMayHaveChanged`, `settleLayers`: a ~3 s quiet spell, each lead told only when its own layers moved), fed by `onItemChanged`, the plans routes and the Workspace PUT |
| `src/plans.ts`, `src/routes/plans-api.ts` | plans on the Workspace: the place (Ronin Lab's `<campaign>/<workspace>/plans`, or `plans: { location, path }`), the header, Draft and Ordered (no guards: the docs steer), one-file commits and the push, the move on a changed place; `resolve` for `plan:` |
| `src/workspaces.ts`, `src/routes/workspaces-api.ts`, `public/js/workspaces-surface.js` | the Workspace's `plans` field and the page's Plans row |
| `public/js/plan-attachment.js`, `src/routes/docs-api.ts` | a `plan:` attachment opened or shown gone; the Docs pane's Plans shelf |
| `public/js/epics-surface.js` | the Epics workbench: stones, an epic's record, its Show question, `holderButton` |
| `public/js/team-epics.js` | the Team workbench's Epics card |
| `public/js/work-items-surface.js` | an item's reading (the overlay): `holderWords` ("Team <t> (lead <l>)", "@agent"), id, kind · level, origin |
| `public/js/tile-island.js` | the item island: Done hidden, Subtasks folded under their Task, the hand-in mark |
| `public/js/jira-panel.js` | Settings › Jira |
| `tests/work-items*.test.ts`, `tests/work-item-*.test.ts`, `tests/plans.test.ts`, `tests/item-reader.test.js`, `tests/tile-island.test.js`, `tests/epics-*.test.js`, `tests/jira-panel-ui.test.js` | the tests |

## The live index

Opening one item read every item file, to find its children, the links to it and its parent, and
every letter on the machine (live and ended sessions), every roster and Workspace holds file, to
say who holds it: about 650 file reads per open on the live store, 0.6–3.4 s under the live
server's load (w418). The owner's shape (2026-11-11):

1. **One JSON file of the live items**, `<work-items>/live-index.json`: everything not archived,
   one flat row per item holding only what lists filter on or show: id, Campaign, kind, level,
   status, flagged, parent, links, holders, title, Jira key, the last hand-in and on dev and when,
   last changed (`moved`). No objective, comments, trail or attachments: those stay in the item's
   own file. The tree comes from `parent`. Beside the rows, the file keeps every holds list it was
   built from (its key, holder label and ids) and the ids renamed to Jira keys.
2. **Reads.** Lists, the Epics board, the work record, Waiting on you and the pills read rows only
   (`liveRows`, `holderLabels`). Opening an item reads the index and its own file. `item search
   --text` opens bodies, only those the other filters leave. The Epics board's bar words (the
   objective cut short, the last comment, how many) are read from bodies for the picked Epic only
   (`GET /api/work-items/:id/cards`, `epicCards`). A work record still opens its own held items'
   files (and its led Teams'), for their attachments: its documents.
3. **Archived items and ended sessions are never read for live work.** Archive takes the row out;
   leaving Done after archive puts it back. Holders come from the index's lists, so no ended
   session's letter is opened; `item read` and `--archived` still find history by id. An Epic no
   longer counts its archived items.
4. **Upkeep.** Every item save puts its row (`itemWritten`) and every removed item file drops it
   (`itemRemoved`), in the same issuer step as the write. Every holds-list write reports its list
   through `holds-hook.ts`: a roster write or delete, any letter write (`replaceLetterBlock`), a
   Workspace's holds write or delete, and a session folder swept by retention; those are the
   writers under session end, Team rename and retire, roster edits and handoffs alike. The file is
   saved whole, through a temp file and a rename, one save at a time. It is rebuilt from the item
   files and the holds lists at every start (`rebuildIndex`, from `index.ts`, and on the first read
   in any process), and a process that sees another's save reads that file back. A test in each
   work-item suite rebuilds it and compares it with the one the writes kept.

Measured (w418), the route and the Epics push run in-process, median ms idle / with the file
pool kept busy, before → after:

| Store | Open an item | List every item | Epics push | Rebuild at start |
|---|---|---|---|---|
| live-sized: 301 items, 329 letters | 143 / 199 → 10 / 14 | 129 / 166 → 5 / 4 | 113 / 144 → 0 / 0 | 147 |
| 5,000 items, 329 letters | 1038 / 1165 → 19 / 16 | 1148 / 1154 → 16 / 15 | 982 / 1044 → 4 / 3 | 862 |

## Jira

The bridge is ronin-services `jira/`, installed at `src/services/jira/`. Its design, what flows
each way and **every Jira call it makes** are in ronin-services
[`docs/jira-bridge.md`](https://github.com/ronincowork/ronin-services/blob/dev/docs/jira-bridge.md).

## Why it is shaped this way

The owner's decisions, 2026-11-04 and 05:

- An item serves one of five reasons, or it isn't made. Nothing ahead of the work.
- A plan is written once with the user and not kept current: Draft, then Ordered. It lives on
  the Workspace, reached only through `plan`; epics attach it as `plan:<name>`.
- A hand-in moves the item to In Review and the Agent keeps it; it carries one short note for
  the user; objectives are what done looks like to the person accepting, in their words.
- A hand-in, a promotion and a flag are three signals; only the accepting person sets Done.
- Six notices, none twice. The rest is seen, not told.
- Send back stays with whoever holds the item, who is told; Done tells the Agent holding it.
- An ending hands over, never drops: To Do to the Team, In Progress and In Review with a
  Handover note; an ending that can't ask flags them for the lead.
- Done stays five days, then is archived in Ronin only; Jira keeps its own view.
- Every Workspace has one Icebox epic, made by Ronin and held by the Workspace, for parked ideas
  only: one item per idea, "Draft the plan for <idea>", its Draft plan attached; finished when the
  plan is taken up or the idea dropped. Parking is one act, `plan park` (2026-11-10). Held by the
  Workspace, it is on no Team's or Agent's record and never reads as work waiting to be given out.
- Ronin refuses any shape Jira would refuse, so the two never part. A delete of an item made in
  Ronin reaches Jira; one that came from Jira goes from Ronin only, its issue kept.

What led there (2026-10-20 to 11-05): items made only to hand in against; Agents keeping
everything they ever held; progress and plans filed as items; leads told of every move, often
twice; ids changing under people; Agents setting Done; handed-in work with nowhere to show;
136 items In Review under one epic, left by Agents that ended without deciding them.

## Known gaps (2026-11-05)

Found reading the code end to end; none is built yet.

| Gap | Where | Proposed |
|---|---|---|
| An ending with no Team found still goes to nobody (flagged, its helpers told) | `releaseHolder` | to the epic's Team, else traffic_control |
| To Do is taken as the space's first status, as Done was taken as its last | `settleToDo`, `unfinishedHolds`, `releaseHolder` | To Do by name, as Done now is |
| The Epics record gets each epic's archived count but doesn't show it | `epics-surface.js` | "N archived" under the status row |
| A Jira change that is only the echo of Ronin's own delete beats Ronin's next change (KAN-232 went back to In Review) | ronin-services `jira/bridge.ts` | treat a parent cleared by a Ronin delete as Ronin's own write |
| "Your work record changed" pings still go to every Agent whose lists move | `ackRecord`, `src/tegami.ts` | only for the Agent's own items, Teams or settings (owner's open question) |
