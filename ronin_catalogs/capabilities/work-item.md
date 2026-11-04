# Work Item
- **label:** Work Item
- **blurb:** Run your work as work items: create, find, move, hand off, watch.
- **class:** cowork
- **requires:** behaviour:project-management
- **order:** 25

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `item create` | create: one work item under an epic, held by you (a lead's: by its Team); answers `created <id> under <parent>` | priority | `item --help` |
| `item read` | read: one item with its children, comments, attachments, links and history | priority | `item --help` |
| `item search` | read: items by Campaign, Team, holder, parent, status, kind, or `--text` in the title or objective | priority | `item --help` |
| `item edit` | write: one item's fields; `--parent` moves it, the level following | priority | `item --help` |
| `item transition` | write: the status of one or several items | priority | `item --help` |
| `item flag` | write: one or several items are stuck, with the reason as a comment | priority | `item --help` |
| `item unflag` | write: one or several items are clear | priority | `item --help` |
| `item assign` | write: add an Agent or Team as a holder of one or several items, removing nobody | priority | `item --help` |
| `item handoff` | write: the giver (you, or `--from` an Agent or `team:<name>`) comes off one or several items and the receiver goes on; `none` puts them back on their epic | priority | `item --help` |
| `item watch` | write: track one or several items without holding them; `item unwatch` stops | priority | `item --help` |
| `item comment` | write: one comment, or `--edit <n>` changes one | priority | `item --help` |
| `item attach` | write: attach or remove a document, visible in Docs | priority | `item --help` |
| `item link` | write: a link by type name (Blocks, Relates, …) | priority | `item --help` |
| `item delete` | write: one or several items go, with their subtasks, in Ronin and in Jira; one that came from Jira only with `--in-jira` | priority | `item --help` |

## Syntax

- An id is `w12` or a Jira key (`KAN-65`); every id an item has had still finds it.
- Where a tool takes several ids, list them: `item transition w12 w13 "In Progress"`,
  `item handoff w12 w13 none`.
- Status, kind, priority and link type are the space's names exactly (`item --help` lists
  them); anything else is refused, naming the set.
- Flag as `item flag <id> "Waiting on <who>: <what>"`.

More: `ronin-help work-items`
