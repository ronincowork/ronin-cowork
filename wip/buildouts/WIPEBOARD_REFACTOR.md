# WIPEBOARD REFACTOR — what is left

> **What this document is.** The remaining work only. Everything built is described in
> `docs/wipeboards.md`, which is the standing account of what a wipeboard now IS — this
> page is not a second copy of it and never restates it. When the last leg lands, this
> file is deleted.
>
> **Last updated 2026-08-23 17:52 UTC.** `dev` @ `fe958a7`, pushed. `bin/ronin-byoin
> --gates` clean (16 ok, 2 SKIP — both browser checks, which fast mode does not run).

## Where it stands

The storage core, the one action, the CLI, the API and the vocabulary have landed.
`docs/wipeboards.md` describes them. What follows is what does not work yet, what is not
covered yet, and what has not been ruled.

## Blocker

None. Nothing waits on anyone.

## Next action

**Update `public/js/wipeboard.js` to the new payload**, then run `bin/ronin-byoin --ui`.

## Legs

| # | Leg | Ends when |
|---|---|---|
| 1 | **The ▤ tab.** `mtime` → `newest`; paging via `?since=`/`?limit=`; the cleared line; the addressee field on the compose row | `bin/ronin-byoin --ui` green — the first browser verification this work will have had |
| 2 | **Discoverability.** A wipeboard section in `ronin_session_boot/all/REQUIRED_ABILITIES.md`; `ACTIONS.md` (`wipeboard-check`, and `wipeboard-post` gaining the addressee doctrine); the `TOOLS.md` row; `MACROS.md`'s `+wipeboard:` recipe; `src/lookup.ts` | a session born from the shelf reaches the one action without being told |
| 3 | **Coverage.** Automated tests for `src/wipeboard-cli.ts` and the API — today only the storage core is on the unit floor | the verdict/exit table and every route asserted in `tests/` |
| 4 | **Full BYOIN on the box**, then land and delete this file | one verdict, no SKIP read as a pass |

## Known defects, in the order they will bite

1. **The ▤ Wipeboard tab is broken against the new server.** `public/js/wipeboard.js:327`
   compares `r.data.mtime`, which the API no longer sends. Traced: the first poll renders,
   `mtime` becomes `undefined`, and every later poll early-returns on
   `undefined === undefined` — **the thread renders once and then never updates.** The
   accepted cost of cutting clean rather than shimming. Leg 1.
2. **`src/lookup.ts:70` teaches the superseded commands.** The `+wipeboard:` expansion
   still says `tejun-wipeboard <name> read` / `post`. Both still work, so this is wrong
   guidance rather than a break. Leg 2.
3. **No automated coverage of the CLI or the API.** The 33 assertions cover
   `src/wipeboards.ts` only, in a temp store, with no tmux. The CLI was verified by hand
   through the `RONIN_SESSION` / `RONIN_BOARDS` / `RONIN_MEMBERS` seams; that is not in
   any gate. Leg 3.
4. **No browser verification has been run at all.** Both UI checks have only ever SKIPped.
   Leg 1.

## Standing rule — master is owner-controlled

**Owner, 2026-08-23, effective immediately.** Do not push `master`, merge any PR into it,
enable auto-merge, repoint the owner-facing service away from the master checkout, or take
an equivalent release action without a fresh explicit instruction from Glen naming that
specific merge or release. Work and pushes stay on `dev`; opening a PR does not authorize
merging it. The shared GitHub identity `gosmond3` is not attribution, so any authorized
release command and the session name that ran it are recorded here **before** execution.

Nothing in this workstream has touched `master`. No PR is open. All commits are on `dev`.

## Shared seams other workstreams read

Recorded because these changed under other people's code, not because they are unfinished.

| Seam | Consequence |
|---|---|
| `boardExists()` now means **a directory exists** | `routes/teams-api.ts` (`wipeboard_exists`) and `routes/launch-preflight.ts` (`adoptsWipeboard`) report **false** for every legacy single-file wipeboard. Lands on New Team / preflight |
| `boardPath()` returns a **directory** | `src/lookup.ts` prints it in `+wipeboard:` output |
| `src/routes/wipeboards-api.ts` | `mtime` → `newest`; new `GET /:name/unread`. `announceTeamChanges` keeps its signature, so `routes/launch.ts` and `routes/sessions-api.ts` are unaffected |
| `src/user-config.ts` | **appended to only** — `readWipeboardSettings` and two private helpers. Nothing existing altered |

## On this box

The live wipeboards store holds a new-format house wipeboard (a directory, empty) beside
six legacy single-file wipeboards — five-eyes, gbrain_service, gbrain_settei, house,
migration, new_gh_user. **The new code does not see the six.** That is the owner's accepted
fresh-start loss (2026-08-23: *"if some agents lost their messaging, tough shit"*). The
files are untouched on disk; removing one is the owner's own `rm`, never the machine's.

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
| **D13** | **The one worth a ruling.** A roster's `wipeboard:` token may name a wipeboard other than the team's own name, but `isTeamBoard()` matches on the **name**, so a roster pointing elsewhere yields a wipeboard with empty derived membership | implemented for the **lifecycle rule only**, where a wrong deletion is unrecoverable. The membership predicate still matches on name — another workstream's surface, deliberately left alone |
