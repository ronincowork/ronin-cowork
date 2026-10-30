# TEAM WORKSPACE — construction contract

> **The page format is the `workbench`** — the team was its first tenant, not its
> definition. The surface map and the names (workspace · selector column · terminal_tile ·
> team_commons · cowork_commons · surface head) are `docs/architecture/cowork-space.md`; this file stays
> the implementation record of the team's use of it.

This is the current contract for the Team destination. It describes what is landed on
`dev`; it is not a speculative redesign brief or a pointer to temporary build-out history.

## Purpose and non-goals

`#/team/:name` is the Team workbench: **two workspaces around the Team's selector.** The
selector holds the Commons, the Agents, New Agent and the hints. Each workspace holds
exactly one thing — a member's full terminal Tile, the Commons (roster · docs · wipeboard ·
messages · cron jobs · configuration), New Agent or an Agent's composition — placed from
the selector by click or drag. The three columns are shown, hidden and reordered from a small **layout map** in the app bar.

Team composes existing Ronin machinery. It does not create a second terminal, Team store,
workspace shell, or control system. Specifically:

- never redraw, restyle, intercept, or reinterpret the Tile header or its controls — the
  one seam that touches a Tile is `createTerminalTileHost({ actions })`;
- never create another transport, composer, output selector, or terminal lifecycle;
- never infer membership from a durable roster — membership is live and session-owned;
- never make Configuration authoritative for membership or leadership; those live in Roster;
- never move Kit layout, splitter, responsive, or persistence behavior into Team.

## Destination boundary

`#/team/:name` is the terminal-bearing cowork-space destination. It closes every Tile
on leave so no transport survives outside the entered destination.

## `#/team/:name` user flow

1. The router enters Team with `name` as the route parameter.
2. Team normalizes tab state through `normalizeWorkbenchState(viewState, declaration)`:
   the column **arrangement** (order · hidden · widths) and the **seats** (what each
   workspace held: a member, or a canonical Workbench surface type).
3. The managed Workbench restores the arrangement; the Kit's layout map in the app bar
   shows it.
4. The shared Team controller refreshes durable and live readings; live members are
   projected from sessions whose tags contain the Team name. Membership stays live
   while the page is open: the events feed pushes on tag and lead changes, and the page
   repaints (seats, cards, configuration) whenever the member set or the 人 changes.
5. Each workspace gets back what it remembered. With nothing remembered, the **人** (the
   designated lead) takes the first empty workspace. A remembered member the roster no longer has
   is waited for while the roster is still arriving, then let go.
6. The selector renders the Commons card, one card per member, and the New Agent card. A member card
   is a **reading**: Agent title, 人, work record chip, status (ready · thinking · awaiting
   input), model, ⛽ context, attached — read off the store's home row: handed over
   on entry, then again each time the server pushes a change. Leaving unsubscribes.
7. **Click a card** and its Tile goes into the workspace last touched; **drag a card** onto a workspace and it
   goes there. Arrow keys walk the cards; Enter picks.
8. The two workspaces are **not connected**: each has its own warm pool of Tiles. The
   same session may be up in both. Cap 2 per workspace (four in all); the lead is pinned
   hot in workspace 1.
9. Leaving, changing Team, losing membership, or destroying closes and destroys every
    Tile of the page. No transport survives outside the entered Team destination.

The Team name is the destination title; the favicon carries the Ronin house identity.
The bar's tab-name field (`tabName` on the view) lets the owner retitle the tab — "what
this tab is for" — since three tabs on one team read the same. Named, the tab reads
`<name> · <team>`; empty means the default, `<team>`.
Persistence is per browser tab (sessionStorage); one tab is one team.

## The page takes instructions (`edges page`)

Everything that changes the page goes through one controller, `arrange(draft)` in
`cowork-view.js`, built by `createArranger` (`team-arrange.js`). The selector cards call it — and so does a **draft** an agent hands in with `edges page`
(`ronin_bin/`, catalogued in `ronin_catalogs/TOOLS.md`). The tool's bare form prints the view (the roster;
each tab on the team; which workspace the owner is typing in; which shows the agent;
what each holds); its other form takes `key=value` words naming only what should
change. The wire is `src/routes/team-page-api.ts`: tabs report their view (`PUT`),
Agents read it (`GET`), and the operator validates a draft (`POST`) before it is
pushed on `/events` as `{t:'team-page'}` to the tab that shows the agent, else every tab
on the team. The server holds no page state. The roster header says who arranged it.

## Membership and durable data

### Live membership

Membership is derived from each live session's `tags`. Team consumes
`membersOfTeam(name)` from the shared Team controller; it keeps no private member array and
does not read a roster `members` field. Membership is many-to-many and session-owned; a
Team may exist from tags alone; removing a tag removes membership without killing the
session. The **人** is a separate, hand-set designation (`leads`), set by the owner in three
places, all through `POST /api/sessions/:name/team_lead`: the member rows
`team-members.js` draws — **Team commons → Roster**, where a pressed row opens in place and
its action bar carries **Make Lead** (the lead's reads *Team Lead*) — and the same rows on
a team's profile on the Coworks page. There is no lead control on a Tile, on the launch
forms, or on the Configuration tab.

### Durable Team record

A `team_roster` is optional metadata: kind, title, purpose, project root,
repositories and their branches, behaviours, the Agent defaults, and `holds`, the ids of
the work items the Team holds. A tag-only Team is ordinary. When no durable record exists,
Team Configuration says so rather than treating the Team as broken.

### Work items

A work item is stored once, one JSON file per id in the `work_items` data store, and only
`src/work-items.ts` reads or writes those files; everything else goes through the
`/api/work-items` routes (`src/routes/work-items-api.ts`), which answer every write with
the item as it now is and the trail line appended. Holding is a list of ids on each holder:
`holds` on the Team roster and in each Agent's letter (`tegami.md`, beside `at.item`, its
focus). The item matches Jira ([Work items](../using-ronin/work-items.md)):
`kind` is the space's work type name and sets `level` (1 Epic, 0 Task/Story/Bug, -1
Subtask), one below the parent at creation or 0 with none, and adding a child never changes
it; `status`, `priority` and a link's type are the space's names (`spaceNames`); `flagged` marks an impediment. Parent is one `parent` id on
the item, or none, which is normal. There is no ladder: Jira has none. Parent is a field:
`item edit --parent` (`editItem` with `parent`) sets parent and level together (no parent
keeps the level). One rule binds a create, a parent change and a level write (`follow`): nothing goes below -1. The item takes its new level and its
children follow, each one below its own parent (`settle` writes them, a trail line each);
if any would land below -1 the act fails with "w39 can't go there." A move under oneself
makes the item its own child, so its levels fall past -1 and it fails the same way. An arrival under a held item queues the holder (or a holding Team's lead) one
message through the message queue. Every item file is in the Jira shape;
`migrateItems` at first start is the one code that converts a store to it. Assign moves an id
between lists and release takes it off every list, under the store's one issuer lock, so
two concurrent assigns leave one holder. An item that comes to or leaves an Agent's list
by anyone else's hand (create with a holder, assign, release) pushes that Agent the
one fixed work-record ack (`ackRecord`, `src/tegami.ts`; owner 2026-10-07); an Agent's own
move is not acked. A move on a Team's list is a roster change and acks its lead. Any other
change to an item by someone else (`appendTrail`) acks its hearers with a line naming the item
and the change, "w64 KAN-27: status In Progress → In Review by jira:x." (`ackHolders`), so a
comment's holder knows to read it. One rule (`hearers`) builds two lists: holders (Agent
holders and each holding Team's lead) hear every change; watchers (the Agents whose letter's
`watches` names the item or one above it) hear status, flag, holder and new-child moves, in a
message naming what they watch. Each list gets its own message; an Agent on both gets both. Every act
names its item, one per Jira item act (`item --help`); the Agent's work record shows the
items it holds, each with its status. `deleteItem` is Jira's delete: the item and its
subtasks go, other children lose the parent, links to it go. Readings are derived in `src/work-items-read.ts` and never stored: an Agent's
(`GET /api/work-items?session=`), a Team's (`?team=`: the Team's holds and its members',
children after parents, plus `boards`: every item under the Team's epics and under the
roots no Team reaches, each whole), and every item (no query), each narrowed by `holder`,
`parent` or `no_parent`. An ending, archived, or Hard
Deleted Agent's holds are released with a `holder-ended` trail line on each item.

**Epic → Teams, one rule** (`boardReadings` in `src/work-items-read.ts`): an epic here is a
root item and every item under it; its Teams come from the holders on the root and on every item
under it, `team:<name>` directly and `agent:<name>` through that Agent's Team tags, so an
Agent in two Teams brings the epic to both. A root nobody's work reaches has no Team. A Team's
`boards` read this rule.

**Team Configuration** (`public/js/team-configuration.js`) is the commons tab that edits
that record and nothing else — never membership or the lead. It is drawn in the same format
as New Agent and New Team (owner, 2026-09-13): the launch forms' numbered steps
(`createStep`), the kit's labelled fields (`createField`), and ERABI at the forms' tight
density. **Step 1 · Team** — one line holding **Team ID** (read, not edited), **Title** and
**Kind** (squares with the shared glyphs), then **Purpose**. **Step 2 · New Agent defaults**
— what the next Agent on this Team starts from, never the Team's own behaviour: **Where it
works** (Born in · Additional workspaces, with a branch line for each checkout), **Mandate**
and **Launch mode**. The model is not a Team's: Models > Defaults sets it. Features and behaviours are not asked on this tab; the
record keeps whatever it has. ERABI takes no foreign DOM: the entries sit beside the stones. The tab repaints only when the saved record changes —
never on a member's status tick or a session coming and going — so an edit in progress is
not thrown away; the Coworks page's copy of the tab keeps the same rule. **Save** PUTs the whole record to
`/api/team-rosters/:name`; keys the tab does not draw are carried, the retired
`agent_defaults.permissions` is not. `tests/team-configuration.test.js` is the floor;
`scripts/smoke-ui.mjs` opens the tab and measures one stone.

## Owned files

- `public/js/cowork-view.js` — the shared cowork-space page: workspaces, selector, placement and lifecycle.
- `public/js/team-arrange.js` — `parseDraft` and `createArranger`: the one parser and
  the one controller; `reportView`, the tab's view to Ronin.
- `public/js/team-terminal-pool.js` — one pool per workspace: warm, hot, cold, pinned,
  prewarm, cap. No renderer, cache, or socket engine.
- `public/js/team-wipeboard.js` — the commons' roster-resolved wipeboard thread.
- `public/js/team-configuration.js` — the Configuration tab: the record's questions as `ask()` specs, and Save.
- `public/css/team-workspace.css` — roster header, cards, configuration.
- `src/routes/team-page-api.ts` — the page's view and drafts; `src/ws/events.ts`
  `broadcastEvent`.
- `ronin_bin/edges page` — the agent's tool.
- `tests/team-terminal-pool.test.js`, `tests/team-arrange.test.js`, `tests/team-configuration.test.js`.
- `docs/architecture/team-workspace.md` — this persistent implementation and resume contract.

Shared seams touched for Team, by authorization: `public/js/terminal-tile-host.js`
(`actions` ride the Tile head), `workspace-tabs.js` (`createTabbedSurface({
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

`public/workspace-kit.css` owns `.wk-workbench-*`, `.wk-layout-*`, `.wk-tabset-*`, the
layout map, and the compact-card rule. `public/css/team-workspace.css` styles Team semantics only: the
roster header, cards, configuration readings, drop targets. It must not
select `.wk-*` internals or restyle `.tile-head`.

## Existing Tile and header contract

Each workspace obtains a terminal through the shared Tile host. Team supplies the session
and workspace lifecycle; it does not rebuild the header or reach into Tile DOM.
`public/js/tile.js` and `public/js/tilehead.js` own the current controls. See
[the tile usage guide](../using-ronin/tile.md) for what the owner sees.

## Lifecycle

Each workspace's pool exists only while the Team destination is entered: a host is created
on the member's first show and kept warm after; cap 2 per workspace; the 人 is pinned in
workspace 1 and kept hot from entry; hovering a card pre-warms it in the workspace the
click would land in. Leaving destroys every host and every empty Tile; re-entry rebuilds
from what the tab remembered.

## Commons tabs

- **Roster** — one line per member (`team-members.js`): 人 and the Agent's title, its live
  reading, a caret. Pressing the row opens it in place to the Agent's read — role, what it
  is working on, the items it holds (`/api/work-items?session=`), then the full configuration
  (the composition body `agent-composition.js` exports, the one body the composition tile
  paints) — all as the launch forms' unnumbered sections: one identity line (role · @id),
  **Work**, **Brief** (born with …), **Mandate** with Save, **Behaviors** with Add — with the
  member action bar (Rename · Make Lead · Remove · Close) under it; pressing again folds it. No
  Launch on a row: dragging a row onto a workspace opens the Agent there, its own tile
  (`session.terminal`), as the Team page's Agent card places it. Agents join a Team by
  dragging, so the foot holds one **New Agent** button, which opens the New Agent form with
  this Team chosen the way the selector's New Agent card does (owner, 2026-10-20).
- **Wipeboard** — the real Team thread and owner composer; the roster's `wipeboard` id or
  the Team name. Entering asks the server for the thread over the socket; the thread and
  every later post arrive by push until the tab is left.
- **Docs** — the Commons' own mdedit pane (`buildDocs`), narrowed to the roster's members;
  a draft `commons:docs:<path>` opens a file here.
- **Messages** — inbound session messages that have not delivered yet; safe
  retries, owner-only Force, and Dismiss share the durable queue described in
  `docs/architecture/message-queue.md`.
- **Configuration** — a compact editor for the durable `team_roster`: its stable
  Cowork ID as a reading, plus editable readable title, purpose and launch defaults. Membership remains on
  Agents and is deliberately absent from this form.
- **Cron jobs** — the Team's scheduled messages (`team-jikan.js`).

### The three headers

A tile's head, the commons' tab strip and the roster's head share one depth, the
`--row-head` token in `style.css` (41px). A tile head wraps rather than clips when its
workspace is squeezed, so every control stays reachable at the workspace floor.

## Verified behavior and commands

the layout map · `dfc627f`/`8d1758b`/`085426b` discrete workspaces, KISS ·
`08c6813` end-to-end review · `272428c` roster readings · `4b42d44` 人 from the tile,
keyboard · `5acb840` `edges page` · `a6819eb` the roster in its view · `041206a`
`+show_file` on the team page · `02f288b` live membership seats and unseats ·
`7c5c619` the head row and Team Configuration finished on measurement.

The surface was verified by Playwright probes against the live page (`scripts/lib/ui-host.mjs`,
`loadPlaywright()`), plus the repo gates (`check-modules`, `check-css`, `check-tests`) and
`scripts/smoke-ui.mjs`.
The designated integrator runs one BYOIN mode on the release candidate; a SKIP is not a pass.

## Known limits

- New Agent opens the New Agent form in the workspace you place it in. The
  born Agent takes that same workspace, in this tab; no new tab opens. If the launch
  receipt carries a desk or lead note, the form stays so the note can be read, and the
  newborn is on the roster one click away (owner ruling 2026-09-08).
- Team Configuration edits roster metadata but never the Cowork ID; that stable address
  is pinned by live Agent membership and lead pointers. Membership itself is still edited
  from roster drag/drop, never stored on the roster.
- No cherry-pick/summary reading on the cards: no service puts such a field on the
  home row.
- The workspace selects the session it shows. The current Tile header displays its
  session name; roster placement and drag/drop change the selection.
- `src/` changes need `ronin-host restart` (`tsx`, no watch); `public/` is live.

## Contributor workflow

Use the [contributor map](../contributor-map.md) and [Agent route](../../AGENTS.md).
Keep implementation changes and their verification with the owning repository.
Buildouts, temporary preview addresses, and session handoffs belong in the creators’ Lab.

## Manual verification

1. Open a rostered `#/team/:name`; confirm the lead's Tile in a workspace, the selector
   beside it, the layout map in the bar.
2. Click the map's rectangles: columns hide and return; drag one past another: columns
   reorder; reload: it holds.
3. Pull each splitter: both workspaces move by the same amount; squeeze the roster: it goes
   to names only.
4. Click a card: its Tile lands in the highlighted workspace; drag a card onto the other:
   it lands there; the same session in both.
5. From a member's shell: `edges page` prints the view; a draft moves the page and the
   roster header says who.
