# Work items

Work lives on **work items**, as in Jira. Anyone reading an Agent's items should know where
its work is without asking, so Agents keep them true as they go, never only at the end.
Ronin has no board: a user who wants one uses Jira or Trello. You read items on the
Agent workbench's **Work Items**, in a Team's **Work items**, and on a tile's
☰ Work record; every change goes through the `item` tool, and `item --help` has the exact
syntax.

## The structure

Every work item has a kind, and the kind has a level. The level says what it is.

| Level | What it is |
|---|---|
| 1 | **Epic**: holds a body of work |
| 0 | **Task, Story, Bug, Feature**: the work itself |
| -1 | **Subtask**: one step inside a level-0 item |

The kind is the Jira work type's name, exactly; a Desk paired to a space uses the space's
own. Setting the kind sets the level (`--kind Epic` makes an epic).

A new item starts one level below its parent, or at 0 with no parent, with its space's first
kind there unless you name one. Moving an item with `item edit <id> --parent <other>` moves
its level too, and its children follow, each one level below its parent; a kind at another
level becomes the first kind at the new one. Put a task under another task and it becomes a
Subtask. `--parent none` takes the parent away and leaves the level as it is.

There is one rule: nothing goes below -1. If a move would push any item there, it fails
with one line, such as "w39 can't go there." Choose another parent.

No parent is normal. Not every task belongs to an epic.

## The fields

- **title**: a short name anyone can read at a glance.
- **objective**: what done looks like. Change it when the job changes.
- **kind**: the work type (`--kind Bug`); it sets the level.
- **status**: where the work stands (below).
- **flagged**: the item is stuck. The reason is a comment.
- **priority**: Highest, High, Medium, Low or Lowest, or the site's own; a new item is Medium,
  as every Jira work item is.
- **comments**: who, when and what. The running account of the work.
- **attachments**: documents that belong to the item, by path; they show in the tile's Docs.
  A file kept in Jira is its Jira link.
- **links**: by Jira's link type name: this item **Blocks** another, **Relates** to it, is a
  **Duplicate**, or **Cloners**.
- **external keys**: the item's key in Trello or GitHub (`--github 123`). Blank clears it.
- **id**: `w12`, or, for an item paired with Jira, its Jira key (`KAN-65`), so Agents and Jira
  users say the same name. One made in Ronin is `w101` until it goes to Jira, then takes its
  key; a key changed in Jira renames it again. Its children, links and holders follow, the
  history says "renamed from w101", and every id it has had still finds it. Nobody is told.

- **Jira fields**: an item paired with Jira also shows Jira's Sprint, Due date, Rank,
  Reporter, Created, Resolved, Story point estimate, Labels, Components and Fix versions,
  by Jira's names, the ones Jira fills. They are Jira's: read only.

Every change adds a line to the item's history. `item read <id>` shows it all: fields,
children, comments, attachments, links and history. A connected item also shows its
`connection`: the key it carries, and its parent's: `null` when it has no parent, a
`key` of `null` when the parent carries none. These are the stored keys; nothing is
checked, so a key does not mean the connection works.

## Status

Status, kind, priority and link type are Jira's names exactly, with no mapping; anything else
is refused, and the refusal names the ones there are. Unconnected, a Desk has Jira's
statuses, in workflow order:

| Status | Means |
|---|---|
| To Do | Not started. New items start here. |
| In Progress | Being done now. |
| In Review | Handed in, ready for someone to look at. |
| Done | Accepted. |

A Desk paired to a Jira space uses that space's names, and a new item starts at the space's
first status.

Agents move their items themselves with `item transition <id> "<status>"`, by name. Any status
to any status is allowed. One move is made for them: a hand-in that names the item
(`worktree-desk hand-in <repo> --item <id>`) moves it to In Review, where the space has that
status, and gives it to the Team. A promotion never changes a status; it puts its receipt on
the item's trail. Done is set only by the person accepting the item: on the Team workbench's
Waiting on you, in an item's reading (below), or, for an item paired to Jira, by the Jira user,
which comes back by polling. A hand-in that names no item moves no status.

**An item's reading** is the same wherever an item opens: over a tile from its item island, or in
place on the Work Items stones. It is drawn in the launch forms' format: a head with the kind's
symbol, the title, and the key, kind, status and flag, then label-left rows: **Status**,
**Objective**, **Details** (priority, holder, parent, a paired item's Jira fields), **Subtasks**
(over a tile: a Task's open ones, each opening in its place), **Done (n)** (its Done ones,
folded to begin with), **Comments**, **Attachments** (each opens), **Links** and, on Work Items,
**History**. Status is an ERABI question: press it, pick any status, and the item moves (the
transition, one trail line, its holders and watchers told). The line under it says what
changed, or why the move was refused, and the answer goes back.

Every row folds: press its name. Folded, it keeps one line (the status, the first line of the
objective, the priority and holder, a count). A fold stays as you left it from one item to the
next until the page reloads.

Under the comments is a box: type, press **Comment**, and the comment goes on the item (the
comment route, as `item comment`). The store sends it to each Agent holding the item, straight
to its dialog box, and the line under the box names who it reached. An item only a Team holds
(after a hand-in, say) has no Agent to send it to; the line says so, and the comment waits on
the item.

## The item tool

```text
item create --title "…" [--kind Task] [--parent w3] [--objective "…"] [--priority High] [--team surface]
item read w12                       # fields, children, comments, attachments, links, history
item search [--campaign home_machine] [--team surface] [--holder builder | none] [--parent w3 | --no-parent] [--status "In Progress"] [--kind Bug]
item edit w12 --objective "…" --priority High
item transition w12 "In Review"
item flag w12 "waiting on the API"  # item unflag w12 when clear
item assign w12 builder             # adds builder; or team:surface
item handoff w12 builder            # the giver comes off; or team:surface, or none; --from team:surface names the giver
item watch w3                       # track it and everything under it; or name builder, team:surface; item unwatch w3 stops
item comment w12 "…"                # --edit <n> changes one
item attach w12 docs/plan.md        # or a link; --remove <path> takes it off
item link w12 Blocks w14            # or Relates, Duplicate, Cloners; --remove takes it off
item delete w12                     # with its subtasks
```

Every write answers with one line of what it did, then the item as it now is.

## An Agent's day

**It is given an item.** Ronin tells it. `work-record read` lists what it holds.

```text
item read w12
item transition w12 "In Progress"
```

**Side work that belongs to the item is a subtask.** Only a step someone else may take, or
work the item turned out to need; never a subtask per step.

```text
item create --parent w12 --title "Migrate the old field"
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
item create --kind Bug --parent w10 --title "Search drops the last result"
```

**Stuck: flag it.** With the reason. The flag comes off when the work moves again.

```text
item flag w12 "Waiting on the API shape from the backend Agent"
item unflag w12 "Shape agreed; see the comment above"
```

**Held up by another item: link it.** The link reads from the item that does the blocking.

```text
item link w15 Blocks w12
```

**Keep the objective true.** If the job changes, `item edit w12 --objective "<new>"`.

**Finished.** A hand-in with the item named; it moves the item to In Review and gives it to
the Team. Under project management a hand-in without `--item` is refused.

```text
worktree-desk hand-in ronin_cowork --item w12
```

## Holding and assigning

An item can be held by several Agents and Teams, or by nobody. A new item lands on whoever
made it: a lead's on its Team (a lead of several Teams names one, `--team surface`, or the
create is refused naming its Teams), any other Agent's on itself. A new item needs an epic
above it, `--parent` naming the epic or an item under one; an Epic needs none. Items from
Jira come as Jira has them.

```text
item assign w12 builder         an Agent holds it
item assign w12 team:surface    the Team holds it
item handoff w12 builder        the giver comes off and builder goes on
item handoff w12 none           the giver lets go
item handoff w12 builder --from team:surface   builder takes the Team's item off the Team
```

Assigning adds a holder and removes nobody. When an Agent ends, what it held goes to nobody,
sitting on its epic for the lead, and nobody is told; other holders stay. `item search` still
finds it.

A lead uses assign to give out work: an item for each member, or the Team for work not yet
given to anyone. Before handing over an item, the lead makes sure it says what is wanted:
a clear title and objective, a parent where one fits.

To find work, search: `item search --campaign <id>`, `--holder <name>` (`none`: the unheld list, held by nobody, watched by nobody and not Done), `--team <t>`, `--parent <id>`,
`--no-parent`, `--status <s>`, `--kind <k>`.

## Watching

An Agent can track an item without holding it: `item watch w3`, or for someone else,
`item watch w3 builder`, `item watch w3 team:surface`. Anyone can watch anything, and an
item can have any number of watchers. Watching changes no holders; a Team's watches sit on
its roster beside its holds. `work-record read` lists what you watch, and `item unwatch w3`
stops.

A watcher is told of a status change on the item it watches, nothing else.

## A Team's lists

A Team hears through its lead, whoever is lead now, so a new lead hears with no step. Its
roster holds what the Team holds and what it watches; its members' holds and watches are read
from their own records. The lead's `work-record read` shows all four.

## Notices

Five, and none twice; [Project management](project-management.md#who-is-told-what) has the
table. Each person gets one notice per change, and a command on several items sends one notice
listing them. An Agent's own changes tell nobody, and neither does an item taking its Jira key.

The Agent reads the item, then answers with an edit or a comment. A comment is how it
replies to a person, from Ronin or from Jira.

## Don'ts

- Don't do work without an item. If there is none, create one under its epic; it is yours.
- Don't move an item to Done. Done is the accepting person's.
- Don't keep work only in your head or in your chat. If it matters, it is on the item:
  a comment, an attachment, a subtask or a status.
- Don't leave an item in a status the work has left. Move it when the work moves.
- Don't delete to tidy. `item delete <id>` removes the item and its subtasks for everyone.

## Read more

- [Work records](what-agents-write-down.md): what an Agent writes down, and why
- [Work records and work items](work-record.md): the stored shape, field by field
