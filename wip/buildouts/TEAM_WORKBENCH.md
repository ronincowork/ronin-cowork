# TEAM WORKBENCH — two terminals, a movable roster, and the always-hot bench

> A build-out plan, not code. The team page is, in the owner's words, "obviously super
> critical for us" — this is the shape it grows into, planned before cut.
>
> Written 2026-08-25 by `@wipeboard_refactor`. Standing account of what exists today:
> `docs/team-workspace.md`. Nothing below is built until the owner says go on its leg.

## Goal — the owner's words (2026-08-25)

> "Probably, ideally, I would have a left-side terminal and a right-side terminal, and
> the middle would be the roster. On one or the other of the terminals, I could turn it
> over to the whiteboard or the docs or whatever, so it's either a terminal tile or it's
> these config comments, team comments. And then that center team roster, I could
> actually ideally shrink that or even move that to one side or the other. … And I would
> always have, regardless of what's showing, at least two teams hot, so I could toggle
> between those and then the others. The team manager is always hot, regardless. … so I
> have either two or three, depending on whether I'm watching two of the team players.
> The head coach would also be hot, so I would keep three."
>
> On locked vs unlocked: "Don't touch that. Currently, unlocked is not beautiful … so we
> need to hold on that. It's just a question that when we can get rireki really firing,
> it will unlock a lot of speed for us."
>
> The reality of use: "I use two terminals at a time on my Mac, and that looks pretty
> good."

## What this is, in one sentence

The team page becomes a **two-seat workbench**: two big side panes that each show either
a member's terminal or the channels (wipeboard · docs · team configuration), with the
roster as a slim, movable, collapsible strip — and a warm bench underneath that keeps the
lead and the sessions being watched hot at all times.

## Already landed ahead of this plan (2026-08-25, same day)

- **Durable warmth.** No clock parks a shown tile; a tile stays hot until cap pressure,
  membership loss, or page exit. The 25s grace survives only for unclaimed hover-prewarms.
- **The pinned lead.** `setPinned()` in the pool; the view pins every `team_lead`. Nothing
  but membership loss or page exit takes a pin's stream. The lead auto-opens on entry.
- **The tiers and the cap** (stream cap 4, park-not-destroy, hover prewarm) and the
  bounded workbench row that made scrolling real.

So the owner's hot-bench arithmetic — lead + the one or two being watched = 2–3 hot —
already holds on today's one-terminal layout. This plan is chiefly the LAYOUT work.

## The legs

| # | Leg | What it is | Ends when |
|---|---|---|---|
| 1 | **The second seat** | The workbench becomes two SEAT panes + the roster strip. A seat hosts either a terminal or the channels surface; a small switcher on each seat chooses. Default: left = terminal (the lead), right = channels — today's muscle memory, one more terminal away | both seats can show terminals side by side; either can flip to channels; state persists per team |
| 2 | **Seat-aware pool** | Two visible tiles means HOT is a set, not a single: the pool's `active` becomes per-seat; the cap arithmetic already holds (2 hot + lead + 1 warm = 4). Cards route to "the seat you last touched", with a long-press/secondary affordance for "open in the other seat" | flipping either seat never disturbs the other; the lead's pin still holds |
| 3 | **The movable roster** | The roster strip docks left / middle / right and collapses to a rail of avatars+marks (the kanban cards become compact chips when collapsed). Position and collapse persist per team via the existing workbench state | the owner can shove the roster aside and live in two terminals |
| 4 | **Polish** | Keyboard flips (e.g. [ and ] cycle the focused seat through hot members), the seat switcher styled to the kit, `--to` addressee affordance on the board composer if wanted | feels like one instrument, not three panels |

Each leg lands separately on `dev`; leg 1 is useful alone.

## The hot-bench policy, stated once

- **Visible seats are HOT** (up to 2).
- **Every `team_lead` is PINNED** — hot from page entry to page exit, regardless of what
  the seats show. "The team manager is always hot, regardless."
- **Recently watched members stay WARM** — durable, no timer — until the stream cap (4)
  forces the coldest unpinned one to park. Parking keeps the seat and the painted screen;
  re-show is one reattach with an immediate tmux repaint.
- **Hover prewarms** remain the only clocked thing: unclaimed after ~25s, they park.
- **Locked mode only**, per the owner's ruling. The RIREKI/unlocked lever is recorded as
  a future speed unlock (a tape-follow tile costs no tmux process at all) and is not
  touched until unlocked fidelity matches locked.

Arithmetic at rest: 2 visible + 1 pinned lead + 1 warm toggle-partner = 4 = the cap.
The cap never takes a pin or a visible seat; if pins + seats ever exceed it (several
leads), the cap yields rather than parking a pin — bounded by team design, not by code.

## Constraints

- No change to Tile/`tile.js` internals — the workbench composes existing machinery.
- The Workspace Kit owns geometry/persistence; this feature supplies content and policy
  (same boundary `docs/team-workspace.md` states today).
- The board slice, its polling and its compose row are done and are not reopened here.
- Narrow screens: seats stack; the roster collapses by default. The owner's Mac two-up
  is the design center.

## Decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| T1 | Default right seat: channels, or second terminal? | channels (board one glance away); one click flips it to a terminal |
| T2 | Roster default position | middle, collapsed to chips once leg 3 lands |
| T3 | "Open in other seat" gesture | a small ⇄ on each card; long-press on touch |
| T4 | Raise the cap when both seats show terminals? | no — 4 holds; the arithmetic above fits inside it |

## Definition of done

Two terminals side by side on a Mac screen, roster tucked where the owner shoved it,
lead hot from the moment the page opens, flips between watched members instant, board
one flip away on either seat — and the whole page still costs at most four streams.
