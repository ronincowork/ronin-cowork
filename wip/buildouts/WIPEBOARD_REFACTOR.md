# WIPEBOARD REFACTOR — what is left

> **What this document is.** The remaining work only. Everything built is described in
> `docs/wipeboards.md`, which is the standing account of what a wipeboard now IS — this
> page is not a second copy of it and never restates it. When the last leg lands, this
> file is deleted.
>
> **Last updated 2026-08-24.** `bin/ronin-byoin --gates` clean (16 ok, 2 SKIP —
> both browser checks, which fast mode does not run). Work stays on `dev`.

## Where it stands

The storage core, the one action, the CLI, the API and the vocabulary have landed.
`docs/wipeboards.md` describes them. What follows is what does not work yet, what is not
covered yet, and what has not been ruled.

## Blocker

None. Nothing waits on anyone.

## THE RESHAPE — the team board is the unit (owner, 2026-08-24)

The owner's step-back, taken whole rather than crammed onto the old shape:

- **The board is assumed, never discovered.** A session on a team posts with
  `tejun-wipeboard post <text>` — no board name. "Sessions should just be posting to
  their whiteboard unless they have an explicit name."
- **The tool knows the team.** Members and leads are read off the live sessions at every
  call; the session's letter already carries its teams block. Nothing new is stored.
- **The lead sees everything that hits a team board.** "`--to`" narrows which members are
  interrupted; the leads are always interrupted. `--to none` therefore means *leads only*.
  A leaderless team has nobody always-on; the poster is never sent their own post.
- **MVP: team boards only.** Custom wipeboards — a board over any grouping outside a
  team — are CUT for now, machinery deleted, not parked: enrolment (`@ronin-wipeboards`),
  the create/close/add/remove surfaces, and the custom join/leave notices. A later
  "generalist wipeboard" is a second utility to design on its own day. `house` stays
  seeded (read/post by name; no members, so TTL alone clears it).
- Named-board commands survive for the explicit case (`tejun-wipeboard <board> post …`),
  because the owner kept "unless they have an explicit name".

Calls made in building this, reversible and flagged:
- **Bare post on several teams refuses** and names them (`WHICH-TEAM`), rather than
  guessing or broadcasting to all.
- **Reaping is unchanged**: the lead being interrupted does not make the lead a required
  reader of an addressed post.

## Next action

**API coverage (leg 1).**

## Legs

| # | Leg | Ends when |
|---|---|---|
| 1 | **API coverage.** `src/routes/wipeboards-api.ts` has no automated test | every route asserted, including that `unread` never advances a cursor |
| 2 | **Full BYOIN on the box**, then land and delete this file | one verdict, no SKIP read as a pass |

**The team page's wipeboard slice LANDED** (2026-08-25): the tab was a hardcoded
placeholder paragraph, met by the owner on the live page. `public/js/team-wipeboard.js`
is the real channel service — the thread and the owner's loud compose row, board id from
the roster, polling only while entered. The tab deferral is over; what remains deferred
was only the OLD ▤ commons tab, which the new UI replaced.

**Create-on-open LANDED** (2026-08-24, third ruling of the day): "should always have a
board — if there isn't one at team open it should fall back to create one." `GET
/api/wipeboards/:name` now materializes a team's board instead of answering with a
phantom, stubbed with the TEAM's name even where the roster's id differs; the post and
brief routes got the same team-name fix. The team page's own board slice is the team
workstream's to wire — the server guarantee is in place for it.

**Quiet by default LANDED** (2026-08-24, second ruling of the day): an agent's bare post
interrupts **the lead alone** — "the board must be efficient, not a spam machine". `--to`
adds names, `--to all` is the explicit everyone, `--to none` interrupts nobody. The owner's
own line from the tab stays loud (D3: "all agents should see that") — the quiet default is
for agents. Reading is untouched: every member still receives every post on its next check.

**The reshape LANDED** (2026-08-24): bare `post` to the team board; leads always
interrupted (`--to none` = the lead alone; several teams = `WHICH-TEAM`); custom
machinery deleted — enrolment consultation, the create/close/add/remove routes, the
custom join/leave notices; the tab's calls to those routes now 404, which the deferral
already covers. Boot shelf, both actions, TOOLS/MACROS rows, `docs/wipeboards.md` and
KOTOBA all say the new shape. 54 assertions across the two suites.

## Deferred by the owner — the ▤ tab

**2026-08-23:** the tab is not touched until the new UI lands, because it will not have
this shape. *"When you open the whiteboard for a team page, it should just be the
whiteboard. There should be none of this other shit where it was like the team brief and
selecting which whiteboard to look at."* Opening a team shows **that team's wipeboard and
nothing else** — no brief panel, no wipeboard picker. Done then, directly, not now.

Until retirement the old tile wipeboard stayed broken against the server (it compared
`r.data.mtime`, which the API no longer sends: the thread renders once and then never
updates). Known, accepted, and not worth fixing into a surface that is being replaced.

## Known defects, in the order they will bite

1. **No automated coverage of the API.** 50 assertions now cover the storage core, the
   roster-id resolution and the CLI — `src/routes/wipeboards-api.ts` is the gap. Leg 1.
2. **No browser verification has been run at all**, and none can be until the new UI. See
   the deferral above.
3. **`tests/wipeboard-cli.test.ts` is slow** — it spawns the shipped entry through tsx per
   case, adding roughly twenty seconds to `check-tests`. Deliberate: driving the real
   entry is what makes it a test of what ships rather than of a copy. Worth revisiting if
   the unit floor gets much slower.

## Standing rule — master is owner-controlled

**Owner, 2026-08-23, effective immediately.** Do not push `master`, merge any PR into it,
enable auto-merge, repoint the owner-facing service away from the master checkout, or take
an equivalent release action without a fresh explicit instruction from Glen naming that
specific merge or release. Work and pushes stay on `dev`; opening a PR does not authorize
merging it. The shared GitHub identity `gosmond3` is not attribution, so any authorized
release command and the session name that ran it are recorded here **before** execution.

Nothing in this workstream has touched `master`. No PR is open. All commits are on `dev`.

**Service action record — retiring the master instance** (the rule above requires the
command and session recorded here). Owner's instruction, 2026-08-25: *"retire the old
master instance so there's only one Ronin."* Session: `@wipeboard_refactor`. Executed
verification found the retirement already effected: `ronin.service`'s drop-in now reads
`WorkingDirectory=/home/glen3/dohyo/ronin-cowork` with `ExecStartPost=` cleared, restarted
2026-08-25 05:02 by the integrator — the restart ended the `ronin-cowork-live` (master)
process. Verified after: **no process runs from `ronin-cowork-live`**, and exactly one
Ronin serves — the supervised unit's tree on `100.101.235.17:3006`, dev checkout, which is
what the owner's `dohyo-unified` URL proxies to. **No kill was needed and none was run.**
The `ronin-cowork-live` checkout stays on disk untouched; it still carries an uncommitted
`REQUIRED_ABILITIES.md` edit (the forkit lesson) that should be ported to `dev` before
that checkout is ever removed — removing it is the owner's own act.

## Shared seams other workstreams read

Recorded because these changed under other people's code, not because they are unfinished.

| Seam | Consequence |
|---|---|
| `boardExists()` now means **a directory exists** | `routes/teams-api.ts` (`wipeboard_exists`) and `routes/launch-preflight.ts` (`adoptsWipeboard`) report **false** for every legacy single-file wipeboard. Lands on New Team / preflight |
| `boardPath()` returns a **directory** | `src/lookup.ts` prints it in `+wipeboard:` output |
| `src/routes/wipeboards-api.ts` | `mtime` → `newest`; new `GET /:name/unread`. `announceTeamChanges` keeps its signature, so `routes/launch.ts` and `routes/sessions-api.ts` are unaffected |
| `src/user-config.ts` | **appended to only** — `readWipeboardSettings` and two private helpers. Nothing existing altered |

## On this box

Clean. The six stale single-file wipeboards were **deleted on the owner's instruction**
(2026-08-23: *"this smells bad and should be cleaned up. Don't keep this shit laying
around. Just kill it."*) — five-eyes (667 KB, 194 posts), new_gh_user, gbrain_service,
gbrain_settei, house and migration. The store now holds only new-format wipeboards. The
five-eyes team had already cut over to its new one before the deletion.

## Decisions the owner has not ruled

The code implements the recommended answer on each. Listed because they are choices, not
because anything waits on them.

| # | Decision | As built |
|---|---|---|
| D1 | Storage shape | a directory, one file per post |
| D2 | Bare `tejun-wipeboard` is the one action; `boards` prints what exists | as ruled 2026-08-23 — no aliases, no forwarding |
| D3 | Owner posts notify every member | yes, reversing the owner-posts-are-silent asymmetry |
| D4 | Grace 60 min, TTL 48 h, both SETTEI, per-wipeboard override | as shipped defaults |
| D5 | Reaping counts live agent members only; the owner never gates it | yes |
| D6 | No archive — reaped is gone | yes |
| D7 | A joining session is handed what is currently on the wipeboard | yes |
| D8 | Concision is doctrine, not a byte cap | yes — guidance in `ACTIONS.md` (leg 2) |
| D9 | A wipeboard is removed whole when nothing points at it | yes, on all six conditions |
| D10 | `--to a,b` / `--to none` / absent; empty `--to` refused | yes |
| D11 | An addressed post reaps on its addressees | yes |
| D12 | The compose row gets an addressee field | **not built** — leg 1 |
| **D13** | **RULED 2026-08-23 and built.** *"Every team roster should have a whiteboard ID, and that whiteboard ID should match with a single whiteboard. I don't care what the names are."* | the roster's id is the identity everywhere — membership, the reaper and the lifecycle all resolve through it. A roster with no wipeboard on disk gets one made, and it opens empty. A team with no roster keeps a wipeboard of its own name |
