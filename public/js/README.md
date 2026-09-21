# `public/js/` — the client, in modules

Individual Agents use focused client checks; Playwright suites are explicit UI diagnostics.
The lead owns full `npm run verify` at the combined integration/release gate
([verification guidance](../../docs/development/verification.md)).
The repository's `AGENTS.md` owns the contributor route.

Native ES modules. **No bundler, no build step, no TypeScript.** `index.html` loads
`js/main.js` with `type="module"`; the browser fetches the rest. `express.static` already
serves this directory, so a change here is live on reload — same as it always was.

**Words:** every string a person reads goes through `t('room.key', 'literal')` from
`lexicon.js`, with the key in `ronin_catalogs/lexicons/professional_en.md` in the same
commit — `docs/products/kokugo.md` is the instruction, and `scripts/check-lexicon.mjs` fails a
module that forgets. `index.html`'s static words go through `pagewords.js`.

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
owner, and a focused test. Follow the [state inventory](../../docs/state-inventory.md) when
changing persistence. Browser state is presentation, not a second server authority.

| Visible surface | UI entry / composition | Route owner | State / implementation owner | Focused tests |
|---|---|---|---|---|
| Ronin Home | [campaign-home.js](campaign-home.js), [layout.js](layout.js), [main.js](main.js) | [setup-runtime-api.ts](../../src/routes/setup-runtime-api.ts), [update-api.ts](../../src/routes/update-api.ts) | [setup-runtime.ts](../../src/setup-runtime.ts), [release-update-controller.js](release-update-controller.js) | [theme-boot.test.js](../../tests/theme-boot.test.js), [setup-runtime.test.ts](../../tests/setup-runtime.test.ts) |
| Ronin Settings / Campaign | [campaign-view.js](campaign-view.js), [campaign-surfaces.js](campaign-surfaces.js), [behaviour-surface.js](behaviour-surface.js) | [campaigns-api.ts](../../src/routes/campaigns-api.ts), [catalogs.ts](../../src/routes/catalogs.ts) | [campaigns.ts](../../src/campaigns.ts), [machine-settings.ts](../../src/machine-settings.ts), [behaviour-documents.ts](../../src/behaviour-documents.ts) | [campaign-config.test.ts](../../tests/campaign-config.test.ts), [campaign-view-single.test.js](../../tests/campaign-view-single.test.js), [behaviour-documents.test.ts](../../tests/behaviour-documents.test.ts) |
| Cowork workbench | [cowork-view.js](cowork-view.js), [workbench.js](workbench.js) | [launch.ts](../../src/routes/launch.ts): `/api/home` | [tmux.ts](../../src/tmux.ts), [team-rosters.ts](../../src/team-rosters.ts); [home.js](home.js) caches the response | [cowork-workbench.test.js](../../tests/cowork-workbench.test.js), [home-roster.test.ts](../../tests/home-roster.test.ts) |
| Team workbench / Configuration | [team-controller.js](team-controller.js), [team-configuration.js](team-configuration.js) | [teams-api.ts](../../src/routes/teams-api.ts), [sessions-api.ts](../../src/routes/sessions-api.ts) | [team-rosters.ts](../../src/team-rosters.ts) for Team facts; [tmux.ts](../../src/tmux.ts) for membership | [team-configuration.test.js](../../tests/team-configuration.test.js), [team-rosters.test.ts](../../tests/team-rosters.test.ts) |
| Agent workbench | [agent-view.js](agent-view.js), [workbench.js](workbench.js) | [sessions-api.ts](../../src/routes/sessions-api.ts), [teams-api.ts](../../src/routes/teams-api.ts) | [tmux.ts](../../src/tmux.ts) for Self/membership; Team Kanban remains a derived reading | [agent-workbench.test.js](../../tests/agent-workbench.test.js), [workbench-launch.test.js](../../tests/workbench-launch.test.js) |
| Team coordination tabs | [team-wipeboard.js](team-wipeboard.js), [team-jikan.js](team-jikan.js), [message-queue.js](message-queue.js) | [wipeboards-api.ts](../../src/routes/wipeboards-api.ts), [jikan-api.ts](../../src/routes/jikan-api.ts), [messages-api.ts](../../src/routes/messages-api.ts) | [wipeboards.ts](../../src/wipeboards.ts), [jikan.ts](../../src/jikan.ts), [message-queue.ts](../../src/message-queue.ts) | [wipeboards.test.ts](../../tests/wipeboards.test.ts), [team-jikan-client.test.js](../../tests/team-jikan-client.test.js), [message-queue.test.ts](../../tests/message-queue.test.ts) |
| Work Record / Team Kanban | [shingo.js](shingo.js), [team-kanban.js](team-kanban.js) | [sessions-api.ts](../../src/routes/sessions-api.ts): `/tegami`; Services `kanban/kanban-api.ts` | [Work Record code path](../../docs/contributor-map.md#work-record); Kanban derives its answer | [work-record.test.ts](../../tests/work-record.test.ts), [team-kanban.test.js](../../tests/team-kanban.test.js) |
| Agent tile | [tile.js](tile.js), [termview.js](termview.js), [composer.js](composer.js), [tilewire.js](tilewire.js) | [sessions-api.ts](../../src/routes/sessions-api.ts), [pty.ts](../../src/ws/pty.ts) | [tmux-client.ts](../../src/tmux-client.ts), [message-queue.ts](../../src/message-queue.ts) | [composer-parcel.test.js](../../tests/composer-parcel.test.js), [terminal-control-session.test.ts](../../tests/terminal-control-session.test.ts) |
| Phone | [phone.js](phone.js), shared tile modules | [index.ts](../../src/index.ts) serves `mobile.html`; same feature routes as desktop | Same authorities as each feature above; [state.js](state.js) holds browser state | [mobile-document.test.js](../../tests/mobile-document.test.js), affected shared-module test |
| New Agent / Team | [new-agent.js](new-agent.js), [new-team-form.js](new-team-form.js), [launch-view.js](launch-view.js) | [launch.ts](../../src/routes/launch.ts), [teams-api.ts](../../src/routes/teams-api.ts) | [agent-defaults.ts](../../src/agent-defaults.ts), [spawn.ts](../../src/spawn.ts), [team-rosters.ts](../../src/team-rosters.ts) | [new-launch-form-layout.test.js](../../tests/new-launch-form-layout.test.js), [launch-seed.test.ts](../../tests/launch-seed.test.ts) |
| Ronin Setup | [setup-view.js](setup-view.js), [garden-canvas.js](garden-canvas.js), [setup-surfaces.js](setup-surfaces.js), [provider-surface.js](provider-surface.js) | [setup-runtime-api.ts](../../src/routes/setup-runtime-api.ts), [services-activation-api.ts](../../src/routes/services-activation-api.ts) | [setup-runtime.ts](../../src/setup-runtime.ts), [registration.ts](../../src/activation/registration.ts), [activation state](../../src/activation/state.ts) | [setup-shell.test.js](../../tests/setup-shell.test.js), [setup-roots-stones.test.js](../../tests/setup-roots-stones.test.js) |
| Machine settings / Workspace Folders / Archive | [machine-settings.js](machine-settings.js), [projectroots.js](projectroots.js), [workspace-folders-surface.js](workspace-folders-surface.js), [github-workspace-setup.js](github-workspace-setup.js), [archives.js](archives.js) | [machine-settings-api.ts](../../src/routes/machine-settings-api.ts), [catalogs.ts](../../src/routes/catalogs.ts), [sessions-api.ts](../../src/routes/sessions-api.ts) | [machine-settings.ts](../../src/machine-settings.ts), [project-roots.ts](../../src/project-roots.ts), [session-archive.ts](../../src/session-archive.ts) | [machine-settings-schema.test.ts](../../tests/machine-settings-schema.test.ts), [setup-roots-stones.test.js](../../tests/setup-roots-stones.test.js), [session-archive.test.ts](../../tests/session-archive.test.ts) |
| Services surfaces | [stats.js](stats.js), [koshi.js](koshi.js), [hotwords.js](hotwords.js), [gbrain.js](gbrain.js) | Exact method/path and route source in the [Services manifest](https://github.com/ronincowork/ronin-services/blob/dev/services.json) | Each canonical Services part owns its API and store use; [parts.ts](../../src/parts.ts) owns startup selection | [services-component-ui.test.js](../../tests/services-component-ui.test.js), Services `bin/verify` |

Shared CSS starts at [style.css](../style.css) and [workspace-kit.css](../workspace-kit.css).
Feature styles: [Campaign/Home](../css/campaign-home.css), [Team](../css/team-workspace.css),
[launch forms](../css/launch-forms.css), and [selectors](../css/ask.css).

### Module responsibilities

[UI architecture](../../docs/architecture/ui.md) defines the shared contracts. The table
below describes implementation ownership; use the surface index above to find a feature.

| Module | What it owns |
|---|---|
| `state.js` | DOM handle, constants, `tiles`, the shared-state object `S`, save/load |
| `errors.js` | `showFailure`, `guard`, `deadTile` — the containment layer |
| `request.js` | the ONE transport contract — every JSON call's "what happened" |
| `ui.js` | the primitives: sheet, toast, field, status, button, tabs (docs/architecture/ui.md) |
| `terminal-controls.js` | Copy, Clear, Close, Stop: shared interception, mobile buttons, and Hints (docs/using-ronin/terminal-controls.md) |
| `theme.js` | dark/light: the saved choice, `termTheme()` read off the CSS tokens, the flip |
| `api.js` | the `/api/sessions` calls |
| `widgets.js` | `makeDial`, `makeGauge`, `setInert`, the job menu |
| `glyphs.js` | THE RULED GLYPHS — one face per ruled word (reach, recruit, output, dial, kind) for ask()'s squares; `glyph(axis, value)`, `ruledRows(axis, values, word)` |
| `ask.js` | ERABI, THE ONE SELECTOR UTILITY — `ask(spec)`: reading stones, the tray, the two shapes, switches, groups (ronin-lab `SELECTORS.md`; docs/architecture/ui.md § Asking a question) |
| `events.js` | the `/events` socket, birth/death chips, `openSessionSomewhere` |
| `home.js` | THE DATA CACHE — `refreshHome` + the catalog loaders, `homeFault` (the provider catalog is form-steps.js's) |
| `form-steps.js` | the drawn form idiom, and THE ONE PICKER — `providerModelPair`, `loadProviderCatalog`, `orderedCatalog` |
| `workbench-catalog.js` / Workbench surface definitions | The canonical destination profile and stable-type catalog. A destination supplies resident data and factories through its environment; `create()` builds the surface and its `show()`/`enter()` starts only that surface's reads. [Workbench construction](../../docs/architecture/workbench.md) owns the inventory, first-open/refresh/structured-launch rules, and dependency contract. |
| `provider-surface.js` | THE ONE MODEL PROVIDERS SURFACE, seated by Ronin Setup and Ronin Settings — per provider, Yours (the steps and the sign-in tile) then The catalog |
| `provider-setup-session.js` | the native sign-in tile's one mount, handed to both workbench environments |
| `garden-canvas-model.js` / `garden-canvas.js` | versioned four-region catalog normalization and the dumb Setup Workspace 1 canvas painter; Setup owns lookup, transitions, and action/media handling |
| `roster.js` | the ⌂ Roster room — the session list, the session max, the stale line |
| `archives.js` | the Archived room — stopped, resumable sessions backed by manifests |
| `projectroots.js` | `buildProjectRoots` — the ▣ Roots pane |
| `hotwords.js` | `buildHotwords` — the ▥ Hotwords pane, the dictation glossary |
| `stats.js` | `buildStats` — the ▦ Stats pane (TOMODACHI usage readout) |
| `koshi.js` | `buildKoshi` — the 目 Koshi pane, model per Koshi job |
| `gbrain.js` | local gbrain process, privacy, search and integration status |
| `gbrain-setup-state.js` | the Ronin Setup gbrain surface's state: one status, one next line, at most one action from the snapshot |
| `services-setup-state.js` | the Ronin Setup Services surface's state: registration, installed facts and the activation record → one status, one next line, at most one action |
| `system.js` | `buildSystem` — ⚙ System: release identity, updates, appearance, log out |
| `shingo.js` | SHINGO 信号 — the expanded work-record reading and its age helpers |
| `tile.js` | `class Tile` — one cell of the coworkspace: a header, a mount point, and the view it composes |
| `tilehead.js` | `buildTileHead` — the cell's chrome, one table and a loop: name, Work Record, output, mentions, Docs, status, and window controls |
| `output.js` | the six Output names and the per-tile selector |
| `tapeview.js` | **RIREKI's client render** — the 🔓 view: transcript, folds, live frame, scroll anchoring, paging |
| `tapefold.js` | `groupRecs` — the fold rule, pure (tested: `tests/tape-fold.test.js`) |
| `termview.js` | the 🔒 view — the untouched `tmux attach` xterm mirror, and touch drag-scroll |
| `tilewire.js` | `TileWire` — the tile's socket: reconnect, the protocol split (keystroke · message · protocol reply), the drop rule, the message answered by id |
| `composer.js` | `buildComposer` — the tile's text entry (unlocked, and every coarse tile), its mic and its keyboard lift; clears only on the host's answer |
| `composer-rules.js` | `sendComposerMessage`, `settleComposer` — HTTP message send and box settlement (tested: `tests/composer-parcel.test.js`) |
| `dvr.js` | `dvrStep` — the unlocked input rule, pure (tested: `tests/dvr.test.js`) |
| `ansi.js` | `ANSI_RE` — its own module so the tape's pure logic loads outside a browser |
| `tiledrop.js` | `isCoarse`, `makeDrop` — the coarse-pointer sheet primitives (the hoisted phone header is gone; the phone has its own shell) |
| `phone.js` | THE MOBILE DOCUMENT's entry module — `mobile.html` boots it, never `main.js`: Teams → a Team (Agents \| Docs) → one Agent's tile, hash-routed (`#/t/…` `#/d/…` `#/s/…`); the server sends that document at `/m`, and at `/` to a phone |
| `keysrow.js` | `buildKeysRow` — Esc/^C/Tab/arrows/⤓ docked on every coarse tile's composer |
| `tilementions.js` | `buildTileMentions` — the @ button on a tile head; click or drag a live session name into the composer |
| `team-arrange.js` | `parseDraft`, `createArranger` — the team page's one controller: a draft (what changes; the rest stays) from a button or from an agent's `edges page`, run through the page's own verbs |
| `team-kanban.js` | `createTeamKanban` — the Team Kanban read: five responsive columns from the team's derived project JSON; a drop sends one move request and writes no project data |
| `team-members.js` | `buildTeamMembers`, `agentTitle`, `configSignature` — the member list shared by the Commons Roster tab and the league surfaces, and the changed-only fingerprint that keeps Configuration off the five-second clock |
| `voice.js` | dictation: `makeClipRecorder` + `wireDictation` (the 🎤 on the tile's compose box) |
| `panels.js` | `buildNotePanel` 📝 (on `ui.sheet`), `toClipboard` |
| `session-picker.js` | `buildSessionPicker` — the pad key's session switcher (on `ui.sheet`) |
| `pad.js` | keypad — bindings, chords, firing |
| `padpanel.js` | keypad — the ▦ panel and ask-on-press (both on `ui.sheet`) |
| `weblink.js` | keypad — WebHID programming of the device |
| `layout.js` | `build`, `buildDrawers` — assembling the page |
| `main.js` | `init` and the boot call |
| `tips.js` | system-wide tooltip suppression; title text survives only as accessible labels while the house help panel is disabled |
| `mika.js` | `askMika` — the way to the house assistant |
| `provenance.js` | the ◆/◈ marks — a catalog entry that is yours |

Module size and dependency checks keep ownership visible: `check-modules` checks the client
and `scripts/check-src.mjs` checks the server. A tile composes its header, terminal or
transcript view, and socket; those modules own their respective machinery.

The keypad's user-facing controls are documented in
[`docs/using-ronin/terminal-controls.md`](../../docs/using-ronin/terminal-controls.md); the module rows above own
the implementation split.

## Four rules

**1. Reassignable shared state lives on `S` in `state.js`.** An imported binding is
read-only for the importer, so `compose = x` from another module is a hard error. The
values any part of the old file could reassign now sit on one object (eleven today), so every write
reads `S.active = t` and is greppable from anywhere. `tiles` is exempt: a const array,
mutated in place, never reassigned. **Do not add a new top-level `let` that another
module writes** — put it on `S`.

**2. No import cycles.** There are none today, and that is checked, not hoped: the split
was computed from the code with comments and string literals stripped, and cycles were
removed by moving the shared thing rather than by importing both ways. `setLayout` got
its own module for exactly this reason (`events`, `pad` and `layout` all need it).
If you find yourself wanting a back-edge, move the shared function down instead.

**3. Transport goes through `request.js`.** Every JSON call uses `request()` and decides
what its failure MEANS itself; no feature spells `fetch(` (the two documented exceptions:
`voice.js` posts an audio blob, `stats.js` beacons a counter). Dialog-shaped surfaces use
`ui.sheet`; one-shot outcomes use `ui.toast`. The contract is `docs/architecture/ui.md`.

**4. Never reference an imported binding at module top level.** Everything cross-module
is used inside a function body, called after the graph has loaded. A top-level
`const X = somethingImported()` reintroduces load-order fragility, which is the class of
bug this split exists to prevent.

## Verifying a change

Ordinary client development uses the running dev UI for direct dogfood and the smallest
scoped diagnostic evidence needed for the leg. It does not run BYOIN around commits,
pushes, or service restarts. At the release boundary, the designated integrator chooses the
appropriate one-time BYOIN mode for the exact candidate; `--ui` drives desktop and phone
rendering. Whether a browser exists is a fact about that verification host, and a browser
SKIP remains unverified. `docs/test-protocols.md` is the cadence contract.

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
still be useful for one local client check, but it is not the preferred multi-Agent Team
review process and does not establish which aggregate repository commit is running.

For a Team visual review, use the two-lane [visual-staging Behavior](../../docs/development/ronin-methodology.md#visual-staging-one-disposable-team-preview):
Agents offer exact private commits provisionally, the lead serially composes one disposable
staging worktree and separate preview process, and finished work later uses ordinary Worktrees
hand-in. The preview's `/api/version` identifies the aggregate commit actually on display.

The phone surface is the one that matters most for a client change: its compact Output
selector can choose the live terminal or any record-fed view supplied by Ronin Services.

`npm run smoke` checks the pipe without a browser. It does not verify rendered UI.
