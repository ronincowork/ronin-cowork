# Work Item
- **label:** Work Item
- **blurb:** How do I create, read, find, edit, transition, flag, assign, hand off, comment on, attach to, link or delete a work item?
- **class:** cowork
- **requires:** —
- **order:** 25

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `item create` | create: one work item, held by nobody until assigned | priority | `item --help` |
| `item read` | read: one item with its children, comments, attachments, links and history | priority | `item --help` |
| `item search` | read: items by Campaign, Team, holder, parent, status or kind | priority | `item --help` |
| `item edit` | write: one item's fields; `--parent` moves it, the level following | priority | `item --help` |
| `item transition` | write: an item's status, any to any | priority | `item --help` |
| `item flag` | write: the item is stuck, with the reason as a comment | priority | `item --help` |
| `item unflag` | write: the item is clear | priority | `item --help` |
| `item assign` | write: add an Agent or Team as a holder, removing nobody | priority | `item --help` |
| `item handoff` | write: the giver comes off and the receiver goes on; `none` lets go | priority | `item --help` |
| `item comment` | write: one comment, or `--edit <n>` changes one | priority | `item --help` |
| `item attach` | write: attach or remove a document, visible in Docs | priority | `item --help` |
| `item link` | write: a link by Jira's type name (Blocks, Relates, …) | priority | `item --help` |
| `item delete` | write: the item goes, with its subtasks | priority | `item --help` |

Your work lives on work items, as in Jira.

**Kinds.** An **Epic** holds a body of work. A **Task, Story, Bug or Feature** is the
work itself; it is what you will create most. A **Subtask** is a step inside one of
those. The kind names are the space's own, and the kind sets the level.

| To | Command |
|---|---|
| see what you hold | `work-record read` |
| read an item | `item read <id>` |
| create one | `item create --title <t> --kind Task\|Bug\|Story`. Add `--parent <id>` when you know where it belongs: under an epic it is work, under a task it is a subtask. With no parent it is work with no epic yet. |
| edit it | `item edit <id> --objective <o> --priority <p> --parent <id>` |
| flag it | `item flag <id> "<why>"` when stuck; `item unflag <id>` when clear |
| transition it | `item transition <id> "In Progress"`: moves it to a status, by its Jira name |
| comment on it | `item comment <id> <text>`: how you answer a person, from Jira or Ronin |
| assign it | `item assign <id> <agent>` |
| hand it over | `item handoff <id> <agent>`; use `none` to let go |
| attach a document | `item attach <id> <path>`: the owner reaches only the documents you attach |
| link it | `item link <id> Blocks <id>`: it holds up another item |
| find items | `item search --campaign <id>`, `--team <t>` and other filters |

Status, kind, priority and link type are the space's names exactly (unconnected, Jira's:
To Do, In Progress, In Review, Done; Epic, Task, Story, Bug, Feature, Subtask; Highest to
Lowest; Blocks, Relates, Duplicate, Cloners); anything else is refused, naming the set. Any
transition is allowed. Stuck is `item flag`. When someone else changes an item you hold,
Ronin tells you: read it, then edit or comment. Epics are made by leads (`--kind Epic`).
Everything else:
`item --help`.

More: `ronin-help work-items`
