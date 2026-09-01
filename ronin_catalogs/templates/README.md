# templates — two shelves, two trays

One preset per file, named by its token, on the shelf that says what it is:

```text
templates/agents/<token>.md   ← a LOADOUT: what one session is handed
templates/teams/<token>.md    ← a CAST: the agents a team launches, one marked lead
```

A template fills part of the New Agent or New Team form and stops: its answers become
yours, and only provenance remains — it is never a live link (KOTOBA § LAUNCHER).
Picking one is the customising: everything it wrote stays editable underneath. Neither
form is shown a template written for the other; the doors are `GET /api/templates/agents`
and `GET /api/templates/teams`, filtered by `?kind=`.

The first box on every tray is **Make your own** — fresh and empty. That box is the
form's, not a file here: a template that filled nothing in would collapse nothing.

## The fields both shelves share

| field | means |
|---|---|
| `label` | the reading-face name on the tray |
| `art` | the tray face — an emoji or a glyph |
| `blurb` | one line under the name |
| `order` | tray order; unordered boxes follow, by label |
| `kinds` | which kinds bring this box forward — `open` on the form shows every template |
| `behaviours` | `<shelf>:<name>` book addresses laid into the tray, e.g. `sops:github, ways:cut_code` |
| `routines_on` / `routines_off` | Routines this template turns on / off over the seeded map — exactly the fields it carries, nothing else moves |

## The agent shelf's own fields

| field | means |
|---|---|
| `brief` | the born Agent's instructions seed |
| `mandate` | `reach · recruit · output`, each a ruled value; output may list several tokens (`an artifact, no code`) |
| `team_mode` | `new` births the box into its own team; absent states nothing |

## The team shelf's own fields

| field | means |
|---|---|
| `objective` | the Team's objective seed |
| `## agents` | the cast — one `### <name>` section per agent row, below the field lines |

Each cast row carries `instructions:`, optionally `mandate:`, and `team_lead: yes` on
exactly one row — the lead is just one of the agents, marked. A row is the same object
the New Team form's agent line produces and the team loader launches; every row stays
editable and deletable on the form before the raise.

```markdown
## agents

### run the evening
- **team_lead:** yes
- **instructions:** Run the evening and keep the timing.
- **mandate:** execute · staff agents · open
```

## Yours

A same-named file in your catalogs store (`bin/ronin-store catalogs` →
`templates/agents/` or `templates/teams/`) replaces ours whole; a new name adds a box.
The two shelves are separate namespaces. The forms' *Save as template* writes here —
always a new file, never over a shipped one (those are edited on the campaign page).
`- **hidden:** yes` withdraws a shipped box without deleting the file.

Your agent keeps these for you: templates are plain files, so "keep this recipe with
the Dinner Party template" is something you say to a session, and it writes the SOP to
your store, shadows the template, and adds the book itself — `docs/templates.md`.
