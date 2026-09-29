# Cowork Team
- **label:** Cowork Team
- **blurb:** How do I create or inspect a Team, keep its record and work items truthful, and move who holds them?
- **class:** cowork
- **requires:** —
- **order:** 60

Reach for the Team tools when the question concerns a Team's existence or shared state:
create or inspect its canonical roster, read what the Team and its members hold, keep those
work items truthful, or move who holds one. A project is a work item, stored once by id;
the Team roster holds a list of item ids, and so does every Agent's work record.

**New Team** means create the canonical Team record with `team roster write`.

**Live tools:** the shipped `team` dispatcher owns Team records and reaches work items
through `/api/work-items`. Universal `session_create` remains the visible Agent-creation
path; this capability does not own or duplicate it.

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `team roster read` | read: one canonical Team roster | priority | `team --help` |
| `team project create` | create: one work item held by the Team | priority | `team --help` |
| `team project read` | read: one work item and who holds it | priority | `team --help` |
| `team project list` | read: the Team's reading | priority | `team --help` |
| `team project write` | write: one work item's typed fields, one trail line | priority | `team --help` |
| `team project assign` | write: move an item's id to one Agent | priority | `team --help` |
| `team project return` | write: move an item's id back to the Team | priority | `team --help` |
| `team project backlog` | write: park an item, held by nobody | priority | `team --help` |
| `team project done` | write: move an item to stage DONE | priority | `team --help` |
| `team project restore` | write: back from DONE to the stage it left, held by the Team | priority | `team --help` |
| `team member status` | read: the Team's reading, as the Team Kanban draws it | priority | `team --help` |
| `team project parent` | write: set or clear an item's one parent | | `team --help` |
| `team roster write` | write: typed Team roster fields | | `team --help` |
| `session_check` | read: one live session by exact name | | `session_check --help` |
| `session_set` | write: a member's Team membership, lead designation, or project root | | `session_set --help` |

Worktree assignment and Team broadcast remain in their own capability bundles; this tool does
not duplicate them. Read-only Team enumeration belongs to `edges team`.

## Team work

| Capability | Meaning |
|---|---|
| Team record read and update | the roster's objective and launch defaults; the Team page derives membership from sessions |
| Work item create, read, write | items the Team holds before they are assigned; lead ideas are items the Team holds, not a separate file or pool |
| Assign and return | who holds an item: assign moves its id to one Agent, return moves it back to the Team. An item is one object and is never copied |
| Parent and child | every item is born under a parent, the common board unless one is named; an item with children is a board, a leaf is a project with the ladder, and a leaf's ladder folds into its first child. Nesting under a board someone holds sends that holder one message; a reparent that would form a cycle is refused with the chain named |
| Member and item status | the Team's reading: what the Team and each member hold, with each item's `stage`, `exit` (none · agent · lead · user) and `status` (green · yellow · red) |
| Agent configuration | create visibly with universal `session_create`, then inspect and configure Team, lead, or Workspace Folder handle through universal `session_check` and `session_set` |
| Team broadcasts | the wipeboard for everything the whole Team must see; one-on-one goes directly to the session |

Every change is made by a tool and appends one line to the item's trail naming who called;
holding is how work is found, never permission, so no tool refuses a caller for not holding
an item. Every acknowledgement answers with the item as it now is and ends with the item and
the write that keeps it current. A hand-in naming an item moves it to LAND; a promotion
moves the items on its hand-ins to DONE. When an Agent ends, what it held is released and
found under its parent; on the common board, held by nobody, is unassigned.

Team membership and Team lead are session facts changed through `session_set`. Lead is an
explicit designation, never inferred from capability selection or from using this tool.
When a designated lead delegates visible work, universal `session_create` creates the
Agent and `team project assign` moves an item to it.

Lead-specific working guidance is a conditional Behavior applied from the explicit
session designation. This capability remains the tool teaching for every Cowork Agent.
