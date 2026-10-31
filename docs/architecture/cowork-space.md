# Coworkspace construction

**The page format is the workbench:** a discovery column beside workspaces that hold
surfaces. A Team page (`#/team/:name`) uses this format, as do the other workbench scopes.
[KOTOBA](../../KOTOBA.md#coworkspace-and-work) defines the shared nouns; the glossary and
lexicon supply the owner's words. Update those sources together when a meaning or its
stock wording changes.

Campaign, Teams collection and Team are discovery boundaries, not different formats. Each has one
discovery column whose cards are limited to that scope; every one uses the same surrounding
workspaces, surface placement, drag/drop, arrangement and recall. Say *Campaign discovery
workbench*, *Teams workbench* or *Team workbench* when the distinction
matters—never “two-workspace Campaign surface.”

## The map

```
┌───────────────────────────────── top header (the bar) ──────────────────────────────────┐
│ RoninCowork · place · view map (which slots show, in what order) · verbs · 2 ⇄ 4        │
├───────────────────────┬──────────────────────┬──────────────────────────────────────────┤
│      workspace 1      │   selector column    │              workspace 2                 │
│                       │      (on a Team)     │                                          │
│  ┌ surface head ────┐ │  ┌ column head ────┐ │  ┌ surface head ──────────────────────┐  │
│  │ terminal_tile:   │ │  │ ▸ Commons       │ │  │ team_commons: tab strip            │  │
│  │ tile head        │ │  │ Agent cards…    │ │  │                                    │  │
│  └──────────────────┘ │  └─────────────────┘ │  └────────────────────────────────────┘  │
│                       │  New Agent · hints   │                                          │
│  one workspace_surface│  (click → workspace) │  one workspace_surface                   │
└───────────────────────┴──────────────────────┴──────────────────────────────────────────┘
```

**Two shapes**: **2** — workspace 1 · selector column · workspace 2, as
drawn; and **4** — a 2×2 of workspaces with the selector column left, centre or right. A
workspace column is a STACK: workspace 3 sits under 1, workspace 4 under 2, and the count
(the bar's **2 ⇄ 4** button, `#shapecycle` — one button wearing the count, clicked to alternate — or `count=4` from `edges page`)
shows or hides the lower cells. The selector's place is the same `order` in both shapes.
There is no one-workspace shape.

Three kinds of thing, and only three, sit inside the bar:

| kind | what it is | how many |
|---|---|---|
| **workspace** | a cell that holds exactly one `workspace_surface` at a time; remembers what it holds per tab | two or four (`workspace1`–`workspace4`; 3 under 1, 4 under 2); the Kit's layout map shows, hides and reorders the three columns |
| **selector column** | a column that PICKS what goes into a workspace; it never holds a surface itself | one — on the Team page it holds the Commons card first, then the Agents as cards, then New Agent and the hints; click seats one in the selected workspace, drag onto any cell |
| **top header** | the neutral bar: RoninCowork, a centred scope island, the place, layout map, the view's verbs and shape | one |

## The workspace surfaces — peers, each able to occupy a workspace

| `workspace_surface` | about | its head | what the head holds |
|---|---|---|---|
| **terminal_tile** | one session | **tile head** (`js/tilehead.js`) | ⛩ edit Agent title · reading toggle · メ menu (`js/menu.js`: send a file, mention, output, work record, delete or archive) · −. The Torii is first, immediately before the readable title; the permanent session ID does not change. |
| **cowork_commons** | this install and this owner | the Campaign's **Machine** strip (`js/cowork-commons.js`) | Themes · Desk · Account (the rail: Configuration · Release & update · Hotwords · Koshi · Log out) · Archived · Messages · Help desk · Keypad |
| **new_agent** | one launch | **surface head** | the New Agent form (`js/new-agent.js`), placed by the New Agent card or `workspace1=new`; from the press until the Agent is born, Launch reads **Building…** and the form steps back under the working dots; the newborn lands in that workspace |
| *(blank)* | — | — | an EMPTY workspace says *Workspace* and holds nothing — never a commons by default |

Rules that make them peers:

- **No flip on any head**: the team commons is the FIRST CARD of the
  selector and goes into a workspace like any card — click for the selected cell, drag onto
  any cell. The work record chip sits at the far RIGHT of a tile head.
- **A cell owns selection and drops, whatever it holds**: a card dropped on
  any workspace clobbers what is there — session, commons, form, anything to come.
  Nothing per surface: a surface is one stable type in `js/workbench-catalog.js`, and a
  profile there names which types a destination offers.
- **One surface per workspace, one head per surface.** A surface never draws over another;
  trading is `place()`.
- **Every head is one depth** — `--row-head` (41px). The tile head wraps rather than clips
  when a workspace is squeezed; the strip's **T** stands at tab height.
- **A surface is a Kit surface** (`docs/architecture/workspace-kit.md`): `createTerminalTileHost` for a
  terminal tile, `createTabbedSurface` for anything with tabs. A new surface is a new
  call of one of those, never a new frame.
- **A surface's words go through `t()`** and its nouns through KOTOBA + the glossary
  (`docs/products/kokugo.md`).

## The names, once

- **workbench** — the format: one discovery column offers surfaces to the
  surrounding workspaces. Campaign, Teams and Team name only what that column can discover.
  This replaces `cowork_space`, which collided with both Cowork and `coworkspace`.
- **workspace** — a slot. Say *workspace 1*, *workspace 2*. A workspace is not a surface.
- **workspace_surface** — the genus: what a workspace holds. Say *a surface*.
- **terminal_tile** — a tile when it is the surface in a workspace. Say *the terminal
  tile* when the contrast with a commons matters. Not "terminal seat" — *seat* is a code word in `cowork-view.js` for the slot's pool
  of tiles and is not a house noun.
- **team_commons** — the team's shared surface. Say *the team commons*.
- **cowork_commons** — the install's shared surface. Say *the cowork commons*.
- **selector column** — a column that picks.
- **top header** — the bar. Say *the bar*.
- **surface head** — the genus for a surface's top row: *tile head*, *commons strip*,
  *column head*. No head carries a flip — a surface gets into a workspace from the selector column, or by drag.

### The bar's navigation

The left side is the crumb (owner, 2026-10-20): the RoninCowork brand (a plain mark and word, not a
link), then after a gap (`--space-subsection`, no dot; owner, 2026-10-24) Home (`#/home`), the Teams
door (`#/cowork`, the Teams workbench), and on a Team page the Team's title last (its id read as
words when it has no title), dots between the crumbs, the crumbs' smaller type on the brand's
baseline (`.bar-crumb`, one baseline-aligned group centred in the bar; owner, 2026-10-24). A view
naming its own place (Models,
Workspaces, Help, Setup, Settings; owner, 2026-10-24 for the last two) reads it after Home instead
of the Teams door. A neutral island is cut into the
top edge of the screen and names the active Workbench scope:

```text
RoninCowork    Home  •  Teams                    Teams                         <verbs>
RoninCowork    Home  •  Teams  •  Sea Settle   Sea Settle                      <verbs>
RoninCowork    Home  •  Models                                                 <verbs>
```

The root landing and Machine Settings have no island. Campaign reads *Campaign*, Teams
reads *Teams*, and one Team uses only its readable name. The neutral island does not carry
the scope colour: graphite, aiiro and kaki belong to the Workbench headers below it. It is
a place reading, never a button, and uses the same `--radius-large` lower corners as the
Workspace Kit surfaces. Doors consume the shared
`.ui-bar-nav` primitive and the place consumes `.ui-bar-place` from `docs/architecture/ui.md`; a
feature must not restyle either. `js/workspace-header.js` writes the place; nothing
else does.

### The root landing

The bare `/` route is the landing, not a remembered workspace and not a Campaign editor.
It has four doors — **Models**, **Workspaces**, **Teams**, **Help** — each opening its own Workbench in
the same tab (`public/js/door-workbenches.js`; owner, 2026-10-19). Models is its own stones of
providers in Workspace 1 (`models-surface.js`): a stone dragged into a workspace, or its selector
card, places that provider's page there whole, no rail; Settings' Model Providers surface stays
as it is, both drawing with the one exported drawing. Workspaces is its own stones of folders in
Workspace 1 the same way (`workspaces-surface.js`), one card per folder and three dotted cards —
Add a workspace, GitHub CLI, Clone a repository — the folder they add taking their workspace;
Settings' Workspace Folders surface stays as it is. Teams opens the Teams workbench at `#/cowork`
(`cowork-view.js`; owner, 2026-10-20), the one Teams workbench: its Teams card
(`team-roster-surface.js`) carries a Workspace question (many-of, blank All) and a Show question
(Theme, State, Agents, Items; Theme on by default) above its stones, each stone the Team's name
with what Show picks under it as the phalanx's branch rows (Theme one row, State one row, each
Agent a row with the lead first, each Item a row); the 人 mark in a stone's corner opens the
Team page in a new tab; its selector offers Team roster, Cron jobs, New Team, New Agent and
Rehydrate Archived.
Help (owner, 2026-10-21) seats the help outline (`help-outline.js`, `help.outline`: the docs/ guides
under a headline of what Ronin is for (the headline alone on a phone); 'START HERE: 4 things you need to know' (the four), then
Getting started and Using Ronin; each of the six opens one level down to Return and its pages (the four's level is the four), the page being read pressed; a pressed page read beside the rail through
`/api/file?product=1`) in Workspace 1 and Mika (`help.mika`) in Workspace 2, her tile opened on its
reading (`createMikaTilePool({ opensOn: 'reading' })`); both are solid cards.
Until one model provider is activated the Models, Workspaces and Teams doors are locked; Help stays
open, its Mika seat saying in one line that she needs a provider, pointing to Setup, and say so (the gate the old
root had); Settings, the live stone, opens Setup until its five answers are recorded.

The current root — Ronin Home as it was before 2026-10-18, with doors into the Desk, Team and
Agent Workbenches (Desk and Team both open the Teams workbench at `#/cowork`; the Desk workbench
was deleted on 2026-10-20) — stays at `#/current` (`public/js/current-home.js`) while pieces move from it
to the new Home. One plain toggle in the bar, the same spot on both pages, swaps the two in one
press: Current on the new Home, Next on the current one.

There is no Campaign picker, default star, archive action or New Campaign footer.

The live owner is `public/js/campaign-home.js`.

The Campaign page shows the Campaign's editable identity, workspaces, installations,
defaults and the Machine surface. With `MULTIPLE_CAMPAIGNS_ENABLED` off, the client does not render
controls that add, select, default, archive or delete Campaigns. The Campaign API remains
available. The fixed Campaign id is not rendered; its title, description and all other
Campaign content remain editable.

## Records

- Implementation of the page as it stands: `docs/architecture/team-workspace.md`.
- The Kit's contract: `docs/architecture/workspace-kit.md`.
# Message delivery

Team Commons' **Messages** tab shows inbound session messages that have not
cleared. It is the visible half of the durable delivery flow; see `docs/architecture/message-queue.md`.
Messages waiting behind a draft or dialog remain visible with **Dismiss**. After two
minutes the worker attempts delivery once and removes the letter.
