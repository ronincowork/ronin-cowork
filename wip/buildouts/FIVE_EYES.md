# FIVE EYES — five-view rollout plan

## Goal

Reorient the coworkspace around Teams and execute the work through five visible,
independently managed Ronin sessions—one per product destination:

1. **League** — discover Teams, inspect optional rosters, manage membership, and begin a
   New Team.
2. **Team** — work with one Team through the default three-Surface workbench or Team-scoped
   Sessions mode.
3. **Customize** — discover and author the recipes that change how Ronin works.
4. **New Team** — define a Team, build its proposed session roster, and launch it.
5. **Agent Configuration** — configure one proposed Team session through configuration
   and resolved-profile preview Surfaces, with no terminal dependency.

The five sessions share the contracts in `wip/buildouts/WORKSPACE_KIT.md`. They do not each
invent a shell, cards, Surfaces, Tile lifecycle, Team projection, or launch payload.

Each Eye also receives the reviewed interactive HTML artifact:

- source: `../ronin-lab/concepts/five-eyes.html`
- preview: `http://100.101.235.17:8099/five-eyes.html`
- reviewed artifact commit: `f9510ef`

The artifact preserves the visual and interaction decisions made during owner review. It is
required design input, not disposable scaffolding and not production code. At session
start, every Eye compares its assigned surface with this document and `WORKSPACE_KIT.md`,
records any disagreement, and resolves it before coding. The documents govern architecture
and ownership; the HTML preserves reviewed composition and visual intent.

This document defines sequencing, ownership, dependencies and release gates. It does not
authorize five simultaneous rewrites before the Workspace Kit foundation is ready.

## Starting model

The current application boots directly into a global one/two/four Tile grid. Tile owns too
many concerns, global session events mutate that grid directly, and Commons/Configuration
borrow Tile-shaped hosts. Five Eyes moves the grid beneath a view shell and makes
Sessions mode one Team-scoped option.

The `session_teams` and role/session-role/lead refactor now establishes the domain vocabulary these
views must consume. Before implementation, all five Eyes must read the landed contracts in
`src/team-rosters.ts`, `src/routes/teams-api.ts`, `ronin_catalogs/team_roles/`,
`ronin_catalogs/role_families/`, and `ronin_catalogs/session_roles/`. The UI must not
preserve obsolete assumptions merely because the fixture was drawn earlier.

The stable constraints are:

- Team membership is expressed on sessions and may be many-to-many.
- Removing Team membership does not kill a session.
- `Unassigned` is the derived holding area for live sessions with no Team membership.
- Team, `team_role`, `role_family`, `session_role`, agent provider, model and lead
  designation are separate axes.
- One shared projection turns session/domain data into League and Team rosters.
- A durable `team_roster` holds Team identity, `team_role`, objective, launch defaults,
  wipeboard link and lifecycle state. It may exist with zero live members.
- A `team_roster` never stores members or a lead pointer. Membership and leadership remain
  derived from live sessions.
- A Team may have no lead. Null, empty and unclassified states are valid and never trigger
  a forced launch, assignment, classification or configuration workflow.

## Settled experience contract

The following decisions are frozen for rollout unless the owner explicitly reopens them.

### Application and browser tabs

- There is one application header, without repeated destination and Surface headers.
- Sessions remains the default for new browser tabs on `dev`. Every new browser tab starts
  at League only after the explicit cutover gate.
- League/Home returns the current tab to League once League is registered.
- `＋` opens a new Sessions tab until cutover, then a new League tab.
- Selecting a Team opens it in the current tab and makes the Team name the browser-tab
  title.
- The right-side `Teams` control lists Team names and switches the current tab directly.
- The preview's five Eye buttons are not proposed production navigation.

### League

- The upper Team card is one full-surface navigation target; the user need not find and
  click the Team name.
- Session roster bubbles are visually and behaviorally separate beneath the Team card.
- One League-level `Show rosters` / `Hide rosters` control changes all cards together.
- There are no per-Team roster disclosure buttons.
- Session bubbles support many-to-many drag/drop membership and a red membership-removal
  `×`.
- `Unassigned` is an ordinary card, not a dashed or specially emphasized virtual Team.
- The dotted creation card goes to New Team.

### Team

Team has two modes in the application header:

1. **Team** — default workbench with a focused terminal Tile, central session Kanban and
   right Channel Surface.
2. **Sessions** — current-style one/two/four terminal Tile grid constrained to the selected
   Team, including a Team Commons Surface that is not a Tile.

The Team workbench contract is:

- default `40 / 20 / 40` terminal Tile/Kanban/Channel Surface ratio;
- Kanban plus one working Surface uses `40 / 60`;
- terminal Tile plus Channel Surface with Kanban collapsed uses `50 / 50`;
- all three Surfaces can collapse;
- terminal Tile and Channel Surfaces have bounded resizing and restore their prior width;
- phone layouts use swipe/stack composition rather than small drag handles.

The Kanban has no redundant roster header. Its SessionCards show `session_role` mark, SHINGO
position and age, agent/model and working state, and a short recent status. Clicking a card
focuses that session's terminal Tile. The final card adds an existing Unassigned session or
raises a new session.

The focused terminal Tile has no identity header. A compact actions rail preserves macros,
terminal mode/lock, Team membership, Control, note and destructive/more actions. The old
status light and context-gauge bowl are removed.

The right Channel Surface contains the `Chat`, `Wipeboard`, `Docs`, and `Team Configuration`
services. Chat is empty and inert: no transcript, composer or protocol is implied. Wipeboard
is only agent-to-agent chronological conversation. Team Configuration owns the brief,
roots, repositories, branches and roster editing.

### Commons and Configuration

Commons and Configuration occupy the complete workspace and carry only their own earned
chrome. Commons no longer sits beneath a session header. Close/back restores the prior
valid location through shell history.

### New Team

New Team is explicitly two-stage:

1. define the Team—Team name, `team_role`, objective/brief, roots, repositories and Team
   defaults;
2. build the roster—one or many proposed sessions, each selected through `role_family` and
   its applicable `session_role` configuration, with an optional lead designation.

The current fixture communicates only this boundary. The New Team Eye owns the detailed
interaction, validation and launch design.

## Shared gates before feature implementation

### Gate A — Workspace Kit

One foundation owner lands and browser-reviews:

- AppShell, ViewHost, routes, history and document-title behavior;
- versioned per-tab workspace state and legacy Tile-state migration;
- view lifecycle and teardown rules;
- Surface, Card, standard states and named layouts;
- the seam consumed by the Team-owned terminal Tile host;
- full-workspace Commons and Configuration extraction.

No Eye implements a substitute foundation locally.

### Gate B — Team domain adoption

The landed Team/role work publishes:

- durable `team_roster` identity and persistence semantics;
- membership read/write API and many-to-many behavior;
- `Unassigned` derivation;
- `team_role` and optional-lead semantics;
- `team_role`, `role_family`, and mutable `session_role` vocabulary;
- Team brief/root/repository ownership;
- create/edit/rename/archive/dissolve behavior for a Team with zero live members.

League, Team, New Team and Agent Configuration stop at fixture adapters until this gate is
stable.

### Gate C — Session store and Team projection

One owner publishes a view-neutral session store and selectors equivalent to:

```text
teamsFromState(state)
membersOfTeam(state, team)
unassignedSessions(state)
sessionBelongsToTeam(session, team)
```

Birth, death, join, leave and retag events update the store. Active views decide how to
render the change; events do not directly attach or detach global tiles.

### Gate D — Terminal Tile host

The Team Eye, working against Workspace Kit, publishes one terminal Tile host:

```text
mount(session) · switchSession(session) · park() · destroy() · fit() · send(text)
```

It defines socket, xterm/tape/composer, focus, observer, keyboard and cleanup ownership.
Team Sessions and the focused Team terminal Tile consume it. Agent Configuration has zero
dependency on it.

### Gate E — Team draft and launch profile

New Team owns one canonical draft/controller shared with Agent Configuration. It must
represent Team-level defaults and one-or-many session seats without confusing `team_role`,
optional lead, `session_role`, provider/model, project root, permissions,
MCP/loadout settings or opening direction.

The gate also settles preflight, name collisions, session limits, launch order, partial
failure, retry and receipts. Agent Configuration may not invent a second payload.

### Gate F — Customize scope

Customize publishes a v1 matrix for macros, SOPs, actions/tools, role families, session roles,
skins, session readings and saved launches. Each resource is explicitly direct-edit,
guided agent handoff, or read-only. Stock/yours provenance and shadowing rules remain
visible.

## Five session charters

### Eye 1 — League and application integration

Consumes the separately owned Workspace Kit and owns:

- League registration with AppShell/ViewHost and global-navigation content;
- canonical session store and Team selectors;
- LeagueBoard and Team/session membership interactions;
- compatibility route for the existing terminal Tile grid during rollout.

Must deliver:

- Team cards, global roster visibility, separate session bubbles and New Team handoff;
- Unassigned behavior and explicit many-to-many drag/drop semantics;
- loading, empty, stale, failure and zero-Team states;
- deterministic behavior when Teams or sessions appear/disappear;

Must not own terminal internals, customization APIs or launch orchestration.

### Eye 2 — Team workspace

Owns both Team modes and the terminal Tile host as one workstream.

Must deliver:

- `40/20/40` WorkbenchLayout with collapse, bounded resize and persistence;
- focused terminal Tile selection from Kanban SessionCards;
- SessionCard readings and current-status hierarchy;
- Channel Surface with empty Chat plus Wipeboard, Docs and Team Configuration service adapters;
- Team-scoped one/two/four Sessions mode and Commons Surface;
- terminal Tile-host lifecycle and compact focused-session actions rail;
- removal of the old status light, context gauge and gauge-only support code;
- membership-change fallback behavior in both modes.

Chat is not an open implementation question in this rollout. It remains empty and inert.

Must not create a second Team store or launch profile.

### Eye 3 — Customize

Owns recipe discovery and authoring, not machine administration.

Must deliver:

- v1 capability matrix for every candidate resource;
- ExplorerLayout information architecture;
- direct editor, guided handoff or read-only behavior per resource;
- typed API/validation additions required by direct editors;
- stock/yours provenance, shadow warnings, save-failure behavior and upgrade safety;
- reuse of existing catalog caches and feature builders.

Admin Desk remains install-level configuration, services, roots, appearance, updates and
account. Customize does not clone it or expose unsafe raw file editing.

### Eye 4 — New Team

Owns Team definition, roster composition and the multi-session launch transaction.

Must deliver:

- detailed two-stage flow and transition between Team definition and roster building;
- `team_role`, Team name, brief/objective, root/repository defaults and validation;
- one-or-many session-seat editor driven by `role_family` and applicable `session_role`;
- optional-lead selection and per-seat override behavior;
- canonical Team draft and reusable non-DOM launch-profile controller;
- batch preflight, ordered launch, receipts, partial-failure and retry behavior;
- precise point at which the new Team becomes visible/selectable in League;
- draft/save/cancel semantics aligned with the accepted Team domain.

It reuses the existing single-session launch machinery. It does not clone the current
launcher DOM or overload one `session_role` into a list.

### Eye 5 — Agent Configuration

Owns the compact editor for one proposed Team session/seat.

Must deliver:

- precise v1 meaning of agent configuration;
- field precedence from system through `session_role` and explicit per-seat overrides;
  `role_family` is presentation and contributes no precedence layer;
- AgentConfigurationLayout with configuration and resolved-profile preview Surfaces;
- resolved-profile summary, validation and preview/apply/revert behavior;
- exact round-trip agreement with Eye 4's Team draft/controller;
- zero dependency on Eye 2's terminal Tile host;
- explicit exclusions for vendor CLI configuration and new named-loadout persistence if
  those remain outside v1.

It may work against fixture drafts after Gate E freezes. It must not create a competing
launch schema.

## Ownership map

| Shared seam | Exclusive owner |
|---|---|
| startup, routes, history, titles, workspace persistence | Workspace Kit owner |
| Commons/Configuration extraction | Workspace Kit owner |
| session store and Team selectors | Eye 1 |
| broad shell/layout CSS and shared primitives | Workspace Kit owner |
| terminal Tile host and Tile lifecycle | Eye 2 |
| Team workbench and Sessions-mode CSS | Eye 2 |
| customization APIs/editors | Eye 3 |
| Team draft/controller and batch launch API | Eye 4 |
| per-seat Agent Configuration UI | Eye 5 |

Feature CSS is namespaced beneath the feature root. Shared primitive changes go through the
foundation owner rather than five edits to a global stylesheet.

## Rollout sequence

### Phase 0 — Freeze the foundation

- Complete Workspace Kit implementation and browser review.
- Accept the Team-domain contract from `session_teams` and role/session-role/lead work.
- Record any vocabulary or schema changes in both build-outs.
- Keep the existing coworkspace available as the compatibility destination.

### Phase 1 — Launch five planning sessions

Create one visible Ronin session per Eye. Each reads Workspace Kit, the accepted Team-domain
documents, this charter, and the reviewed Five Eyes HTML. Each opens its assigned surface,
checks it against the written contract, and records any discrepancy before producing a
bounded plan, file/seam inventory, state model, API dependencies, responsive behavior and
verification journeys. No session starts an uncoordinated shared-file refactor.

### Phase 2 — Land shared gates

- Workspace Kit owner lands shell registration; Eye 1 lands Team projection and League integration.
- Eye 2 lands the terminal Tile-host contract and a compatibility adapter.
- Eyes 4 and 5 freeze the Team draft/profile schema, with Eye 4 owning implementation.
- Eye 3 freezes the Customize v1 capability matrix.

These are thin foundations, not hidden feature rewrites.

### Phase 3 — Parallel feature slices

After their gates, Eyes implement primarily in new namespaced modules:

- League can attach live Team/session data.
- Team can attach workbench, channels and Team-scoped Sessions mode.
- Customize can attach approved resource slices independently.
- New Team can attach the definition/roster flow and orchestration.
- Agent Configuration can attach to the frozen draft/profile controller.

Land small integrated slices on `dev`; do not hold five long-lived branches for a final
merge.

### Phase 4 — Cross-view integration

Review the system as one application:

- navigation, refresh, back/forward and per-tab restoration;
- Team creation appearing in League;
- Team switching and document titles;
- live membership changes across League, Team and Unassigned;
- focused-session and Sessions-slot fallback;
- repeated terminal Tile navigation without resource duplication;
- Commons/Configuration full-workspace behavior;
- responsive and keyboard behavior;
- launch receipts/failure recovery and configuration precedence;
- Customize provenance and failure states.

### Phase 5 — Cutover

Make League the default entry only after the compatibility grid, state migration and core
Team journeys are proven. Remove obsolete global-grid and overlay paths in separately
reviewable cleanup slices, not during first-route enablement.

## Verification contract

Implementation verification follows `docs/test-protocols.md`: run only
`bin/ronin-byoin`, once applicable work is complete, and report its single verdict. Do not
invent per-session shell test sequences. Browser review of the fixture and product remains
design/acceptance review, not a replacement test harness.

The integrated acceptance journeys cover:

- direct entry, refresh, history and per-tab restore for all five destinations;
- migration of existing one/two/four Tile state;
- global League roster show/hide and full-card Team navigation;
- many-to-many membership, removal and Unassigned behavior;
- `40/20/40`, `40/60`, `50/50`, resize, collapse and mobile composition;
- Teams larger than four and membership changes while both Team modes are open;
- one terminal Tile host with no duplicate sockets/listeners/observers/polls;
- no inherited Commons session header, status light or context gauge;
- Team definition plus one/many roster seats;
- preflight, successful launch, collision, capacity refusal, partial failure, retry and
  receipts;
- exact Agent Configuration/profile agreement;
- Customize provenance, shadows, validation, failures and unavailable services;
- keyboard focus and visible selection;
- every BYOIN SKIP reported as unverified, never passed.

## Ready to launch the five Eyes

The rollout may begin when:

- Workspace Kit passes its ready-to-unleash gate;
- the accepted Team-domain contract is linked and reflected here;
- each Eye has one exclusive charter and shared-file boundary;
- Team projection, terminal Tile host and Team draft each have exactly one owner;
- remaining product questions are named and assigned rather than hidden in fixtures;
- the existing coworkspace remains usable during incremental integration;
- the owner approves these two rewritten build-outs.
