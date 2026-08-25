# TEAM WORKBENCH — the handoff

> **Written for the agent who picks this up.** Everything found while working the team
> page in Aug 2026 is here: the cost model, the rulings, the landed state, the plan, and
> the traps. The standing account of what exists is `docs/team-workspace.md`; this page
> is the work that remains plus the knowledge that should not have to be rediscovered.
> One home, this file — the owner has ruled against copies.
>
> By `@wipeboard_refactor`, last updated 2026-08-25, `dev` @ `eb122b3` (default-tab
> lines corrected after `8837ae5`; the lead has been hot from page entry since `b3fb096`).

## Goal — the owner's words (2026-08-25)

**The default, in the owner's own restatement (2026-08-25, in this file):** three
columns, and every one of them can be reordered, swapped and resized.

| Column | Holds |
|---|---|
| **workspace 1** | a terminal tile, OR the team_commons (chat · wipeboard · docs) |
| **the action column** (name open — T6) | the team roster · the new-session builder · whatever else acts on the team |
| **workspace 2** | same menu as workspace 1 |

("terminal_tile" is the owner's working word; KOTOBA's term is **tile**, and a tile
showing a terminal is what the Kit calls the `terminalTile` surface.)

Earlier, spoken: "Probably, ideally, I would have a left-side terminal and a right-side
terminal, and the middle would be the roster. On one or the other of the terminals, I
could turn it over to the whiteboard or the docs or whatever … I would always have,
regardless of what's showing, at least two teams hot … The team manager is always hot,
regardless."


> On architecture: "we have three surfaces, and we can just mix and match those
> surfaces … plug and play the particular type of service that we want to show up on
> that surface. I don't want to hack on these UI changes."
>
> On locked/unlocked: "Don't touch that. Currently, unlocked is not beautiful … It's
> just a question that when we can get rireki really firing, it will unlock a lot of
> speed for us."

## THE COST MODEL — learn this before touching anything

**The cap, in one line (owner, 2026-08-25): four hot seats — the team_lead always, plus
the next three by last use.** That is what the landed bench below implements; T4 is
therefore closed.

**Every streaming tile is: one websocket + one tmux VIEWER SESSION (`grid_*`) + one live
`tmux attach` process on a pty, server-side** (`src/ws/pty.ts` — `createViewer` then
`pty.spawn('tmux', ['attach', …])`), plus an xterm parsing the stream client-side.
Closing the websocket frees all of it (`cleanup()` kills the pty and the viewer).
Reattach costs ~200ms and tmux repaints the live screen immediately.

Locked vs unlocked: tiles are born **locked** on desktop (`S.locked = !IS_TOUCH`,
`public/js/state.js`) — the expensive kind above. The **unlocked/tape** path
(`mode=stream` in pty.ts) is RIREKI's file-follow: **no tmux process, no viewer, no
pty** — radically cheaper per tile, held back only by fidelity (owner's ruling: hold
until unlocked matches locked; then it unlocks walls of cheap tiles).

**The roster card is a reading, not a label** (owner, 2026-08-25): each card should carry
SHINGO, the model, ready/busy, whether the session is taken, and — once RIREKI is firing —
its cherry_pick or summary. Today's card is name + role. That is leg 6.

Never guess at browser behavior — **measure**. `scripts/lib/ui-host.mjs` exports
`loadPlaywright()`; a ten-line probe against the live page (getBoundingClientRect,
scrollTop round-trips) settled in minutes what three theory-driven "fixes" did not.

## LANDED — the state a successor inherits (all on `dev`)

**The hot bench** (`public/js/team-terminal-pool.js`, 10 tests in
`tests/team-terminal-pool.test.js`):
- Seats are free: page entry mounts nothing; first show mounts; **warmth is durable** —
  no clock ever parks a shown tile (owner overruled a 25s grace: toggled members stay
  hot).
- **Every `team_lead` is PINNED and HOT FROM ENTRY** — `keepHot()` mounts each lead
  hidden the moment the page opens (entry, re-entry, and roster change all re-ensure
  it); nothing but membership loss or page exit parks a pin. The lead's Tile is also
  the default focused session when nothing is restored. NOTE: this keys off the 人
  designation (`@ronin-lead`), which is hand-set — a team with no designated lead has
  no always-hot member, which is exactly how the owner first met it (2026-08-25;
  five-eyes had none, view_mgr was then designated via
  `POST /api/sessions/:name/team_lead {"teams":[…]}` as the test fixture).
- **Stream cap 4** (hot+warm together): at the cap the least-recently-shown UNPINNED
  tile *parks* (transport closed, seat and painted DOM kept); nothing is destroyed for
  the cap; the cap yields if only pins/visible remain.
- Hover ~150ms **prewarms** a card's tile hidden; unclaimed prewarms are collected by a
  ~25s grace — the only thing the clock still does. Prewarm declines at the cap.
- The arithmetic: 2 visible + pinned lead + 1 warm partner = 4.

**The board slice** (`public/js/team-wipeboard.js`): thread + owner composer, board id
resolved from the roster (`roster.wipeboard || team name`), server creates the board on
open. First load full, every poll a `?since=` delta (usually empty), one request in
flight, append-only rendering, scroll never yanked unless pinned at bottom. An **empty
board is normal** — posts clear after 48 hours (TTL only, owner 2026-08-25: read-reaping
dropped so the board holds the same history for everyone and scroll-back works); that is
the wipeboard transport working, not a bug.

**Layout truths bought with pain:**
- `.wk-layout-surface` (the wrapper between a Kit layout grid and a surface) now makes
  **surfaces fill their slots** (column flex + `flex:1 1 auto; min-height:0` on the
  surface). Before, every surface was auto-height and a long one was CLIPPED by the
  layout's `overflow:hidden` — the unscrollable-wipeboard bug, twice misdiagnosed.
- `.wk-workbench-layout` (the grid) carries `grid-template-rows: minmax(0, 1fr)`.
- The **managed** workbench wraps the grid in `.wk-workbench-host` (workspace-kit.css) —
  probes that select `.tw-view > *` get the HOST, not the grid.
- The channel surface prepends its tab strip to `surface.el`, OUTSIDE
  `.wk-surface-content`; the panels live inside content, which is a column flex.
- `createChannelSurface`'s unqualified default tab is **'chat', which is reserved and
  deliberately empty** — always pass `selected`. The team page passes `'chat'` explicitly
  (owner, 2026-08-25, `8837ae5`: "I don't want to land on the whiteboard … I know to
  check the whiteboard tab"). An empty chat on entry is the ruling, not the fallback.

**In simple terms, what was wrong with the layouts** (answering the owner's question):
two things. The one that is FIXED — the Kit put each pane in a fixed-height box and let a
long pane get cut off instead of scrolling, so the wipeboard looked frozen; the fix makes
every pane fill its column and scroll inside it. The one that REMAINS — the three columns
have their jobs hard-wired (left is always a terminal, middle always the roster, right
always the commons), so nothing can be swapped or moved. Leg 1 exists to remove that
wiring; the bullets above are the traps for whoever does it.

**Server lessons that keep the page fast** (`src/routes/wipeboards-api.ts`,
`src/tmux.ts`): the dial and the durable key ride `listSessions`' single tmux exec
(fields on the list format — never one subprocess per member; that was the 2.9s GET);
the board sweep is throttled to once per 45s per board.

## THE PLAN — three slots, plug and play

**Default landing (RULED):** left = the team lead's terminal · middle = the roster ·
right = the **team_commons** (wipeboard · docs · team configuration; named by the owner,
KOTOBA row exists).

**The architecture rule — how "no hacking" is enforced:**
- **The Kit owns the frame.** Slot geometry, surface↔slot assignment, moving, collapse,
  persistence — a general *slot arrangement* capability in the Workspace Kit. Nothing in
  it knows the word "team".
- **Features supply surfaces.** The team page becomes a declaration: three surface
  factories (terminal seat · roster · team_commons) + a default arrangement. Content and
  policy only; zero geometry.
- **The test of non-hackery:** any other destination could adopt the slot machinery
  without touching team code, AND the team page could show the commons on the LEFT
  purely by changing its declared default. If either is untrue, the cut does not land.

**The control — a layout map in the app bar, not chevrons (owner, 2026-08-25):** "Carets
suck and take up valuable real estate. For workspace one it's an entire row by itself."
Today each column carries its own collapse rail — a `«` row above the left tile, a `^` on
the roster, a `»` on the commons — and the left one costs a whole row of terminal.
Instead: **one small drawing of the workspace in the header — three little rectangles,
left · middle · right. Each is a toggle: click it off and that column is gone, click it
on and it is back; all three on is the full bench.** Reordering is done *in the map* —
drag a rectangle past another and the real columns swap. The map is the slot arrangement
made visible, so it is Kit-owned and shows whatever N slots the destination declared;
nothing in it knows the word "team". The column splitters stay for resizing (they sit
between columns and cost no row). The chevron rails go.

*Why drag in the map and not the columns* (the owner asked which is easier): the map
is easier and it is enough. Its targets are tiny, fixed and always visible; a drag there
is the same pointer-capture code the splitters already use; and it works the same on
touch. Dragging a live column means dragging an xterm — which fights the terminal's own
text selection, needs a drop indicator across a 600px-wide box, and has to redraw the
map anyway, since the map only reflects arrangement state. If column-drag is ever
wanted it is a second gesture over the same state (leg 5), never a second source of
truth.

*Where it plugs in:* the managed workbench (`public/js/workspace-layouts.js`) already
keeps per-surface `collapsed` state with `setCollapsed`, `snapshot` and `restore`, and
it builds the `.wk-workbench-rails` strip and each `.wk-workbench-collapse` action from
that state. The map's toggles are that same state with a new face; the rails and the
collapse actions are what get deleted. The team-wiring to remove is right there too —
`collapsed` is keyed on the fixed names `terminalTile · kanban · channels`, which is
why the slots cannot be reordered today.

| # | Leg | Ends when |
|---|---|---|
| 1 | **Kit: slot arrangement** — N slots, surfaces assigned, swap, per-destination persistence; no team knowledge. Its control is the **layout map** in the app bar (click = show/hide, drag = reorder); the per-column chevron rails are retired with it | **DONE 2026-08-25** — see LEG 1 — LANDED below |
| 2 | **Second terminal seat** — left and right can both be terminals, or either the commons; cards route to the seat last touched | two terminals side by side; state persists per team |
| 3 | **Seat-aware hot bench** — pool `active` becomes per-seat; cap arithmetic already fits | flipping one seat never disturbs the other; the pin holds |
| 4 | **Movable, shrinkable roster** — docks any slot, collapses to a chip rail | the owner can live in two terminals |
| 5 | **Polish** — keyboard flips through hot members; switcher in kit style | one instrument, not three panels |
| 6 | **Roster readings** — SHINGO, model, ready/busy, taken; cherry_pick or summary when RIREKI fires (owner, 2026-08-25) | a card tells you the session's state without opening it |
| 7 | **Team lead from the tile** — the 人 is set through the tile's existing session_role selector, not an API call (T5, ruled) | the owner designates a lead by hand from any tile |
| 8 | **Unlocked flavours** — a selector for the flavours of Unlocked, cherry pick included, to play with; later the Locked/Unlocked control moves out of the tile header (owner, 2026-08-25) | each flavour can be tried on a live tile |

Legs 1–4 are one chain (each needs the one before). Legs 6, 7 and 8 stand alone and can
go in any order, or in parallel with the chain.

## LEG 1 — LANDED (cut by `@team_page`, 2026-08-25, on the owner's "go ahead and cut it")

**What is on `dev`:** the arrangement module and its 11 pure tests (slots a·b·c·d, no
team import); the frame taking a declaration, with N−1 splitters placed from measured
edges, `fr` columns, DOM-order moves, and `data-width` written per slot; the layout map
primitive; the ViewHost's `#viewmap` bar slot; the contract migrating the old
`{widths, surfaces}` shape once; the team page reduced to its declaration; the Kit gate
rewritten (rails/expand/collapse/`data-open` are now *forbidden* strings); the Kit
README. One commit rather than the six planned below — the gate ties them together.

**Measured (playwright, 1600×950, `#/team/five-eyes`):** columns 630/315/630 (was
632/304/632 with the rails; the roster took back the rail's width), zero rails, three
switches in the bar, xterm 98→940. Hide the roster → 791/791, survives reload. Drag
commons over terminal in the map → commons leftmost. Pull each splitter 100px → each
workspace grows by the same amount (see the note below). Squeeze the roster to its floor
→ 95px, `data-width="compact"`, cards show heading only. Phone (600px): three stacked
columns, no splitters, map toggles still work. Sessions and League: the bar slot is
empty. Console: no errors. Smoke suite (desktop + WebKit phone): passed.

**Three bugs found by measurement, not by reading:** (1) the shell's default state
carries `widths: {left: null, right: null}` and `Number(null)` is `0`, which clamped
the workspaces to their floors — 15/70/15; (2) re-appending the splitter node on every
render dropped its pointer capture, so drags died after one move — same for the map's
re-rendered buttons; (3) drag percentages measured against the grid's padded box left
one side ten pixels short per hundred. The probe pattern earns its keep.

**Left for the owner:** T6 (a name for the action column) and whether the map's
switches want a label on hover beyond the slot's declared label.

### The design as approved (kept for the record)

**What exists, read plainly.** `createWorkbenchLayout(terminalTile, kanban, channels,
{managed})` in `public/js/workspace-layouts.js` is the whole frame today. Three
positional arguments, three fixed names, a CSS grid of `--wk-left | 1fr | --wk-right`,
collapse state keyed on those names, a `data-open` string enumerating the seven
show/hide combinations by hand, and the rails/collapse actions built from
`WorkspacePrimitives.createAction`. Its state `{widths:{left,right},
surfaces:{terminalTile,kanban,channels}}` is typed by `teamWorkspaceState()` in
`workspace-contract.js` and written by the team page with `ctx.patchState(...)` — **onto
the shell's top-level state, not the view's**, so today it is neither per-destination
nor per-team. The header `#bar` (`public/index.html`) has no slot a view can put a
control into; views hand the ViewHost a `title` and nothing else.

**The cut, in one sentence:** the frame stops knowing three names and starts taking a
*declaration*; the state becomes an *arrangement*; the control becomes a *map* the
ViewHost draws in the bar; and the team page shrinks to the declaration.

### 1. The arrangement — pure state, no DOM (a new module, public/js/workspace-arrangement, not yet in the tree)

```js
// declared by a destination; the Kit never sees the names' meaning
{ slots: ['terminal', 'roster', 'commons'],          // the surfaces, in default order
  widths: [40, 20, 40],                              // default share of the row, percent
  hidden: [] }                                       // default nothing hidden

// the state it keeps and persists
{ order:  ['terminal', 'roster', 'commons'],
  hidden: ['roster'],
  widths: { terminal: 40, roster: 20, commons: 40 } }  // by name, so a move keeps a width
```

Operations, each returning a new state: `toggle(name)` (refuses to hide the last
visible one), `move(name, index)`, `resize(name, percent)` (clamped to the slot's
declared floor — 15 for a workspace, **6 for the action column, which the owner wants
"quite thin"** — and 70; the
neighbour to the right yields, as today's "last changed edge yields"), `normalize(state,
declaration)` (drops unknown names, adds missing ones at the end, rescales visible
widths to 100). `migrateWorkbenchState(old)` turns today's
`{widths:{left,right}, surfaces:{…}}` into an arrangement once, so nobody's saved
layout is lost. Unit-tested with slots named `a b c d` and **no team import** — that is
half of the non-hackery test, executable.

### 2. The frame — `createWorkbenchLayout({ declaration, surfaces, state, onStateChange })`

Same export name (it *is* the managed Workbench; renaming buys nothing). The positional
form goes; the Kit gate flags any caller still using it. It renders `order` as DOM order
inside `.wk-workbench-layout`, sets `grid-template-columns` from the visible widths
(percent each, no `data-open` table — the seven hand-written combos in
`workspace-kit.css` are deleted), puts a `.wk-workbench-splitter` between each visible
pair (N−1, positioned from the cumulative widths), and marks hidden slots
`hidden`. A move is a DOM move of the `.wk-layout-surface` wrapper; the terminal host's
fit seam is poked after (its `ResizeObserver` already does this on any size change —
confirm by probe, not assumption). `.wk-workbench-rails`, `.wk-workbench-expand`,
`.wk-workbench-collapse` and the per-surface `.wk-surface-controls` injection are
deleted. The phone composition (`max-width: 680px`: column flex, snap-scroll) is
untouched — it reads DOM order, so it inherits reorder for free.

Returns `{ host, el, arrangement, restore, snapshot }` where `arrangement` is the live
controller the map binds to: `{ state(), toggle, move, resize, subscribe }`.

### 3. The map — `createLayoutMap(arrangement)` in `workspace-primitives.js`

A `<div class="wk-layout-map" role="group">` holding one `<button role="switch">` per
slot in `order`, each drawn as a small rectangle whose width follows the slot's share
and whose `aria-checked` follows visibility; `title` is the surface's declared label.
**Click toggles. Pointer-drag reorders**: pointer capture on the button (the splitter's
code, reused), and when the pointer crosses the midpoint of a neighbour, `move()`.
Keyboard: arrows move focus, Space toggles, Shift+arrows move the slot. It renders from
`arrangement.subscribe`, so a splitter drag redraws the rectangle widths and a map drag
moves the real columns; one state, two faces. Roughly 2.2rem tall so it fits the bar's
34px control height; no text.

### 4. Where the map lives — the ViewHost draws it, features never touch the bar

`#bar` gains one empty slot, `<span id="viewmap" class="wk-view-map">`, in the grow
gap left of the five verbs (which keep their measured width untouched). A view may
expose `arrangement` beside `el`/`mount`/`enter`; on every `navigate`, `createWorkspace`
empties the slot and, if the incoming view has one, mounts `createLayoutMap(view.arrangement)`
there. A view without slots (Sessions, League, Customize…) shows nothing. Nothing in the
bar or the ViewHost knows what the slots contain.

### 5. Persistence — per destination now, per team in leg 2

`teamWorkspaceState()` becomes `{ team, mode, focusedSession, arrangement }`, with
`arrangement` normalized against the declaration and migrated from the old shape. It is
written with `ctx.patchViewState('team', { arrangement })` — the per-view store that
already exists and today goes unused by the team page — not `patchState`. Leg 2 keys it
by team param (`arrangements[team]`); the shape does not change again.

### 6. The team page after the cut (`team-view.js`)

```js
const workbench = createWorkbenchLayout({
  declaration: { slots: ['terminal', 'roster', 'commons'], widths: [40, 20, 40] },
  surfaces: { terminal: terminalTile.el, roster: kanban.el, commons: channels.el },
  state: typed.arrangement,
  onStateChange: (arrangement) => ctx.patchViewState('team', { arrangement }),
});
root.append(workbench.host);
// …and `arrangement: workbench.arrangement` on the view object it registers.
```

That is the whole of the team page's geometry. Commons-on-the-left is
`slots: ['commons', 'roster', 'terminal']` — the other half of the non-hackery test.

### 7. Gates and evidence

- `scripts/check-workspace-kit.mjs`: the contract list changes from rails/expand/collapse
  to `wk-layout-map`, `wk-view-map`, the arrangement module, and a rule that no file
  under `public/js/` except the Kit reads `grid-template-columns` or `.wk-workbench-splitter`.
- `scripts/check-css.mjs`: unchanged rules; the new map CSS lives in `workspace-kit.css`,
  tokens only.
- a pure unit suite for the arrangement module under `tests/`, plus the existing team-terminal-pool
  suite untouched (the bench is DONE, and hiding a column does not park a transport —
  same as today).
- Playwright probe, before and after, at 1600×950: the three columns measure
  632/304/632 today; after the cut they must measure the same, with `#bar` containing
  three switches and the page containing zero `.wk-workbench-rails`. A second probe
  toggles the middle switch and expects two columns and a persisted `hidden: ['roster']`
  after reload.
- `docs/workspace-kit.md`: the "Current load-bearing contracts" bullet for
  `createWorkbenchLayout` is rewritten; the map and `arrangement` are added.

### 8. Order of work (one PR, six commits)

1. arrangement module + tests · 2. frame takes the declaration; rails deleted · 3. map
primitive + CSS · 4. ViewHost bar slot · 5. contract + migration + team page declaration
· 6. gates, probe evidence, README.

### 8a. The thin roster, and two workspaces that behave alike (owner, 2026-08-25)

"The roster can only be so skinny, but we should make it so that it can get quite thin.
It should have different modes when it's very thin — it maybe doesn't carry every piece
of information, it just becomes the session name. And both left and right workspaces
should be the same size; they don't seem to work exactly the same now."

Two consequences, both inside leg 1:

- **A declared floor per slot, and a compact mode below a width.** The declaration
  carries `min` per slot (`widths: [40, 20, 40]` becomes `slots: [{name, width, min}]`).
  The frame writes the slot's rendered width class onto its wrapper —
  `data-width="compact"` under a declared threshold (the roster's is ~11rem), `"full"`
  above — so a surface can change what it draws without measuring anything. The roster
  card in compact mode is the session name and the 人 mark, nothing else; the readings of
  leg 6 come back when it widens. (Container queries would do this in CSS alone; the
  attribute is chosen because `check-css` forbids feature sheets owning Kit geometry, and
  a feature reacting to a Kit-written attribute is exactly the boundary the README wants.)
- **Symmetry is a property of the arrangement, not of "left" and "right".** Today the
  frame has `left` and `right` widths, clamps each 25–60, and makes *the right one* yield
  when they overlap (`setWidths`: "the last changed edge yields" — in fact the right
  always does). The kanban is `minmax(12rem, 1fr)` and takes whatever is left, which is
  why it cannot go thin and why the two workspaces feel different. Widths by slot name
  with the same clamp and the same yield rule (the neighbour toward the middle yields)
  removes the asymmetry by construction; a probe dragging each splitter by the same
  distance must move each workspace by the same amount.

### 9. Chosen without asking — say if wrong

- At least one slot stays visible; the map refuses the last toggle rather than showing
  an empty bench.
- Hiding a column does not touch the hot bench: a hidden terminal keeps streaming. The
  bench policy is DONE and this leg does not reopen it.
- The map appears only on views that declare slots; the bar stays as it is everywhere else.
- Widths are stored by slot name, so a moved column carries its width with it.

## Decisions

| # | Question | State |
|---|---|---|
| T1 | Right slot default | **RULED: team_commons**, opening on the chat tab (`8837ae5`; the wipeboard is one tab over) |
| T2 | Roster default | **RULED: middle**; chips on collapse (leg 4) |
| T3 | "Open in other seat" gesture | open — suggest ⇄ on the card; long-press on touch |
| T4 | Raise the cap with two terminal seats? | **RULED: no** — four hot seats, lead + next three by last use (owner, 2026-08-25) |
| T5 | **Assign the team lead live from the UI** ("I need to be able to assign team lead live", 2026-08-25) | **RULED: through the tile buttons** — the tile already has a session_role selector; the 人 goes there. Leg 7 |
| T7 | Show/hide and reorder the columns | **RULED: a layout map in the app bar** — three toggling rectangles; drag within the map to reorder. No chevron rails (owner, 2026-08-25). Column-drag, if ever, is a second gesture in leg 5 |
| T6 | Name for the middle column — the owner's "action column": roster, new-session builder, whatever acts on the team | open — "action" is the placeholder; needs a KOTOBA word |

## Constraints

- **Locked only** until unlocked fidelity matches locked (owner). The RIREKI lever is
  the recorded future speed unlock — do not reach for it early. **Softened 2026-08-25:**
  Unlocked is not one thing but several flavours (cherry pick among them), and the owner
  wants a selector to try each on a live tile (leg 8). Locked stays the default; the
  ruling is against *switching* the page to unlocked, not against experimenting.
- No `tile.js` internals; compose existing machinery. The Kit/feature boundary above is
  the whole contract.
- The board slice, its polling and the hot-bench policy are DONE — do not reopen them
  with the layout work.
- One home for this plan; no copies (owner, 2026-08-25).
- Verify UI work by measurement (the playwright probe pattern), then land.
