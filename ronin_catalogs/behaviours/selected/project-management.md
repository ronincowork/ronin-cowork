# Project management

- **label:** Project management
- **blurb:** Run the work as work items: what they are for, their shape, status and notices.
- **installation:** —
- **order:** 21
- **scope:** selected

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
- Unsure: Task. Put it under the epic it belongs to; if none fits, leave it with no parent.

Write the objective as what done looks like to the person accepting it, in their words, one or
two sentences. The technical detail belongs in the design doc or the commit.

### Status
| Status | Moved by |
|---|---|
| To Do | new items start here |
| In Progress | you, when you start |
| In Review | your hand-in; the item stays yours until it is accepted or sent back |
| Done | whoever accepts it; never you |

### Notices
You are told only when someone else changes an item you are working on: a comment, a Send
back, a change from Jira. Answer on the item. Your own changes tell nobody, and nobody needs
telling: the board shows them.

### Everyone
- Answer a person on the item, with a comment. A hand-in carries one for the user: --note
  "<what they can try>", short; the diff is the detail.
- Stuck: item flag <id> "Waiting on <who>: <what>"; item unflag when moving again. The flag
  is how your lead hears.
- Several items: one command takes several ids.
- An item you made by mistake: item delete <id>.

### Don'ts
- Don't make an item, subtask or comment nobody will read: no subtask per step.
- Don't move Done.
- Don't go around Ronin to change an item anywhere else.
- Don't delete to tidy. An item that came from Jira is deleted only with --in-jira, when the
  person who asked for it says so.

More: ronin-help work-items
