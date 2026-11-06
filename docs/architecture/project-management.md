# Project management: contents

Every file behind Ronin's project management, and who reads it. Start with the README,
[Project management, the Ronin way](../using-ronin/project-management.md); everything below is
where it is built or taught.

## For people

| Doc | What it holds |
|---|---|
| [Project management](../using-ronin/project-management.md) | **The README.** Plan, epic, item; how an item lives; the three signals; the six notices; where the work shows (Jira Kanban or Scrum, Epics, the item island) |
| [Writing a plan](../using-ronin/planning.md) | the plan: who writes it, Draft and Ordered, the `plan` tool, from plan to epics, and the one copy of the template (`plan read --template` reads it) |
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
| `plan` (`ronin_bin/plan`) | ls (`--status Draft\|Ordered`), read (`<workspace>/<name>`, `--template`), write, order, over `/api/plans`; the Workspace is the caller's Team's unless `--workspace`; `plan --help`. Taught by `ronin-help planning`, not by a brief |
| `worktree-desk hand-in <repo> --item <id> --note "<what they can try>"` | the hand-in signal: In Review, the Agent keeping the hold, recorded in `hand_ins`, the note posted as the **Handed in** comment (280 characters at most). Under project management, refused without `--item` or without `--note` (`src/commands/desk.ts`, `src/desks/hand-in.ts`) |
| `bin/ronin-promote <team>` | the promotion signal: marks each carried item `on_dev`, no status change (`src/promotion/promote.ts`) |
| `session_end` | settles To Do back to the Team, then refuses while the Agent holds anything In Progress or In Review; NEXT is `item handover` (`src/routes/sessions-api.ts`, `settleToDo`, `unfinishedHolds`) |
| `team-roster-write --select / --deselect` | turns project management on or off for a Team (`libexec/team-roster-write`) |

## The code

| File | Holds |
|---|---|
| `src/work-items.ts` | the store. Shapes Jira refuses (`jiraShape`); every id resolving (`resolveId`); the hand-in (`handInUnlocked`, `handInStage`, the Handed in note); `markOnDev`; Send back; the handover (`handoverItem`), To Do settling (`settleToDo`), an ending without a handover (`releaseHolder`: to the Team, flagged, the lead told once) and the crash sweep (`releaseEndedHolders`); the six notices (`noticesOf`, one per person per command); Done by name (`DONE`); the archive (`archiveDone`, `ARCHIVE_AFTER_MS`, five days from `doneSince`); delete; `plan:` attachments |
| `src/index.ts` | the five-minute sweeps: crashed holders, then the archive |
| `src/work-items-read.ts` | the Team readings: the Team's epics, the Epics push (archived items left out, counted per epic); lists read by the id each item goes by now, once |
| `src/routes/work-items-api.ts` | `/api/work-items`: CRUD, `many/:act`, `:id/on-dev`, `:id/send-back`, `:id/handover`, comment, attach, link; search leaves archived out unless `?archived=1` |
| `src/routes/sessions-api.ts` | `session_end`'s refusal and its NEXT |
| `src/tegami-read.ts`, `libexec/work-record-read` | the work record's items, for the tile and `work-record read` (Done shown with how long ago) |
| `src/plans.ts`, `src/routes/plans-api.ts` | plans on the Workspace: the place (Ronin Lab's `<campaign>/<workspace>/plans`, or `plans: { location, path }`), the header, Draft and Ordered (no guards: the docs steer), one-file commits and the push, the move on a changed place; `resolve` for `plan:` |
| `src/workspaces.ts`, `src/routes/workspaces-api.ts`, `public/js/workspaces-surface.js` | the Workspace's `plans` field and the page's Plans row |
| `public/js/plan-attachment.js`, `src/routes/docs-api.ts` | a `plan:` attachment opened or shown gone; the Docs pane's Plans shelf |
| `public/js/epics-surface.js` | the Epics workbench: stones, an epic's record, its Show question, `holderButton` |
| `public/js/team-epics.js` | the Team workbench's Epics card |
| `public/js/work-items-surface.js` | an item's reading (the overlay): `holderWords` ("Team <t> (lead <l>)", "@agent"), id, kind · level, origin |
| `public/js/tile-island.js` | the item island: Done hidden, Subtasks folded under their Task, the hand-in mark |
| `public/js/jira-panel.js` | Settings › Jira |
| `tests/work-items*.test.ts`, `tests/work-item-*.test.ts`, `tests/plans.test.ts`, `tests/item-reader.test.js`, `tests/tile-island.test.js`, `tests/epics-*.test.js`, `tests/jira-panel-ui.test.js` | the tests |

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
- Ronin refuses any shape Jira would refuse, so the two never part. A delete reaches Jira; one
  from Jira needs `--in-jira`.

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
