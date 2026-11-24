# `public/js/` — the client, in modules

Individual Agents use focused client checks; Playwright suites are explicit UI diagnostics.
The lead owns full `npm run verify` at the combined integration/release gate
([verification guidance](../../docs/development/verification.md)).
The repository's `AGENTS.md` owns the contributor route.

Native ES modules. **No bundler, no build step, no TypeScript.** `index.html` loads
`js/main.js` with `type="module"`; the browser fetches the rest. `express.static` already
serves this directory, so a change here is live on reload — same as it always was.

**Words:** every string a person reads goes through `t('room.key', 'literal')` from
`lexicon.js`, with the key in `ronin_stock/lexicons/professional_en.md` in the same
commit — `docs/products/kokugo.md` is the instruction. `index.html`'s static words go through `pagewords.js`.

xterm stays a classic `<script>` (`window.Terminal`, `window.FitAddon`): the vendor files
are served straight from `node_modules` and load before the module graph runs.

## Ownership

Feature modules compose shared transport, UI primitives, and terminal boundaries. Start
with the [canonical contributor map](../../docs/contributor-map.md#user-interface) for the
cross-repository view. [KOTOBA](../../KOTOBA.md) owns meaning; the lexicon owns displayed words.

## The map

The modules below are the client map.

### Visible-surface ownership index

Start here for a rendered change. Each row names an entry, the server door, the state
owner, and the behaviour test that covers it (`—`: only the rendered check, `npm run smoke:ui`). Follow the [state inventory](../../docs/state-inventory.md) when
changing persistence. Browser state is presentation, not a second server authority.

| Visible surface | UI entry / composition | Route owner | State / implementation owner |
|---|---|---|---|
| Ronin Home | [campaign-home.js](campaign-home.js) (the default root: Teams, Epics and Workspaces in a triangle, with Harnesses, Help and Settings on the right; the one root, an old `#/current` link lands here), [door-workbenches.js](door-workbenches.js) (the Models, Workspaces, Epics and Help workbenches the doors open; the Teams door opens the Teams workbench at `#/cowork`), [layout.js](layout.js), [main.js](main.js) | [setup-runtime-api.ts](../../src/routes/setup-runtime-api.ts), [update-api.ts](../../src/routes/update-api.ts) | [setup-runtime.ts](../../src/setup-runtime.ts), [release-update-controller.js](release-update-controller.js) |
| Harnesses workbench surfaces (KAN-236: tilespace 1 the stones of harnesses, 2 Accounts, 3 Models, 4 Refresh; a harness whole in a tilespace) | [models-surface.js](models-surface.js) (`createModelStones(context)`, `createModelRefresh(context)`, `createModelDefaults()`, `createModelProvider(key, context)`, `providerOffers()`), [accounts-surface.js](accounts-surface.js) (`createAccountsSurface(context)`), [models-records-surface.js](models-records-surface.js) (`createModelsRecords(context)`), [account-editors.js](account-editors.js) (the account and preset forms and tick lists every page shares), placed by the `models` destination in [door-workbenches.js](door-workbenches.js) | the setup runtime and catalog routes the provider drawing already reads; `/api/accounts` and `/api/presets` ([setup-runtime-api.ts](../../src/routes/setup-runtime-api.ts)) | [provider-surface.js](provider-surface.js) (`createProviderDrawing`, `createRefreshAll`, `providerStones`, `recordRuntime`: the one drawing and its Refresh all, shared with Settings and Setup); [accounts.ts](../../src/accounts.ts) reads the Hermes record ([hermes-setups.ts](../../src/hermes-setups.ts)) as accounts and presets, one store |
| Item lifecycle (KAN-785: the one contract every Epic, Team, Agent and Workspace summary uses: a status's family and number 1–4, counts over level-0 items, mean, band, shares, the line or bar, its reading and keyboard) | [item-lifecycle.js](item-lifecycle.js) (`statusKey`, `lifecycle`, `createLifecycle`, `createStoneMarks` (a stone's line, ⚑ and open count), `LIFECYCLE`, `LIFECYCLE_SCORE`) | — (drawn inside the Epics, Teams and Team surfaces) | the items each consumer passes |
| Epics surfaces (Layer 1, w897: a phalanx of open Epics, no Done and no Icebox, each stone its title, its Jira key and when it last moved, ⚑ top right when anything in it is flagged, its open item count small bottom right, its progress a colour line; the pressed one beside the rail; a Workspace question over them; every stone one height; New Epic the selector's pill, `createNewItem` (any kind, Epic to start) in the New Team form's steps, wide before deep (Kind with Priority on its row; Parent with an Epics only switch, a Team's own inside a Team, a level-0 parent making a Subtask; short and long title and Objective; who does the work, Team, Lead or Agent, one row). One Epic, pressed or placed (no page of its own, owner 2026-11-23): `createEpicBoard` without its strip, its top line the Launch into the Team working it, or nothing. epic-stage, w898: the shared item lifecycle's band named, in epic-stage.js, its drawing epic-progress.js over item-lifecycle.js) | [epics-surface.js](epics-surface.js) (`createEpicsRead`, `createEpicStones`, `createNewItem`, `createEpicRecord`, `epicOffers`, `itemReading`, `createEpicBoard`), [epic-stage.js](epic-stage.js), [epic-progress.js](epic-progress.js); placed by the `epics` destination in [door-workbenches.js](door-workbenches.js) | the store's pushed `epics` and `epicItems` ([store.js](store.js); requests for the picked Epic's cards, an item's reading, a status change and a new Epic) | [work-items-surface.js](work-items-surface.js) (`renderItemDetail`), [tile-island.js](tile-island.js) (`itemBar`), [phalanx.js](phalanx.js), the kit (`createSurface`) |
| Team workbench Epics (the Team's Epics on the Epics board; each stone carries the shared lifecycle line, KAN-785) | [team-epics.js](team-epics.js) (`createTeamEpics`), placed by the Team environment in [cowork-view.js](cowork-view.js) | the teams push's `epics` on each Team row ([teams-api.ts](../../src/routes/teams-api.ts), `teamWork` in [work-items-read.ts](../../src/work-items-read.ts)) | [epics-surface.js](epics-surface.js) (`createEpicBoard`, `createEpicsRead`), [team-controller.js](team-controller.js) |
| Workspaces workbench surfaces (workspace 1 Workspaces, each page the whole record: Describe, Where it lives (Add a folder, Paste a Git URL, My GitHub repositories), More); also Setup's Workspace step and Settings' Workspaces | [workspaces-surface.js](workspaces-surface.js) (`createWorkspaceStones`), the one Workspaces read every list on the page hears in [workspaces-read.js](workspaces-read.js), placed by the `workspaces` destination in [door-workbenches.js](door-workbenches.js) | `/api/workspaces`, `/api/folders`, `/api/folders/inspect`, `/api/setup/git/clone`, `/api/setup/github/repos` | the kit (`ask`, `createPhalanx`, `createSurface`) |
| The Teams card's stones (Workspace question; `bare` and fixed `roots` for an embedding surface) and one Team's open view (its bar opening its Configuration, its Agents and Epics as stones) | [team-roster-surface.js](team-roster-surface.js) (`createTeamRosterSurface({ teamDetail, bare, roots })`, the Cowork workbench's Teams card), [team-one.js](team-one.js) (`createTeamBody` for the Cowork view, `createTeamOne(name)` standing alone, KAN-801), [teams-surface-rows.js](teams-surface-rows.js) (the pure rows) | [teams-api.ts](../../src/routes/teams-api.ts) builds each roster row's `board` and `items`; [events.ts](../../src/ws/events.ts) pushes `teams` after roster, work-item, membership and lead writes | [team-controller.js](team-controller.js) (the projection of the pushed `teams` and `sessions`); [work-items-read.ts](../../src/work-items-read.ts) for the board rule |
| Ronin Settings / Campaign | [campaign-view.js](campaign-view.js), [campaign-surfaces.js](campaign-surfaces.js), [behaviour-surface.js](behaviour-surface.js) | [campaigns-api.ts](../../src/routes/campaigns-api.ts), [catalogs.ts](../../src/routes/catalogs.ts) | [campaigns.ts](../../src/campaigns.ts), [machine-settings.ts](../../src/machine-settings.ts), [behaviour-documents.ts](../../src/behaviour-documents.ts) |
| Settings › Jira: connect a Desk to a Jira space; Check, Polling, Sync now, the state, and for dev the pairs | [jira-panel.js](jira-panel.js) (`createJiraPanel(selected)`), placed by [campaign-view.js](campaign-view.js) as `campaign.jira` | `/api/jira/:campaign` (the `jira` Services part, ronin-services `jira/jira-api.ts`); a 404 means the part is off | the bridge's per-campaign file and Services secrets; the panel keeps nothing |
| Settings › entitlement › Cloud account: read-only account, office, office lease and house-model usage; not activated, no Cloud account, refused and HQ unavailable each said | [account-card.js](account-card.js) (`accountCard(body)`, pure `accountModel`), placed by [machine-settings.js](machine-settings.js) under the Services card, and alone as the Settings selector's **Cloud Account** worksurface ([campaign-view.js](campaign-view.js) `campaignCloudAccount`, Machine Settings group; says "Not installed" when the part is absent) | `GET /api/account` (the `account` Services part, ronin-services `account/account-api.ts`); a 404 means the part is absent and hides the card | Ronin HQ is the account authority and the gateway office the usage authority; the card keeps nothing |
| Cowork workbench | [cowork-view.js](cowork-view.js), [workbench.js](workbench.js) | [launch.ts](../../src/routes/launch.ts) builds the home rows; [events.ts](../../src/ws/events.ts) pushes them | [tmux.ts](../../src/tmux.ts), [team-rosters.ts](../../src/team-rosters.ts); [store.js](store.js) holds the pushed rows, [home.js](home.js) reads them |
| Team workbench / Configuration | [team-controller.js](team-controller.js) (the projection of the store's pushed `teams` and `sessions`), [team-configuration.js](team-configuration.js) | [teams-api.ts](../../src/routes/teams-api.ts), [sessions-api.ts](../../src/routes/sessions-api.ts); [events.ts](../../src/ws/events.ts) pushes both | [team-rosters.ts](../../src/team-rosters.ts) for Team facts; [tmux.ts](../../src/tmux.ts) for membership |
| Agent workbench | [agent-view.js](agent-view.js), [workbench.js](workbench.js) | [sessions-api.ts](../../src/routes/sessions-api.ts), [teams-api.ts](../../src/routes/teams-api.ts) | [tmux.ts](../../src/tmux.ts) for Self/membership; Work Items is a derived reading |
| Team coordination tabs | [team-wipeboard.js](team-wipeboard.js), [team-jikan.js](team-jikan.js), [message-queue.js](message-queue.js), each painting the store's pushed thread, jobs or queue | [wipeboards-api.ts](../../src/routes/wipeboards-api.ts), [jikan-api.ts](../../src/routes/jikan-api.ts), [messages-api.ts](../../src/routes/messages-api.ts) | [wipeboards.ts](../../src/wipeboards.ts), [jikan.ts](../../src/jikan.ts), [message-queue.ts](../../src/message-queue.ts) |
| Work Record / Work Items | [work-record.js](work-record.js), [work-items-surface.js](work-items-surface.js) | the tile reads the `tegami` on its home row from [store.js](store.js); Work Items reads `GET /api/work-items?team=` | [Work Record code path](../../docs/contributor-map.md#work-record); the Team's reading of its work items |
| Agent tile (its header's item island: a pill per held work item, w271, w272, KAN-238) | [tile.js](tile.js), [tilehead.js](tilehead.js), [tile-island.js](tile-island.js) (`createItemIsland`), [termview.js](termview.js), [composer.js](composer.js), [tilewire.js](tilewire.js) | [sessions-api.ts](../../src/routes/sessions-api.ts), [pty.ts](../../src/ws/pty.ts) | [tmux-client.ts](../../src/tmux-client.ts), [message-queue.ts](../../src/message-queue.ts) |
| A gecko's tile (KAN-755: a seat has no terminal; its status line and work record on top, its Tells thread both ways where the terminal would be, the composer writing to its inbox) | [seat-view.js](seat-view.js), placed by [tile.js](tile.js) (`connectSeat`, the `seat` surface) | `POST /api/messages` (the composer); the card's `seat_status`, `tegami` and `thread` pushed by [events.ts](../../src/ws/events.ts) when the seats store moves | [seats.ts](../../src/seats.ts) |
| Phone | [phone.js](phone.js), shared tile modules | [index.ts](../../src/index.ts) serves `mobile.html`; same feature routes as desktop | Same authorities as each feature above; [state.js](state.js) holds browser state |
| New Agent / Team | [new-agent.js](new-agent.js), [new-team-form.js](new-team-form.js), [launch-view.js](launch-view.js) | [launch.ts](../../src/routes/launch.ts), [teams-api.ts](../../src/routes/teams-api.ts) | [agent-defaults.ts](../../src/agent-defaults.ts), [spawn.ts](../../src/spawn.ts), [team-rosters.ts](../../src/team-rosters.ts) |
| Ronin Setup | [setup-view.js](setup-view.js), [garden-canvas.js](garden-canvas.js), [setup-irasshai.js](setup-irasshai.js) (her chat, read as a conversation (Chat reading; KAN-617): hosted, the Ask Ronin panel under the step's lines, w926; her Helpful Assistant entry tops the selector and asks for her on any install, KAN-694; her chat starts at her `ready` mark), [setup-journey.js](setup-journey.js) (the scenes: hosted Harness, Workspace, Team and three pages; self-hosted five steps and Launch), [setup-progress.js](setup-progress.js), [setup-surfaces.js](setup-surfaces.js), [setup-doc-page.js](setup-doc-page.js) (the hosted pages: a doc shown whole), [provider-surface.js](provider-surface.js) | [setup-progress-api.ts](../../src/routes/setup-progress-api.ts) (the ticks, from the facts), [setup-runtime-api.ts](../../src/routes/setup-runtime-api.ts), [services-activation-api.ts](../../src/routes/services-activation-api.ts) | [setup-runtime.ts](../../src/setup-runtime.ts), [registration.ts](../../src/activation/registration.ts), [activation state](../../src/activation/state.ts) |
| Machine settings / GitHub CLI / Archive | [machine-settings.js](machine-settings.js), [archives.js](archives.js) | [machine-settings-api.ts](../../src/routes/machine-settings-api.ts), [sessions-api.ts](../../src/routes/sessions-api.ts), [setup-runtime-api.ts](../../src/routes/setup-runtime-api.ts) (`/api/setup/github`; `{t:'github-setup', github}` pushed while a setup session is attached) | [machine-settings.ts](../../src/machine-settings.ts), [session-archive.ts](../../src/session-archive.ts) |
| Services surfaces | [stats.js](stats.js), [koshi.js](koshi.js), [hotwords.js](hotwords.js) | Exact method/path and route source in the [Services manifest](https://github.com/ronincowork/ronin-services/blob/dev/services.json) | Each canonical Services part owns its API and store use; [parts.ts](../../src/parts.ts) owns startup selection |

Shared CSS starts at [style.css](../style.css) and [workspace-kit.css](../workspace-kit.css).
Feature styles: [Campaign/Home](../css/campaign-home.css), [Team](../css/team-workspace.css),
[launch forms](../css/launch-forms.css), and [selectors](../css/ask.css).

### Module responsibilities

[UI architecture](../../docs/architecture/ui.md) defines the shared contracts. The table
below describes implementation ownership; use the surface index above to find a feature.

| Module | What it owns |
|---|---|
| `state.js` | constants, `tiles`, the shared-state object `S`, `saveState` |
| `errors.js` | `showFailure`, `clearFailure`, `guard` — the containment layer |
| `request.js` | the ONE transport contract — every JSON call's "what happened" |
| `ui.js` | the primitives: sheet, confirmDialog, toast, attention, field, status, button (docs/architecture/ui.md) |
| `terminal-controls.js` | Copy, Clear, Close, Stop: shared interception, mobile buttons, and Hints (docs/using-ronin/terminal-controls.md) |
| `theme.js` | dark/light: the saved choice, `termTheme()` read off the CSS tokens, the flip |
| `api.js` | `reconcileSessions` (the one writer of `S.sessions`) and the `/api/sessions` write calls |
| `widgets.js` | `makeGauge`, `setInert` |
| `glyphs.js` | THE RULED GLYPHS — one face per ruled word (kind) for ask()'s squares; `glyph(axis, value)`, `ruledRows(axis, values, word)` |
| `mandates.js` | THE MANDATE MENUS — Reach, Recruit and Output from the catalog's `mandate:` files (docs/architecture/brief.md, Mandates); `loadMandates`, `setMandates`, `mandateRows(axis, screen)`, `screenOf(preview body)`, `mandateTitle` |
| `ask.js` | ERABI, THE ONE SELECTOR UTILITY — `ask(spec)`: reading stones, the tray, the two shapes, switches, groups (ronin-lab `SELECTORS.md`; docs/architecture/ui.md § Asking a question) |
| `events.js` | what the `/events` messages mean to the page — birth/death chips, the transcript, draft, Mika and Setup feeds and their handler sets, `openSessionSomewhere`, and `sayWhenUnreachable` (the delayed, quiet top-bar reconnect reading on desktop and phone) |
| `store.js` | THE STORE ([docs/architecture/data-path.md](../../docs/architecture/data-path.md)) — the one `/events` socket (`connect`, `renew`) and the server's resources, all by push only: `home`, `sessions`, `teams`, `messages`, `memory`, and `wipeboard:<board>` / `jikan:<team>`, which a subscription asks for with a `want`; `get`, `subscribe` |
| `home.js` | the workspace-folder catalog (`loadProjects`, `onProjects`, `projectData`) and `stanceLabel` (the provider catalog is form-steps.js's) |
| `form-steps.js` | the drawn form idiom, and THE ONE PICKER — `providerModelPair`, `loadProviderCatalog` (rows come joined from the server) |
| `save-row.js` | THE GREY FORM — `saveRow({ say, save, after })` returns `commit(value)`: saving…, the save, then saved or the refusal, then the re-read. The caller draws the row. Machine settings and the Desk identity fields save with it |
| `workbench-catalog.js` / Workbench surface definitions | The canonical destination profile and stable-type catalog. A destination supplies resident data and factories through its environment; `create()` builds the surface and its `show()`/`enter()` starts only that surface's reads. [Workbench construction](../../docs/architecture/workbench.md) owns the inventory, first-open/refresh/structured-launch rules, and dependency contract. |
| `provider-surface.js` | THE ONE MODEL PROVIDERS SURFACE, seated by Ronin Setup and Ronin Settings — per provider, Yours (the steps and the sign-in tile) then The catalog |
| `provider-setup-session.js` | the native sign-in tile's one mount, handed to both workbench environments |
| `garden-canvas-model.js` / `garden-canvas.js` | versioned four-region catalog normalization and the dumb Setup Workspace 1 canvas painter; Setup owns lookup, transitions, and action/media handling |
| `archives.js` | the Archived room — stopped, resumable sessions backed by manifests |
| `hotwords.js` | `buildHotwords` — the ▥ Hotwords pane, the dictation glossary |
| `stats.js` | `buildStats` — the ▦ Stats pane (TOMODACHI usage readout) |
| `koshi.js` | `buildKoshi` — the 目 Koshi pane, model per Koshi job |
| `services-setup-state.js` | the Ronin Setup Services surface's state: registration, installed facts and the activation record → one status, one next line, at most one action |
| `system.js` | `buildSystemPanel` — the Account tab's Release & update and Log out rooms (release identity, updates, log out, passkeys) in `cowork-commons.js` |
| `work-record.js` | `buildWorkRecord` — the tile's ☰ Work record (held items first, each with status, flag and attachments; then objective, worktrees, Teams), and its age helpers |
| `plan-attachment.js` | `isPlanRef`, `planName`, `resolvePlan`, `planAttachment` — an epic's `plan:<workspace>/<name>` attachment by name, opened through `/api/plans/resolve`, or "gone" (KAN-256) |
| `work-items-surface.js` | `createWorkItemsSurface`, `createItemPhalanx`, `holderOf` — work items as phalanx stones grouped by parent, each pressed to its reading in place; `renderItemDetail`, the one item reading (form steps, Status an `ask()` that posts the transition) |
| `tile.js` / `surface-host.js` | `class Tile` — one cell of the coworkspace; its surface host owns the catalogued sibling tenants and names the one active tenant |
| `tilehead.js` | `buildTileHead` — the cell's chrome, one table and a loop: name, item island, reading toggle, メ, window control; `tileMenu` — the tile's menu (send a file, mention, output, work record, configuration, docs, delete or archive); reads open in the full overlay over the tile body (`overTile`), a held item among them (`openItem`) |
| `tile-island.js` | `createItemIsland` — the header's item island (w271, w272): a pill per held work item from the pushed `tegami.items` (Jira kind symbol, status dot, ⚑); its bar brings it down as a column of pills, each reading its status words, dot and flag (solid or outline; KAN-238); a pill opens and closes its item |
| `menu.js` | `createMenuButton`, `openMenu`, `closeMenu`, `menuOpen` — THE MENU location's one owner: an overlay hung off its メ control over the surface it heads; groups of rows (action, radio, drill-in list) and a pinned foot; a row that opens a read opens it in the full overlay |
| `output.js` | `OUTPUTS` — the Output names the menu offers |
| `tapeview.js` | **RIREKI's client render** — the 🔓 view: transcript, folds, live frame, scroll anchoring, paging |
| `tapefold.js` | `groupRecs` — the fold rule, pure |
| `termview.js` | the 🔒 view — the untouched `tmux attach` xterm mirror, and touch drag-scroll |
| `tilewire.js` | `TileWire` — the tile's socket: reconnect, the protocol split (keystroke · message · protocol reply), the drop rule, the message answered by id |
| `composer.js` | `buildComposer` — the tile's text entry (unlocked, and every coarse tile), its mic and its keyboard lift; clears only on the host's answer |
| `composer-rules.js` | `sendComposerMessage`, `settleComposer` — HTTP message send and box settlement |
| `dvr.js` | `dvrStep` — the unlocked input rule, pure |
| `ansi.js` | `ANSI_RE` — its own module so the tape's pure logic loads outside a browser |
| `phone.js` | THE MOBILE DOCUMENT's entry module — `mobile.html` boots it, never `main.js`: Teams → a Team (Agents \| Docs) → one Agent's tile, hash-routed (`#/t/…` `#/d/…` `#/s/…`); the server sends that document at `/m`, and at `/` to a phone |
| `keysrow.js` | `buildKeysRow` — Esc/Tab/Shift-Tab/arrows/⤓ docked on every coarse tile's composer |
| `tilementions.js` | `insertMention`, `MENTION_MIME` — a session name into this tile's composer, from the menu or a drag |
| `team-arrange.js` | `parseDraft`, `createArranger` — the team page's one controller: a draft (what changes; the rest stays) from a button or from an agent's `edges page`, run through the page's own verbs |
| `team-members.js` | `buildTeamMembers`, `agentTitle`, `configSignature` — the Commons Roster: one line per Agent (人 first), a pressed row opening in place to the Agent's read, the one composition body and its action bar, a draggable row opening the Agent in a workspace, New Agent at the foot; `update()` lays its rows through the kit's keyed list and redraws only the rows whose head line moved, never an opened configuration (a draft is the kit's edit hold and stays until Send, w451, KAN-413); and the changed-only fingerprint that keeps Configuration from redrawing an unchanged Team |
| `voice.js` | dictation: `wireDictation` (the 🎤 on the tile's compose box) |
| `panels.js` | `toClipboard` |
| `session-picker.js` | `buildSessionPicker` — the pad key's session switcher (on `ui.sheet`) |
| `pad.js` | keypad — bindings, chords, firing |
| `padpanel.js` | keypad — the ▦ panel and ask-on-press (both on `ui.sheet`) |
| `weblink.js` | keypad — WebHID programming of the device |
| `layout.js` | `build`, `trimBarForTouch` — assembling the page |
| `main.js` | `init` and the boot call |
| `tips.js` | system-wide tooltip suppression; title text survives only as accessible labels while the house help panel is disabled |
| `mika.js` | `askMika` — the way to the house assistant |
| `provenance.js` | the ◆/◈ marks — a catalog entry that is yours |

Module size and dependency checks keep ownership visible: `check-modules` checks the client. A tile composes its header, terminal or
transcript view, and socket; those modules own their respective machinery.

The keypad's user-facing controls are documented in
[`docs/using-ronin/terminal-controls.md`](../../docs/using-ronin/terminal-controls.md); the module rows above own
the implementation split.

## Five rules

**1. Reassignable shared state lives on `S` in `state.js`.** An imported binding is
read-only for the importer, so `compose = x` from another module is a hard error. The
values any part of the old file could reassign now sit on one object (eleven today), so every write
reads `S.active = t` and is greppable from anywhere. `tiles` is exempt: a const array,
mutated in place, never reassigned. **Do not add a new top-level `let` that another
module writes** — put it on `S`.

**2. No import cycles.** There are none today, and that is checked, not hoped: the split
was computed from the code with comments and string literals stripped, and cycles were
removed by moving the shared thing rather than by importing both ways. If you find yourself wanting a back-edge, move the shared function down instead.

**3. Transport goes through `request.js`.** Every JSON call uses `request()` and decides
what its failure MEANS itself; no feature spells `fetch(` (the documented exceptions:
`voice.js` posts an audio blob, `lexicon.js` reads word catalogs, `message-queue.js`
dismisses messages, `setup-surfaces.js` reads an SVG mark). Dialog-shaped surfaces use
`ui.sheet`; one-shot outcomes use `ui.toast`. The contract is `docs/architecture/ui.md`.

**4. Never reference an imported binding at module top level.** Everything cross-module
is used inside a function body, called after the graph has loaded. A top-level
`const X = somethingImported()` reintroduces load-order fragility, which is the class of
bug this split exists to prevent.

**5. One way to redraw a list: the kit's keyed list.** A surface that paints rows from a
push keeps one row per key with `WorkspacePrimitives.createKeyedList` (and `layNodes`) in
[workspace-primitives.js](workspace-primitives.js): each row compares what it shows and
repaints only itself, moves only when its order or group changes, and is added or removed
only when the set changes; an open row, a detail or a form being typed in is never rebuilt
by a push that moved something else (owner, 2026-11-12, KAN-412, KAN-414). No surface keeps
its own variant. **Never under an edit:** a row the person has typed or changed something in
holds its redraw; the newest row lands at once when the edit is sent or abandoned (`submit`,
`reset`, a press on a button marked `data-ends-edit`, a `<details>` folding, or focus leaving
with nothing changed). Every Send, Save or Cancel that is not a form submit carries
`data-ends-edit` (`createAction({ endsEdit: true })`); `editHold()` is the same hold for one
open detail. Its users: the Epics surface ([epics-surface.js](epics-surface.js)); the stone
work surface ([phalanx.js](phalanx.js)): every stone, the Return stone and every group
section is a kept row, a stone reads its row at press time, and the open detail is drawn
again only when what is open changes, its own row moves (held under an edit), or
`refreshDetail()` asks; the roster ([roster.js](roster.js)): every group block, heading and
session row (a session under each group it is in) is a kept row; the Team wipeboard
([team-wipeboard.js](team-wipeboard.js)): each post by its id, so a push adds the new post
and leaves the thread and its scroll; the message queue ([message-queue.js](message-queue.js)):
each card by its message id; the phone's bar pieces and Teams cards ([phone.js](phone.js)), so a push never detaches
a card mid-tap; the Cron tab ([team-jikan.js](team-jikan.js)): its header row, each job's row
by id, and the filter and form options; an Agent's Team membership ([agent-view.js](agent-view.js));
the Workbench selector ([workbench.js](workbench.js)): each card by type and resource, its
press, hover and drag reading the newest offer; the Services setup surface and the ⚙ Services
card ([setup-surfaces.js](setup-surfaces.js), [services-card.js](services-card.js)): steps by
id, the key row, switches built once and set in place, the egress list keeping its fold; the
Setup zone's picks ([setup-zone.js](setup-zone.js)).
Work Items ([work-items-surface.js](work-items-surface.js)) re-reads only when the `epics`
push moves (it carries every live item, `epic: ''` under none) or its scope changes, never on
a sessions push. Also (KAN-413): the item island's pills and bars
([tile-island.js](tile-island.js)), the People list ([team-members.js](team-members.js)),
the League Team's Agents ([cowork-view.js](cowork-view.js); a stance moves one row and never
asks for the Work list again), the Docs shelf's groups and rows ([docs.js](docs.js); a group
keeps its fold) and the phone's Agents cards ([phone.js](phone.js); the launch card, its
form mid-typing, is one kept row). The Team roster ([team-roster-surface.js](team-roster-surface.js))
and Workspaces ([workspaces-surface.js](workspaces-surface.js)) keep no signature of their own:
they hand the phalanx every push (the roster keeps one launch mark per Team, so a stone is
not redrawn for a fresh node).

## Verifying a change

Ordinary client development uses the running dev UI for direct dogfood and the smallest
scoped diagnostic evidence needed for the leg. It does not run BYOIN around commits,
pushes, or service restarts. At the release boundary, the designated integrator chooses the
appropriate one-time BYOIN mode for the exact candidate; `--ui` drives desktop and phone
rendering. Whether a browser exists is a fact about that verification host, and a browser
SKIP remains unverified. [Verification guidance](../../docs/development/verification.md) is the cadence contract.

**A passing gate is not "the change is right."** It says the page loaded, threw nothing, and
painted a live pane. The phone pass is Safari's engine at phone geometry — not a device, so
never write that a change is verified on iPhone.

What works with no browser at all:

```bash
npm run check:modules   # cycles, orphans, unresolved imports — structure only
node --check public/js/*.js   # parse
npx tsc --noEmit        # server types
npm run stage           # low-level copy of this client to public-staging/
```

`npm run stage` only copies static client files for the server's `/staging/` route. It can
still be useful for one local client check. It does not establish which repository commit is
running; a Team's UI work is tried on dev after the lead promotes it.

The phone surface is the one that matters most for a client change: its compact Output
selector can choose the live terminal or any record-fed view supplied by Ronin Services.
