# Project management, the Ronin way

Ronin keeps project management light. Docs hold the thinking, epics hold the work under way,
and a work item exists only while someone is doing it. You see the work without asking, and
you are told only when you have something to do.

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
| Stuck | the Agent | flagged "Waiting on <who>: <what>"; it shows under Stuck on Waiting on you |
| Handed in | the Agent | In Review, held by the Team; it shows under Ready to accept |
| Accepted or sent back | you | Accept makes it Done. Send back returns it to its Agent with your comment |
| Put back | the Agent | work it won't finish goes back on the epic, held by nobody, for the lead |
| Done | you | held by nobody, off every list. Only the person accepting sets Done |

An item nobody wants any more is deleted, not left in To Do. An epic is Done when what done
looks like is met, and its plan doc says so.

**Kinds.** Epic; then Task, Story, Bug or Feature (the work); then Subtask (a step of one of
those). A Subtask never goes straight under an epic.

## Who is told what

Very few notices, and never the same news twice:

| You are told of | If you are |
|---|---|
| a hand-in | the lead of the Team holding the work (one message, from the hand-in itself) |
| a call for help (a flag) | the lead or epic holder above the item |
| a status change | watching that item |
| someone else's change on your item | the Agent doing it |
| a Jira item with nobody on it | traffic_control, which places it |

Nothing else sends a notice. Starts, new items, holder changes and Agents ending show on the
tile, the work record and the Team workbench's **Waiting on you** and **Epics**. Agents tell
their lead only a decision or a blocker.

## Jira

Jira is another view of the same items, through the bridge (Settings › Jira). A Jira user
decides what the work is; Ronin decides who does it. Agents use the `item` tool only and
never touch Jira. An item keeps its Ronin id and its Jira key, and either finds it. Ronin
refuses any parent or kind Jira would refuse, so the two never drift apart. Deleting an item
made in Ronin deletes it in Jira too; one that came from Jira needs `--in-jira`, when the
person who asked for it says so.

## More

- Agents: the work-item brief, and `item --help`.
- [Work items](work-items.md): the fields and commands. [Jira](jira.md): connecting a space.
