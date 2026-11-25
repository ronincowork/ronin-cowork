# Running work items

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
| **Plan** | what the work is, and how it gets done: which epics, which Teams | a plan: written once, kept on the Workspace |
| **Epic** | one part of the plan, with what done looks like, given to one Team | an epic, held by that Team |
| **Item** | one piece of work an Agent will hand in | an item under the epic, held by the Agent doing it |

- A small project is one plan, one epic and one Team. A large one has several epics,
  roughly a Team each, and may have an **epic_lead** on Steerco to keep the Teams on what
  done looks like.
- Nothing sits above an epic, and epics don't nest. Where one depends on another, link them.
- What isn't started stays a paragraph in the plan. A board holds only what is being worked.

**Kinds.** Epic (level 1); Task, Story, Bug or Feature (level 0, the work); Subtask (level -1,
a step of a level-0 item). Ronin sets the kind from the parent: under an epic, a Task (or the
Story, Bug or Feature you name); under one of those, a Subtask. Nothing goes under a Subtask:
Ronin refuses it and names the Task. Every shape this makes is one Jira accepts.

## What you ask for

When you bring work to a lead, it decides first which of three it is:

- **A new effort:** a planner (usually that lead) writes the plan with you, and the epics are
  made from it. See [Writing a plan](planning.md).
- **A change to the current effort:** it changes the epic: its what done looks like.
- **Progress on what's under way** (most asks): nothing new is made. The answer goes on the
  items already there, as a comment, a status or your Accept.

## How an item lives

| Step | Who | What happens |
|---|---|---|
| Made | the lead as it gives out work, or the Agent as it takes it | under the epic; its objective is what done looks like to you, in your words, one or two sentences |
| Started | the Agent | In Progress |
| Waiting | the Agent | stopped for a question, a choice, a discussion or a block: `item flag <id> "<who>: <what you need>"`, `item unflag <id>` when moving again: a reason is asked for and becomes the comment **Flagged:** <reason>; without one the flag still goes on, and the reply asks for it as that comment. The Agent's pill (the Team's selector, People) shows ⚑ in amber while it holds a flagged item; Epics, filtered by Flagged, lists every flagged item |
| Handed in | the Agent | In Review, still held by the Agent, with one short **Handed in** comment for you: what you can try. It shows under With the lead. Handing in code is the repo's and needs no item: `worktree-desk hand-in <repo>` alone puts the code in, and its reply tells the Agent to check its items; `--item` hands in both at once. Handing in code doesn't hand in the item, and a hand-in never makes an item Done |
| On dev | the lead's promotion | still In Review; it moves to Ready to accept |
| Accepted or sent back | you | Accept makes it Done, and the Agent holding it is told and ends. Send back makes it In Progress with your comment, held where it is; the Agent holding it is told |
| Handed over | the Agent, as it ends | to the Team (or a named Agent) with a **Handover** comment: where it stands, what is next. Its status stays |
| Done | as a rule, whoever asked for it: the Agent for an item it made itself, the lead for its own when it promotes, you for yours and Jira's | off the open lists at once, counted until it is archived ("Done, not yet archived: N (ids)" on the work record); the lead need not wait: `item archive --done` clears the deck |
| Archived | Ronin, five days after Done; or anyone at once, `item archive <ids>` or `item archive --done [--team <t>]` (a Done item only) | off every list, the Epics workbench and `item search` (`--archived` finds it); `item read` and its documents still open. Jira's issue is untouched. Leaving Done brings it back |

**An Agent's end hands over, never drops.** By status:

| The item is | At the Agent's end | Decided by |
|---|---|---|
| Done | nothing: it stays where it is until it is archived, five days after Done | — |
| To Do | back to the Team, for its lead to give out again | automatic |
| In Progress | finished if it can be; if not, flagged with where it stands and what is missing, or handed over | the Agent; then the lead |
| In Review | the Agent stays until it is Done if it can, so a sent-back item still has its Agent; if it can't, it flags it and goes | the lead or you, accepting or sending it back |

One check is made on every way out: `session_end`, `session_archive`, and Archive, Delete and
Hard Delete on the tile. It is a nudge, never a wall. While the Agent holds anything In Progress
or In Review it has not flagged, the first try is refused, each item named, as the worktree
check names its desks, with NEXT in order: 1. finish the item if you can (In Review is finished
when the lead or you make it Done); 2. if you can't, flag it: `item flag <id> "<where it stands;
what is missing>"`; 3. clean your desks: commit and hand in; 4. then go. An item the Agent
flagged itself needs nothing more: the flag is the acknowledgement. For one left unflagged,
`session_end --ignore-items` (or `session_archive <name> --ignore-items`), or "close anyway" in
the tile's confirm, goes anyway. Either way, as after a crash, each unfinished item goes to the
Team flagged, its comment "Flagged: Ended without handover: <agent>, <status>", and the lead is
told once. Nothing goes to nobody. An item nobody wants any more is deleted, not left in To Do. An epic is Done
when what done looks like is met.

In an item's view on the tile, the objective and the Handed in note come
first; the other comments (the Agent and lead deciding things, the item's record) fold under them.

## Three signals

| Signal | Made by | Means | Who is told |
|---|---|---|---|
| **Hand-in** | the Agent: `worktree-desk hand-in <repo> [--item <id> --note "<what you can try>"]` | my work is done; review it | the lead |
| **Promotion** | the lead: `bin/ronin-promote <team>` | it is on dev; you can try it | nobody: it shows under Ready to accept |
| **Flag** | anyone: `item flag <id> "<why>"`, a reason asked for; `item handover --flag`; the item's Flagged switch, which asks for it | I have stopped and wait on someone: a question, a choice, a discussion or a block; the reason is the **Flagged:** comment | the lead or epic holder above it |

A code hand-in is the repo's: `worktree-desk hand-in <repo>` never needs an item. With none
named, the code goes to the Team line, the lead is told, and the reply tells the Agent to check
its work items, one of which may now be ready to hand in for review. An item handed in carries
its review line: one short line telling you what to look at, with no commit ids or receipts
(those stay on the item's trail; the diff is the detail). Opened, the item shows it as **Look
at**, straight after the Objective. Moved to In Review without one, or with a long one, the move still goes and whoever moved
it is prompted to write it. A hand-in moves a named item to In Review and no further;
a promotion never changes a status; the lead makes its own items Done as it promotes, and you yours. You accept only what is on dev (or what was
handed in from a checkout, with no code to promote).

## Who is told what

Very few notices, and never the same news twice:

| You are told of | If you are |
|---|---|
| a hand-in | the lead of the Team holding the work (one message, from the hand-in itself) |
| a call for help (a flag), or an Agent ended without a handover | the lead of the Team holding the item, and the lead or epic holder above it; for an ending, the lead of the Team its items went to, once |
| a status change | the Agent holding the item, and the lead of the Team holding or watching it |
| a comment | holding or watching the item |
| someone else's change on your item: handed to you ("<id> '<title>' is yours, from <giver>. Read it and follow its objective."), a status move, an edit, a Send back | the Agent holding it |
| a Jira item with nobody on it (it comes in on the Team holding its parent, if any) | traffic_control, which places it |
| your item is Done, with what you still hold or, holding nothing open, "End now with session_end: it archives you; your lead can restore you within 7 days." | the Agent holding it |

A Team is told through its lead. Where a Team holds or watches an item, its notices go to the
Team's lead(s); with no lead running, to no one. On an item an Agent works, the lead is not
told of its changes: only when the Agent asks for help or hands in.

Nothing else sends a notice, and nobody hears their own change. A Team's starts, new items, holder changes and handovers show
where the work shows (below). Agents move their items without waiting for a go, flag when they wait on someone, and tell their lead only a decision.

## Where the work shows

**In Jira**, primarily. A connected Campaign is one Jira space, and its board is Jira's own:
**Kanban** (To Do, In Progress, In Review, Done as columns) or **Scrum**, with sprints. Either
works. Sprints are the Jira user's: Ronin reads an item's Sprint but never creates, starts or
fills one, so an item Ronin makes lands in the backlog, as a person's does. Each Agent holding
an item has a link on the Jira item that opens its chat.

**In Ronin:**

- **Epics workbench** (Campaign home › Epics, "What the work is"): a phalanx of stones, one
  per open Epic in the Campaign (no Done Epics, no Icebox), narrowed by its **Workspace**
  question, all one height, each its title and Jira key, ⚑ top right when anything in it is
  flagged, how many of its items are open (small, bottom right), its
  progress a colour line along its bottom edge. Press the line for the Epic's **epic-stage**
  and its four counts; press the stone to see that Epic beside the stones; a stone dragged into
  a tilespace places that Epic there.
- **One Epic** (the pressed stone): the same Epics board a Team's Epics view shows, without the
  row of Epic stones: **Launch** when someone holds it, the Epic's own bar (press it for its
  reading; assign it and move its Status, Done included, there), the Assigned, Flagged and
  Status questions, then its items grouped by status. Press an item to read it in its place;
  the board stays. **Launch** opens the Team working the Epic in a new tab: the Agent holding
  it in tilespace 1 (the lead when the Team holds it), the Epic in tilespace 2.
- **New Epic** (the selector's pill): a new work item, Epic to start. **Kind** first, its
  **Priority** on the same row; **Parent** (not for an Epic) with **Epics only** beside it: on, the
  open Epics (inside a Team, its Epics); off, the open items under them, which makes it a Subtask; its short and long title (saved as `short: long`) and its
  **Objective**; **Who does the work**: Team, Lead or Agent (answer one and the others go; or
  nobody yet).
  **Create** (or Ctrl/Cmd+Enter) makes it; an Epic shows in the same tilespace.
- **epic-stage** is read from the Epic's Tasks, Stories, Bugs and Features (not its own
  Status): each scores To Do 1, In Progress 2, In Review 3, Done 4, and their average is the
  epic-stage: Empty (no items), Starter (under 1.5), Working (under 2.5), Maturing (under
  3.25), Aging (3.25 and over: the work is in, mark the Epic Done). An Epic whose Status is Done
  is Done. A Workspace's Icebox has none.
- **Team workbench › Epics:** the same Epics board over the Team's epics, switching on the
  one card; with a single epic, that one is shown.
- **The item island:** on every Agent's tile, a pill for each open item it holds (Done is not
  on it, and Subtasks fold under their Task): the kind's Jira symbol, a status dot, ⚑ when
  flagged, and "handed in" or "on dev" with how long ago. Press a pill to read the item: its
  Status, objective, details (id, kind and level, where it started, who holds it), comments
  and attachments. A lead's island also shows its Teams' epics and the Tasks no member has
  taken yet. See [the tile](tile.md#the-item-island).
- **Docs › Plans:** the Workspaces' plans, by status.
- **The work record** (tile › ☰ Work record): what the Agent holds and watches.

## Jira

Jira is another view of the same items, through the bridge (Settings › Jira). A Jira user
decides what the work is; Ronin decides who does it. The bridge is the only Jira writer:
Agents use the `item` tool and never touch Jira. An item keeps its Ronin id and its Jira key,
and either finds it. Deleting an item made in Ronin deletes it in Jira too. Deleting one that
came from Jira removes it from Ronin only: the Jira issue stays, and the bridge never brings it
back. Done set in Jira comes back
with the next read.

## Turning it on

Project management is a selected behaviour, **Project management**, on per Campaign (in the
Campaign's defaults), and a Team can turn it off (`team-roster-write <team> --deselect
project-management`). Off, Agents get no item tools and no item briefs.

## More

- Agents: the project-management briefs, and `item --help`.
- [Writing a plan](planning.md): the plan, the `plan` tool and the template.
- [Work items](work-items.md): the fields and commands. [Jira](jira.md): connecting a space.
- Developers: [Project management: contents](../architecture/project-management.md).
