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

The team page becomes **three slots the Workspace Kit owns — left, middle, right — into
which surfaces plug**: a terminal seat, the **team commons** (wipeboard · docs · team
configuration), or the roster. Mix and match; move them; shrink the roster. The default
landing is the owner's ruling of 2026-08-25: **left = the team lead's terminal · middle =
the roster · right = the team commons.**

## The architecture rule — no hacking, and how that is enforced

The owner's requirement, verbatim: *"we have three surfaces, and we can just mix and
match those surfaces … we're just able to plug and play the particular type of service
that we want to show up on that surface. I don't want to hack on these UI changes."*

So the boundary is absolute and it is the Kit's existing boundary, extended rather than
bent:

- **The Kit owns the frame.** Slot geometry, which surface sits in which slot, moving a
  surface between slots, collapse, resize, persistence — all of it lands in the
  Workspace Kit as a general **slot arrangement** capability. Nothing about it knows the
  word "team".
- **Features supply surfaces.** The team page becomes a *declaration*: three surface
  factories (terminal seat · roster · team commons) and a default arrangement. It owns
  content and policy (which member, the hot bench, the pin) and zero geometry.
- **The test of non-hackery:** any other destination could adopt the same slot machinery
  tomorrow without touching team code, and the team page could show the commons on the
  LEFT purely by changing its declared default. If either is untrue, the cut was a hack
  and does not land.
- Surfaces already meet the Kit's service contract (`mount/enter/leave/destroy`); the
  wipeboard slice, the roster and the config panel plug in as they are.

**`team_commons` is the name** (owner, 2026-08-25) for the channels surface — recorded in
KOTOBA beside `session_commons`, same word one level up: shared ground about the TEAM,
inside its workbench.

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
| 1 | **Kit: slot arrangement** | The general capability, in the Kit and only there: N slots, surfaces assigned to slots, an arrangement swap, per-destination persistence. No team knowledge anywhere in it | a destination can declare surfaces + a default arrangement and the Kit draws it; the team page still renders identically to today through the new machinery |
| 2 | **The second terminal seat** | A second terminal-seat surface, so left and right can both be terminals, or either can be the team commons. Cards route to the seat last touched; a small affordance opens in the other seat | two terminals side by side; either flips to the commons; state persists per team |
| 3 | **Seat-aware hot bench** | Two visible tiles means HOT is a set: the pool's `active` becomes per-seat; the cap arithmetic holds (2 hot + pinned lead + 1 warm = 4) | flipping either seat never disturbs the other; the pin holds |
| 4 | **The movable, shrinkable roster** | The roster surface docks in any slot and collapses to a chip rail; position and collapse persist per team | the owner can shove the roster aside and live in two terminals |
| 5 | **Polish** | Keyboard flips through hot members; switcher styled to the kit | feels like one instrument, not three panels |

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

## Decisions

| # | Question | State |
|---|---|---|
| T1 | Default right slot | **RULED 2026-08-25: the team commons** — "the right side is the team commons". Left = lead's terminal, middle = roster |
| T2 | Roster default position | **RULED: middle** ("the center is the team roster"); collapse-to-chips arrives with leg 4 |
| T3 | "Open in other seat" gesture | open — recommended: a small ⇄ on each card; long-press on touch |
| T4 | Raise the cap when both seats show terminals? | open — recommended no: 4 holds, the arithmetic fits |

## Definition of done

Two terminals side by side on a Mac screen, roster tucked where the owner shoved it,
lead hot from the moment the page opens, flips between watched members instant, board
one flip away on either seat — and the whole page still costs at most four streams.
