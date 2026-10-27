# Work records and work items

A work record says what an Agent is doing now: its objective, repositories, and the work
items it holds, each with its status. Ronin has no board: a user who wants one uses Jira
or Trello.

Two shipped commands: `work-record` keeps what is about the Agent (objective, repositories),
and `item` does every act on a work item, the item always named. Its acts are Jira's item
acts, one for each. `work-record --help` and `item --help` are the canonical vocabulary;
there are no aliases.

## Work items

A work item matches Jira. It is stored once, keyed by its id (`w12`), and changed only by
tools. Every change appends one line to its trail naming who made it. Nobody is refused for
not holding an item: holding is how work is found, never permission.

```json
{
  "id": "w12",
  "title": "Agent-authored items",
  "objective": "Create collision-free work items.",
  "level": 0,
  "kind": "task",
  "status": "BUILD",
  "flagged": false,
  "priority": "High",
  "comments": [
    { "by": "lead", "at": "2026-09-28T15:06:02Z", "text": "Start with the store." }
  ],
  "parent": "w3",
  "attachments": ["/home/me/plans/AGENT_ITEMS.md"],
  "links": [{ "type": "blocks", "to": "w14" }],
  "external": { "jira": { "id": "10012", "key": "RON-12" } },
  "trail": [
    { "at": "2026-09-28T15:02:11Z", "by": "lead", "op": "create", "to": "none", "note": "Agent-authored items; under w3" },
    { "at": "2026-09-28T15:04:40Z", "by": "lead", "op": "assign", "from": "none", "to": "agent:builder" }
  ],
  "created": { "at": "2026-09-28T15:02:11Z", "by": "lead" }
}
```

| Field | Values | Meaning |
|---|---|---|
| `level` | `1` epic · `0` story, task or bug · `-1` subtask | stored; a new item is one level below its parent, `0` with none |
| `kind` | any work type name (`story`, `task`, `bug`, `feature`, a site's own) · blank | the work type; blank unless you set it, no fixed list |
| `status` | `IDEA` · `PLAN` · `BUILD` · `REVIEW` · `LAND` · `DONE` | the item's state |
| `flagged` | `true` · `false` | an impediment, as Jira's flag; `item flag` / `item unflag` |
| `priority` | any name · blank | as Jira's priority; `item edit <id> --priority <name>` |
| `comments` | `{ by, at, text }` list | as Jira's comments; `item comment <id> <text>` adds one |
| `parent` | an id, or none | none is normal; `item edit <id> --parent <id>\|none` |
| `attachments` | absolute paths | as Jira's attachments; `item attach <id> <path>` |
| `links` | `{ type: blocks\|relates, to }` list | as Jira's issue links; `item link`; a read shows links in too |
| `external` | `jira` `{ id, key }` · `trello`, `github` keys | `jira` pairs the item with a Jira issue and is written by the Jira bridge alone; `item edit <id> --trello\|--github <key>` |

One object serves every level; a field that means nothing at a level is simply unused, as in
Jira. An epic's status is set by hand. Adding a child never changes an item's level. There
is no ladder: Jira has none.

Two relations are kept apart. **Holding** (assign, held by) is a list of item ids on each
Team and each Agent; assigning moves the id from one list to another and never touches the
item. **Parent** is one id on the item, or none. A Team holds; it does not contain.

```text
item create --title "Agent-authored items" [--kind task] [--parent w3] [--level 1|0|-1] [--objective "…"] [--priority High]
item read w12                       # fields, children, comments, attachments, links, history
item search [--team surface] [--holder builder | none] [--parent w3 | --no-parent] [--status BUILD] [--kind bug]
item edit w12 --priority High --jira RON-12
item edit w12 --parent w3           # parent and level together; --parent none keeps the level
item transition w12 REVIEW          # any status to any status, as Jira's transition
item flag w12 "waiting on the API"  # Jira's Add flag; the reason is a comment. item unflag w12
item assign w12 builder             # or team:surface, or none
item comment w12 "commit 0123456789: store round-trips"
item comment w12 --edit 1 "commit 0123456789: the store round-trips"
item attach w12 docs/using-ronin/work-record.md     # --remove <path> takes it off
item link w12 blocks w14            # or relates; --remove takes it off
item delete w12                     # with its subtasks; an epic's other children lose the parent
```

A new item is held by nobody until it is assigned. Parent is a field, as in Jira:
`item edit --parent` changes the parent and the level in one act, one below the new
parent; with no parent the level stays. Any level-0 item moved under another becomes a
subtask (Jira's convert to subtask).

**The one rule: nothing goes below -1.** On a create, an `item edit --parent` or
`--level`, the item takes its new level (one below its parent, or the level set) and its
children follow, each one below its own parent. If any of them would land below -1, the
act fails with one line: "w39 can't go there." Nothing else is checked. So nothing goes
under a subtask, under its own descendant or under itself; a story and its subtasks move to
another epic together; and an epic with stories moved under an epic becomes 0, its stories
-1, each child with a trail line saying it followed.

`item delete` is Jira's delete: the item goes, and its subtasks with it; any other child is
left with no parent, links to it go, and its holders let go of it.

Every write answers with one line of what the act did, read from the trail line it
appended, then the item as it now is: "w39 moved under w40, level -1", "w9 moved to BUILD",
"w9 is held by agent:x", "w12 was created", "w12 changed: kind story", "w12 is flagged:
waiting on the API", "w12 has a comment from lead: Start with the store.", "w12 blocks
w14", "w12 has /home/me/plans/AGENT_ITEMS.md removed". Status, kind and level appear only when the act changed them. When an item arrives
under one someone holds, by a create with a parent or an `item edit --parent`, that holder
gets one message through the ordinary queue: "w9 Fix login was added under w7, which you
hold. Handle it as you see fit." A Team holder's lead gets it. An item held by nobody
notifies nobody. A new item held by nobody, or one its last holder hands off to none, is on
the Campaign's unheld list (`item search --holder none`), and every Coordinator in the
Campaign gets one message naming it: "w41 PAY-7 'Fix login' has no holders; place it
(item read w41)." Any write by someone other than the holding Agent, a comment included,
gives that Agent "Your work record changed"; its own writes tell nobody.

## Where you read them

- **Work Items** on the Agent workbench: the items the Agent holds across its Teams.
- **Work items** in a Team on the Teams workbench, and under an opened Agent on the Team
  roster.
- The tile's **☰ Work record**: the held items first, each with its status, flag and
  attachments, then the objective, worktrees and Teams. **📄 Docs** lists the held items'
  attachments.

Items show as stones grouped by parent: each epic, then its items, each followed by its
subtasks. A stone shows the id, title, kind, status and ⚑ when flagged; press one to read
its objective, priority, comments, attachments (each opens), links and history beside the
stones. These are readings: every change goes through the `item` tool.

## Receipts move Land and Done

Name the item on a hand-in with `worktree-desk hand-in <repo> --item <id>`. An accepted
hand-in moves the item to LAND, with the receipt on its trail. A completed promotion moves
every item named on the hand-ins it carries to DONE, with the promotion receipt. No
association is guessed from names or repositories.

A supporting Agent and an assignment are two operations owned by their tools:

```text
session_create board_reader --prompt "Take w12 and read it with item read w12."
item assign w12 board_reader
```

## Documents live on items

Documents are an item's attachments, and travel with it when it moves between Agents. The
tile's Docs lists the attachments of every item you hold: a document you did
not attach is one the owner cannot reach.

## The work record

```text
work-record update_record --objective "<sentence>"
work-record workspace add ronin_cowork --branch team/example/cut
work-record workspace add https://github.com/ronincowork/samurai_lab.git --branch main
work-record workspace list
work-record read
```

Remove an old entry with `work-record workspace remove <repo-or-url>`; add `--branch`
to remove only that branch. The acknowledgement says how many rows changed, including
when none matched. `session_set <name> --root <handle>` separately changes a live
session's recorded Workspace Folder. Neither edit changes its birth directory or opens
a managed desk. These fields locate work; they do not replace commits, hand-ins, or evidence.

When an Agent ends, is archived, or is Hard Deleted, what it held is released: each item
gets a `holder-ended` line and is held by nobody, found again under its parent or with no
parent. Restoring an archived Agent does not reclaim it.
