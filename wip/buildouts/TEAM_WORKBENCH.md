# TEAM WORKBENCH — the handoff

> **Written for the agent who picks this up.** Everything found while working the team
> page in Aug 2026 is here: the cost model, the rulings, the landed state, the plan, and
> the traps. The standing account of what exists is `docs/team-workspace.md`; this page
> is the work that remains plus the knowledge that should not have to be rediscovered.
> One home, this file — the owner has ruled against copies.
>
> By `@wipeboard_refactor`, last updated 2026-08-25, `dev` @ `536313f`.

## Goal — the owner's words (2026-08-25)

> "Probably, ideally, I would have a left-side terminal and a right-side terminal, and
> the middle would be the roster. On one or the other of the terminals, I could turn it
> over to the whiteboard or the docs or whatever … And then that center team roster, I
> could actually ideally shrink that or even move that to one side or the other. … I
> would always have, regardless of what's showing, at least two teams hot, so I could
> toggle between those … The team manager is always hot, regardless."
>
> On architecture: "we have three surfaces, and we can just mix and match those
> surfaces … plug and play the particular type of service that we want to show up on
> that surface. I don't want to hack on these UI changes."
>
> On locked/unlocked: "Don't touch that. Currently, unlocked is not beautiful … It's
> just a question that when we can get rireki really firing, it will unlock a lot of
> speed for us."

## THE COST MODEL — learn this before touching anything

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

Never guess at browser behavior — **measure**. `scripts/lib/ui-host.mjs` exports
`loadPlaywright()`; a ten-line probe against the live page (getBoundingClientRect,
scrollTop round-trips) settled in minutes what three theory-driven "fixes" did not.

## LANDED — the state a successor inherits (all on `dev`)

**The hot bench** (`public/js/team-terminal-pool.js`, 10 tests in
`tests/team-terminal-pool.test.js`):
- Seats are free: page entry mounts nothing; first show mounts; **warmth is durable** —
  no clock ever parks a shown tile (owner overruled a 25s grace: toggled members stay
  hot).
- **Every `team_lead` is PINNED** — never parked by anything but membership loss or page
  exit. The lead's Tile auto-opens on entry, unfocused.
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
board is normal** — posts clear once everyone they were for has read them; that is the
wipeboard transport working, not a bug.

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
  deliberately empty** — always pass `selected`. The team page passes `'wipeboard'`.

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

## Decisions

| # | Question | State |
|---|---|---|
| T1 | Right slot default | **RULED: team_commons**, opening on the wipeboard tab |
| T2 | Roster default | **RULED: middle**; chips on collapse (leg 4) |
| T3 | "Open in other seat" gesture | open — suggest ⇄ on the card; long-press on touch |
| T4 | Raise the cap with two terminal seats? | open — suggest no: 4 fits the ruled arithmetic |

## Constraints

- **Locked only** until unlocked fidelity matches locked (owner). The RIREKI lever is
  the recorded future speed unlock — do not reach for it early.
- No `tile.js` internals; compose existing machinery. The Kit/feature boundary above is
  the whole contract.
- The board slice, its polling and the hot-bench policy are DONE — do not reopen them
  with the layout work.
- One home for this plan; no copies (owner, 2026-08-25).
- Verify UI work by measurement (the playwright probe pattern), then land.
