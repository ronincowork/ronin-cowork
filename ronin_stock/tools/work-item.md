# item
- **seed:** create, find, move, hand off and comment on work items; every command takes several ids, and create several titles. Each reply says what was done, with the id, or why not: read it, in a script too.
- **when:**
- **depth:** seed
- **serves:** project-management, irasshai
- **order:** 40

## Commands

| Tool | Authority |
|---|---|
| `item create` | create work items, held by you (a lead's by its Team): one per `--title`, the rest shared. You can write a title as `Short name: more detail`. Put it under any item: the kind follows the parent. Answers `created <id>, a <kind> under <parent>`, one line each. |
| `item read` | read: one or several items, each in plain lines: title, id, kind, status, holder, parent, the objective whole, its children one line each, its latest comments and trail lines, newest last; `--json` the whole item as JSON |
| `item search` | read: items by Campaign, Team, holder, parent, status, kind, or `--text` in the title or objective, one line each: `<id> \| <status> \| <holder> \| <title>`, the title in full; `--json` the JSON |
| `item edit` | write: the fields of one or several items; `--parent` moves them under any item, the kind following |
| `item transition` | write: the status of one or several items; a hand-in to In Review takes `--note`, the Handed in comment for the user |
| `item flag` | write: one or several items are stuck, with the reason as a comment |
| `item unflag` | write: one or several items are clear |
| `item handoff` | write: the giver comes off one or several items and the receiver (an Agent or `team:<name>`) goes on. The giver is you, with any Team of yours or of the receiver's that holds it; `--from` names it; `--keep-holding` keeps it on too |
| `item handover` | write: an ending Agent hands one or several items to its Team or an Agent, with where each stands and what is next (a Handover comment); `--to-do`, `--flag "<the question>"` |
| `item watch` | write: track one or several items without holding them; `item unwatch` stops |
| `item comment` | write: one comment on one or several items, or `--edit <n>` changes one |
| `item attach` | write: attach or remove a document on one or several items, visible in Docs |
| `item link` | write: a link by type name (Blocks, Relates, …), one item to another |
| `item archive` | write: one or several Done items off every list now, as five days Done does; `--done [--team <t>]` clears every Done item you or your Teams hold; an item not Done is refused |
| `item delete` | write: one or several items go, with their subtasks |
| `item checkout` | write: `PLAYBOOK-<n> [<agent>\|team:<name>]` makes that playbook's epic, tasks and subtasks as plain new items, To Do, held by the receiver (you, unless named); `<live id> --playbook` files a live item and its children as a new playbook |
| `item search --playbook`, `item read PLAYBOOK-<n>` | read: the playbooks' items, and one with its children; `item create --playbook` makes a new one |

## Syntax

- An id is a plain id such as `w12` or `KAN-65`; every id an item has had still finds it.
- Every command but `link` and `checkout` takes several ids: list them, `item transition w12 w13
  "In Progress"`, `item comment w12 w13 "<text>"`. `item create --title a --title b` makes one
  item per title. One reply line each; if any was not done, its line says why and the tool exits 4.
- Status, kind, priority and link type are the space's names exactly (`item --help` lists
  them); anything else is refused, naming the set.
- `item read` and `item search` print plain lines to read; add `--json` only when a script parses
  the output.
- Flag as `item flag <id> "<who>: <what you need>"`; `item unflag <id>` clears it.

More: `ronin-help work-items`

## Usage

Every act on a work item, the item always named: create, read, search, edit, transition, flag, unflag, handoff, comment, attach, link and delete. `item --help`.
