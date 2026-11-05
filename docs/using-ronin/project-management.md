# Project management, the Ronin way

Ronin keeps project management light. Docs hold the thinking, epics hold the work under way,
and a work item exists only while someone is doing it. You see the work without asking, and
you are told only when you have something to do.

Items are for five things, and only these: **where the work is, what is handed in, what waits
on someone, what the next Agent picks up, and a clean end.**

Every file behind this page (briefs, tools, code, the Jira bridge) is listed in
[Project management: contents](../architecture/project-management.md).

## Plan, epic, item

| Layer | What it is | Lives as |
|---|---|---|
| **Plan** | what the work is, and how it gets done: which epics, which Teams | a document, never an item |
| **Epic** | one part of the plan, with what done looks like, given to one Team | an epic, held by that Team |
| **Item** | one piece of work an Agent will hand in | an item under the epic, held by the Agent doing it |

- A small project is one plan doc, one epic and one Team. A large one has several epics,
  roughly a Team each, and may have an **epic_lead** on Steerco to keep the Teams on what
  done looks like.
- Nothing sits above an epic, and epics don't nest. Where one depends on another, link them.
- What isn't started stays a paragraph in the plan. A board holds only what is being worked.

**Kinds.** Epic (level 1); Task, Story, Bug or Feature (level 0, the work); Subtask (level -1,
a step of a level-0 item). A Subtask never goes straight under an epic, and a level-0 item
never under another. Ronin refuses those shapes, as Jira does.

## What you ask for

When you bring work to a lead, it decides first which of three it is:

- **A new effort:** it writes a plan doc, then makes the epic when the work starts.
- **A change to the current effort:** it changes the plan doc first, then the epic.
- **Progress on what's under way** (most asks): nothing new is made. The answer goes on the
  items already there, as a comment, a status or your Accept.

## How an item lives

| Step | Who | What happens |
|---|---|---|
| Made | the lead as it gives out work, or the Agent as it takes it | under the epic; its objective is what done looks like |
| Started | the Agent | In Progress |
| Stuck | the Agent | flagged "Waiting on <who>: <what>"; it shows under Stuck |
| Handed in | the Agent | In Review, held by the Team; it shows under With the lead |
| On dev | the lead's promotion | still In Review; it moves to Ready to accept |
| Accepted or sent back | you | Accept makes it Done. Send back returns it, In Progress, to the Agent that handed it in, with your comment |
| Put back | the Agent | work it won't finish goes back on the epic, held by nobody, for the lead |
| Done | you | held by nobody, off every list. Only the person accepting sets Done |

An Agent can't `session_end` while it holds unfinished items; if it ends any other way, Ronin
puts them back on their epic. An item nobody wants any more is deleted, not left in To Do.
An epic is Done when what done looks like is met, and its plan doc says so.

## Three signals

| Signal | Made by | Means | Who is told |
|---|---|---|---|
| **Hand-in** | the Agent: `worktree-desk hand-in <repo> --item <id>` | my work is done; review it | the lead |
| **Promotion** | the lead: `bin/ronin-promote <team>` | it is on dev; you can try it | nobody: it shows under Ready to accept |
| **Flag** | anyone: `item flag` | I am stuck on someone | the lead or epic holder above it |

A hand-in must name its item. A promotion never changes a status. You accept only what is on
dev (or what was handed in from a checkout, with no code to promote).

## Who is told what

Very few notices, and never the same news twice:

| You are told of | If you are |
|---|---|
| a hand-in | the lead of the Team holding the work (one message, from the hand-in itself) |
| a call for help (a flag) | the lead or epic holder above the item |
| a status change | watching that item |
| someone else's change on your item | the Agent doing it |
| a Jira item with nobody on it | traffic_control, which places it |

Nothing else sends a notice. Starts, new items, holder changes and Agents ending show where
the work shows (below). Agents tell their lead only a decision or a blocker.

## Where the work shows

**In Jira**, primarily. A connected Campaign is one Jira space, and its board is Jira's own:
**Kanban** (To Do, In Progress, In Review, Done as columns) or **Scrum**, with sprints. Either
works. Sprints are the Jira user's: Ronin reads an item's Sprint but never creates, starts or
fills one, so an item Ronin makes lands in the backlog, as a person's does. Each Agent holding
an item has a link on the Jira item that opens its chat.

**In Ronin:**

- **Epics workbench** (Campaign home › Epics, "What the work is"): a stone per epic in the
  Campaign. Press one and its record opens: where it comes from (its Jira key, or Ronin only),
  who holds it, its statuses with counts, and its items as cards, each with its holder.
- **Team workbench › Waiting on you:** what waits on you, oldest first. **With the lead**
  (handed in, not yet on dev), **Ready to accept** (Accept, Send back) and **Stuck** (Reply).
- **Team workbench › Epics:** the Team's epics; one opens straight onto its record, several
  show as stones.
- **The item island:** on every Agent's tile, a pill for each item it holds: the kind's Jira
  symbol, a status dot, ⚑ when flagged, and "handed in" or "on dev" with how long ago. Press a
  pill to read the item. A lead's island also shows its Teams' epics. See
  [the tile](tile.md#the-item-island).
- **The work record** (tile › ☰ Work record): what the Agent holds and watches.

## Jira

Jira is another view of the same items, through the bridge (Settings › Jira). A Jira user
decides what the work is; Ronin decides who does it. The bridge is the only Jira writer:
Agents use the `item` tool and never touch Jira. An item keeps its Ronin id and its Jira key,
and either finds it. Deleting an item made in Ronin deletes it in Jira too; one that came from
Jira needs `--in-jira`, when the person who asked for it says so. Done set in Jira comes back
with the next read.

## Turning it on

Project management is a selected behaviour, **Project management**, on per Campaign (in the
Campaign's defaults), and a Team can turn it off (`team-roster-write <team> --deselect
project-management`). Off, Agents get no item tools and no item briefs.

## More

- Agents: the project-management briefs, and `item --help`.
- [Work items](work-items.md): the fields and commands. [Jira](jira.md): connecting a space.
- Developers: [Project management: contents](../architecture/project-management.md).
