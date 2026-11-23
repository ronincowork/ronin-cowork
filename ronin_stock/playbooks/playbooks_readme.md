# Playbooks

A playbook is a reusable plan of work, checked out into live items: an epic, its tasks and
their subtasks. Each is a work item, stored as a live one is: one JSON file per item, the same
shape as a live `<id>.json` (title, objective, kind, level, parent, links, ...), named by its
own id, `PLAYBOOK-n.json`. A child's `parent` is its PLAYBOOK-n parent; the status is
`Playbook`. A playbook is a foundation: the person's custom-foundations are in
`~/ronin/custom/playbooks/` and replace the stock one of the same id, whole
([stock_readme.md](../stock_readme.md#three-places-each-with-one-meaning)).

- **Read:** `item read PLAYBOOK-n` and Find Item read it as any item: its children list, each
  one opening on a press. A playbook item has no status to move.
- **Check out:** `item checkout PLAYBOOK-n [<agent>|team:<name>]` copies it and everything under
  it as new plain live items, To Do, held by the receiver, with no link back.
- **Make my version, Edit, Delete my version:** the ordinary item edits (`item edit`, an item
  made with `--parent PLAYBOOK-n`, `item delete`), written to `~/ronin/custom/playbooks/`.
  Delete removes your copy, and the stock one is back.
- **New:** `item create --playbook` takes the next free PLAYBOOK-n; `item checkout <live id>
  --playbook` files a live item and its children as a new playbook.

The stock ones: PLAYBOOK-1 (Irasshai's onboarding, its tasks the Setup steps), PLAYBOOK-2
(writing a Workspace's Summary) and PLAYBOOK-3 (mapping a project brought in). How a person uses
them: [docs/using-ronin/playbooks.md](../../docs/using-ronin/playbooks.md).
