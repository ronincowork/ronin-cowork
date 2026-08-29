# COWORK SPACE — the surface map

**The page is the `cowork_space`.** It was called "the team workspace" while the team was
the only thing it showed; the name moved up a level on 2026-08-27 (owner: *"I've been
calling it the team workspace. But to be honest, this is the cowork_space"*) because the
page is about to hold surfaces that are not about a team. `#/team/:name` is one address
into it; the League will be another. This page is the one document to point at when two
people need the same word for a part of it. **Every noun here is a KOTOBA row** (§
COWORKSPACE) and a `glossary.*` word the owner's desk profile renders; add a term here and
you add it there in the same commit.

## The map

```
┌───────────────────────────────── top header (the bar) ──────────────────────────────────┐
│ ⛩ brand · view name · view map (which slots show, in what order) · か New · ⚙ · count   │
├───────────────────────┬──────────────────────┬──────────────────────────────────────────┤
│      workspace 1      │   selector column    │              workspace 2                 │
│                       │      (the roster)    │                                          │
│  ┌ surface head ────┐ │  ┌ column head ────┐ │  ┌ surface head ──────────────────────┐  │
│  │ terminal_tile:   │ │  │ Roster: team    │ │  │ team_commons: tab strip            │  │
│  │ tile head        │ │  │ ▸ Team commons  │ │  │ cowork_commons: tab strip          │  │
│  └──────────────────┘ │  └─────────────────┘ │  └────────────────────────────────────┘  │
│                       │  member cards…       │                                          │
│  one workspace_surface│  (click → workspace) │  one workspace_surface                   │
└───────────────────────┴──────────────────────┴──────────────────────────────────────────┘
```

**Two shapes** (owner, 2026-08-27): **2** — workspace 1 · selector column · workspace 2, as
drawn; and **4** — a 2×2 of workspaces with the selector column left, centre or right. A
workspace column is a STACK: workspace 3 sits under 1, workspace 4 under 2, and the count
(the bar's **2 ⇄ 4** button, in the seat the grid count had — one button wearing the count, clicked to alternate — or `count=4` from `tejun-teampage`)
shows or hides the lower cells. The selector's place is the same `order` in both shapes.
There is no one-workspace shape.

Three kinds of thing, and only three, sit inside the bar:

| kind | what it is | how many |
|---|---|---|
| **workspace** | a cell that holds exactly one `workspace_surface` at a time; remembers what it holds per tab | two or four (`workspace1`–`workspace4`; 3 under 1, 4 under 2); the Kit's layout map shows, hides and reorders the three columns |
| **selector column** | a column that PICKS what goes into a workspace; it never holds a surface itself | one today — the **roster**: the Team commons card first (thin), then the members as cards, then ＋ Add team member; click seats one in the selected workspace, drag onto any cell; the 人 pinned hot in workspace 1 |
| **top header** | the bar: `Ronin <Campaign>` and `Coworks <Cowork or blank>` label/value navigation, the tab's editable view name, layout map, ⚙ and shape | one |

## The workspace surfaces — peers, each able to occupy a workspace

| `workspace_surface` | about | its head | what the head holds |
|---|---|---|---|
| **terminal_tile** | one session | **tile head** (`js/tilehead.js`) | ⛩ rename · session picker · job · branch · output selector · @ · ⚡ · メ · gauge · ladder chip. The Torii is first, immediately before the session name. |
| **team_commons** | one team | **commons strip** — the channel surface's tab strip | Docs (three pills: **Tracked** — what agents listed; **Plans** and **Docs** — the files under the places each project root names on its record, grouped by root, the team's repos first) · Wipeboard · Team Configuration (Chat hidden until it is a thing — owner, 2026-08-28). Reached from the **Team commons card**, first on the roster |
| **cowork_commons** | this install and this owner | **Ronin Desk strip** — the same tab strip | Desk (Ronin usage stats) · Account (the desk's rail: Configuration · Appearance · Release & update · Hotwords · Koshi · gbrain · Log out) · Desk profile · Project roots · Roster · Archived (the tile commons' two) · Help desk (Mika's door over a reserved chat) · Keypad (the pad's card, inline). `js/cowork-commons.js`; landed 2026-08-27, the `admin_desk` overlay retired with it |
| **new_session** | one launch | **surface head** — T, then the name | the ＋ New session launcher, placed by ＋ Add team member (roster) or か New (bar), or `workspace1=new`; the newborn lands in that workspace |
| *(blank)* | — | — | an EMPTY workspace says *Workspace* and holds nothing — never a commons by default (owner, 2026-08-27) |
| `campaign_commons` | this campaign | Campaign Commons strip | Campaign · Project roots · Team roster · Templates |

Rules that make them peers:

- **No flip on any head** (owner, 2026-08-28): the team commons is the FIRST CARD of the
  roster, thinner than a session's, and goes into a workspace like one — click for the
  selected cell, drag onto any cell. The SHINGO light signal sits at the far RIGHT of a
  tile head; the connection dot is gone. The selector column's head reads *Roster: <team>*.
- **A cell owns selection and drops, whatever it holds** (owner, 2026-08-28): a card dropped on
  any workspace clobbers what is there — session, commons, launcher, anything to come.
  Nothing per surface: `cowork-view.js` keeps ONE registry (`SURFACES`: token · element ·
  show) and a new surface is one entry in it — the cells, the memory, the view report and
  `tejun-teampage`'s words all read the table.
- **One surface per workspace, one head per surface.** A surface never draws over another;
  trading is `place()`. The old `admin_desk` overlay is the one exception and it is going.
- **Every head is one depth** — `--row-head` (41px). The tile head wraps rather than clips
  when a workspace is squeezed; the strip's **T** stands at tab height.
- **A surface is a Kit surface** (`docs/workspace-kit.md`): `createTerminalTileHost` for a
  terminal tile, `createChannelSurface` for anything with a strip. A new surface is a new
  call of one of those, never a new frame.
- **A surface's words go through `t()`** and its nouns through KOTOBA + the glossary
  (`docs/kokugo.md`).

## The names, once

- **cowork_space** — the page. Say *the cowork space*. Not "the team workspace" (that was
  its first tenant), not "the coworkspace" (that is the whole UI — this page is one view
  of it; see KOTOBA `coworkspace`).
- **workspace** — a slot. Say *workspace 1*, *workspace 2*. A workspace is not a surface.
- **workspace_surface** — the genus: what a workspace holds. Say *a surface*.
- **terminal_tile** — a tile when it is the surface in a workspace. Say *the terminal
  tile* when the contrast with a commons matters; *the tile* is still right on the grid
  page. Not "terminal seat" — *seat* is a code word in `cowork-view.js` for the slot's pool
  of tiles and is not a house noun.
- **team_commons** — the team's shared surface. Say *the team commons*.
- **cowork_commons** — the install's shared surface. Say *the cowork commons*. Never
  "the admin desk" once it lands; never "the commons" bare — that is the
  `session_commons` inside a tile, about sessions.
- **selector column** — a column that picks; the **roster** is one.
- **top header** — the bar. Say *the bar*.

### The bar's navigation

The left side is two label/value pairs, not a breadcrumb:

```text
Ronin  <selected Campaign>     Coworks  <selected Cowork or blank>
```

`Ronin` and `Coworks` are the only doors. Their values are readings and never buttons;
there are no slash separators. The root landing shows only Ronin. Both doors consume the
shared `.ui-bar-nav` primitive and both readings consume `.ui-bar-value` from
`docs/ui.md`; a feature must not restyle either.

### The root landing

The bare `/` route is the landing, not a remembered workspace and not a Campaign editor.
It has three loaded doors: Campaign, Coworks and Agents. The large door launches what is
loaded: Campaign opens that Campaign's all-Coworks page; Coworks opens the loaded Cowork;
Agents opens the loaded Agent in its Cowork.

The value chip opens that door's selector. Every row has one star and one explicit action:

| selector | star means | row action | footer |
|---|---|---|---|
| Campaign | load this Campaign and re-home the other defaults | Edit | New Campaign |
| Coworks | load this Cowork | Launch | New Cowork |
| Agents | load this Agent | Launch | New Agent |

A star updates the loaded default and leaves the selector open. A row name loads it and
closes; Edit or Launch acts on that row and closes. A closed selector has no box, height or
stale children. The approved composition is the Campaign Home concept in Ronin Lab; the
live owner is `public/js/campaign-home.js`, never a simplified second interaction.
- **surface head** — the genus for a surface's top row: *tile head*, *commons strip*,
  *column head*. No head carries a flip — a surface gets into a workspace from the selector column, or by drag.

## Where ⚙ puts it

- **On the cowork_space:** into the workspace you are in (the selected one); ⚙ there
  again brings the terminal back. Any workspace can be selected whatever it holds — a
  terminal tile wears `.tile.active`, a commons wears the same ring on its surface.
- **On the parked grid page:** there is no workspace to place it in, so ⚙ is the
  `cowork` destination — the surface at full width — and ⚙ again is the way back.

## Retired

The raw Sessions 1 / 2 / 4 grid and the `session_commons` embedded inside every Tile were
removed on 2026-08-28. A terminal Tile is now only a terminal surface. Roster, Archives,
New Session, Docs and Wipeboard live in the cowork-space surfaces named above.

## What is NOT a workspace surface

- The retired **session_commons** and raw **grid page** are not surfaces or destinations.

## Records

- Implementation of the page as it stands: `docs/team-workspace.md`.
- The Kit's contract: `docs/workspace-kit.md`.
- The cowork commons build-out and its open decisions: `ronin-lab wip/buildouts/COWORK_COMMONS.md`.
