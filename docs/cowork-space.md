# COWORK SPACE — the surface map

**The page format is the `workbench`.** It was called "the team workspace" while the team was
calling it the team workspace. But to be honest, this is the cowork space"*) because the
page is about to hold surfaces that are not about a team. `#/team/:name` is one address
into it; the League will be another. This page is the one document to point at when two
people need the same word for a part of it. **Every noun here is a KOTOBA row** (§
COWORKSPACE) and a `glossary.*` word the owner's desk profile renders; add a term here and
you add it there in the same commit.

Campaign, Cowork and Team are discovery boundaries, not different formats. Each has one
discovery column whose cards are limited to that scope; every one uses the same surrounding
workspaces, surface placement, drag/drop, arrangement and recall. Say *Campaign discovery
workbench*, *Cowork workbench* or *Team workbench* when the distinction
matters—never “two-workspace Campaign surface.”

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

**Two shapes**: **2** — workspace 1 · selector column · workspace 2, as
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
| **terminal_tile** | one session | **tile head** (`js/tilehead.js`) | ⛩ edit Agent title · View Work Record · output selector · @ · ⚡ · メ. The Torii is first, immediately before the readable title; the permanent session ID does not change. |
| **cowork_commons** | this install and this owner | **Ronin Desk strip** — the same tab strip | Desk (Ronin usage stats) · Account (the desk's rail: Configuration · Appearance · Release & update · Hotwords · Koshi · gbrain · Log out) · Desk profile · Project roots · Archived · Help desk (Mika's door over a reserved chat) · Keypad (the pad's card, inline). The Team roster now lives on the Cowork workbench. |
| **new_session** | one launch | **surface head** — T, then the name | the ＋ New session launcher, placed by ＋ Add team member (roster) or か New (bar), or `workspace1=new`; the newborn lands in that workspace |
| *(blank)* | — | — | an EMPTY workspace says *Workspace* and holds nothing — never a commons by default |
| `campaign_commons` | this campaign | Campaign Commons strip | Campaign · Project roots · Team roster · Templates |

Rules that make them peers:

- **No flip on any head**: the team commons is the FIRST CARD of the
  roster, thinner than a session's, and goes into a workspace like one — click for the
  selected cell, drag onto any cell. The SHINGO light signal sits at the far RIGHT of a
  tile head; the connection dot is gone. The selector column's head reads *Roster: <team>*.
- **A cell owns selection and drops, whatever it holds**: a card dropped on
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

- **workbench** — the format: one discovery column offers surfaces to the
  surrounding workspaces. Campaign, Cowork and Team name only what that column can discover.
  This replaces `cowork_space`, which collided with both Cowork and `coworkspace`.
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

The left side is doors, not a breadcrumb; the middle is one reading:

```text
Ronin  •  Coworks                 Teams                        <verbs>
Ronin  •  Coworks           Your team: Sea Settle              <verbs>
```

`Ronin` and `Coworks` are the only doors, and the root landing shows only Ronin. The
Team's name used to sit beside the Coworks door, where a first-time visitor read it as
one more door and could not tell the all-Teams page from one Team's page. It now sits centred in the bar as **the place**: *Teams* on the Coworks page
(its tooltip says "See all of your teams here"), *Your team: <name>* on a Team page,
italic so it reads as information and never as a button. Doors consume the shared
`.ui-bar-nav` primitive and the place consumes `.ui-bar-place` from `docs/ui.md`; a
feature must not restyle either. `js/workspace-header.js` writes the place; nothing
else does.

### The root landing

The bare `/` route is the landing, not a remembered workspace and not a Campaign editor.
It has three direct doors: Machine Settings, Coworks and New Project. Machine Settings
opens the one Campaign page; Coworks opens the coworkspace; New Project opens launch.
There is no Campaign picker, default star, archive action or New Campaign footer.

The live owner is `public/js/campaign-home.js`.

The Campaign page shows the Campaign's editable identity, desk profile, routines,
defaults and templates. With `MULTIPLE_CAMPAIGNS_ENABLED` off, the client does not render
controls that add, select, default, archive or delete Campaigns. The Campaign API remains
available. The fixed Campaign id is not rendered; its title, description and all other
Campaign content remain editable.
- **surface head** — the genus for a surface's top row: *tile head*, *commons strip*,
  *column head*. No head carries a flip — a surface gets into a workspace from the selector column, or by drag.

## Where ⚙ puts it

- **On a workbench:** into the workspace you are in (the selected one); ⚙ there
  again brings the terminal back. Any workspace can be selected whatever it holds — a
  terminal tile wears `.tile.active`, a commons wears the same ring on its surface.
- **On the parked grid page:** there is no workspace to place it in, so ⚙ is the
  `cowork` destination — the surface at full width — and ⚙ again is the way back.

## Retired

The raw Sessions 1 / 2 / 4 grid and the `session_commons` embedded inside every Tile were
New Session, Docs and Wipeboard live in the cowork-space surfaces named above.

## What is NOT a workspace surface

- The retired **session_commons** and raw **grid page** are not surfaces or destinations.

## Records

- Implementation of the page as it stands: `docs/team-workspace.md`.
- The Kit's contract: `docs/workspace-kit.md`.
- The cowork commons build-out and its open decisions: `ronin-lab wip/buildouts/COWORK_COMMONS.md`.
# Message delivery

Team Commons' **Agent message queue** channel shows inbound session messages that have not
cleared. It is the visible half of the durable delivery flow; see `docs/message-queue.md`.
Delivered messages disappear, while stuck and failed messages offer **Try Again**,
**Force**, and **Dismiss**.
