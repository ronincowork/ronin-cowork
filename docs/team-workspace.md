# TEAM WORKSPACE — current implementation and resume contract

> **The page format is the `workbench`** — the team was its first tenant, not its
> definition. The surface map and the names (workspace · selector column · terminal_tile ·
> team_commons · cowork_commons · surface head) are `docs/cowork-space.md`; this file stays
> the implementation record of the team's use of it.

This is the current README for the Team destination. It records what is landed on `dev`
as of 2026-08-26, which contracts Team consumes, what was verified, and the exact place to
resume. It is not a speculative redesign brief. The history of how it got here — the
rulings, the measurements, the traps — is `wip/buildouts/TEAM_WORKBENCH.md`.

## Purpose and non-goals

`#/team/:name` is the Team workbench: **two workspaces around the Team roster.** Each
workspace holds exactly one thing — a member's full terminal Tile, or the Team commons
(chat · wipeboard · docs · configuration) — and trades between them with one button in
its header row: **C** on a Tile's head, **T** on the commons' tab strip. The three
columns are shown, hidden and reordered from a small **layout map** in the app bar.

Team composes existing Ronin machinery. It does not create a second terminal, Team store,
workspace shell, or control system. Specifically:

- never redraw, restyle, intercept, or reinterpret the Tile header or its controls — the
  one seam that touches a Tile is `createTerminalTileHost({ actions })`;
- never create another transport, composer, output selector, or terminal lifecycle;
- never infer membership from a durable roster — membership is live and session-owned;
- never improvise a Chat protocol — Chat is reserved, empty, and inert;
- never make Team Configuration authoritative for membership or leadership;
- never move Kit layout, splitter, responsive, or persistence behavior into Team;
- never replace or narrow the existing Sessions destination.

## Destination boundary

`#/team/:name` is the terminal-bearing cowork-space destination. The former raw Sessions
1 / 2 / 4 grid was retired on 2026-08-28. Team still builds Tiles lazily and destroys every
one on leave so no transport survives outside the entered destination.

## `#/team/:name` user flow

1. The router enters Team with `name` as the route parameter.
2. Team normalizes tab state through `teamWorkspaceState(state, viewState, declaration)`:
   the column **arrangement** (order · hidden · widths) and the **seats** (what each
   workspace held: a member, or `@commons`).
3. The managed Workbench restores the arrangement; the Kit's layout map in the app bar
   shows it.
4. The shared Team controller refreshes durable and live readings; live members are
   projected from sessions whose tags contain the Team name. Membership stays live
   while the page is open: the events feed pushes on tag and lead changes, and the page
   repaints (seats, cards, configuration) whenever the member set or the 人 changes.
5. Each workspace gets back what it remembered. With nothing remembered: the **人** (the
   designated lead) left, the commons right. A remembered member the roster no longer has
   is waited for while the roster is still arriving, then let go.
6. The roster renders one card per member and an inert `＋ Add team member` card. A card
   is a **reading**: session role, 人, SHINGO chip, status (ready · thinking · awaiting
   input), model, ⛽ context, attached — read off `/api/home`'s row on entry and every 5s.
7. **Click a card** and its Tile goes into the workspace last touched (the one carrying
   the Sessions grid's `.tile.active` highlight); **drag a card** onto a workspace and it
   goes there. Arrow keys walk the cards; Enter picks.
8. **C** on a Tile's head trades the commons into that workspace; **T** on the commons
   trades the terminal back. A workspace with no member seated shows an empty Tile —
   head row and C, no session — never a blank box.
9. The two workspaces are **not connected**: each has its own warm pool of Tiles. The
   same session may be up in both. Cap 2 per workspace (four in all); the lead is pinned
   hot in workspace 1.
10. Leaving, changing Team, losing membership, or destroying closes and destroys every
    Tile of the page. No transport survives outside the entered Team destination.

The Team name is the destination title; the workspace shell adds the Ronin house title.
The bar's tab-name field (`tabName` on the view) lets the owner retitle the tab — "what
this tab is for" — since three tabs on one team read the same. Named, the tab reads
`<name> · <team>` with no house word; empty means the default, `<team> · Ronin`.
Persistence is per browser tab (sessionStorage); one tab is one team.

## The page takes instructions (`tejun-teampage`)

Everything that changes the page goes through one controller, `arrange(draft)` in
`cowork-view.js`, built by `createArranger` (`team-arrange.js`). The C/T buttons and the
roster cards call it — and so does a **draft** an agent hands in with `tejun-teampage`
(`ronin_bin/`, catalogued in `ronin_catalogs/TOOLS.md`; actions `team-page-read` and
`team-page-draft` in `ACTIONS.md`). The tool's bare form prints the view (the roster;
each tab on the team; which workspace the owner is typing in; which shows the agent;
what each holds); its other form takes `key=value` words naming only what should
change. The wire is `src/routes/team-page-api.ts`: tabs report their view (`PUT`),
agents read it (`GET`), and a draft (`POST`) is key-, dial- and membership-checked, then
pushed on `/events` as `{t:'team-page'}` to the tab that shows the agent, else every tab
on the team. The server holds no page state. The roster header says who arranged it.

## Membership and durable data

### Live membership

Membership is derived from each live session's `tags`. Team consumes
`membersOfTeam(name)` from the shared Team controller; it keeps no private member array and
does not read a roster `members` field. Membership is many-to-many and session-owned; a
Team may exist from tags alone; removing a tag removes membership without killing the
session. The **人** is a separate, hand-set designation (`leads`), toggled from any Tile's
job menu ("人 make team lead" / "step down") through `POST /api/sessions/:name/team_lead`.

### Durable Team record

A `team_roster` is optional metadata: Team role, objective, project root, repositories,
branch, wipeboard, and state. A tag-only Team is ordinary. When no durable record exists,
Team Configuration says so rather than treating the Team as broken. Team Configuration is
read-only.

## Owned files

- `public/js/cowork-view.js` — the shared cowork-space page: workspaces, selector, placement and lifecycle.
- `public/js/team-arrange.js` — `parseDraft` and `createArranger`: the one parser and
  the one controller; `reportView`, the tab's view to Ronin.
- `public/js/team-terminal-pool.js` — one pool per workspace: warm, hot, cold, pinned,
  prewarm, cap. No renderer, cache, or socket engine.
- `public/js/team-wipeboard.js` — the commons' roster-resolved wipeboard thread.
- `public/css/team-workspace.css` — roster header, cards, flip button, configuration.
- `src/routes/team-page-api.ts` — the page's view and drafts; `src/ws/events.ts`
  `broadcastEvent`.
- `ronin_bin/tejun-teampage` — the agent's tool.
- `tests/team-terminal-pool.test.js`, `tests/team-arrange.test.js`.
- `docs/team-workspace.md` — this persistent implementation and resume contract.

Shared seams touched for Team, by authorization: `public/js/terminal-tile-host.js`
(`actions` ride the Tile head), `workspace-primitives.js` (`createChannelSurface({
actions })`, `current()`), and `events.js` (`teamPageHandlers`). Team leadership is
managed from the roster; the terminal head does not edit the session's role.

## Workspace Kit contract

Team consumes the single `WorkspaceKit` namespace and does not import Kit implementation
modules directly.

### The one managed Workbench

```js
WorkspaceKit.workbench.create({
  profile: 'team',
  tenant: { kind: 'team', team: () => team },
  environment,
  defaultNode: (workspace) => terminalSeats[workspace].el,
})
```

Append `workbench.host`. Expose `workbench.arrangement` on the registered view so the
ViewHost draws the layout map in the bar. `workbench.place(type, workspace, detail)` asks
the active profile and shared library for an independent surface instance.

The managed Kit owns: slot geometry and DOM order; the layout map (show/hide/reorder);
one splitter between each visible pair, symmetric; `data-width="compact"` on a slot
under its declared threshold (the roster's cards drop to names); responsive phone
stacking; the arrangement's snapshot and `restore`. Team supplies tenant context and the
terminal default node only; it never declares slots, selector DOM, rails, splitters,
pointer handlers, width state, or geometry CSS.

### CSS boundary

`public/workspace-kit.css` owns `.wk-workbench-*`, `.wk-layout-*`, the layout map, and
the compact-card rule. `public/css/team-workspace.css` styles Team semantics only: the
roster header, cards, the C/T button, configuration readings, drop targets. It must not
select `.wk-*` internals or restyle `.tile-head`.

## Existing Tile and header contract

A workspace's terminal is obtained only through
`createTerminalTileHost({ mode: 'full' })` (the C flip was retired 2026-08-28). Full mode
instantiates the existing `Tile` unchanged — picker, SHINGO ladder, role mark, branch
reading, ⛩, @, ⚡, メ, output selector, dials, terminal, tape, composer — and appends the
given actions to its own head row. Team never reaches into Tile DOM.

## Lifecycle

Each workspace's pool exists only while the Team destination is entered: a host is created
on the member's first show and kept warm after; cap 2 per workspace; the 人 is pinned in
workspace 1 and kept hot from entry; hovering a card pre-warms it in the workspace the
click would land in. Leaving destroys every host and every empty Tile; re-entry rebuilds
from what the tab remembered.

## Channel Surface

- **Chat** — reserved, empty, inert.
- **Wipeboard** — the real Team thread and owner composer; the roster's `wipeboard` id or
  the Team name; polled only while entered.
- **Docs** — the Commons' own mdedit pane (`buildDocs`), narrowed to the roster's members;
  a draft `commons:docs:<path>` opens a file here.
- **Agent Message Queue** — inbound session messages that have not delivered yet; safe
  retries, owner-only Force, and Dismiss share the durable queue described in
  `docs/message-queue.md`.
- **Team Configuration** — a compact editor for the durable `team_roster`: its stable
  Cowork ID as a reading, plus editable readable title, purpose and launch defaults. Membership remains on
  Agents and is deliberately absent from this form.

The tab strip carries **T** at its right end through `createChannelSurface({ actions })`.

### The three headers

A tile's head, the commons' tab strip and the roster's head share one depth, the
`--row-head` token in `style.css` (41px). **C** on a tile head is sized by the head's own
button rule, like ⛩ @ ⚡ メ; C and T were retired on 2026-08-28 — the team commons is a roster card.
A tile head wraps rather than clips when its workspace is squeezed, so the picker stays
readable and every control — C included — stays reachable at the workspace floor.

## Verified behavior and commands

The chain through 2026-08-25/26 (all on `dev`, PR #34): `e291c6d` slot arrangement and
the layout map · `dfc627f`/`8d1758b`/`085426b` discrete workspaces, C/T, KISS ·
`08c6813` end-to-end review · `272428c` roster readings · `4b42d44` 人 from the tile,
keyboard · `5acb840` `tejun-teampage` · `a6819eb` the roster in its view · `041206a`
`+show_file` on the team page · `02f288b` live membership seats and unseats ·
`7c5c619` the head row and Team Configuration finished on measurement.

Every leg was verified by a playwright probe against the live page (`scripts/lib/ui-host.mjs`,
`loadPlaywright()`), recorded in `wip/buildouts/TEAM_WORKBENCH.md` under each LANDED
section, plus the repo gates (`check-modules`, `check-workspace-kit`, `check-css`,
`check-dead`, `check-docs`, `check-tests` — 248 unit tests) and `scripts/smoke-ui.mjs`.
The designated integrator runs one BYOIN mode on the release candidate; a SKIP is not a pass.

## Known limits

- `＋ Add team member` is intentionally inert.
- Team Configuration edits roster metadata but never the Cowork ID; that stable address
  is pinned by live Agent membership and lead pointers. Membership itself is still edited
  from roster drag/drop, never stored on the roster.
- Chat is intentionally empty.
- No cherry-pick/summary reading on the cards: no service puts such a field on the
  `/api/home` row.
- There is no Team-scoped 1/2/4 mode. Sessions retains its separate raw grid.
- The hosted Tile keeps its global picker; switching it to a non-member is existing Tile
  behavior.
- `src/` changes need `tejun-machine-restart` (`tsx`, no watch); `public/` is live.

## Exact resume checklist

1. Work at your repo desk (`ronin_session_boot/assignment/DESK_CONTRACT.md`); never act on
   `master` without a fresh owner instruction.
2. Read `wip/buildouts/TEAM_WORKBENCH.md` (HANDOFF first), this file, and `docs/workspace-kit.md`.
3. Inspect `git status`; in a shared checkout, preserve unrelated changes.
4. Name one bounded behavior; if it needs a new Kit primitive, Tile change, or backend
   contract, stop for the owner.
5. Route every change to the page through `arrange()`; never a second path.
6. Keep Tiles lazy and destroyed on `leave()`; keep membership derived from tags; keep the
   Sessions 1/2/4 grid untouched.
7. Verify by probe, then scoped diagnostics; stage only owned paths; commit as you go at
   your desk and hand in when the work is coherent for the team.

## Exact dogfood checklist

1. Open a rostered `#/team/:name`; confirm the lead's Tile left, the commons right, the
   roster between, the layout map in the bar.
2. Click the map's rectangles: columns hide and return; drag one past another: columns
   reorder; reload: it holds.
3. Pull each splitter: both workspaces move by the same amount; squeeze the roster: it goes
   to names only.
4. Click a card: its Tile lands in the highlighted workspace; drag a card onto the other:
   it lands there; the same session in both.
5. C on a Tile: the commons trades in; T: the terminal trades back with its session.
6. From a member's shell: `tejun-teampage` prints the view; a draft moves the page and the
   roster header says who.
7. Open Sessions and exercise raw 1/2/4 layouts; confirm exactly four Tiles.
