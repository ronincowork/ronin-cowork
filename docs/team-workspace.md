# TEAM WORKSPACE — current implementation and resume contract

This is the current README for the Team destination. It records what is landed on `dev`,
which contracts Team consumes, what was verified, and the exact place to resume. It is not
a speculative redesign brief.

## Purpose and non-goals

`#/team/:name` is the Team-oriented workbench: one focused session Tile, a Kanban of the
Team's live sessions, and a Channel Surface for Team services.

Team composes existing Ronin machinery. It does not create a second terminal, Team store,
workspace shell, or control system. Specifically:

- never redraw, restyle, intercept, or reinterpret the Tile header or its controls;
- never create another transport, composer, output selector, or terminal lifecycle;
- never infer membership from a durable roster—membership is live and session-owned;
- never improvise a Chat protocol—Chat is reserved, empty, and inert;
- never make Team Configuration authoritative for membership or leadership;
- never move Kit layout, collapse, resize, responsive, or persistence behavior into Team;
- never replace or narrow the existing Sessions destination.

## Two first-class destinations

Team and Sessions are deliberately separate first-class destinations:

- **Team:** `#/team/:name` — one focused Tile beside Kanban and Channel services.
- **Sessions:** the existing raw **1 / 2 / 4 Tile grid** — the familiar unrestricted
  coworkspace of complete Tiles.

The Sessions grid is not a compatibility shim and is not a mode inside Team. Preserve its
raw Tile composition, full controls, session pickers, layout choices, and behavior. Team
work must not scope, wrap, replace, or retire it.

## `#/team/:name` user flow

1. The router enters Team with `name` as the route parameter.
2. Team normalizes tab state through `teamWorkspaceState()`.
3. Managed WorkbenchLayout restores widths and collapsed Surfaces from that state.
4. The shared Team controller refreshes durable and live readings.
5. Live members are projected from sessions whose tags contain the Team name.
6. Kanban renders one card per member and an inert `＋ Add team member` card.
7. Team creates one full existing terminal host per live member and opens each member once;
   all but the focused host remain warm and hidden.
8. If persisted `focusedSession` is still a member, its host is revealed; otherwise every
   host stays hidden behind the honest empty placeholder.
9. Selecting a card hides the old host and reveals/focuses the selected warm host. It does
   not close, reset, or reopen transport.
10. Leaving, changing Team, losing membership, or destroying closes and destroys every
    affected pooled host. No warm transport survives outside the entered Team destination.

The Team name is the destination title; the workspace shell adds the Ronin house title.

## Membership and durable data

### Live membership

Membership is derived from each live session's `tags`. Team consumes
`membersOfTeam(name)` from the shared Team controller; it keeps no private member array and
does not read a roster `members` field.

This preserves the domain contract:

- membership is many-to-many and session-owned;
- one session may belong to several Teams;
- a Team may exist from tags alone;
- removing a tag removes membership without killing the session;
- joining, leaving, or dying is reflected from the shared live reading.

### Durable Team record

A `team_roster` is optional metadata: Team role, objective, project root, repositories,
branch, wipeboard, and state. A tag-only Team is ordinary. When no durable record exists,
Team Configuration says so rather than treating the Team as broken.

Team Configuration is currently read-only. It never writes `members` or `team_lead` into
durable metadata.

## Owned files

- `public/js/team-view.js` — Team composition, readings, Kanban selection, and lifecycle.
- `public/js/team-terminal-pool.js` — page-lifetime orchestration of existing full Kit
  terminal hosts; it contains no renderer, cache, or socket engine.
- `public/js/team-wipeboard.js` — the Team Channel's roster-resolved wipeboard thread,
  owner composer, entered-only poll, and service lifecycle.
- `public/css/team-workspace.css` — Team-specific Kanban, notice, placeholder, and
  configuration presentation.
- `tests/team-terminal-pool.test.js` — scoped proof of warm revisits and complete cleanup.
- `docs/team-workspace.md` — this persistent implementation and resume contract.

Registration in `public/js/main.js` and the stylesheet link in `public/index.html` are
shared integration seams. Do not edit them as Team-only cleanup.

## Workspace Kit contract

Team consumes the single `WorkspaceKit` namespace and does not import Kit implementation
modules directly.

### Managed WorkbenchLayout

```js
createWorkbenchLayout(terminalTile.el, kanban.el, channels.el, {
  managed: true,
  onStateChange: (state) => ctx?.patchState(state),
})
```

Append `workbench.host`, not its inner layout element. On every entry normalize with
`teamWorkspaceState(context.state)` and call `workbench.restore(typed)`.

The managed Kit owns:

- outer host and desktop geometry;
- responsive phone composition;
- collapse controls and expand rails;
- left and right splitters;
- pointer capture and listener teardown;
- keyboard resizing;
- width bounds and resolved widths;
- collapsed-state snapshots and `onStateChange` notification.

Team must not add raw rail buttons, collapse lookalikes, splitters, pointer handlers, local
width state, direct `setCollapsed` persistence, or responsive workbench CSS.

### CSS boundary

`public/workspace-kit.css` owns `.wk-workbench-*`, `.wk-layout-*`, Surface-control chrome,
splitters, rails, geometry, and responsive behavior.

`public/css/team-workspace.css` may style only Team semantics: Kanban contents, notices,
configuration readings, and the empty terminal placeholder. It must not restyle
`.tile-head`, Tile controls, managed workbench controls, or shared Kit primitives.

## Existing Tile and header contract

The focused terminal is obtained only through:

```js
createTerminalTileHost({ mode: 'full' })
```

Full mode instantiates the existing `Tile` unchanged, retaining its genuine:

- connection status, session picker, SHINGO ladder, role mark, and branch reading;
- ⛩ Torii/Commons, mentions, ⚡ macros, and メ more control;
- output/lock, Teams, context, Control, Docs, Note, and kill controls;
- terminal, tape views, composer, focus, resize observer, and transport.

Kanban selects among already-open hosts. It may not reach into Tile DOM, synthesize
controls, constrain the genuine picker, or intercept Torii. The picker remains global and
keeps its ordinary existing behavior.

## Lifecycle

The warm pool exists only while one Team destination is entered:

- reconcile one `createTerminalTileHost({ mode: 'full' })` host per live Team member;
- open each host against its member exactly once, then hide non-focused wrappers;
- on Kanban selection, reveal, fit, and focus the existing host without `switchSession`;
- when a member leaves, immediately destroy that member's host and wrapper;
- before changing Team or leaving, destroy the entire pool;
- on view destruction, unsubscribe and destroy the pool again idempotently.

Each host still owns its unchanged Tile socket, reconnect behavior, xterm/tape renderers,
composer, fitting, observers, timers, focus, and teardown. The pool owns only membership
and visibility; it implements no renderer, cache, protocol, or socket.

### Large-Team cost

Warm revisits trade memory and concurrent transport for latency. A Team with **N live
members** holds **N full Tiles and N viewer transports** while entered, including each
Tile's xterm/tape state, observer, header, and any legitimate output timer. Creation and
teardown are O(N); switching is O(N) DOM visibility work with no transport reopen. Cost
drops to zero pooled hosts immediately on leave or Team change. Never make the pool global
or preserve it across destinations.

## Channel Surface

- **Chat** — reserved, empty, inert; no fetch, timer, socket, composer, or fallback.
- **Wipeboard** — the real Team thread and owner composer. It resolves the roster's
  `wipeboard` id, falling back to the Team name for a tag-only Team; opening materializes
  the Team board when absent. It polls every two seconds only while entered, preserves
  typed text on a failed post, interrupts all members for an owner post through the
  server's dial-governed fan-out, and never renders the Brief.
- **Docs** — placeholder for Team working documents.
- **Team Configuration** — read-only durable metadata and derived live roster.

Channel tab/service lifecycle belongs to the Kit Channel Surface. Team supplies service
content objects only.

## Verified behavior and commands

The current chain landed as:

- `dbc03c2` — Team workbench destination, geometry, and shells.
- `47cb962` — repaired the original feature-owned hidden contract.
- `09f579c` — replaced disabled Tile-control lookalikes with the complete existing Tile.
- `092ddfc` — released managed Team workbench controls in Workspace Kit.
- `ab659d7` — migrated Team to the managed workbench contract.
- `bfeb772` — replaced card-driven transport resets with the page-lifetime warm host pool.
- `3881c96` — made opening a Team board materialize its real empty thread when absent.
- `7330d50` — replaced the Wipeboard placeholder with the entered-only thread/composer.

For `ab659d7`, the declared rendered verification ran once:

```text
bin/ronin-byoin --ui
BYOIN: the repo is clean (19 ok, 0 skipped).
```

Both `smoke-ui` and `visual-ui` ran and passed. The push hook then ran:

```text
bin/ronin-byoin --gates
BYOIN: the repo is clean (17 ok, 2 skipped).
```

The two fast-tier skips were its browser checks by definition; the separate UI run had
already executed them. That is historical evidence, not the current dev cadence. Future
Team legs use direct dogfood and scoped diagnosis; the designated integrator runs one
appropriate BYOIN mode on the exact release candidate. A SKIP remains unverified.

The warm-pool change carries scoped evidence in `tests/team-terminal-pool.test.js`:
repeated card revisits do not reopen transport, while membership loss and page cleanup
destroy and remove every affected host exactly once. BYOIN is not run for this dev leg.

Final retirement audit on 2026-08-25 checked current `dev` at `5358577` against the shipped
Team modules and this document. The scoped command was:

```text
node --test tests/team-terminal-pool.test.js
2 passed, 0 failed, 0 skipped
```

No candidate-wide BYOIN was run: this audit is not the dev-to-master release boundary.

## Known limits

- This remains a preview slice, not the complete Team product.
- Richer reviewed SessionCard readings are incomplete.
- `＋ Add team member` is intentionally inert.
- Docs remains a placeholder here.
- Team Configuration is read-only; creation, editing, membership mutation, and lead changes
  are not implemented.
- Chat is intentionally empty, not an invitation to improvise.
- There is no Team-scoped 1/2/4 mode. Sessions retains its separate raw 1/2/4 grid.
- The full hosted Tile keeps its global picker; switching to a non-member is existing Tile
  behavior and must not be silently narrowed in Team code.
- Historical source comments may describe the first preview; this README is the current
  resume contract.

## Exact resume checklist

Before changing Team:

1. Confirm the branch is `dev`; never act on `master` without a fresh owner instruction.
2. Read current `docs/test-protocols.md` and this file completely.
3. Inspect `git status`; preserve all unrelated shared-worktree changes.
4. Inspect current `WorkspaceKit` exports and managed WorkbenchLayout; do not trust an old
   plan description.
5. Verify Team membership is still derived from session tags in the shared controller.
6. Name one bounded missing Team behavior; do not combine it with foundation cleanup.
7. If it needs a new Kit primitive, shared CSS, Tile, backend, League, New Team, or Sessions
   change, stop for the responsible owner's reviewed contract.

While implementing:

8. Edit Team-owned files only unless a shared seam is explicitly authorized.
9. Keep `createTerminalTileHost({ mode: 'full' })` and the genuine Tile unchanged.
10. Let Kanban selection reveal/focus only an existing pooled host; never reopen it.
11. Keep layout, collapse, rails, splitters, responsiveness, and snapshots in managed Kit.
12. Keep membership derived from tags through the shared Team controller.
13. Preserve the separate Sessions 1/2/4 raw Tile-grid destination.

Before reporting completion:

14. Confirm the diff contains no unrelated path.
15. Record direct dogfood and scoped diagnostic evidence; do not run BYOIN in the dev loop.
16. Leave the one candidate-wide BYOIN verdict to the designated integrator.
17. If landing is authorized, stage only owned paths, inspect the staged path list, commit
    and push only `dev`. Documentation-only work does not itself authorize git writes.

## Exact dogfood checklist

Use the current checkout, not another serving tree:

1. Open a rostered `#/team/:name`; confirm title and three Surfaces.
2. Open a tag-only Team; confirm members render and Configuration says no roster exists.
3. Select each member, revisit earlier cards, and confirm terminal state returns immediately
   without reconnect/reset delay.
4. Exercise the genuine picker, Torii, macros, output/lock, Teams, context, Control, Docs,
   Note, more/kill, terminal, and composer; confirm none is a Team imitation.
5. Collapse and reopen all three Surfaces using Kit controls.
6. Resize both edges by pointer and keyboard; reload and confirm state restoration.
7. Repeat at phone width; confirm Kit responsive composition and no desktop splitters.
8. Navigate away and back repeatedly; confirm the old pool closes completely and exactly
   one fresh host per current member opens on re-entry.
9. Remove a member's Team tag or end it; confirm that host is destroyed immediately and a
   focused removal returns to the honest placeholder.
10. Open Chat; confirm it is empty and inert.
11. Open Sessions and exercise raw 1/2/4 Tile layouts; confirm Team did not alter them.
12. Finish with scoped rendered evidence; the designated integrator owns candidate BYOIN.

If a journey requires Team to reproduce Kit or Tile behavior, stop. That is a missing
shared contract, not permission for a local repair.
