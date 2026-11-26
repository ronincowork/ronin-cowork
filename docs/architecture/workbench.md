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
surface as it was, its geometry untouched: Settings (Workspaces, Model
Providers, Setup) and the Agent workbench's Work Items draw with it. Escape lifts only the layer it
is pressed in (2026-10-08).

An Epic has no page of its own (owner, 2026-11-23): the Epics phalanx's pressed stone shows the
Team's Epics board without its strip of Epic stones, its one Launch opening the Team working it
(the holding Agent or the lead in tilespace 1, the Epic in tilespace 2). One Workspace has its own page too, `#/workspace/<name>` (owner,
2026-11-22; KAN-784): Work (its Teams or Epics) or Config (its record), the same surface a pressed
Workspace stone opens beside the stones. Work Items
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

## Surfaces, profile, tenant, instance

`public/js/workbench.js` owns the shared surface registry (`surfaces`) and frame.
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

- A **surface definition** gives one stable type a header kind, discovery reading, and
  `create(context)` factory.
- A **profile** lists the surface types one destination may place.
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
opened in the same tab. The link's href is the plain address (`#/models`), so hovering shows what a
person reads; a Ctrl/Cmd/Shift or middle press makes the tab id and launch state then and opens a new
tab through `openWorkbenchTab` (`workbenchLink`, KAN-473; the bar's Teams crumb and New Agent's
defaults links the same). The
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
last-ran line and notice — with its steps under it (owner, 2026-10-20). The third card,
**Defaults** (`models.defaults`, solid utility, after Model refresh; owner, 2026-10-21), sets the model a new Agent,
a new Team lead and Mika start on: ⚙ Configuration's own `models` section drawn alone (`buildMachineSettings(…, { only:
'models' })`), each row saving itself — one record, two views. **The Harnesses workbench** (KAN-236; owner,
2026-11-04) is this door under its new word on Home, opened in three tilespaces: the stones (now the **Harness**
card) in tilespace 1, **Refresh** (`models.refresh` under its new word) in 2 and **Defaults** in 3; Model refresh's
steps read Harnesses · Model services, the second asking each configured model service for its model list. The
Accounts and Models (preset) cards and their routes are gone (owner, 2026-11-26; KAN-892): model services and their
model entries are Settings' Model services card ([Model services](model_services_README.md), `/api/model-services`).
The existing types, surfaces and stones are
unchanged but for their words; the route id stays `models` so saved arrangements survive. Settings' Model
Providers surface is untouched; all draw with the one drawing `harnesses-surface.js` exports
(`createHarnessDrawing`, `createRefreshAll`, `harnessStones`) over the same record and measure. In Harnesses,
Authenticate offers Mika operating the registry-owned native login command in the current tilespace, or the native
`provider_setup_*` terminal with Mika reading it from the paired tilespace; Setup and Settings retain their direct
Authenticate action. Mika is a startup invariant, including before the first owner provider is connected, so the
two assisted choices do not depend on provider count. In every path the provider summary remains the readiness authority. Workspaces seats
its own stones of Workspaces (`workspaces-surface.js`, `workspaces.records`): a pressed one's page is the whole
Workspace: Describe (its objective), Where it lives (its folder and its repositories, Desks or Direct each; Add a repository clones one into its `repos/`, KAN-809), and More;
one read of the pinned folders per bench (`createRootsReading`, the detail route). Epics (owner, 2026-11-02;
KAN-187) seats its own stones of Epics the same way (`epics-surface.js`, `epics.records`): the level-1 work items of
the Campaign — the store's pushed `epics` and `epicItems`, no request (KAN-190, KAN-206). Since w334 (owner,
2026-11-06) Tilespace 1 is the Epics board (`createEpicBoard`), borrowed from the phalanx but its own: a row of Epic
stones across the top (title, its Jira key when it has one, open count); a pressed one is selected and its items come below
under three ERABI questions (ask.js), Assigned (Yes / No), Flagged (Yes / No; w409) and Status (the open ones on arrival), as the item island's
bars (`tile-island.js` `itemBar`) grouped by status in workflow order, a Subtask under its Task. The push carries what
a bar says (`epicsPush`: the objective and last comment cut short, comment count, last move, last hand-in). A bar
pressed opens the item's reading under it (`renderItemDetail`, its own read). Every Epic surface is that board (w340,
owner 2026-11-06): the selected Epic's source line (Jira key, holder) heads its items, then the Epic's own details as
the island's bar (KAN-309: kind, key, title, status, objective, last comment, holder); pressed, it opens the Epic's
reading under it exactly as an item's bar does (KAN-310: `renderItemDetail`, its Status moved there through
`POST /api/work-items/:id/transition`; the Epic's children are left out, they are the board below). Another stone switches
to that Epic on the same surface, nothing placed elsewhere. A dragged stone or an Epic's selector card places a
board starting on that Epic (`epics.record`, `createEpicRecord`), and a Team's Epics card is the board over the
Team's Epics (`createTeamEpics`; one Epic shows itself). The bar's crumb (`workspace-header.js`;
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
dragged into a workspace reads that page whole there (`help.page`, no selector card). Her tile
opens on Chat like every tile, before her record has anything in it; a Mika born by the seat gets a fresh tile once she is up.
The gate (owner, 2026-10-19): as on the old root, the Teams, Epics and Workspaces doors are locked until one
model provider is activated (`/api/setup/runtime`'s `activated_count`), each saying under its name that a
provider is activated in Setup or Harnesses. Settings, Help (owner, 2026-10-21; with no provider its Mika
seat is one line pointing to Setup) and Harnesses (owner, 2026-11-13; KAN-472: it is where a provider is
signed in, its sign-in tile mounted as on Setup) stay open — a new user's way in is Setup or Harnesses.

**One root** (owner, 2026-11-02; KAN-197). That page is the only root: the old Home at `#/current`
and the bar's Current/Next toggle are deleted, and an old `#/current` link falls to the safe view,
Home.

Campaign Defaults is the reference case. Its saved values are already in
`campaign.config.defaults`, so it paints them immediately. Model choices come from the
provider catalog and selectable Behaviors come from `/api/campaign-default-options`.
It does not call `/api/launch-seed`: that endpoint assembles a prospective Agent from a
Desk, Team, Workspace, Agent defaults, Installations, and Behaviors, most of which
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
| Ronin Settings | Defaults in workspace 1; Workspaces in workspace 2 | **Desk defaults** replaces the seats with Defaults and Launch your own |
| New Project | New Agent in workspace 1 | Links may replace or overlay New Agent/New Team and carry prompt detail |
| Ronin Setup | Garden in workspace 1; active journey surface in workspace 2 | Journey actions select a Setup surface without another restoration path |
| Cowork / Team | Fresh empty/member seating rules; refresh restores this instance | Team Configuration, documents, commons tabs, and New Agent may be addressed in seat detail |
| Agent | Self in workspace 1; Documents in workspace 2 | A successful standalone launch replaces the seats and focuses the authoritative returned Agent as Self |

## Surface inventory and required data

This records the implemented boundary. Update it in the same change that adds a surface,
changes its dependency, or changes a Workbench profile.

### Ronin Settings (`campaign` profile)

Entry reads the Desk record because it is the tenant. Nothing waits on that read before seats paint. The former
page-wide progressive gate is deleted.

| Surface | Required data and owner |
|---|---|
| Desk | selected Desk record already held by the tenant |
| Defaults | `campaign.config.defaults` immediately; provider catalog and Campaign-default options afterward |
| Workspaces | `/api/workspaces` (the Workspaces stones) |
| Installations | installation catalog and installed facts; Desk values come from the tenant |
| Harnesses | provider runtime/catalog owned by `harnesses-surface.js` |
| Machine | the selected cowork-commons tab owns its read; unopened tabs do no work |
| Register / Launch your own | registration or embedded launch-form reads owned by that shared Setup surface |
| Mika / terminal | readiness and terminal transport only when placed or deliberately prewarmed |
| Document / Feedback / Password | each shared surface owns its operation |

### New Project (`launch` profile)

Entry performs no form catalog read. It restores and places the requested form first.

| Surface | Required data and owner |
|---|---|
| New Agent | Team roster index and selected Team/Desk launch seed |
| New Team | The Workspaces and Desk launch seed; live sessions only for the final name-collision gate |
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
| Harnesses | provider runtime/catalog owned by the shared provider surface |
| Workspaces | `/api/workspaces` (the Workspaces stones, New Workspace among them) |
| Installations | Desk record, installation catalog, and installed facts |
| Password | authentication state owned by the shared Password surface |
| Launch your own | no launch data until Agent or Team is selected; that embedded form then owns its reads |
| Hosted: Team | the embedded New Team form owns its reads |
| Tour | the Ronin Tour, `docs/getting-started/tour.md`, read when shown (`/api/file`) |
| Hosted: Ask Ronin | the garden copy, then the Helpful Assistant's chat (the session push) |

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
| Document / Feedback | the shared surface's own reads |

### Models (`models` profile)

The door's own destination over the provider drawing Settings and Setup share.

| Surface | Required data and owner |
|---|---|
| Model stones (`models.stones`) | the recorded provider summary and catalog through `recordRuntime()`; a measure only on a press, as on Settings |
| Model refresh (`models.refresh`) | the same record; the Refresh all press (`/api/setup/harnesses/refresh`) through the shared drawing's measure, then each account's Discover |
| Defaults (`models.defaults`) | `GET /api/machine-settings`, the schema's `models` section; each row PATCHes `agents` (`sessions.default`, `sessions.lead`, `jobs.mikaassist.level`) |
| Model provider (`models.provider`) | the same record for the one provider named in its detail; its selector cards come from `harnessOffers()` over the same record |

### Workspaces (`workspaces` profile)

The door's own destination: the Workspaces and their pages. The Workspace is the organizing
principle (KAN-728): its folders and repositories are rows of its record, and nothing else lists them.

| Surface | Required data and owner |
|---|---|
| Workspaces (`workspaces.records`) | `/api/workspaces` (each repository row with its `remote`); the page writes the whole record with `PUT /api/workspaces/:name`, its rows (name, dir, note; a repository's mode, working, stable, desks) with it. Sections: 1 Describe (the objective, the kind; New: the Name after it, made from it until typed), 2 Where it lives (its folder and repositories; a repository's Desks or Direct; Add a repository: a Git URL or one of theirs on GitHub, `GET /api/setup/github/repos`, cloned into its `repos/` by `POST /api/workspaces/<name>/repos`, on Desks), 3 More, folded (instructions, Mode, plans, canvases, Integrations, Behaviors); ⋯ holds Archive. Folders are Explorer's. Owner, 25 Nov; KAN-809 |
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
