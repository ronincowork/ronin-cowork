# templates — the tray the launch forms draw

One preset per file, named by its token. A template fills part of the New Team or New
Agent form and stops: its answers become yours, and only provenance remains — it is
never a live link (KOTOBA § LAUNCHER). Picking one is the customising: everything it
wrote stays editable underneath.

The first box on every tray is **Make your own** — fresh and empty. That box is the
form's, not a file here: a template that filled nothing in would collapse nothing.

## The fields

| field | means |
|---|---|
| `label` | the reading-face name on the tray |
| `art` | the tray face — an emoji or a glyph |
| `blurb` | one line under the name |
| `order` | tray order; unordered boxes follow, by label |
| `kinds` | which kinds bring this box forward — `open` on the form shows every template |
| `brief` | the born Agent's instructions seed |
| `objective` | the Team's objective seed |
| `mandate` | `reach · recruit · output`, each a ruled value (R36 as amended) |
| `behaviours` | `<shelf>:<name>` book addresses laid into the tray, e.g. `sops:github, ways:cut_code` |
| `routines_on` / `routines_off` | Routines this template turns on / off over the seeded map — exactly the fields it carries, nothing else moves |
| `lead_brief` / `lead_mandate` | the Team-lead offer this template suggests — a brief and a mandate, never a seat |

A template overlays **exactly the fields it carries** onto the seeded form (order:
level above → template → the owner's hand, later beats earlier — CASCADE § 1). Absent
fields state nothing.

## Yours

A same-named file in your catalogs store (`bin/ronin-store catalogs` → `templates/`)
replaces ours whole; a new name adds a box. The forms' *Save as template* writes here —
always a new file, never over a shipped one (those are edited on the campaign page).
`- **hidden:** yes` withdraws a shipped box without deleting the file.
