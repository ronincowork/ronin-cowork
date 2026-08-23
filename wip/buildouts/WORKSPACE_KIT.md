# WORKSPACE KIT — shared foundation for Five Eyes

## Purpose

Workspace Kit is the common UI and runtime foundation beneath the five Team-oriented
destinations. It prevents League, Team, Customize, New Team, and Agent Configuration from
building separate shells, terminal hosts, pane systems, cards, navigation rules, or state
models.

It is infrastructure, not a sixth product view. The kit supplies the stage and interaction
contracts; each Five Eye supplies its feature data and behavior.

The reviewed fixture is `../ronin-lab/concepts/five-eyes.html`, available at
`http://100.101.235.17:8099/five-eyes.html`; its reviewed artifact commit is `f9510ef`. It
is a durable visual contract and browser-review tool, not production code or a source of
product data. Every Eye receives it with this kit and `FIVE_EYES.md`, opens its assigned
surface, and reconciles any difference before implementation begins.

## Product rules already settled

These decisions are no longer design questions for individual Eyes:

- The application is Team-oriented. The current one/two/four terminal grid becomes one
  Team mode, not the application shell.
- There is one application header. Destinations and panes do not automatically add second
  and third identity headers.
- A destination owns the complete workspace beneath the application header.
- Commons and Configuration are full workspace destinations, not overlays mounted over a
  session tile.
- Closing a destination such as Commons returns through application history to the prior
  valid location.
- The unexplained connection/status light and context-gauge bowl do not carry forward.
- New browser tabs start at League. The `＋` beside League/Home opens that new tab.
- The right-side `Teams` menu lists Team names and switches the current tab directly.
- A Team browser tab uses the Team name as its document/tab title.
- `Unassigned`, not Ronin, is the holding area for live sessions with no Team membership.
- Team membership is stored on sessions and is many-to-many. Removing membership never
  kills the session.
- A durable `team_roster` stores Team identity, `team_role`, objective, launch defaults,
  wipeboard link and lifecycle state, including Teams with zero live members.
- Members and leads are never copied into `team_roster`; they are derived from live
  session membership and lead metadata.

## Architectural boundary

Today `Tile` combines six responsibilities: grid cell, session selection, terminal
connection, session header, overlay host, and persisted workspace slot. Those
responsibilities must split.

```text
AppShell
├── AppBar
└── ViewHost
    └── WorkspaceView
        └── layout composition
            ├── Pane
            ├── Card / CardGrid
            ├── ExplorerRail
            ├── SessionTerminal / SessionPane
            └── ChannelPane
```

The boundaries are strict:

- `AppShell` owns global navigation, browser history, workspace persistence, application
  errors and the single `ViewHost`.
- `WorkspaceView` is a first-class destination that occupies the entire `ViewHost`.
- `Pane` is a generic content region. It has no session or Team assumptions.
- `SessionTerminal` owns terminal transport and rendering without compulsory chrome.
- `SessionPane` deliberately composes terminal chrome with `SessionTerminal`.
- `Tile` may remain a user-facing word in Sessions mode, but it is no longer the generic
  architectural container.

## Application shell

### Navigation

The shell exposes one navigation API and one view registry. Feature views do not manipulate
browser history, document titles, root DOM, or storage directly.

The production destinations are:

```text
league
team/:team
customize
new-team
agent-config/:draft-or-team?
commons/:team?
configuration
```

The exact URL mechanism—hash routes or server-backed clean paths—must account for staging
and direct entry. That implementation choice belongs to the shell owner.

Navigation behavior:

- League/Home returns the current tab to League.
- `＋` opens a new browser tab at League.
- Selecting a Team card opens that Team in the current tab.
- `Teams` switches the current Team directly in the current tab.
- Browser back/forward and destination close use shell history.
- An invalid remembered Team or destination falls back safely to League.
- The preview's five destination buttons are fixture-only navigation.

### Workspace state

Use one versioned, per-browser-tab workspace record. At minimum it contains:

```text
current destination
selected Team
Team mode: team | sessions
focused session
left / Kanban / right collapsed states
left and right expanded widths
Sessions-mode layout and slots
return location
```

The shell owns migration from `tmuxgrid.sessions` and `tmuxgrid.layout`. Individual views
must not invent localStorage keys.

### View lifecycle

Every destination follows one observable lifecycle:

```text
mount(host, context)
enter(context)
leave()
destroy()
```

A terminal-bearing view may remain parked rather than destroyed, but that decision must be
explicit. Repeated navigation must not multiply sockets, listeners, observers, timers,
polls, keyboard bindings, or composers.

## Shared primitives

### Pane

A Pane provides:

- optional earned local controls, without compulsory identity chrome;
- content mount and overflow policy;
- collapse state where supported;
- loading, empty, stale, failed and unavailable states;
- keyboard focus and responsive behavior.

Feature meaning comes from the mounted component, not a proliferation of architectural
`pane_kind` classes.

### Card

One card primitive provides:

- heading, optional mark and summary;
- metadata/readings;
- selected, active, warning and stale states;
- whole-card primary action;
- optional secondary actions;
- dotted creation variant;
- keyboard focus and responsive sizing.

`TeamCard`, `SessionCard`, `RecipeCard`, and `AgentSeatCard` are compositions of this
primitive rather than independent visual systems.

### ExplorerRail

ExplorerRail owns hierarchical sections, selection, optional counts/provenance, collapse,
keyboard traversal, loading/empty states, and a narrow-screen drawer treatment. Customize
is its first consumer; Configuration may reuse it later.

### SessionTerminal and SessionPane

Terminal mechanics must be extracted from the current Tile shell:

```text
SessionTerminal
├── live tmux renderer
├── condensed/tape renderer
├── composer/input
├── connection lifecycle
├── focus and fitting
└── optional terminal-specific controls
```

Required host contract:

```text
mount(session)
switchSession(session)
park()
destroy()
fit()
send(text)
```

The contract names the owner of `TileWire`, xterm/tape/composer resources, focus, resize
observers, keyboard behavior and teardown. No view creates a second terminal transport.

Three deliberate compositions consume it:

- full `SessionPane` for Team Sessions mode;
- reduced terminal pane for the focused Team session;
- clean terminal pane for Agent Configuration.

The focused Team terminal keeps a compact session-actions rail for macros, terminal
mode/lock, Team membership, Control, note, and destructive/more actions. It does not repeat
session identity, `session_role`, status, model, connection state, or Team identity already visible
in the selected session card and application header.

### ChannelPane

The Team right region is one ChannelPane with local tabs:

- `Chat` — owner interaction with the focused session or future native Ronin chat/voice;
- `Wipeboard` — chronological agent-to-agent posts and composer only;
- `Docs` — Team working documents;
- `Team Config` — durable `team_roster` fields plus a derived live roster and membership
  controls.

These are replacement tabs within one pane, not permanent columns or another page header.
The Brief does not appear on the Wipeboard.

The kit defines ChannelPane geometry, tab behavior, standard states and composition slots.
The Team Eye must still settle the actual Chat protocol.

### Standard states

Every shared surface supports the same language for loading, genuine emptiness, stale but
usable data, failed load, unavailable optional service, and inert/permission state. Typed
work survives failures. Stale content remains visible and labelled. An unavailable optional
service remains opaque and is not fetched.

## Named layout compositions

The kit provides a small set of named compositions, not a generic drag-anything dashboard.

### LeagueBoard

LeagueBoard displays the durable Team roster list—including Teams with zero live
members—plus any compatibility representation required for tag-only Teams, and a dotted
New Team card.

Each unit has two visually separate objects:

1. The upper Team card contains Team identity, objective and working context. The entire
   box is the navigation target.
2. Optional session bubbles hang beneath it. They are roster membership objects with their
   own drag/drop and removal behavior.

One League-header control switches all rosters together: `Show rosters` or `Hide rosters`.
There are no per-Team disclosure buttons.

Expanded session bubbles show the useful compact roster readings: `session_role` mark,
SHINGO position and age, agent/model or working state, and current status where space
permits.

Membership behavior:

- dropping a session onto a Team adds that Team membership without removing other Teams;
- the red `×` removes only that Team membership and never kills the session;
- a session may appear beneath several Teams;
- sessions with zero Team memberships appear beneath `Unassigned`;
- `Unassigned` uses the ordinary Team-card treatment, without a dashed border or special
  emphasis;
- assigning an Unassigned session removes it from that holding area;
- dropping onto Unassigned explicitly clears all real Team memberships.

### WorkbenchLayout

The default Team mode is:

```text
┌────────────────┬──────────┬────────────────┐
│ Focus terminal │ Kanban   │ Channel pane   │
│                │ sessions │                │
└────────────────┴──────────┴────────────────┘
```

All three regions can collapse. The left terminal and right ChannelPane are independently
resizable with bounded splitters.

Sizing contract:

- all open: `40 / 20 / 40`;
- Kanban plus one working pane: `40 / 60` (Kanban / working pane);
- Kanban closed with both working panes: `50 / 50`;
- collapse remembers the last expanded custom width;
- returning to three panes restores that width within current bounds;
- widths and collapsed states persist in the current tab;
- phone layouts use swipe/stack composition rather than tiny resize handles.

The Kanban has no redundant “Team roster” header. Each larger SessionCard contains the
`session_role` mark, SHINGO position and age, agent/model and working state, and a short recent
status paragraph. Selecting the card switches the focused terminal. The final card is
`＋ Add team member`, offering an existing Unassigned session or a new session.

### SessionGrid

Team Sessions mode preserves the useful one/two/four terminal arrangements while
constraining eligible sessions to one selected Team. Restored slots are revalidated against
current Team membership.

A Team Commons tile may occupy a slot, but it is a real non-terminal tile with its own
Roster, Wipeboard, Docs, and Team Config tabs. It does not retain an irrelevant session
header.

### ExplorerLayout

ExplorerLayout pairs ExplorerRail with one selected resource or editor host. The rail owns
selection; the content host owns the selected feature.

### CompactTerminalLayout

Agent Configuration pairs compact configuration with a clean terminal/preview. It may
share two-column mechanics with ExplorerLayout without inheriting explorer semantics or
ordinary session-management buttons.

### NewTeamLayout

New Team has two explicit product stages:

1. define the Team—name, `team_role`, objective/brief, roots, repositories and Team defaults;
2. build the roster—one or many proposed sessions, each chosen through `role_family` and
   its applicable `session_role` configuration, including the lead.

The kit provides form, card, notice, validation-state and multi-stage composition
primitives only. The New Team Eye owns the detailed interaction and transaction design.

## Commons and Configuration

Commons becomes a full WorkspaceView. It receives only its own identity, tabs and actions.
Closing it uses shell history to restore the previous valid view/session.

Configuration/Admin also becomes a full WorkspaceView rather than an overlay over a hidden
terminal. Existing room builders and data behavior should be adapted, not rewritten as part
of the kit.

## Implementation sequence

1. **Shell and vocabulary** — root mount, AppShell/ViewHost boundaries, routes, history,
   title policy, workspace schema and legacy migration.
2. **Lifecycle** — idempotent view registry, enter/leave/park/destroy behavior and safe
   return navigation.
3. **Primitives** — Pane, Card, standard states, focus behavior and shared tokens.
4. **Layouts** — LeagueBoard, WorkbenchLayout, SessionGrid, ExplorerLayout,
   CompactTerminalLayout and NewTeamLayout.
5. **Terminal extraction** — SessionTerminal contract plus full, reduced and clean
   compositions.
6. **Commons/Configuration extraction** — full workspace ownership and history-based close.
7. **Browser-reviewed blanks** — desktop, tablet and phone review using fixture data.
8. **Owner gate** — freeze the kit contracts before feature sessions implement their Eyes.

This sequence may use small vertical slices, but one integration owner controls shared
shell and primitive files.

## What each Eye receives

| Eye | Workspace Kit contract |
|---|---|
| League | AppShell, LeagueBoard, TeamCard, session bubble, dotted creation card |
| Team | WorkbenchLayout, SessionCard, reduced SessionPane, ChannelPane, SessionGrid |
| Customize | ExplorerLayout, ExplorerRail, Pane, RecipeCard, editor host |
| New Team | NewTeamLayout, AgentSeatCard, forms, notices and validation states |
| Agent Configuration | CompactTerminalLayout, AgentSeatCard, clean SessionPane |

The Eyes attach feature behavior to these contracts. They do not recreate their geometry.

## Ownership and constraints

The Workspace Kit integration owner exclusively owns:

- startup, root mount, route registry and browser history;
- workspace persistence and migration;
- broad shell/layout CSS and responsive rules;
- primitive APIs and shared tokens;
- fixture gallery;
- lifecycle extraction from the current global grid.

Hard constraints:

- Build shared primitives only when at least two named consumers exist.
- One application header is the default; local chrome must earn its space.
- Do not restore the status light or context gauge in another form.
- Do not implement Five Eyes feature behavior under cover of fixture work.
- Do not let view modules reach into another view's DOM.
- Preserve many-to-many, session-owned Team membership.
- Keep the current coworkspace usable during incremental extraction.
- Follow `docs/ui.md` and KOTOBA vocabulary.
- Repository verification is only `bin/ronin-byoin` after implementation; no hand-rolled
  test sequence.

## Verification for the production kit

The completed implementation must demonstrate:

- direct entry, refresh, back/forward and return-to-previous behavior;
- legacy one/two/four workspace migration;
- Commons and Configuration occupying the complete workspace without inherited session
  controls;
- repeated navigation without duplicate resources;
- desktop, tablet and phone behavior for every named layout;
- keyboard focus order and visible selection;
- standard loading/empty/stale/failure/unavailable states;
- one terminal host serving full, reduced and clean compositions;
- correct `40/20/40`, `40/60`, `50/50`, collapse and resize behavior;
- fixture removal without removing production primitives;
- the final `bin/ronin-byoin` verdict, with SKIPs reported as unverified.

## Ready-to-unleash gate

Workspace Kit is ready for the five feature sessions when:

- the shell, state migration and lifecycle contracts are implemented and reviewed;
- the named layouts and primitives are browser-reviewed across breakpoints;
- Commons and Configuration no longer depend on session-tile overlays;
- the terminal host can be composed with full, reduced or no session chrome;
- each Eye can work mainly in namespaced modules without editing shared shell files;
- unresolved feature questions are explicitly assigned to one Eye;
- the owner approves the blank gallery and this contract.
