# Desk state — what the owner and the lead see, derived, never prose

> The visible half of the control surface (`docs/control-surface.md`
> § 5; the desk model is `docs/worktrees.md` there). The registry and hand-in have their own
> page (Track 1's); team promotion has its own (Track 2's). This page is only about what
> is SHOWN, where, and where each fact comes from.

## The rule

A **desk** is one repository's branch and the worktree on it; a session has one per repo
it is changing. Everything a person wants to know about a desk — which line it hands in
to, how far ahead, whether it is dirty, parked, pending an update, blocked, when it last
handed in — is a fact git or the desk registry already holds. **No agent is asked to keep
those in its letter.** The letter's `repos[]` says *which* desks (repo + branch, and a
tool may add `worktree` and `line`); the server derives the rest at the moment of asking.

## Where a fact comes from

`src/desk-state.ts` produces one shape (`DeskState`) from two sources:

| Source | When | Answers |
|---|---|---|
| the desk registry (`src/desks/registry.ts`, `listDesks`) | the desk was opened by a tool and has a row | everything, through its own `DeskStatus`: tip, mounted, dirty files, ahead/behind, **pending update, last hand-in, blocked, parked** |
| git, here | the letter lists a repo the registry has no row for — today's shared checkout, or a repo the session added by hand | worktree (from `git worktree list`), line (the upstream, else the name the branch path implies **if that ref exists**), ahead/behind, dirty files, parked (branch with no worktree). Registry-only facts are null — never invented |

`source: 'registry' | 'git'` says which answered. A plain checkout on `dev` is one desk
with no line: `1 desk`, nothing about hand-ins. A manual terminal or a direct repository
gets no invented desk state.

## The routes

| Route | Answers |
|---|---|
| `GET /api/desks` | every live session's desks and roll-up, keyed by session; memoised a few seconds — what every tile and the roster poll |
| `GET /api/sessions/:name/desks` | one session: `{ session, live, desks[], rollup }` |
| `GET /api/teams/:name/desks` | every member's desks, **plus parked desks of sessions that are gone** (`live: false`) — the lead's *hand in · inspect · reassign · discard* list — the team line seen per repository (`lines`), because one roster `branch` cannot name two repos' lines, and `promotion`: the last complete team promotion and any receipt still blocking the team (advancing or interrupted), from Track 2's ledger |

The roll-up: `{ desks, private, dirty, pending, parked, blocked, lined }` — `private` is
the sum of commits ahead of a line, i.e. what nobody else can see yet.

## The surfaces

`public/js/desks.js` shares one deduped fetch of `/api/desks` and owns the words
(`desks.*` in the lexicon).

| Surface | Shows |
|---|---|
| tile head ⑂ | one desk: its branch; several: the count. The help carries the roll-up (`2 desks · 1 pending · 3 private`) and one line per desk: repo, branch, `→ line`, ahead/behind, unsaved, pending (by whom), parked, blocked. Amber when pending or blocked. Works with no services installed |
| roster (⌂) | a `--hr-desks` column with the same label and help; hidden with the model column on a narrow tile |
| Team page | the roll-up among each member's readings; a **Team lines** row (`ronin-cowork → team/comp/dev · ronin-services → team/comp/dev`) beside the roster's single `Branch`; a **Promotion** row (last complete, or the receipt blocking the team — amber); a **Parked desks** row (`name · gone · 3 ahead`) |
| ▣ Project roots | a chip for the **arrangement**, read from the repo's checked-in `RONIN_REPO`: `reviewed · desks`, `reviewed`, `direct`, or `shared checkout` when there is no record — apart from whichever branch happens to be mounted at the root |

Paths and SHAs stay out of every row (docs/worktrees.md, "Surfaces that change": detail
behind inspection); the API carries them for anyone who asks.

## What this page does not cover

Opening, syncing, parking and handing in a desk are Track 1's tools (`tejun-desk`). The
notice a sibling gets when the line moves is delivered by the registry's adoption step;
here it only *shows*, as `pending` on the desk until the desk syncs.
