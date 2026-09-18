# Work records and projects

A work record says what an Agent is doing now. It contains session context—objective,
repositories, documents, and focus—and every project the Agent currently holds. The
Team Kanban is derived from these records and the Team roster; there is no stored board
to reconcile.

Use the shipped `work-record` command exposed to your session. `work-record --help` is the
canonical command vocabulary; there are no legacy reader or writer aliases.

## Projects are the work ladder

Plan real deliverable work as a project. Do not also maintain a session-level ladder for
the same work. A project is one complete object:

```json
{
  "id": "virtual-kanban/6",
  "title": "Agent-authored projects",
  "objective": "Create collision-free projects in an Agent work record.",
  "stage": "BUILDING",
  "exit": "agent",
  "status": "yellow",
  "ladder": [
    { "stage": "BUILDING", "legs": [
      { "title": "Roster issued the stable ID", "done": true },
      { "title": "Focused checks pass", "done": false }
    ] },
    { "stage": "LANDING" }
  ],
  "evidence": []
}
```

The stable ID is issued by the Team roster's monotonic counter. An Agent does not state
the number and must not derive it from the projects it can see:

```text
work-record project create --team virtual-kanban \
  --title "Agent-authored projects" \
  --objective "Create collision-free projects in an Agent work record."
```

Issuing an ID advances the roster counter before the project is written. If the later write fails, create a new
project; a gap is harmless, while reusing an issued identity is not.

Every Agent may take an assignment. When work arrives without a Project, create it through
this roster-issued-ID path, then read the stable ID returned by the acknowledgement and use
the lifecycle verbs. Never choose an ID by hand or create a duplicate project object.

The same Project has three working entrances: the Team creates it in Inbox and assigns it;
its Agent moves the whole object back to Team Inbox, Done, or Backlog; or the Agent creates
it through the roster-issued sequence when work arrived without one. No path makes a copy.

`project create` is creation, never an upsert. It writes the complete starting shape into
the calling Agent's own record and refuses an existing ID. An Agent can write only a
project it holds.

## Stage, exit, and status

`stage` is the project's current column:

- `IDEAS`: held by the Team roster before assignment.
- `PLANNING`: the Agent is shaping the accepted project.
- `BUILDING`: the Agent is producing it.
- `LANDING`: implementation is moving through hand-in, promotion, or master.
- `DONE`: the delivered result is contained by master.

Each ladder rung names one of those stages. Legs describe observable outcomes and carry
only `done: true|false`. Revise the ladder when reality changes and ask whether each test
earns a leg and its maintenance cost.

| Flag | Values | Meaning |
|---|---|---|
| `exit` | `none` · `agent` · `lead` · `user` | who must act next |
| `status` | `green` · `yellow` · `red` | delivery health |

There is no owner field. The holder is where the board found the canonical project: the
Team roster or one Agent record. There is also no revision counter, history, verdict, or
decider. Evidence is an append-only list of useful facts such as commit SHAs and hand-in
receipts, not a second status system.

Typical updates are:

```text
work-record project write virtual-kanban/6 --stage LANDING
work-record project write virtual-kanban/6 --exit lead
work-record project write virtual-kanban/6 --status green
work-record project write virtual-kanban/6 --leg BUILDING.2 done
work-record project write virtual-kanban/6 --evidence "commit 0123456789"
```

Prefer the lifecycle verbs when they express the whole intent:

```text
work-record project working virtual-kanban/6
work-record project ready virtual-kanban/6 --for user
work-record project stuck virtual-kanban/6
work-record project blocked virtual-kanban/6 --on lead
work-record project advance virtual-kanban/6 --to LANDING
work-record project backlog virtual-kanban/6
work-record project done virtual-kanban/6
```

`working` writes yellow and `exit: agent`; `ready` writes green and the actor named by
`--for`; `stuck` writes red while leaving the next move with the Agent; `blocked` writes
red and names the actor required by `--on`. `advance` writes only `stage`, preserving
`status` and `exit` so the Agent states the new condition explicitly. The field-level
`project write` remains available; these intent operations are not aliases or automatic
workflow. Every successful lifecycle acknowledgement ends, “Remember to update your
project.”

`return`, `backlog`, and `done` move the same held object to Team Inbox, Backlog, or Done.
They preserve its authored state. If the moved Project was focused, focus becomes the first
remaining held Project in record order with no rung or leg coordinates, or clears when none
remains. Team `restore` moves Backlog or Done to Inbox; assignment moves Inbox to an Agent.

## Whole-project moves

The Team roster has exactly three Project areas: Inbox, Done, and Backlog. Assignment moves
an Inbox Project whole to an Agent. Restore moves a Team-held Done or Backlog Project to
Inbox. Custody movement never changes stage, status, exit, ladder, or evidence.

Associate a hand-in explicitly with `worktree-desk hand-in <repo:branch> --project <id>`. An
accepted receipt records that ID and prompts `work-record project advance <id> --to
LANDING`; it does not run the command. A successful promotion follows the same receipt ID
back to the canonical Project and prompts `work-record project done <id>`. No association
is guessed from focus, names, or repositories, and failed operations claim no movement.

A supporting Agent and a project assignment are two operations owned by their respective
tools:

```text
session_create board_reader --prompt "Take virtual-kanban/6 and read its work record."
team project assign virtual-kanban virtual-kanban/6 board_reader
```

`session_create` creates the session and carries its explicit prompt; `team project
assign` moves the roster-held project. Lead designation belongs to `session_set`, never
session creation.

## Session context

Session objective, repositories, documents, focus, and the legacy ladder remain for
compatibility and non-project work. Do not duplicate a project ladder there. List documents
the owner should be able to open and keep checkout rows current:

```text
work-record document add docs/using-ronin/work-record.md
work-record update_record --repo ronin_cowork:team/example/cut
```

These fields locate work; they do not replace commits, hand-ins, or project evidence.
Read the record after structural edits. Keep the project truthful when the plan changes,
when a leg completes, when work waits on someone else, and when landing evidence arrives.
