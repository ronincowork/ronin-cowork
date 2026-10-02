# Work Record
- **label:** Work Record
- **blurb:** How do I keep my current work, documents, and the work items I hold truthful?
- **class:** cowork
- **requires:** —
- **order:** 20

Reach for this bundle when your task, position, documents, or a work item you hold changes:
it is the one record the owner reads on your tile and roster. Your ladder and your documents
live on the work item you are on; your record keeps your objective, repositories, the ids
you hold, and your focus.

**Show docs** means list the documents of the items you hold. **Update work record** means
record current progress, position, and next steps through the typed dispatcher.

**Live tool:** the shipped `work-record` dispatcher owns record fields and reaches work items
(ladder, documents, projects) through `/api/work-items`.

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `work-record update_record` | write: objective and repositories on the record; ladder and position on the focus item | priority | `work-record --help` |
| `work-record workspace list|add|remove` | read/write: repositories this Agent records as current work; accepts a handle or full URL and a separate branch | priority | `work-record workspace --help` |
| `work-record document add` | write: list one document on the focus item, visible in Docs | priority | `work-record --help` |
| `work-record project create` | create: one work item held by this Agent | priority | `work-record --help` |
| `work-record project read` | read: one work item and who holds it | priority | `work-record --help` |
| `work-record project write` | write: one work item's typed fields and evidence, one trail line | priority | `work-record --help` |
| `work-record project return` | write: give an item back to this Agent's Team | priority | `work-record project --help` |
| `work-record project backlog` | write: park an item, held by nobody | priority | `work-record project --help` |
| `work-record project done` | write: move an item to stage DONE | priority | `work-record project --help` |
| `work-record read` | read: the record, the items held, and the focus item's ladder | | `work-record --help` |
| `work-record document list` | read: documents of every item held | | `work-record --help` |
| `work-record document remove` | write: take a document off the focus item | | `work-record --help` |
| `work-record project list` | read: the items this Agent holds | | `work-record --help` |
| `team project list` | read: the Team's reading; the same dispatcher also exposes the Team's item operations | | `team --help` |

## Projects are work items

A work item is one object with a stable id (`w12`), stored once. Holding is a list of ids on
each Agent and Team; assigning moves the id and never the item, so nothing is ever copied.
Every change is made by a tool and appends one line to the item's trail naming who called.
Holding is how work is found, never permission: any Agent may change any item, and the trail
says who.

`project create` makes an item held by you; ids come from one global issuer and are never
chosen. Read the returned id, then use `work-record project read <id>` and the verbs shown
by `work-record project --help`. Every acknowledgement answers with the item as it now is and
ends with the item and the write that keeps it current; read it before your next act.

An item carries:

| Field | Values | Meaning |
|---|---|---|
| `stage` | `IDEA` · `PLAN` · `BUILD` · `REVIEW` · `LAND` · `DONE` | a mark on the item |
| `exit` | `none` · `agent` · `lead` · `user` | who the item is waiting on to move |
| `status` | `green` · `yellow` · `red` | how the held work is going |
| `parent` | an item id | the one item it sits under: the Unfiled board unless another was named |

Use the intent verbs when they say what happened more plainly than raw fields:
`working <id>` means yellow with the Agent acting next and makes it your focus;
`ready <id> --for lead|user` means green and names the next actor; `stuck <id>` means red
while the Agent retains the next move; `blocked <id> --on lead|user` means red and names who
must act; `advance <id> --to <stage>` changes only the stage. Evidence is a fact with its
receipt: `project write <id> --evidence "<fact>"`, alone or with other fields in one call.

An item with children is a board, read by its children; a leaf is a project and carries
the ladder, and every acknowledgement says which. When a leaf gains its first child its
ladder folds into that child. Nesting an item under a board someone holds sends that holder
one message; the Unfiled board is held by nobody and notifies nobody.

Two tools move stage from receipts: a hand-in naming the item moves it to LAND, and a
promotion moves the items on its hand-ins to DONE. `return` gives an item back to your Team,
`backlog` parks it, `done` moves it to DONE.

Your ladder is your focus item's: `update_record --phase|--leg|--gate|--done …` writes it,
and holding nothing, your first ladder or document write makes one item for you. Phases
and legs are never items. Handoffs are documents on an item; there is no separate handoff
command. Reporting an outcome is ordinary responsibility, not an operation.
