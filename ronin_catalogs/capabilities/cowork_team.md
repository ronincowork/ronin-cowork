# Cowork Team
- **label:** Cowork Team
- **blurb:** How do I create or inspect a Team, keep its record truthful, and read what it holds?
- **class:** cowork
- **requires:** —
- **order:** 60

Reach for the Team tools when the question concerns a Team's existence or shared state:
create or inspect its canonical roster, or read what the Team and its members hold. A work
item is stored once by id; the Team roster holds a list of item ids, and so does every
Agent's work record. Every act on an item is the `item` tool's (`item handoff <id>
team:<name>` gives one to a Team).

**New Team** means create the canonical Team record with `team roster write`.

**Live tools:** the shipped `team` dispatcher owns Team records and reads the Team's work
items through `/api/work-items`. Universal `session_create` remains the visible Agent-creation
path; this capability does not own or duplicate it.

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `team roster read` | read: one canonical Team roster | priority | `team --help` |
| `team member status` | read: the Team's reading, as the Team Kanban draws it | priority | `team --help` |
| `team roster write` | write: typed Team roster fields | | `team --help` |
| `session_check` | read: one live session by exact name | | `session_check --help` |
| `session_set` | write: a member's Team membership, lead designation, or project root | | `session_set --help` |

Worktree assignment and Team broadcast remain in their own capability bundles; this tool does
not duplicate them. Read-only Team enumeration belongs to `edges team`.

## Team work

| Capability | Meaning |
|---|---|
| Team record read and update | the roster's objective and launch defaults; the Team page derives membership from sessions |
| Team work items | items the Team holds: `item handoff <id> team:<name>` gives one to the Team, `item handoff <id> <agent>` to a member, taking the Team off. Lead ideas are items the Team holds, not a separate file or pool |
| Member and item status | the Team's reading: what the Team and each member hold; the item itself is the Work Item capability's |
| Agent configuration | create visibly with universal `session_create`, then inspect and configure Team, lead, or Workspace Folder handle through universal `session_check` and `session_set` |
| Team broadcasts | the wipeboard for everything the whole Team must see; one-on-one goes directly to the session |

Holding is how work is found, never permission. When an Agent ends, what it held is
released, held by nobody, and found under its parent or with no parent. The work item
itself is the Work Item capability's.

Team membership and Team lead are session facts changed through `session_set`. Lead is an
explicit designation, never inferred from capability selection or from using this tool.
When a designated lead delegates visible work, universal `session_create` creates the
Agent and `item handoff <id> <agent>` moves an item to it.

Lead-specific working guidance is a conditional Behavior applied from the explicit
session designation. This capability remains the tool teaching for every Cowork Agent.
