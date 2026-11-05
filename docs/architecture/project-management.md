# Project management: contents

Every file behind Ronin's project management, and who reads it. Start with the README,
[Project management, the Ronin way](../using-ronin/project-management.md); everything below is
where it is built or taught.

## For people

| Doc | What it holds |
|---|---|
| [Project management](../using-ronin/project-management.md) | **The README.** Plan, epic, item; how an item lives; the three signals; the five notices; where the work shows (Jira Kanban or Scrum, Epics, Waiting on you, the item island) |
| [Writing a plan](../using-ronin/planning.md) | the order: who writes it, its status, the `plan` tool, from plan to epics, closing, and the one copy of the template (`plan read --template` reads it) |
| [Work items](../using-ronin/work-items.md) | the fields, levels, statuses and every `item` command |
| [Jira](../using-ronin/jira.md) | connecting a space: the panel, the switches, Connect, Jira wins |
| [Workbench](../using-ronin/workbench.md#waiting-on-you-and-epics-on-a-team) | Waiting on you and Epics on the Team workbench |
| [The tile](../using-ronin/tile.md#the-item-island) | the item island: a pill per held item |

## For Agents: the briefs

The birth packet compiles them (`src/agent-composition.ts`). Project management is the selected
behaviour `project-management`: on in a Campaign's defaults, off per Team with `team-roster-write
<team> --deselect project-management`. With it off an Agent gets none of these. Each brief is one
cell of topic × audience; an Agent reads only its own cells.

| Brief (`ronin_catalogs/`) | Read by | `requires` |
|---|---|---|
| `behaviours/selected/project-management.md` | every Agent: the five reasons, structure, status, notices, don'ts | (selected) |
| `behaviours/conditional/project-management-coworker.md` | coworkers: take, start, side work, put back, hand in, leave | `behaviour:project-management, role:coworker` |
| `behaviours/conditional/project-management-lead.md` | Team leads: the three kinds of ask, the epic, giving out work, promote | `behaviour:project-management, lead` |
| `behaviours/conditional/project-management-epic-lead.md` | an epic_lead on Steerco | `behaviour:project-management, role:epic_lead` |
| `behaviours/conditional/project-management-traffic-control.md` | traffic_control on Steerco: placing Jira's unheld items | `behaviour:project-management, role:coordinator` |
| `capabilities/work-item.md` | every Agent, in YOUR TOOLS: the `item` tools table and syntax only | `behaviour:project-management` |

`behaviours/conditional/cowork-agent.md` and `team-lead.md` carry no item text. The role comes
from the session's behaviours (`currentRoleAt` in `src/agent-composition.ts`; a role file wins, then the Steerco cell names, then lead or coworker); `behaviour:` is a
predicate in `src/behaviours.ts`.

## For Agents: the tools

| Tool | Does |
|---|---|
| `item` (`ronin_bin/item`) | create, read, search, edit, transition, flag, unflag, assign, handoff, watch, comment, attach, link, delete; `item --help` |
| `plan` (`ronin_bin/plan`) | ls, read (`<workspace>/<name>`, `--template`), write, order, close, over `/api/plans`; the Workspace is the caller's Team's unless `--workspace`; `plan --help` |
| `worktree-desk hand-in <repo> --item <id>` | the hand-in signal: In Review, given to the Team, recorded on the item; refused without `--item` under project management (`src/commands/desk.ts`, `src/desks/hand-in.ts`) |
| `bin/ronin-promote <team>` | the promotion signal: marks each carried item `on_dev`, no status change (`src/promotion/promote.ts`) |
| `session_end` | refuses while the Agent holds unfinished items, naming the command that puts them back (`src/routes/sessions-api.ts`) |
| `team-roster-write --select / --deselect` | turns project management on or off for a Team (`libexec/team-roster-write`) |

## The code

| File | Holds |
|---|---|
| `src/work-items.ts` | the store: `plan:<workspace>/<name>` attachments (`planAttachment`), shapes Jira refuses (`jiraShape`), every id resolving, hand-in and `handInStage`, send-back, delete, the five notices (`noticesOf`, one per command) |
| `src/plans.ts` | plans on the Workspace: the place (`plansPlace`: Ronin Lab's `<campaign>/<workspace>/plans`, or `plans: { location, path }` on the record, Direct or non-Git only), the header, the states and refusals, one-file commits and the push, the move on a changed place with its clash refusal, `plan:` resolving |
| `src/routes/plans-api.ts` | `/api/plans`: ls, read, template, write, order, close, and `resolve` for the readers of a `plan:` attachment |
| `src/workspaces.ts`, `src/routes/workspaces-api.ts`, `public/js/workspaces-surface.js` | the Workspace's `plans` field, kept by `normalizeWorkspace`; the PUT that moves the plans; the page's Plans row |
| `public/js/plan-attachment.js`, `src/routes/docs-api.ts` | a `plan:` attachment opened or shown gone; the Docs pane's Plans shelf, the Workspaces' plans by status |
| `src/work-items-read.ts` | the Team readings: Waiting on you's three groups, the Team's epics |
| `src/routes/work-items-api.ts` | `/api/work-items`: CRUD, `many/:act`, `:id/on-dev`, `:id/send-back`, comment, attach, link |
| `src/tegami-read.ts` | the work record's items, for the tile |
| `public/js/epics-surface.js` | the Epics workbench: stones, an epic's record |
| `public/js/team-waiting.js` | the Team workbench: Waiting on you, Epics |
| `public/js/tile-island.js` | the item island and its hand-in mark |
| `public/js/jira-panel.js` | Settings › Jira |
| `tests/plans.test.ts`, `tests/work-items*.test.ts`, `tests/work-item-*.test.ts`, `tests/tile-island.test.js`, `tests/epics-*.test.js`, `tests/jira-panel-ui.test.js` | the tests |

## Jira

The bridge is ronin-services `jira/`, installed at `src/services/jira/`. Its design, what flows
each way and **every Jira call it makes** are in ronin-services
[`docs/jira-bridge.md`](https://github.com/ronincowork/ronin-services/blob/dev/docs/jira-bridge.md).

## Why it is shaped this way

The owner's decisions, 2026-11-04:

- An item serves one of five reasons, or it isn't made. A plan is an order, not an item; nothing ahead of the work.
- The order is written once and not kept current; it is read again only to close it (2026-11-05).
- A hand-in gives the item to the Team, so an Agent's list empties as its work finishes.
- A hand-in, a promotion and a flag are three signals; only the accepting person sets Done.
- Five notices, none twice. The rest is seen, not told.
- Send back goes to the Agent that handed in (to the Team if it has ended).
- An Agent ending puts its unfinished items back on their epic, with no notice.
- Ronin refuses any shape Jira would refuse, so the two never part.
- A delete reaches Jira; one from Jira needs `--in-jira`.

What led there (2026-10-20 to 11-04): items made only to hand in against; Agents keeping
everything they ever held; progress and plans filed as items; leads told of every move, often
twice; ids changing under people; Agents setting Done; handed-in work with nowhere to show.
