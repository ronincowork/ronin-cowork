# Work items

Work lives on **work items**, as in Jira. Anyone reading an Agent's items should know where
its work is without asking, so Agents keep them true as they go, never only at the end.
Ronin has no board: a user who wants one uses Jira or Trello. You read items on the
Agent workbench's **Work Items**, in a Team's **Work items**, and on a tile's
☰ Work record; every change goes through the `item` tool, and `item --help` has the exact
syntax.

## The structure

Every work item has a level. The level says what it is.

| Level | What it is |
|---|---|
| 1 | **epic**: holds a body of work |
| 0 | **story, task, bug, feature**: the work itself |
| -1 | **subtask**: one step inside a level-0 item |

At level 0 the kind is only a label. Story, task, bug and feature are the usual ones; any
other name works, and blank is fine.

The parent sets the level. A new item starts one level below its parent, or at 0 with no
parent. Moving an item with `item edit <id> --parent <other>` moves its level too, and its
children follow, each one level below its parent. Put a task under another task and it
becomes a subtask. `--parent none` takes the parent away and leaves the level as it is.

There is one rule: nothing goes below -1. If a move would push any item there, it fails
with one line, such as "w39 can't go there." Choose another parent.

No parent is normal. Not every task belongs to an epic.

## The fields

- **title**: a short name anyone can read at a glance.
- **objective**: what done looks like. Change it when the job changes.
- **kind**: the label at level 0 (`--kind bug`).
- **status**: where the work stands (below).
- **flagged**: the item is stuck. The reason is a comment.
- **priority**: any name your Team uses, or blank.
- **comments**: who, when and what. The running account of the work.
- **attachments**: documents that belong to the item. They show in the tile's Docs.
- **links**: this item **blocks** another, or **relates** to it.
- **external keys**: the item's key in Trello or GitHub (`--github 123`). Blank clears it. An
  item paired with Jira shows its Jira key (`PAY-123`); the Jira bridge keeps that pair.

Every change adds a line to the item's history. `item read <id>` shows it all: fields,
children, comments, attachments, links and history.

## Status

| Status | Means |
|---|---|
| IDEA | Written down, not yet agreed or planned. New items start here. |
| PLAN | Being shaped: scope, approach, subtasks. |
| BUILD | Being done now. |
| REVIEW | Your part is finished and ready for someone to look at. |
| LAND | Handed in to the Team line. |
| DONE | Promoted. |

Agents move their items themselves with `item transition <id> <status>`. Any status to any
status is allowed. Two moves are made for them: a hand-in that names the item
(`worktree-desk hand-in <repo> --item <id>`) moves it to LAND, and the promotion that
carries that hand-in moves it to DONE. An item paired to Jira is the exception: promotion
moves it to LAND (In Review on Jira), and it is DONE only when the Jira user moves it to Done,
which comes back by polling. A hand-in that names no item moves no status.

## The item tool

```text
item create --title "…" [--kind task] [--parent w3] [--level 1|0|-1] [--objective "…"] [--priority High]
item read w12                       # fields, children, comments, attachments, links, history
item search [--campaign home_machine] [--team surface] [--holder builder | none] [--parent w3 | --no-parent] [--status BUILD] [--kind bug]
item edit w12 --objective "…" --priority High
item transition w12 REVIEW
item flag w12 "waiting on the API"  # item unflag w12 when clear
item assign w12 builder             # adds builder; or team:surface
item handoff w12 builder            # the giver comes off; or team:surface, or none
item comment w12 "…"                # --edit <n> changes one
item attach w12 docs/plan.md        # --remove <path> takes it off
item link w12 blocks w14            # or relates; --remove takes it off
item delete w12                     # with its subtasks
```

Every write answers with one line of what it did, then the item as it now is.

## An Agent's day

**It is given an item.** Ronin tells it. `work-record read` lists what it holds.

```text
item read w12
item transition w12 BUILD
```

**Big work is broken down.** Each step gets its own subtask, moved through its own status,
so anyone can see how far along the work is.

```text
item create --parent w12 --title "Write the migration"
item create --parent w12 --title "Update the docs"
```

**Findings and decisions are comments.** What it learned, what it chose and why, the answer
to a question someone asked: written where the next reader will look.

```text
item comment w12 "The old field is read in two places; both now use the new one."
item comment w12 --edit 2 "Corrected: three places, not two."
```

**Documents are attached.** A plan, a study, a design note: if it was written for this item,
it is attached. People reach the documents an Agent attaches, and no others.

```text
item attach w12 docs/migration-plan.md
```

**Work found on the side is filed.** A bug it notices, a task the job turns out to need:
an item of its own, never done quietly inside the one it holds.

```text
item create --kind bug --parent w10 --title "Search drops the last result"
```

**Stuck: flag it.** With the reason. The flag comes off when the work moves again.

```text
item flag w12 "Waiting on the API shape from the backend Agent"
item unflag w12 "Shape agreed; see the comment above"
```

**Held up by another item: link it.** The link reads from the item that does the blocking.

```text
item link w15 blocks w12
```

**Keep the objective true.** If the job changes, `item edit w12 --objective "<new>"`.

**Finished.** REVIEW, then a hand-in with the item named.

```text
item transition w12 REVIEW
worktree-desk hand-in ronin_cowork --item w12
```

## Holding and assigning

An item can be held by several Agents and Teams, or by nobody. A new item is held by
nobody until it is assigned.

```text
item assign w12 builder         an Agent holds it
item assign w12 team:surface    the Team holds it
item handoff w12 builder        the giver comes off and builder goes on
item handoff w12 none           the giver lets go
```

Assigning adds a holder and removes nobody. When an Agent ends, it lets go; other holders
stay.

A lead uses assign to give out work: an item for each member, or the Team for work not yet
given to anyone. Before handing over an item, the lead makes sure it says what is wanted:
a clear title and objective, a parent where one fits.

To find work, search: `item search --campaign <id>`, `--holder <name>` (`none`: held by nobody), `--team <t>`, `--parent <id>`,
`--no-parent`, `--status <s>`, `--kind <k>`.

## Notices

When someone else changes an item an Agent holds, Ronin tells it: "Your work record
changed; please read it." When someone adds an item under one it holds, Ronin tells it that
too. Under a Team's item, the Team's lead is told.

The Agent reads the item, then answers with an edit or a comment. A comment is how it
replies to a person, from Ronin or from Jira. A change is never left unanswered.

An Agent's own changes notify nobody. If someone needs to know, it tells them.

## Don'ts

- Don't do work without an item. If there is none, create one and assign it to yourself.
- Don't keep work only in your head or in your chat. If it matters, it is on the item:
  a comment, an attachment, a subtask or a status.
- Don't leave an item in a status the work has left. Move it when the work moves.
- Don't delete to tidy. `item delete <id>` removes the item and its subtasks for everyone.

## Read more

- [Work records](what-agents-write-down.md): what an Agent writes down, and why
- [Work records and work items](work-record.md): the stored shape, field by field
