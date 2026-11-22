# The library

The library holds ready-made work: an epic and its tasks for a piece of work that comes up again
and again, such as welcoming a person to a new office or mapping a project they bring in. Each
has an id, LIBRARY-1, LIBRARY-2 and so on. Checking one out makes its epic, tasks and subtasks as
plain new [work items](work-items.md), To Do, held by whoever it goes to. From then on they are
ordinary items: they show on that Agent's or Team's holds and tile, and go to Jira like any item.
They keep no tie to the library, and a later change to the library does not touch them.

## Find one

- Agents: `item search --library` lists the library; `--text <words>` narrows it. `item read
  LIBRARY-1` reads one, with its tasks.
- In Ronin: type `LIBRARY-` in Find item. Press an item to read it.

## Check one out

```text
item checkout LIBRARY-3 mapper
item checkout LIBRARY-3 team:site
```

With no receiver named, it goes to the Agent checking it out. A brief or a task can simply say
"Check out LIBRARY-1 to see your next steps." In Find item, an item's **Assign** checks it out to
the Agent or Team you pick and opens the new epic.

## What Ronin ships

| Id | What it is for |
|---|---|
| LIBRARY-1 | Getting set up in a new office: the Helpful Assistant checks it out to herself |
| LIBRARY-2 | Writing one Workspace's Summary: a fresh Agent per Workspace with no Summary yet |
| LIBRARY-3 | Mapping a project someone has brought in: PROJECT_MAP.md and an HTML summary, attached to its epic |

## Your own

The library is files, one item tree each, named after its id. Ronin's are in
`ronin_catalogs/library/`. Yours are in `~/ronin/library_items/`, and a file of yours with a
stock id replaces that one whole.

- `item create --library --title "…" --objective "…"` makes a new one at the next free number.
  With `--parent LIBRARY-<n>`, the item is added as a task to that one instead.
- `item checkout <live epic> --library` files a live epic and its children as a new one.
- You can also write the file yourself:

```text
# The epic's title

The epic's text: what the Agent who checks it out does, and its rules.

## A task's title
Do: what done is, in one line.
Details: where the steps are: `ronin-help <topic>`, a screen, a tool's `--help`.
Check: how the Agent knows it is done.
Open: `setup.providers` (optional): the Setup surface for it.

### A subtask of that task
Do: … Details: … Check: …
```

Tasks come in the file's order. Point at reference material; never write lines for the Agent to
say.
