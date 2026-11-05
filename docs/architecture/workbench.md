# Workbench — construction and surface contract

This is the construction authority for Ronin Cowork Workbenches. The owner journey is
[Workbench — finding and arranging your work](../using-ronin/workbench.md); Workspace
Kit's lower-level primitives and lifecycle live in [Workspace Kit](workspace-kit.md).

A Workbench is one frame with a discovery column and two or four numbered workspaces.
It does not own feature data. It restores placement, creates independent surface
instances, and calls the placed instance's `show()` synchronously. The surface owns the
smallest reads needed to paint itself.

`public/js/phalanx.js` owns the shared Phalanx collection interaction: stones at rest,
a selected-stone rail beside its detail, focus return, Escape, and responsive geometry (at rest
up to four stones across, fewer as the seat narrows).
Consumers supply items and detail content; they do not recreate that movement privately.
A row may carry `items`. In full density pressing such a stone goes one level down: its
descendants become the rail's stones and the stone is the level's detail until one is
pressed. At rest in full density `branches` draws those items under their stone
(`'column'` stacks them; `'chart'` is one column per child with grandchildren stacked,
folded into a count past `CHART_DEPTH` until pressed). There is one way back from any
depth: Escape or the Return stone (small, on the inset) returns to the top view, nothing selected, in the
density you were in. Switching density keeps the selection: a selected stone with items
becomes its level in full density, a level becomes its selected stone in compact, and
the stone open at that level returns with it. Consumers never restyle the rest geometry.

**The phalanx** (owner ruling, 2026-10-03). `phalanx.js` is the stone work
surface as it was, its geometry untouched: Settings (Presets, Workspace Folders, Model
Providers, Setup) and the Agent workbench's Work Items draw with it. Escape lifts only the layer it
is pressed in (2026-10-08).

Ronin has no board (owner, 2026-10-23): a board is Jira's or Trello's. Work Items
(`work-items`) stays on the Agent's workbench, filtered to the work items held by that
Agent. **The Team page** (owner, 2026-10-18) is the old Team workbench opening on the
lead's tile in workspace 1 with workspace 2 blank; its selector holds Commons, the Agents,
New Agent and the hints (Agent vocabulary, Session controls). Team Chart and the Team's Work
Items card are deleted; the composition reader, Behaviors and Feedback stay in the profile
only so the roster, New Agent's Customize Behaviors and the bar's Feedback can place them.
Launch of a Team is always a new tab (`openWorkspaceTab`).

Work items read as phalanx stones (`createItemPhalanx` in `work-items-surface.js`), on the
Agent's Work Items surface, a Team's Work items step on the Teams workbench and an opened
member on the Team roster. Stones group by parent: each epic heads its group, then its
items, each followed by its subtasks; items under no epic group under *No epic*. A stone
shows the title, the holder, and id · kind · status with ⚑ when flagged. Pressing one moves
the stones to the rail and renders its reading inside the same `sws-detail`: objective,
priority, holder, parent, comments, attachments (each opens as a document beside it),
links and history. It is a reading: changes go through the `item` tool. The stones supply
no action callback, so the normal selection, rail, detail, Escape and focus-return
behavior applies; dragging a stone onto a tile hands the Agent the item's reference.

## Library, profile, tenant, instance

`public/js/workbench.js` owns the shared library and frame.
`public/js/workbench-catalog.js` is the canonical registration and profile catalog for
Ronin Settings, New Project, Cowork, Team, Agent, and Home's Models and Workspaces
doors. Destination modules provide tenant
data and surface factories through their environment; they do not register another copy
of those types or profile lists. Ronin Setup's ordered journey profile remains with its
Setup controller because journey progress, rather than destination choice, determines it.

`workbenchView(appearance, options)` in `public/js/workspace-contract.js` is the one
application-chrome declaration. It supplies the shared header capabilities and one of the
explicit Campaign, Setup, New Project (`launch`), Cowork, Team, Agent, Models or
Workspaces appearances; a view may also
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
- A **tenant** supplies scope such as a Teams collection or Team. It filters and
  parameterizes definitions; it does not create another Workbench implementation.
- An **instance** belongs to one workspace and optional resource key. The same type in
  two workspaces creates two rendered instances; data authorities may still be shared.
- `place(type, workspace, detail)` is the only placement path used by clicks, drag/drop,
  restoration, and programmatic openings.
- The frame owns the selector's compact/expanded action and persists `selectorDensity`
  beside shape, selection, arrangement, and seats. Profiles do not build another toggle.

A surface's header ends with its window control, −, which the Workbench seats.

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

**Ronin Home** (`campaign-home.js`; owner, 2026-10-19) stays a page, not a Workbench: Teams,
Workspaces and Epics in a triangle (owner, 2026-11-02), with Models, Help and Settings smaller stones
in a column inset on the right — each a link to a Workbench destination of its own,
opened in the same tab (a modified press opens a new tab through `workbenchLaunchUrl`). The
Teams door opens the Teams workbench (`#/cowork`, `cowork-view.js`; owner, 2026-10-20). Models and
Workspaces are one shape (`door-workbenches.js`): the Kit Workbench on a profile of the
door's surfaces, the door's surface seated in Workspace 1 on first open. Models seats its own
stones of providers (`models-surface.js`, `models.stones`): a stone pressed opens the provider's
page beside the rail; a stone dragged into a workspace, or the provider's selector card, places
the provider there whole (`models.provider`), the page with no rail. The cards follow the Team page
(owner, 2026-10-20): a provider's or a folder's card is an entity card like an Agent's
(`wk-selector-entity`), the three admin doors dotted like New Agent, and the stones surface heads
the selector as a solid card (Models, Workspaces) as the Teams card heads the Cowork selector. The Models stones carry
no refresh door; the selector's second card, **Model refresh** (`models.refresh`, solid utility, after Models), does:
its surface is the Refresh all control Settings' provider surface carries — the one `createRefreshAll` export, its
last-ran line and notice — with an empty slot under it for the models.dev update (owner, 2026-10-20). The third card,
**Defaults** (`models.defaults`, solid utility, after Model refresh; owner, 2026-10-21), sets the model a new Agent,
a new Team lead and Mika start on: ⚙ Configuration's own `models` section drawn alone (`buildMachineSettings(…, { only:
'models' })`), each row saving itself — one record, two views. **The Agent Harness workbench** (KAN-236; owner,
2026-11-04) is this door under its new word on Home, opened in the four-tilespace shape: the stones (now the **Harness**
card) in tilespace 1, **Accounts** (`accounts.records`, `accounts-surface.js`) in 2, **Models** (`models.records`,
`models-records-surface.js`, with the Defaults surface embedded) in 3 and **Refresh** (`models.refresh` under its new
word) in 4; Model refresh's steps read Harnesses · Accounts · Model info · Review, the Accounts step each account's
Discover. Accounts and presets are one reading of the Hermes record (`src/accounts.ts`, `/api/accounts`, `/api/presets`):
a key added on Accounts is the connection the Hermes page shows. The existing types, surfaces and stones are
unchanged but for their words; the route id stays `models` so saved arrangements survive. Settings' Model
Providers surface is untouched; all draw with the one drawing `provider-surface.js` exports
(`createProviderDrawing`, `createRefreshAll`, `providerStones`) over the same record and measure. Workspaces seats
its own stones of Workspaces (`workspaces-surface.js`, `workspaces.records`): a pressed one's page is the whole
Workspace, its folders ticked in a browser of this machine (owner, 2026-11-02), with GitHub CLI beside them;
one read of the pinned folders per bench (`createRootsReading`, the detail route). Epics (owner, 2026-11-02;
KAN-187) seats its own stones of Epics the same way (`epics-surface.js`, `epics.records`): the level-1 work items of
the Campaign — the store's pushed `epics` and `epicItems`, no request (KAN-190, KAN-206). The stones stay at rest (no
side rail): a pressed Epic opens in Tilespace 2 as its worksurface (`epics.record`), as a dragged stone or its selector
card places it anywhere. The worksurface: where it comes from (Jira key, or Ronin only) and its holder; one row of
statuses, a hidden one carrying its count, an empty one not shown; each status that is out as its items' cards (In
Review out on arrival), a card's title whole and its holder, which opens that Agent or Team; a card pressed opens in
place to its statuses as buttons (`/transition`), objective and comments. No history, no Jira fields. The bar's crumb (`workspace-header.js`;
owner, 2026-10-20) reads RoninCowork   Home • Teams • <Team title> on a Team page — a gap, not a dot,
after the brand (`--space-subsection`; owner, 2026-10-24) — Home to `#/home`, Teams to `#/cowork`;
the Teams workbench ends at Teams, and a view naming its own `place` (Models, Workspaces, Epics, Help,
Setup, Settings) reads RoninCowork   Home • <place>.
The Teams workbench's Teams card (`team-roster-surface.js`; owner, 2026-10-20) carries, above its
stones, the Workspace question (many-of, blank All) and the Show question (Theme on; State,
Agents, Items); each stone is the Team's name with what Show picks under it, a cell per picked
topic in Show's order, the phalanx laying the stones and their cells on one grid so each topic is
a row aligned across the stones (`branches: 'column'`, a row's `under`; `teams-surface-rows.js`
over the pushed rosters' `board` (the Team's epic) and `items`): Theme and State plain clamped text, each Agent and
each Item a branch row; the 人 mark in a stone's corner opens the Team page in a new tab.
Help (owner, 2026-10-21) is the same door shape seating two workspaces: the help outline
(`help.outline`, `help-outline.js`) in Workspace 1 and Mika (`help.mika`) in Workspace 2. A page stone
dragged into a workspace reads that page whole there (`help.page`, no selector card). A Tile
built with `opensOn: 'reading'` spends the touch screens' open-on-the-reading intention on a desk too,
and before her record has anything in it; a Mika born by the seat gets a fresh tile once she is up.
The gate (owner, 2026-10-19): as on the old root, the Models, Workspaces and Teams doors are locked (Help
stays open, owner 2026-10-21; with no provider its Mika seat is one line pointing to Setup) until one model
provider is activated (`/api/setup/runtime`'s `activated_count`), each saying so under its name,
and Settings is the one live stone — a new user's way in is Setup.

**One root** (owner, 2026-11-02; KAN-197). That page is the only root: the old Home at `#/current`
and the bar's Current/Next toggle are deleted, and an old `#/current` link falls to the safe view,
Home.

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

### Cowork and Team (`cowork` and `team` profiles)

Cowork is the Teams workbench (`#/cowork`), the one aggregate surface over every Team; Team
addresses one Team. (The Desk workbench, a card-for-card duplicate of Cowork, was deleted on
2026-10-20; the desk PROFILE — skins, words, layout — is a different thing and stays.) Sessions and Team records are legitimate
entry data because they are the discovery cards and seats. Optional feature status is
independent and must not hold the frame.

| Surface | Required data and owner |
|---|---|
| Team roster / Team profile | Team records and live session-derived membership; the roster's Phalanx is Cowork's only discovery of Teams (no per-Team selector cards); its detail and a placed Team profile paint one body (`leagueTeamBody` in `cowork-view.js`) |
| Team roster (`cowork.session-roster`) | `js/roster.js` restored as consumed before the Phalanx port: Team records, live sessions and pushed home rows; its desk column stays empty: desks are read when the work record opens |
| Agent terminal | selected session plus terminal transport; other sessions are not mounted for it |
| Commons | only the selected tab enters: Roster, Docs, Wipeboard, Messages, Cron jobs or Configuration |
| Cron jobs | scheduled messages for the addressed Team or collection scope |
| New Agent / New Team | canonical launch form and its dependencies listed above |
| Archived sessions | archive manifests when shown |
| Presets / Document / Feedback | the shared surface's own reads |

### Models (`models` profile)

The door's own destination over the provider drawing Settings and Setup share.

| Surface | Required data and owner |
|---|---|
| Model stones (`models.stones`) | the recorded provider summary and catalog through `recordRuntime()`; a measure only on a press, as on Settings |
| Model refresh (`models.refresh`) | the same record; the Refresh all press (`/api/setup/providers/refresh`) through the shared drawing's measure; the slot under it is the models.dev update's |
| Defaults (`models.defaults`) | `GET /api/machine-settings`, the schema's `models` section; each row PATCHes `agents` (`sessions.default`, `sessions.lead`, `jobs.mikaassist.level`) |
| Model provider (`models.provider`) | the same record for the one provider named in its detail; its selector cards come from `providerOffers()` over the same record |

### Workspaces (`workspaces` profile)

The door's own destination: the Workspaces and their pages, over one read of the pinned folders per
bench (`/api/project-roots/detail`).

| Surface | Required data and owner |
|---|---|
| Workspaces (`workspaces.records`) | `/api/workspaces` for the Campaign the tab looks at; the page writes `PUT /api/workspaces/:name`. Its Locations: a browser of this machine from the home folder (`/api/folders`), a tick box per folder; ticking pins a folder not pinned yet (`POST /api/project-roots`) and holds it by name, the ones with Git as repositories, the rest as folders. A Git folder's How Agents work here writes the repo profile. Clone a repo (`/api/setup/github/clone` with `parent`) asks the repository, then clones into the folder its own browser is open on. Section order: Name & objective, Locations, Agent info. A `/files/<path>` link dropped from Files adds `$HOME/<path>`. Owner, 2026-11-02/03 |
| GitHub CLI (`workspaces.github`) | the GitHub setup read and session attachment `github-workspace-setup.js` owns, one instance per bench |

### Agent (`agent` profile)

The route parameter is the tenant Agent. Its terminal can paint before Team and optional
service reads finish. Team membership and Work Items enrich independently.

| Surface | Required data and owner |
|---|---|
| Self | route Agent plus the shared terminal host and transport |
| Agent Documents | the Agent's tracked documents in one untabbed work surface |
| Work Items | the route Agent's work items across its current Teams, filtered by the canonical holder returned with each Team work item reading |
| Team membership | Team records and live session tags from `team-controller.js`; writes use the canonical session-membership route |
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
