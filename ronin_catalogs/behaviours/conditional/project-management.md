# Project management

- **label:** Project management (beta)
- **blurb:** Run your work as work items, kept true as you go.
- **installation:** task_manager
- **order:** 20
- **scope:** conditional
- **requires:** project_management

Anyone reading your work items should know where your work is without asking you, so keep
them true as you go, never only at the end. `item --help` has the exact syntax.

### The structure

| Level | What it is |
|---|---|
| 1 | **epic**: holds a body of work |
| 0 | **story, task, bug, feature**: the work itself; the kind is only a label |
| -1 | **subtask**: one step inside a level-0 item |

The parent sets the level: a new item starts one level below its parent, or at 0 with none,
and `item edit <id> --parent <other>` moves it with its children. No parent is normal.
The one rule: nothing goes below -1. A move that would push an item there fails.

### Status

Status and kind are Jira's own names, exactly. Unconnected, the statuses are Jira's defaults;
a Desk paired to a Jira space uses that space's.

| Status | Means | Moved by |
|---|---|---|
| To Do | Not started; new items start here. | you |
| In Progress | Being done now. | you |
| In Review | Handed in, ready to look at. | `worktree-desk hand-in <repo> --item <id>` |
| Done | Accepted. | the promotion carrying that hand-in; for an item paired to Jira, only the Jira user |

You move yours with `item transition <id> "<status>"`, any to any, by name. A hand-in naming
no item moves no status.

### The day's moves

- **Start:** `work-record read` lists what you hold; `item read w12`, `item transition w12 "In Progress"`.
- **Break big work down:** one subtask per step, `item create --parent w12 --title "…"`.
- **Comment** findings, decisions and answers: `item comment w12 "…"`.
- **Attach** what you wrote for it: `item attach w12 <path>`. People reach what you attach.
- **File side work** as its own item (`item create --kind Bug …`), never inside the one you hold.
- **Flag** when stuck: `item flag w12 "<why>"`; `item unflag` when moving again.
- **Link** what holds you up, from the blocking item: `item link w15 blocks w12`.
- **Keep the objective true:** `item edit w12 --objective "…"` when the job changes.
- **Finish:** `worktree-desk hand-in <repo> --item w12`; it moves the item to In Review.

Several Agents or Teams can hold an item; `item assign` adds a holder and `item handoff`
gives the caller's hold to someone else (or `none`). An ending Agent lets go of its items.
A lead gives out work by assigning items that say what is wanted.

### Notices

When someone else changes an item you hold, or adds one under it, Ronin tells you; under a
Team's item, the lead is told. Read it, then answer with an edit or a comment; a comment is
how you reply to a person. Your own changes notify nobody: tell whoever needs to know.

### Don'ts

- Don't work without an item. If there is none, create one and assign it to yourself.
- Don't keep work only in your head or chat: put it on the item.
- Don't leave an item in a status the work has left.
- Don't delete to tidy: `item delete` removes the item and its subtasks for everyone.

More: `ronin-help work-items`
