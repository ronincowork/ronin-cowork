# Work Item
- **label:** Work Item
- **blurb:** Run your work as work items: create, find, move, hand off, watch.
- **class:** cowork
- **requires:** —
- **order:** 25

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `item create` | create: one work item under an epic, held by you (a lead's: by its Team) | priority | `item --help` |
| `item read` | read: one item with its children, comments, attachments, links and history | priority | `item --help` |
| `item search` | read: items by Campaign, Team, holder, parent, status or kind | priority | `item --help` |
| `item edit` | write: one item's fields; `--parent` moves it, the level following | priority | `item --help` |
| `item transition` | write: an item's status, any to any | priority | `item --help` |
| `item flag` | write: the item is stuck, with the reason as a comment | priority | `item --help` |
| `item unflag` | write: the item is clear | priority | `item --help` |
| `item assign` | write: add an Agent or Team as a holder, removing nobody | priority | `item --help` |
| `item handoff` | write: the giver (you, or `--from <agent>\|team:<name>`) comes off and the receiver goes on; `none` lets go | priority | `item --help` |
| `item watch` | write: track an item without holding it; `item unwatch` stops | priority | `item --help` |
| `item comment` | write: one comment, or `--edit <n>` changes one | priority | `item --help` |
| `item attach` | write: attach or remove a document, visible in Docs | priority | `item --help` |
| `item link` | write: a link by type name (Blocks, Relates, …) | priority | `item --help` |
| `item delete` | write: the item goes, with its subtasks | priority | `item --help` |

Your work lives on work items. Anyone reading your items should know where your work is
without asking you, so keep them true as you go, never only at the end.

### The structure

| Level | What it is |
|---|---|
| 1 | **Epic**: holds a body of work |
| 0 | **Task, Story, Bug, Feature**: the work itself |
| -1 | **Subtask**: one step inside a level-0 item |

The kind sets the level; a new item starts one level below its parent. An item can have no
epic; one you create needs an epic above it (an Epic needs none). `item edit <id> --parent <other>` moves an item with
its children. Nothing goes below -1.

### Status

| Status | Means | Moved by |
|---|---|---|
| To Do | Not started; new items start here. | you |
| In Progress | Being done now. | you |
| In Review | Handed in, ready to look at. | `worktree-desk hand-in <repo> --item <id>` |
| Done | Accepted. | the promotion carrying that hand-in |

Status, kind, priority and link type are fixed names (`item --help` lists them); anything
else is refused, naming the set.

### The day's moves

- **Start:** `work-record read` lists your items; `item transition w12 "In Progress"`.
- **Break big work down:** one subtask per step, `item create --parent w12 --title "…"`.
- **Comment** findings, decisions and answers: `item comment w12 "…"`.
- **Attach** what you wrote for it: `item attach w12 <path>`. People reach what you attach.
- **File side work** as its own item, never inside the one you hold.
- **Flag** when stuck: `item flag w12 "<why>"`; `item unflag` when moving again.
- **Link** what holds you up, from the blocking item: `item link w15 Blocks w12`.
- **Keep the objective true:** `item edit w12 --objective "…"` when the job changes.
- **Finish:** `worktree-desk hand-in <repo> --item w12` moves it to In Review; in a checkout, transition it.
- **Give it on:** `item handoff w12 <agent>`; `item assign` adds a holder beside you. Take your Team's item: `item handoff w12 <you> --from team:<name>`.

### Notices

When Ronin tells you an item changed, read it, then answer with an edit or a comment; a
comment is how you reply to a person. Your own changes notify nobody: tell whoever needs to
know.

### Don'ts

- Don't work without an item: create it under its epic before you start.
- Don't keep work only in your head or chat: put it on the item.
- Don't leave an item in a status the work has left.
- Don't delete to tidy: `item delete` removes the item and its subtasks for everyone.

More: `ronin-help work-items`
