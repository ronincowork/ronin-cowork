# Playbooks

A playbook is ready-made work: an epic and its tasks for a piece of work that comes up again
and again, such as welcoming a person to a new office or mapping a project they bring in. Each
item in it is a [work item](work-items.md) with its own id, PLAYBOOK-1, PLAYBOOK-2 and so on,
and a parent: an epic's tasks and a task's subtasks are items under it. Checking one out makes
its epic, tasks and subtasks as plain new work items, To Do, held by whoever it goes to. From
then on they are ordinary items: they show on that Agent's or Team's holds and tile, and go to
Jira like any item. They keep no tie to the playbook, and a later change to it does not touch
them.

## Find one

- Agents: `item search --playbook --no-parent` lists the playbooks; `--text <words>` narrows
  it. `item read PLAYBOOK-1` reads one, with its tasks; each task reads the same way.
- In Ronin: type `PLAYBOOK-` in Find item. Press one to open it in the same reading as any work
  item; its tasks and subtasks open on a press. Its status is Playbook, which does not move.

## Check one out

```text
item checkout PLAYBOOK-3 mapper
item checkout PLAYBOOK-3 team:site
```

With no receiver named, it goes to the Agent checking it out. A brief or a task can simply say
"Check out PLAYBOOK-1 to see your next steps." In Find item, a playbook's **Assign to agent** copies it
to the Agent or Team you pick and opens the new epic.

## What Ronin ships

| Id | What it is for |
|---|---|
| PLAYBOOK-1 | Getting set up in a new office: the Helpful Assistant checks it out to herself; its tasks are Setup's steps |
| PLAYBOOK-2 | Writing one Workspace's Summary: a fresh Agent per Workspace with no Summary yet |
| PLAYBOOK-3 | Mapping a project someone has brought in: PROJECT_MAP.md and an HTML summary, attached to its epic |

Their tasks and subtasks are PLAYBOOK-4 onwards.

## Your own

Ronin's playbooks are in `ronin_stock/playbooks/`, one JSON file per item, the same shape as a
live item. Yours are in `~/ronin/custom/playbooks/`, and a file of yours with a stock id
replaces that one whole: the one rule of the
[three places](../../ronin_stock/stock_readme.md#three-places-each-with-one-meaning).

- In Find item, a playbook item's **Customize** edits its title and objective, and adds a
  task (under an epic) or a subtask (under a task); saved, it is yours and replaces Ronin's. **Delete my version** removes your
  copy, and Ronin's is back. **New playbook**, under the list, makes a new one at the next free
  number.
- `item edit PLAYBOOK-<n> --title … --objective …` edits one as any item; the edit is your copy.
- `item create --playbook --kind Epic --title "…" --objective "…"` makes a new one at the next
  free number. With `--parent PLAYBOOK-<n>`, the item goes under that one.
- `item checkout <live epic> --playbook` files a live epic and its children as a new playbook.

Write a task's objective as:

```text
Do: what done is, in one line.
Details: where the steps are: `ronin-help <topic>`, a screen, a tool's `--help`.
Check: how the Agent knows it is done.
Open: `setup.providers` (optional): the Setup surface for it.
```

Tasks come in id order. Point at reference material; never write lines for the Agent to say.
