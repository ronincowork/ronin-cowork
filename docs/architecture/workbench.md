# Workbench — construction and surface contract

This is the construction authority for Ronin Cowork Workbenches. The owner journey is
[Workbench — finding and arranging your work](../using-ronin/workbench.md); Workspace
Kit's lower-level primitives and lifecycle live in [Workspace Kit](workspace-kit.md).

A Workbench is one frame with a discovery column and two or four numbered workspaces.
It does not own feature data. It restores placement, creates independent surface
instances, and calls the placed instance's `show()` synchronously. The surface owns the
smallest reads needed to paint itself.

`public/js/phalanx.js` owns the shared Phalanx collection interaction: stones at rest,
a selected-stone rail beside its detail, focus return, Escape, and responsive geometry.
Consumers supply items and detail content; they do not recreate that movement privately.
A row may carry `items`. In full density pressing such a stone goes one level down: its
descendants become the rail's stones and the stone is the level's detail until one is
pressed. At rest in full density `branches` draws those items under their stone
(`'column'` stacks them; `'chart'` is one column per child with grandchildren stacked,
folded into a count past `CHART_DEPTH` until pressed). There is one way back from any
depth: Escape or the back stone returns to the top view, nothing selected, in the
density you were in. Switching density keeps the selection: a selected stone with items
becomes its level in full density, a level becomes its selected stone in compact, and
the stone open at that level returns with it. Consumers never restyle the rest geometry.

Trello view (`work.views`, `work-views-surface.js`) is the Cowork/Desk work-item card, over
GET `/api/work-items` (every item with its holder), with no phalanx, organised as a Trello board: its top-left button names the view and switches
it. Status lays one fixed-width list per stage, grouping under an underlined subtitle per
board that board's items (every descendant, `boardStages`) at that stage; Board lays one
list per board with a subtitle per stage it has items at. Each list carries its count at the
head and Add at the foot (the Add form, started in that list); Board view ends with Add board
(the Add form with New board chosen, held by the Team on a Team workbench). Board view puts
Unfiled last, in its own accent shade. On a Team, Add with no board of its own to start on
defaults to the Team's target board, read off `boards` and never stored: the oldest root the
Team holds, else the oldest its lead holds, else Unfiled. Cowork/Desk read
every item; a Team workbench draws the server's `?team=` reading `boards` (its boards and
Unfiled) and filters nothing in the browser. In Board view an item card drags onto another
board's list (one reparent call under that board; its children come with it) or onto empty
row space (reparent to none: a root); on a Team workbench a root made that way is then
assigned to the Team when it had no holder. The store writes each move's trail line. Every press opens an overlay
from `work-details.js`, whose one utility sits top right: Save (only while there is
something to save), Assign, Add (the Add form as an overlay, placed where it was pressed),
Close. The Add form, the same wherever Add appears, asks title, objective, status and
board: an existing board, New board (`root: true` on the create route: a root of its own) or
Unfiled, the default. Assign holds the item by an Agent or a Team.

Who (`collection.who`, `who-surface.js`) is the first door of the collections workbench
(owner, 2026-10-03: Who, What, Where — Teams, boards, workspace folders — each a surface of
the same stones with the other axes under them, drilled into in place). Its reading is one
request, GET `/api/collection` (`src/collection-read.ts`), the folder filter sent as `?root=`;
the browser joins nothing. One stone per Team: its name, nothing else. At rest
the fork stacks under each Team what the second question, Under each Team, chooses: its boards
as one-line bars (that board's items
folded away until the Team is pressed), or its Agents, the lead first and marked 人, an Agent
pressed opening its profile in place (the composition reader, with Launch); the surface header's one-line/two-line toggle (the
selector column's) folds the boards away by switching density. A board or an item bar is its title
and nothing else: the surface is a table of contents, saying where to drill, never a reading
of everything, and never a count of what is visible (owner, 2026-10-03). The top area is two `ask()` questions: Workspace, any
number of registered folders (none is all), which narrows the stones to the Teams working in
them (`?root=` repeated, the server narrowing to any of them; a Team in two folders is found
under either), and Under each Team, Boards or Agents, a one-of-two question
that flips on press (`ask.js`: two answers, no blank, nothing nested — no tray). Drill is the phalanx's own: press a Team and its
boards and items are the rail with the one Team profile (`team-profile.js`) beside; a board's
detail is `listDetail` (its items as item lines, each a press to that item's stone, the title
given the row and wrapping; the board's items stay out of the rail, only the item being viewed
showing under its board); an item's
detail is `itemDetail`. Bars drag (phalanx `draggable` and `events`, nothing new): an item
onto another board reparents it there, a board onto another Team assigns it, an Agent onto
another Team joins it and leaves the Team it was under; `whoMove` (who-rows.js) is the rule,
each move one call to the store, then the reading again. `who-rows.js` is the pure mapping,
under test.

**The phalanx and its fork** (owner ruling, 2026-10-03). `phalanx.js` is the stone work
surface as it was, its geometry untouched: Settings (Presets, Workspace Folders, Model
Providers, Setup), Team Chart, Work Items and the Trello view's overlays draw with it.
`collection-phalanx.js` is the fork for the collection doors, built on `createPhalanx`
(the same stones, rail, detail and way back, nothing copied): blocks centred at wide
spacing, each stone's children stacked under it as one-line bars (no connector line), an empty
stack drawing nothing, grandchildren folded away at rest and inset under their parent in
the rail (`data-cph-depth`, set by the fork through `attrs`), and a header that fits its
question.
Its root wears `.cph` and its host `.cph-host`; every rule is under that prefix. Who draws
with the fork; What and Where will.

Task Manager keeps its board and status/Project drill-downs for the Agent's Task Manager;
its selector card is no longer offered on the Cowork, Desk or Team workbenches. The older
Work Items board (`work-items`) stays on the Team workbench beside Trello view and in the
Agent's; Team reads its selected Team, Agent filters to Projects held by that Agent.

Work Items mounts `createPhalanx` directly in the standard surface content seat. Each
Project is a selectable stone in Ideas, Planning, Building, Landing, Done order. Selection
moves all groups into the left rail and renders the Project inside the same `sws-detail`;
it never opens another numbered workspace. `project-reading.js` holds the canonical
Project reading used by both presentations, with each supplying its own styling classes.
Work Items keeps normal Phalanx furniture, density controls, explicit holder opening,
and message-only stage drops. It does not use Task Manager's board or beige furniture.

The shared Phalanx accepts ordered `grouped.groups`, group/item event callbacks, item
actions, and `setDensity`; Work Items stones deliberately supply no action callback,
so the normal selection, rail, detail, Escape, and focus-return behavior applies.

## Library, profile, tenant, instance

`public/js/workbench.js` owns the shared library and frame.
`public/js/workbench-catalog.js` is the canonical registration and profile catalog for
Ronin Settings, New Project, Cowork, Team, and Agent. Destination modules provide tenant
data and surface factories through their environment; they do not register another copy
of those types or profile lists. Ronin Setup's ordered journey profile remains with its
Setup controller because journey progress, rather than destination choice, determines it.

`workbenchView(appearance, options)` in `public/js/workspace-contract.js` is the one
application-chrome declaration. It supplies the shared header capabilities and one of the
explicit Campaign, Setup, New Project, Cowork, Team, or Agent appearances; a view may also
supply its dynamic-island reading. `workspace-header.js` applies that declaration, while
surface factories remain ignorant of header colour.

Header content has two declared seats: `header.leading` appears before the centred
dynamic island and `header.actions` appears with the right-side controls. Both accept
elements or primitives exposing `.el`; the ViewHost alone places them. Standard controls
remain capability flags (`shape`, `ram`, `services`, and `feedback`), so a Workbench turns
one off in its declaration rather than hiding it with local CSS or querying header DOM.

- A **library definition** gives one stable type a header kind, discovery reading, and
  `create(context)` factory.
- A **profile** lists the library types one destination may place.
- A **tenant** supplies scope such as a Desk, Teams collection, or Team. It filters and
  parameterizes definitions; it does not create another Workbench implementation.
- An **instance** belongs to one workspace and optional resource key. The same type in
  two workspaces creates two rendered instances; data authorities may still be shared.
- `place(type, workspace, detail)` is the only placement path used by clicks, drag/drop,
  restoration, and programmatic openings.
- The frame owns the selector's compact/expanded action and persists `selectorDensity`
  beside shape, selection, arrangement, and seats. Profiles do not build another toggle.

The definition's `create()` draws the stable shell. Its returned `show()` or `enter()`
starts only that surface's reads. `leave()` parks active work and `destroy()` releases
surface-lifetime resources. See [the common lifecycle](workspace-kit.md#lifecycle-contract).

## The surface map and live arrangement

The surface map in the app bar is a miniature live model of the whole Workbench, not
merely a visibility menu. Each block represents an arrangement slot: a workspace column
or the discovery column. Its order and proportional width match the full Workbench.

The one arrangement state is `{ order, hidden, widths }`:

- **Show or hide:** click a map block. The last visible slot cannot be hidden, so the
  Workbench can never become an empty page.
- **Reorder:** drag a map block past a neighbor's midpoint. With the keyboard, focus a
  block and use Shift+Left or Shift+Right. The full columns move immediately, including
  their contents; surfaces are not destroyed or recreated.
- **Resize:** drag the divider between full-size Workbench columns, or focus that divider
  and use Left or Right. The adjacent column yields symmetrically. Minimum widths and the
  70% maximum trim the movement rather than refusing it. The surface map redraws during
  the drag, so its block proportions are the live resizing readout rather than a separate
  approximation.
- **Remember:** widths are stored by slot name, not position. A reordered slot carries
  its width; a hidden slot returns at its previous width; refresh restores the complete
  arrangement.

Visible widths are normalized across the remaining slots, and the frame writes each
slot's `compact` or `full` width class from its measured pixels. This lets a surface adapt
its reading without owning layout geometry. On phones the same ordered arrangement
becomes the responsive stack; desktop divider dragging is not imitated as a touch-only
second control.

`public/js/workspace-arrangement.js` owns the pure state transitions,
`public/js/workspace-layouts.js` owns column geometry and accessible dividers, and
`createLayoutMap()` in `public/js/workspace-primitives.js` renders the map. The ViewHost
mounts it for any active view exposing `arrangement`. A destination supplies slot names
and content only; it must not implement its own hiding, ordering, resizing, or persistence.

## Paint and data rule

A Workbench entry restores its shape and seats before network reads complete. A surface
paints saved or already-known values immediately when possible, then enriches choices or
status as its own reads return.

1. A destination must not await a catalog needed only by an unopened surface.
2. Discovery summaries may read a light index because the discovery column displays
   them. They must not use a detail, repository-analysis, or launch-assembly route.
3. A placed surface asks only for the data it displays or edits. It does not reuse a
   larger endpoint merely because that endpoint contains the required field.
4. Shared loaders may cache and deduplicate the same catalog. Caching may not broaden
   the request or turn it into a page-wide readiness gate.
5. Failure belongs to the requesting surface. One slow or failed read must not keep
   another workspace blank.
6. Async enrichment must not discard edits made after the first paint. Generation or
   ownership checks prevent stale responses from repainting replaced surfaces.

Campaign Defaults is the reference case. Its saved values are already in
`campaign.config.defaults`, so it paints them immediately. Model choices come from the
provider catalog and selectable Behaviors come from `/api/campaign-default-options`.
It does not call `/api/launch-seed`: that endpoint assembles a prospective Agent from a
Desk, Team, Workspace Folders, Agent defaults, Installations, and Behaviors, most of which
the Defaults surface neither displays nor edits.

## Entry, refresh, and intentional launch

A Workbench **tab instance**, not a destination or tenant, owns its current setup. The
open request names the destination and tenant, chooses shape and initial seats, and gets a
fresh tab-instance id. `openWorkbenchTab()` and ordinary Workbench doors use this path;
the destination's declared defaults complete any omitted fields. A direct route with no
request also creates a fresh default request. No new open recalls another tab's shape,
seats, selection, or presentation preferences.

On refresh (or browser history return), the same tab-instance id restores its entire
snapshot: tenant, arrangement, shape, selected workspace, seats, and preferences. The
one-shot request is consumed after the first entry and cannot replay over later edits.
`public/js/workspace.js` owns request, id, snapshot, and resolution through
`openWorkbenchTab()` and `workbenchEntry()`. A new tab receives a new id even if its
browser cloned the source tab's `sessionStorage`; that clone is not a refresh.

- **Replace:** the request replaces the default seat map and names its requested shape.
- **Overlay:** the request changes named seats and shape fields over destination defaults,
  never over a prior tab's state.
- **Refresh:** the saved snapshot wins in full. It is not merged with a fresh open request
  or a destination's first-open floor.

Destinations validate every requested type against their profile. Malformed or mismatched
requests fall through to destination defaults, not another tab's last setup. Feature code
must not copy another tab's storage, temporarily mutate a source view, or add link-specific
restoration branches.

| Destination | First open | Notable structured opening |
|---|---|---|
| Ronin Settings | Defaults in workspace 1; Workspace Folders in workspace 2 | **Desk defaults** replaces the seats with Defaults and Launch your own |
| Desk | Teams overview in workspace 1; Trello view in workspace 2 | Status and Project drill-downs retain the Desk tenant |
| New Project | New Agent in workspace 1 | Links may replace or overlay New Agent/New Team and carry prompt or template detail |
| Ronin Setup | Garden in workspace 1; active journey surface in workspace 2 | Journey actions select a Setup surface without another restoration path |
| Cowork / Team | Fresh empty/member seating rules; refresh restores this instance | Team Configuration, documents, commons tabs, and New Agent may be addressed in seat detail |
| Agent | Self in workspace 1; Documents in workspace 2 | A successful standalone launch replaces the seats and focuses the authoritative returned Agent as Self |

## Surface inventory and required data

This records the implemented boundary. Update it in the same change that adds a surface,
changes its dependency, or changes a Workbench profile.

### Ronin Settings (`campaign` profile)

Entry reads the Desk record because it is the tenant and uses the light Workspace Folder
index for the discovery count. Nothing waits on either read before seats paint. The former
page-wide progressive gate is deleted.

| Surface | Required data and owner |
|---|---|
| Desk | selected Desk record already held by the tenant |
| Desk profile | selected Desk record; skin catalog enriches choices after paint |
| Defaults | `campaign.config.defaults` immediately; provider catalog and Campaign-default options afterward |
| Workspace Folders | its own root-detail read; repository facts belong here, not in its discovery summary |
| Installations | installation catalog and installed facts; Desk values come from the tenant |
| Model providers | provider runtime/catalog owned by `provider-surface.js` |
| Machine | the selected cowork-commons tab owns its read; unopened tabs do no work |
| Register / Launch your own | registration or embedded launch-form reads owned by that shared Setup surface |
| Mika / terminal | readiness and terminal transport only when placed or deliberately prewarmed |
| Document / Feedback / Password | each shared surface owns its operation |

### New Project (`launch` profile)

Entry performs no form catalog read. It restores and places the requested form first.

| Surface | Required data and owner |
|---|---|
| New Agent | Agent templates, Team roster index, Workspace Folder details, and selected Team/Desk launch seed |
| New Team | Team templates, Workspace Folder index, and Desk launch seed; live sessions only for the final name-collision gate |
| Help | local reading and currently seated form context |
| Document / Feedback | the shared surface's own read or submission |

### Ronin Setup (`setup` profile)

The Garden and selected journey surface seat immediately. Garden content, setup runtime,
and small registration/GitHub completion facts hydrate the journey and discovery column
independently.

| Surface | Required data and owner |
|---|---|
| Garden | static garden catalog; selected scene only |
| Register | registration and user-introduction records |
| Model providers | provider runtime/catalog owned by the shared provider surface |
| Workspace Folders | Workspace Folder details and GitHub connection state |
| Installations | Desk record, installation catalog, and installed facts |
| Password | authentication state owned by the shared Password surface |
| Bounty Program | registration/GitHub facts and the explicit preference it writes |
| Launch your own | no launch data until Agent, Team, or Preset is selected; that embedded form then owns its reads |
| Presets | preset catalog plus provider/root choices required by the selected preset |

### Desk, Cowork, and Team (`desk`, `cowork`, and `team` profiles)

Desk is a first-class Workbench profile and tenant with its own restoration namespace and
first-open map; it is not a renamed Cowork entry. Desk and Cowork reuse aggregate surface
implementations, while Team addresses one Team. Sessions and Team records are legitimate
entry data because they are the discovery cards and seats. Optional feature status is
independent and must not hold the frame.

| Surface | Required data and owner |
|---|---|
| Team roster / Team profile | Team records and live session-derived membership; the roster's Phalanx is Cowork/Desk's only discovery of Teams (no per-Team selector cards); its detail, a placed Team profile and Who's stone detail paint one body, `createTeamProfile` in `team-profile.js` (owner, 2026-10-03: one Team profile format): head with Launch; Agents, each a block with its live dot, 人 and name, the items it holds as lines beneath and Launch at the right, the name opening the Agent's composition reader in place under it; one section per board the Team works on (its collection reading, `?team=`), its items as lines; Configuration with Delete team; no numbering; the plus adds an Agent. An item line pressed selects the item's stone on Who and opens the item overlay on a surface |
| Team Chart | Selected Team membership and lead designation; Phalanx owns collection and selection geometry, and its in-place detail embeds the canonical Agent composition reader plus the secondary Launch action |
| Team roster (`cowork.session-roster`) | `js/roster.js` restored as consumed before the Phalanx port: Team records, live sessions and pushed home rows; its desk column stays empty now that desks are read when the ladder opens |
| Agent terminal | selected session plus terminal transport; other sessions are not mounted for it |
| Commons | only the selected tab enters: Roster, Docs, Wipeboard, Messages, Configuration, or another registered room |
| Task Manager | Desk scope aggregates the canonical per-Team Project readings; Team scope reads the selected Team; status and Project drill-downs are independently placeable surfaces carrying the same tenant |
| Cron jobs | scheduled messages for the addressed Team or collection scope |
| New Agent / New Team | canonical launch form and its dependencies listed above |
| Archived sessions | archive manifests when shown |
| Presets / Document / Feedback | the shared surface's own reads |

### Agent (`agent` profile)

The route parameter is the tenant Agent. Its terminal can paint before Team and optional
service reads finish. Team membership and Task Manager choices enrich independently.

| Surface | Required data and owner |
|---|---|
| Self | route Agent plus the shared terminal host and transport |
| Agent Documents | the Agent's tracked documents in one untabbed work surface |
| Agent Task Manager | the route Agent's Projects across its current Teams, filtered by the canonical holder returned with each Team Project reading |
| Team membership | Team records and live session tags from `team-controller.js`; writes use the canonical session-membership route |
| Status / Project drill-down | the same Agent tenant and Team reads as Task Manager; each is an independently placeable surface and writes no Project data |
| Document / Feedback | each shared surface's own read or submission |

## Change checklist

When adding or changing a Workbench surface:

1. Register one stable type and include it only in profiles that may expose it.
2. Record its tenant input, discovery-summary input, first-paint input, and async
   enrichment input above.
3. Keep requests in the returned surface lifecycle unless data visibly belongs to the
   discovery column or defines the tenant/seats.
4. Define first-open placement separately from structured launches.
5. Verify refresh restores remembered state and does not replay a launch.
6. Verify a slow surface does not delay another surface or the frame.
7. Remove the superseded loader, route branch, cache, and test; never retain two entry or
   readiness mechanisms.

The visible-surface index in [`public/js/README.md`](../../public/js/README.md) maps each
surface to routes, state authority, and focused checks.
