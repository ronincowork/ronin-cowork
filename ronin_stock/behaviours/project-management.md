# Project management
- **seed:** Run the work as work items: what they are for, their shape, status and notices.
- **when:** pm, !irasshai
- **depth:** full
- **order:** 21

Work items let the people you work for see your work without asking you. They are for five
things, and only these: where the work is, what is handed in, what waits on someone, what the
next Agent picks up, and a clean end. Write nothing on an item that serves none of them.

An item is changed only through the item commands. Whatever Ronin is connected to follows on
its own; an Agent never reaches a connected system, its API or its credentials. If something
outside Ronin looks different from the item, tell your lead and stop.

### The structure
| Level | What it is |
|---|---|
| 1 | Epic: one part of a plan, with what done looks like, held by a Team |
| 0 | Task, Story, Bug, Feature: one piece of work an Agent hands in |
| -1 | Subtask: a step of a level-0 item that someone else may take, or side work that belongs to it |

A Subtask goes only under a level-0 item, and a level-0 item only under an epic or nothing.
Ronin refuses any other shape and says why. Every id an item has had still finds it.

### Which kind
- **Epic:** a goal bigger than one hand-in, with what done looks like; several items go under it. You don't work on an epic itself: make an item under it for each piece, and hand in on the item.
- **Story:** something a person will see or use when it's done.
- **Feature:** a new thing the product can do. Story or Feature: either is fine.
- **Task:** work that needs doing that nobody sees directly: setup, research, docs, a check.
- **Bug:** something that should work and doesn't.
- **Subtask:** a step of one of those that someone else may take.
- Unsure: Task. Give a new item the epic it obviously belongs to (`--parent <epic>`); if none fits, no parent is fine.

Write the objective as what done looks like to the person accepting it, in their words, one or
two sentences, with no code names. The technical detail goes in the item's first comment,
starting "Brief:". When creating an item, you can use `Short name: more detail`.
Choose a short name in the requester's words for stones and bars, then add whatever
wording helps someone reading the item. A plain title works too.

### Status
| Status | Moved by |
|---|---|
| To Do | new items start here |
| In Progress | you, when you start; never wait for a go |
| In Review | your hand-in; the item stays yours until it is accepted or sent back |
| Done | as a rule, whoever asked for it: you for an item you made yourself, your lead for its own when it promotes, the user for theirs or Jira's |

### Notices
You are told whenever someone else changes an item you hold: it is handed to you, its status
moves, it is edited, commented on or sent back. Read the item and act on it; answer on the
item. Your own changes tell nobody, and nobody needs telling: the board shows them.

### Everyone
- Answer a person on the item, with a comment. A hand-in carries one for the user: --note
  "<what they can try>", short; the diff is the detail.
- Stopped, waiting on someone for a question, a choice, a discussion or a block:
  item flag <id> "<who>: <what you need>"; a reason is asked for. item unflag <id> when
  moving again. The flag is how your lead or user hears you are waiting.
- Several items: one command takes several ids.
- An item you made by mistake: item delete <id>.

### Don'ts
- Don't make an item, subtask or comment nobody will read: no subtask per step.
- Don't go around Ronin to change an item anywhere else.
- Don't delete to tidy. An item you didn't make is deleted only when the person who asked for
  it says so.

More: ronin-help work-items
