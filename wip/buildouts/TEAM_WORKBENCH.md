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

| # | Leg | Ends when |
|---|---|---|
| 1 | **Kit: slot arrangement** — N slots, surfaces assigned, swap, per-destination persistence; no team knowledge | the team page renders identically to today *through the new machinery* |
| 2 | **Second terminal seat** — left and right can both be terminals, or either the commons; cards route to the seat last touched | two terminals side by side; state persists per team |
| 3 | **Seat-aware hot bench** — pool `active` becomes per-seat; cap arithmetic already fits | flipping one seat never disturbs the other; the pin holds |
| 4 | **Movable, shrinkable roster** — docks any slot, collapses to a chip rail | the owner can live in two terminals |
| 5 | **Polish** — keyboard flips through hot members; switcher in kit style | one instrument, not three panels |
| 6 | **Roster readings** — SHINGO, model, ready/busy, taken; cherry_pick or summary when RIREKI fires (owner, 2026-08-25) | a card tells you the session's state without opening it |
| 7 | **Team lead from the tile** — the 人 is set through the tile's existing session_role selector, not an API call (T5, ruled) | the owner designates a lead by hand from any tile |
| 8 | **Unlocked flavours** — a selector for the flavours of Unlocked, cherry pick included, to play with; later the Locked/Unlocked control moves out of the tile header (owner, 2026-08-25) | each flavour can be tried on a live tile |

Legs 1–4 are one chain (each needs the one before). Legs 6, 7 and 8 stand alone and can
go in any order, or in parallel with the chain.

## Decisions

| # | Question | State |
|---|---|---|
| T1 | Right slot default | **RULED: team_commons**, opening on the chat tab (`8837ae5`; the wipeboard is one tab over) |
| T2 | Roster default | **RULED: middle**; chips on collapse (leg 4) |
| T3 | "Open in other seat" gesture | open — suggest ⇄ on the card; long-press on touch |
| T4 | Raise the cap with two terminal seats? | **RULED: no** — four hot seats, lead + next three by last use (owner, 2026-08-25) |
| T5 | **Assign the team lead live from the UI** ("I need to be able to assign team lead live", 2026-08-25) | **RULED: through the tile buttons** — the tile already has a session_role selector; the 人 goes there. Leg 7 |
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
