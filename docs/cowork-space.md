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
│  │ terminal_tile:   │ │  │ team name · 人  │ │  │ team_commons: tab strip · T        │  │
│  │ tile head (C)    │ │  │ output selector │ │  │ cowork_commons: tab strip · T      │  │
│  └──────────────────┘ │  └─────────────────┘ │  └────────────────────────────────────┘  │
│                       │  member cards…       │                                          │
│  one workspace_surface│  (click → workspace) │  one workspace_surface                   │
└───────────────────────┴──────────────────────┴──────────────────────────────────────────┘
```

Three kinds of thing, and only three, sit inside the bar:

| kind | what it is | how many |
|---|---|---|
| **workspace** | a slot that holds exactly one `workspace_surface` at a time (`workbench.place`); remembers what it holds per tab | two today (`workspace1`, `workspace2`); the Kit's layout map shows, hides and reorders them |
| **selector column** | a column that PICKS what goes into a workspace; it never holds a surface itself | one today — the **roster** (the team's members as cards; click seats one in a workspace; the 人 pinned hot in workspace 1) |
| **top header** | the bar: brand, the tab's editable view name, the layout map, か New, ⚙, the grid count | one |

## The workspace surfaces — peers, each able to occupy a workspace

| `workspace_surface` | about | its head | what the head holds |
|---|---|---|---|
| **terminal_tile** | one session | **tile head** (`js/tilehead.js`) | the session picker · connection dot · ladder chip · job · branch · output selector · ⛩ · @ · ⚡ · メ · gauge — the unchanged `Tile` head — plus **C** (flip to the commons) appended by the page |
| **team_commons** | one team | **commons strip** — the channel surface's tab strip | Chat · Wipeboard · Docs · Team Configuration, plus **T** (flip back to the terminal) at its right end |
| **cowork_commons** | this install and this owner | **commons strip** — the same tab strip | Machine health · Account · Desk profile · Project roots · Help desk · Keypad (planned — `ronin-lab wip/buildouts/COWORK_COMMONS.md`; today this is the `admin_desk`, an overlay a tile draws, and that overlay retires when the surface lands) |
| *league* | every team | *a strip* | **[planned]** — the League destination re-hung as a surface; not designed here |

Rules that make them peers:

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
  page. Not "terminal seat" — *seat* is a code word in `team-view.js` for the slot's pool
  of tiles and is not a house noun.
- **team_commons** — the team's shared surface. Say *the team commons*.
- **cowork_commons** — the install's shared surface. Say *the cowork commons*. Never
  "the admin desk" once it lands; never "the commons" bare — that is the
  `session_commons` inside a tile, about sessions.
- **selector column** — a column that picks; the **roster** is one.
- **top header** — the bar. Say *the bar*.
- **surface head** — the genus for a surface's top row: *tile head*, *commons strip*,
  *column head*.

## What is NOT a workspace surface

- The **session_commons** (⌂ Roster · ＋ New · ▤ Wipeboard · ▧ Docs) lives INSIDE a tile
  when no session is showing. It is tile-scoped and stays so.
- The **grid page** (1 / 2 / 4 tiles) is the other destination, not a workspace of this
  one — `docs/team-workspace.md` § Two first-class destinations.

## Records

- Implementation of the page as it stands: `docs/team-workspace.md`.
- The Kit's contract: `docs/workspace-kit.md`.
- The cowork commons build-out and its open decisions: `ronin-lab wip/buildouts/COWORK_COMMONS.md`.
