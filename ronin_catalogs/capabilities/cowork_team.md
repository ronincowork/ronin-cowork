# Cowork Team
- **label:** Cowork Team
- **blurb:** How do I create or inspect a Team, keep its record and projects truthful, and move project custody?
- **class:** cowork
- **requires:** —
- **order:** 60

Reach for the Team tools when the question concerns a Team's existence or shared state:
create or inspect its canonical roster, inspect its members and projects, maintain the
projects it holds, or move project custody. Every Agent keeps its personal work record;
the Team roster holds Team facts and unassigned projects.

**New Team** means create the canonical Team record with `team roster write`.

**Live tools:** the shipped `team` dispatcher owns Team records and projects.
Universal `session_create` remains the visible Agent-creation path; this capability does
not own or duplicate it.

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `team roster read` | read: one canonical Team roster | priority | `team --help` |
| `team project create` | create: one roster-held project | priority | `team --help` |
| `team project read` | read: one roster-held project | priority | `team --help` |
| `team project list` | read: roster-held projects | priority | `team --help` |
| `team project write` | write: one roster-held project's typed fields | priority | `team --help` |
| `team project assign` | write: move a project whole to one Agent | priority | `team --help` |
| `team project return` | write: move a project whole back from one Agent | priority | `team --help` |
| `team project backlog` | write: move a Team-held Project to Backlog | priority | `team --help` |
| `team project done` | write: move a Team-held Project to Done | priority | `team --help` |
| `team project restore` | write: restore Backlog or Done to Inbox | priority | `team --help` |
| `team member status` | read: settled Team Kanban member/project shape | priority | `team --help` |
| `team roster write` | write: typed Team roster fields | | `team --help` |
| `session_check` | read: one live session by exact name | | `session_check --help` |
| `session_set` | write: a member's Team membership, lead designation, or project root | | `session_set --help` |

Worktree assignment and Team broadcast remain in their own capability bundles; this tool does
not duplicate them. Read-only Team enumeration belongs to `edges team`.

## Team work

| Capability | Meaning |
|---|---|
| Team record read and update | the roster's objective and launch defaults; the Team page derives membership from sessions |
| Team project create, read, write | projects the Team holds before they are assigned; lead ideas live in the Team roster, not in a separate file or pool |
| Assign and return | the two lead moves: assign a held project whole to one Agent; take one back from an Agent's record. A project is one canonical object and is never copied |
| Member and project status | each member's work record and each project's two flags — `exit` (none · agent · lead · user) and `status` (green · yellow · red) — as the Team Kanban projects them at read time |
| Agent configuration | create visibly with universal `session_create`, then inspect and configure Team, lead, or Workspace Folder handle through universal `session_check` and `session_set` |
| Team broadcasts | the wipeboard for everything the whole Team must see; one-on-one goes directly to the session |

The move is the approval: there is no verdict, decider, revision counter, or history on a
project. The roster has Inbox, Done, and Backlog. Assignment moves Inbox to an Agent;
restore moves Done or Backlog to Inbox. Backlog and Done move the same Team-held object
between roster areas without rewriting its authored state.

Team membership and Team lead are session facts changed through `session_set`. Lead is an
explicit designation, never inferred from capability selection or from using this tool.
When a designated lead delegates visible work, universal `session_create` creates the
Agent and `team project assign` moves a roster-held project to it.

Lead-specific working guidance is a conditional Behavior applied from the explicit
session designation. This capability remains the tool teaching for every Cowork Agent.
