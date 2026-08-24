# League — current implementation README

## Purpose

League is the Team-oriented overview at `#/league`. It shows which durable and live-only
Teams exist, which live sessions belong to each Team, and which sessions have no Team and
therefore appear in `Unassigned`.

League is read-only in the current slice. It preserves null-valid states: an empty Team, a
tag-only Team, a blank `team_role`, a blank objective, a session without a `session_role`,
and a session without any Team are all ordinary states.

League coexists with the Sessions destination and its one/two/four raw terminal Tile grid.
It does **not** replace raw session viewing, change the default destination on `dev`, or
remove the compatibility Sessions workflow. A Team card opens the Team workspace; raw
session Tiles remain available through Sessions.

## Non-goals

League does not own or recreate:

- the application shell, routes, browser history, title policy, or workspace state;
- the Team store, session reconciliation, event socket, or service lifecycle;
- terminal transport, terminal Tiles, the Sessions grid, or launching;
- Team creation/editing, Team Configuration, or the `Teams` application menu;
- membership writes, drag/drop, removal, or touch/keyboard membership editing;
- Workspace Kit primitives, layout grammar, responsive geometry, or global tokens.

A missing shared capability is a Workspace Kit or domain contract question, not permission
to build a League-local substitute.

## `#/league` user flow

1. Navigate to `#/league` through the shell or enter that hash directly.
2. League renders one board containing:
   - active durable Team rosters, including Teams with zero live members;
   - tag-only Teams derived from live session tags;
   - `Unassigned` when a live session has no Team membership;
   - a dotted **New Team** card.
3. Select anywhere on a real Team card to navigate in the current tab to
   `#/team/<name>`.
4. `Unassigned` is a holding projection, not a Team or destination. Its card is an
   `<article>`, has no navigation action, and never stores an `unassigned` tag.
5. Select **New Team** to navigate to `#/new-team`.
6. Use the one League-level **Show rosters / Hide rosters** action to change every Team's
   bubble list together. The per-tab value is `viewState('league').rostersVisible`;
   absent/null means shown.
7. Navigate to Sessions whenever raw one/two/four Tile viewing is wanted. League and
   Sessions are parallel destinations.

## Owned files

League owns exactly these feature files:

| File | Responsibility |
|---|---|
| `public/js/league-view.js` | Destination lifecycle, refresh boundary, repaint subscription, roster visibility, feature stylesheet loading. |
| `public/js/league-board.js` | Team cards, feature-specific bubbles, standard states, Kit controls/readings, Team and New Team navigation. |
| `public/css/league.css` | League meaning only: Team/card/bubble presentation, roster visibility, lead mark, empty copy, toolbar placement. |

League consumes but does not own:

| File | Contract consumed |
|---|---|
| `public/js/team-controller.js` | The single browser-side Team refresh and projection controller. |
| `public/js/workspace-kit.js` | The feature entry point to Kit primitives, layouts, adapters, and navigation. |
| `public/workspace-kit.css` | League card-grid/responsive geometry and generic action/metadata styling. |
| `public/js/main.js` | Registers `league` before `workspace.start()`. This is a shared shell seam. |

The retired feature-local teams-store module must not return.

## State and API derivation

`team-controller.js` is the only Team projection League uses. League imports no second
store and opens no socket.

At each `enter()` refresh boundary, League calls `refreshTeams()` exactly once. The
controller coordinates:

- `fetchSessions()` / `GET /api/sessions`, updating `S.sessions` through the existing
  reconciliation path;
- `GET /api/team-rosters`, updating the durable roster list.

League renders only through these controller selectors:

- `teamsFromState()` supplies ordered durable Teams, tag-only Teams, and `UNASSIGNED`;
- `teamByName(name)` resolves each real Team descriptor;
- `membersOfTeam(name)` derives live members;
- controller leadership data supplies Team-contextual lead presentation.

Ordering and validity rules:

- archived durable rosters are hidden;
- durable Teams precede tag-only Teams; `Unassigned` is last;
- stated classifications sort before blank classifications, then by name;
- empty durable Teams remain visible;
- no blank field is rejected or synthesized;
- tag-only Teams are compatible domain objects, not error cards.

League writes no API route. It does not write session tags or durable rosters and does not
fetch `/api/teams` or `/api/team-roles`.

## Workspace Kit and CSS contracts

League imports `WorkspaceKit` and uses:

- `createSurface` / `setSurfaceState` for standard states;
- `createCard` for Team, `Unassigned`, and dotted creation cards;
- `createAction` / `createActionBar` for the roster control;
- `createMetadata` for Team state, count, optional `team_role`, and tag-only status;
- `createLeagueBoard` for the named composition;
- `workspaceTarget` plus `navigateWorkspace` for Team and New Team navigation.

Whole-card navigation is structural: an actionable Team card is a button. `Unassigned` has
no action and remains an article. Bubbles are siblings beneath the card, never nested
interactive content inside a button.

The Workspace Kit owns the cards-region grid display, columns, gap, alignment, generic
control/readout styling, and the phone one-column breakpoint in `public/workspace-kit.css`.
`public/css/league.css` may style League meaning but must not redefine that geometry.
Bubble-internal layout remains feature-specific.

## Lifecycle

- `mount`: attach the board once, install one delegated roster-toggle handler, and register
  one controller subscription.
- `enter`: paint available state, call `refreshTeams()` once, then repaint.
- subscription callback: repaint only—never fetch, poll, reconcile, or create a socket.
- `leave`: no resource work; League owns no transport or timer.
- `destroy`: unsubscribe and remove the board.

Repeated navigation must not multiply listeners, subscriptions, sockets, observers, timers,
or polls.

## Verified behavior and command

The hardened migration landed on `dev` at `5812cd1`, after the Kit completed the League
cards-grid contract at `8357a3a`.

Declared UI verification from the repository root:

```text
bin/ronin-byoin --ui
BYOIN: the repo is clean (19 ok, 0 skipped).
```

That verdict included `smoke-ui`, `visual-ui`, `check-workspace-kit`, TypeScript, module
parsing, CSS checks, and the repository chain. Verified behavior includes:

- direct `#/league` registration;
- Kit-contract Team and New Team navigation;
- non-navigable `Unassigned`;
- empty durable and tag-only Teams;
- global roster visibility with per-tab state;
- blank/null validity and blank-last ordering;
- feature-specific bubbles and Team lead indication;
- Kit-owned desktop/phone board geometry;
- coexistence with the Sessions one/two/four raw Tile grid.

For future League UI work, run only:

```text
bin/ronin-byoin --ui
```

Run it once when the bounded work is ready. Read the final verdict; a SKIP is not a pass.
Do not assemble a hand-written sequence. `docs/test-protocols.md` is the contract.

## Known limits

- League is read-only; bubbles have no membership controls.
- Drag/drop, touch, and keyboard membership editing are not implemented.
- There is no optimistic membership state, write serialization, rollback, or membership
  notice presentation because League performs no writes.
- Controller notifications repaint current state; they do not initiate roster refreshes.
  Durable lifecycle changes become current at the next refresh boundary unless another
  controller consumer refreshes first.
- Optional service readings may be absent and must not trigger League-local service work.
- Archived Teams remain hidden in v1.
- A legacy durable Team named `unassigned` remains recoverable; the holding projection uses
  the controller's non-name sentinel.
- Sessions remains the default on `dev`. League default cutover is owner-controlled.

## Exact resume and dogfood checklist

1. Confirm the branch is `dev`; never touch or merge to `master` without a fresh explicit
   owner instruction naming that release action.
2. Read this file, `wip/buildouts/WORKSPACE_KIT.md`'s **HARDENING MIGRATION**, and
   `docs/test-protocols.md` from the current tree.
3. Inspect `git status`; preserve every unrelated dirty path. League owns only the three
   files listed above.
4. Inspect `team-controller.js`, `workspace-kit.js`, and `workspace-kit.css`. If a needed
   controller, primitive, navigation, state, or geometry contract is missing or ambiguous,
   stop and report the exact gap to `view_mgr`; do not build a substitute.
5. Keep one `refreshTeams()` call per refresh boundary; subscriptions repaint only.
6. Render through `teamsFromState()`, `teamByName()`, and `membersOfTeam()`—never a local
   cache or direct API request.
7. Dogfood these invariants:
   - an empty durable Team is visible and ordinary;
   - a tag-only Team looks complete;
   - blank `team_role`, objective, and `session_role` remain blank;
   - marked members sort before unmarked members;
   - `Unassigned` appears only when populated, never navigates, and is not stored;
   - one action shows/hides every roster and survives refresh in that browser tab;
   - Team and dotted cards navigate through the Kit contract;
   - Sessions and its one/two/four raw Tile grid still work.
8. Check desktop, tablet, and phone without adding feature-local board geometry.
9. When bounded UI work is ready, run `bin/ronin-byoin --ui` once. Report SKIPs as
   unverified.
10. If a later assignment authorizes landing, stage only named League paths, verify the
    staged list, and commit/push only `dev`. Documentation-only work authorizes none of
    those actions.
