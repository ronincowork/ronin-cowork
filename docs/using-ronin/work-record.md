# Work records and projects

A work record says what an Agent is doing now: its objective, repositories, the work items
it holds, and its focus. The ladder and the documents live on the work item the Agent is
on. The Team Kanban is a reading of the same items; there is no stored board to reconcile.

Use the shipped `work-record` command exposed to your session. `work-record --help` is the
canonical command vocabulary; there are no legacy reader or writer aliases.

## A project is a work item

A work item is stored once, keyed by its id (`w12`), and changed only by tools. Every change
appends one line to its trail naming who made it. Nobody is refused for not holding an item:
holding is how work is found, never permission.

```json
{
  "id": "w12",
  "title": "Agent-authored projects",
  "objective": "Create collision-free projects.",
  "stage": "BUILD",
  "exit": "agent",
  "status": "yellow",
  "parent": "w3",
  "ladder": [
    { "gate": "go / no-go", "status": "DONE" },
    { "phase": "Build it", "status": "ACTIVE", "legs": [
      { "title": "Store round-trips", "status": "DONE" },
      { "title": "Focused checks pass", "status": "ACTIVE" }
    ] }
  ],
  "docs": ["/home/me/plans/AGENT_PROJECTS.md"],
  "external": {},
  "trail": [
    { "at": "2026-09-28T15:02:11Z", "by": "lead", "op": "create", "to": "team:surface", "note": "Agent-authored projects" },
    { "at": "2026-09-28T15:04:40Z", "by": "lead", "op": "assign", "from": "team:surface", "to": "agent:builder" }
  ],
  "created": { "at": "2026-09-28T15:02:11Z", "by": "lead" }
}
```

Two relations are kept apart. **Holding** (assign, hold, held by) is a list of item ids on
each Team and each Agent; assigning moves the id from one list to another and never touches
the item. **Parent and child** (nest, parent) is one optional parent id on the item; a
reparent that would form a cycle is the one refusal, answered `REFUSED` with the chain
named. A Team holds; it does not contain.

Create an item held by yourself, or by a Team:

```text
work-record project create --title "Agent-authored projects" --objective "…" [--parent w3]
team project create surface --title "Agent-authored projects" --objective "…"
```

Every acknowledgement answers with the item as it now is and the trail line it appended, and
ends by naming the item and the write that keeps it current:

```text
w12 moved to land. Keep it current: work-record project write w12 --objective "<what it is now>" --evidence "<a fact with its receipt>"
```

## Stage, exit, and status

`stage` is a mark on the item: `IDEA`, `PLAN`, `BUILD`, `REVIEW`, `LAND`, `DONE`.

| Flag | Values | Meaning |
|---|---|---|
| `exit` | `none` · `agent` · `lead` · `user` | who must act next |
| `status` | `green` · `yellow` · `red` | delivery health |

Write one or several fields in one call; it is one trail line. Evidence is a fact with a
receipt, such as a commit or a hand-in, and is kept as an `evidence` line on the trail:

```text
work-record project write w12 --objective "Sharper words" --evidence "commit 0123456789"
work-record project write w12 --status green --exit lead
```

Prefer the lifecycle verbs when they express the whole intent:

```text
work-record project working w12            # yellow, exit agent, and your focus
work-record project ready w12 --for user   # green, exit user
work-record project stuck w12              # red, exit agent
work-record project blocked w12 --on lead  # red, exit lead
work-record project advance w12 --to REVIEW
work-record project return w12 [--team surface]
work-record project backlog w12
work-record project done w12
work-record project read w12
work-record project list
```

`return` gives the item to your Team (name it with `--team` when you are on several);
`backlog` parks it, held by nobody; `done` moves it to stage DONE. The Team verbs are
`team project assign <id> <session>`, `return <team> <id>`, `backlog <id>`, `done <id>`,
`restore <team> <id>` (back from DONE to the stage it left, held by the Team), and
`parent <id> <parent-id>|none`.

## Receipts move Land and Done

Name the item on a hand-in with `worktree-desk hand-in <repo> --project <id>`. An accepted
hand-in moves the item to LAND, with the receipt on its trail. A completed promotion moves
every item named on the hand-ins it carries to DONE, with the promotion receipt. No
association is guessed from focus, names, or repositories.

A supporting Agent and an assignment are two operations owned by their tools:

```text
session_create board_reader --prompt "Take w12 and read it with work-record project read w12."
team project assign w12 board_reader
```

## The ladder is the focus item's

Your ladder is the ladder of the item you are on: your focus, the item `working` last
pointed at, else the first item you hold. Write it with the same verbs as ever:

```text
work-record update_record --phase "Build it" --leg 1 "Store round-trips"
work-record update_record --done 1.1 --active 1.2
work-record update_record --gate "owner go"
work-record read --rungs
```

Phases and legs are never items; only a lead breaking work up makes a piece its own item,
with a parent. Holding nothing, your first ladder write makes one item for you, held by
you, titled from your objective, so there is no break. A lead or monitor places you on the
ladder with `work-record update_record --session <name> --at N[.M]`.

## Documents and session context

Documents live on the focus item too, and travel with it when it moves between Agents. The
Docs tab lists your README and the documents of every item you hold:

```text
work-record document add docs/using-ronin/work-record.md
work-record workspace add ronin_cowork --branch team/example/cut
work-record workspace add https://github.com/ronincowork/samurai_lab.git --branch main
work-record workspace list
```

Remove an old entry with `work-record workspace remove <repo-or-url>`; add `--branch`
to remove only that branch. The acknowledgement says how many rows changed, including
when none matched. `session_set <name> --root <handle>` separately changes a live
session's recorded Workspace Folder. Neither edit changes its birth directory or opens
a managed desk. These fields locate work; they do not replace commits, hand-ins, or evidence.

When an Agent ends, is archived, or is Hard Deleted, what it held is released: each item
gets a `holder-ended` line and is found again under its parent or unassigned. Restoring an
archived Agent does not reclaim it.
