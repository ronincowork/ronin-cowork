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
  history says "renamed from w101", and each holding Agent is told: "w101 is now KAN-65 (its Jira
  key); nothing to do."

- **Jira fields**: an item paired with Jira also shows Jira's Sprint, Due date, Rank,
  Reporter, Created, Resolved, Story point estimate, Labels, Components and Fix versions,
  by Jira's names, the ones Jira fills. They are Jira's: read only.

Every change adds a line to the item's history. `item read <id>` shows it all: fields,
children, comments, attachments, links and history.

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
to any status is allowed. Two moves are made for them: a hand-in that names the item
(`worktree-desk hand-in <repo> --item <id>`) moves it to In Review, and the promotion that
carries that hand-in moves it to Done, each only where the space has that status. An item paired to Jira is the exception: promotion
leaves it as it is, and it is Done only when the Jira user moves it to Done, which comes back
by polling. A hand-in that names no item moves no status.

## The item tool

```text
item create --title "…" [--kind Task] [--parent w3] [--objective "…"] [--priority High] [--team surface]
item read w12                       # fields, children, comments, attachments, links, history
item search [--campaign home_machine] [--team surface] [--holder builder | none] [--parent w3 | --no-parent] [--status "In Progress"] [--kind Bug]
item edit w12 --objective "…" --priority High
item transition w12 "In Review"
item flag w12 "waiting on the API"  # item unflag w12 when clear
item assign w12 builder             # adds builder; or team:surface
item handoff w12 builder            # the giver comes off; or team:surface, or none
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

**Finished.** A hand-in with the item named; it moves the item to In Review.

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
```

Assigning adds a holder and removes nobody. When an Agent ends, what it held goes back to
its Team, or to nobody when it has no Team or several; other holders stay. Its Done items go
to nobody, and nobody is told: Done work needs no holder, and `item search` still finds it.

A lead uses assign to give out work: an item for each member, or the Team for work not yet
given to anyone. Before handing over an item, the lead makes sure it says what is wanted:
a clear title and objective, a parent where one fits.

To find work, search: `item search --campaign <id>`, `--holder <name>` (`none`: the unheld list, held by nobody and not Done), `--team <t>`, `--parent <id>`,
`--no-parent`, `--status <s>`, `--kind <k>`.

## Watching

An Agent can track an item without holding it: `item watch w3`, or for someone else,
`item watch w3 builder`, `item watch w3 team:surface`. Anyone can watch anything, and an
item can have any number of watchers. Watching changes no holders; a Team's watches sit on
its roster beside its holds. `work-record read` lists what you watch, and `item unwatch w3`
stops.

A watcher hears the moves on the item and everything under it, its children and theirs:
a status change, a flag raised or cleared, a new child (created under or moved under), a
holder change (assign, handoff, let go, holder ended). Comments, edits, links and Jira
fields stay the holders'.

## A Team's four lists

A Team hears through its lead, whoever is lead now, so a new lead hears with no step.

- **What the Team holds** (its roster): the lead gets the holder messages.
- **What the Team watches** (its roster): the lead gets the watcher messages.
- **What its members hold:** the lead gets the watcher messages, never the holder ones.
- **What its members watch:** the lead hears nothing; they are shown only.

The lead's `work-record read` shows all four, read from the roster and the members' own
records when it reads.

## Notices

A change is told to two lists, with two messages. The one who made it is never told. Each
list reaches an Agent once; the two are never compared, so an Agent on both gets both.

- **Holders:** the Agents holding the item, and each Team holding it through its lead. They
  hear every change: "w5: status To Do → In Review by builder." or "w5: a comment from
  jira:glen." A new child under an item they hold: "w9 Fix login was added under w7, which
  you hold. Handle it as you see fit."; a lead hearing for its Team, "…which your team holds."
- **Watchers:** the Agents watching the item or anything above it, and through its lead each
  Team watching it or anything above it, or with a member holding it. Holding the item puts
  a Team on no watchers list. They hear only a status change, a flag, a new child and a holder
  change, named with what they watch: "w9 (under w3, which you watch): status To Do → In
  Review by builder." Watching the item itself, the "(under …)" part is dropped.

When the holders themselves change, each Agent whose list moved also hears "Your work record
changed; please read it."

The Agent reads the item, then answers with an edit or a comment. A comment is how it
replies to a person, from Ronin or from Jira. A change is never left unanswered.

An Agent's own changes notify nobody. If someone needs to know, it tells them.

## Don'ts

- Don't do work without an item. If there is none, create one under its epic; it is yours.
- Don't keep work only in your head or in your chat. If it matters, it is on the item:
  a comment, an attachment, a subtask or a status.
- Don't leave an item in a status the work has left. Move it when the work moves.
- Don't delete to tidy. `item delete <id>` removes the item and its subtasks for everyone.

## Read more

- [Work records](what-agents-write-down.md): what an Agent writes down, and why
- [Work records and work items](work-record.md): the stored shape, field by field
