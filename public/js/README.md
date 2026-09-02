# `public/js/` — the client, in modules

**test_protocols:** ordinary dev work does not run BYOIN; the integrator runs it once at the `dev → master` boundary — `docs/test-protocols.md` is the contract.

Native ES modules. **No bundler, no build step, no TypeScript.** `index.html` loads
`js/main.js` with `type="module"`; the browser fetches the rest. `express.static` already
serves this directory, so a change here is live on reload — same as it always was.

**Words:** every string a person reads goes through `t('room.key', 'literal')` from
`lexicon.js`, with the key in `ronin_catalogs/lexicons/professional_en.md` in the same
commit — `docs/kokugo.md` is the instruction, and `scripts/check-lexicon.mjs` fails a
module that forgets. `index.html`'s static words go through `pagewords.js`.

xterm stays a classic `<script>` (`window.Terminal`, `window.FitAddon`): the vendor files
are served straight from `node_modules` and load before the module graph runs.

## Why it is split at all

Until 2026-08-08 this was one 4,287-line `app.js`. That day one line in the wrong place —
`this.body.appendChild(...)` nineteen lines before `this.body` was assigned — threw in a
constructor, killed `build()`, and left a page that rendered its static header and did
nothing. It took hours to find and survived two reverts, because the bug was older than
the changes being reverted. A file that big is where a mistake like that hides.

See `co-working/user_repo/wip/buildouts/` history and `CLAUDE.md` for the full account.

## The map

Forty-four modules, 8,916 lines. Counts below are `wc -l`, measured against the tree.

The platform row (request/ui/panes/theme) landed 2026-08-16 with the UI/UX
professionalisation pass: transport, dialog behaviour, the pane registry and the theme
became shared contracts instead of per-feature re-inventions, and the retired Commons gave its
two resident rooms — the roster and the launcher — their own modules. `roster.js` is still
one of them; the launcher module went with the ＋ New board (2026-08-31), and New Agent is
where a session is born now. `docs/ui.md` is the written contract those modules enforce.

| Module | Lines | What it owns |
|---|---|---|
| `state.js` | 153 | DOM handle, constants, `tiles`, the shared-state object `S`, save/load |
| `errors.js` | 115 | `showFailure`, `guard`, `deadTile` — the containment layer |
| `request.js` | 88 | the ONE transport contract — every JSON call's "what happened" |
| `ui.js` | 280 | the primitives: sheet, toast, field, status, button, tabs (docs/ui.md) |
| `theme.js` | 107 | dark/light: the saved choice, `termTheme()` read off the CSS tokens, the flip |
| `api.js` | 44 | the `/api/sessions` calls |
| `widgets.js` | 225 | `makeDial`, `makeGauge`, `setInert`, the job menu |
| `events.js` | 96 | the `/events` socket, birth/death chips, `openSessionSomewhere` |
| `home.js` | 131 | THE DATA CACHE — `refreshHome` + the catalog loaders, `homeFault` |
| `roster.js` | 258 | the ⌂ Roster room — the session list, the session max, the stale line |
| `archives.js` | — | the Archived room — stopped, resumable sessions backed by manifests |
| `projectroots.js` | 245 | `buildProjectRoots` — the ▣ Roots pane |
| `hotwords.js` | 132 | `buildHotwords` — the ▥ Hotwords pane, the dictation glossary |
| `stats.js` | 413 | `buildStats` — the ▦ Stats pane (TOMODACHI usage readout) |
| `koshi.js` | 185 | `buildKoshi` — the 目 Koshi pane, model per Koshi job |
| `gbrain.js` | commons_tab | local gbrain process, privacy, search and integration status |
| `system.js` | 187 | `buildSystem` — ⚙ System: release identity, updates, appearance, log out |
| `shingo.js` | 289 | SHINGO 信号 — the expanded work-record reading and its age helpers |
| `tile.js` | 695 | `class Tile` — one cell of the coworkspace: a header, a mount point, and the view it composes |
| `tilehead.js` | 343 | `buildTileHead` — the cell's chrome, one table and a loop: name, work-record door, output, ⛩ ⚡ メ, and the メ drops |
| `output.js` | — | the six Output names and the per-tile selector |
| `tapeview.js` | 305 | **RIREKI's client render** — the 🔓 view: transcript, folds, live frame, scroll anchoring, paging |
| `tapefold.js` | 98 | `groupRecs` — the fold rule, pure (tested: `tests/tape-fold.test.js`) |
| `termview.js` | 250 | the 🔒 view — the untouched `tmux attach` xterm mirror, and touch drag-scroll |
| `tilewire.js` | 133 | `TileWire` — the tile's socket: reconnect, the protocol split, the drop rule |
| `composer.js` | 183 | `buildComposer` — the unlocked tile's text entry, its mic and its keyboard lift |
| `dvr.js` | 37 | `dvrStep` — the unlocked input rule, pure (tested: `tests/dvr.test.js`) |
| `ansi.js` | 12 | `ANSI_RE` — its own module so the tape's pure logic loads outside a browser |
| `tiledrop.js` | 95 | `isCoarse`, `makeDrop` — the coarse-pointer sheet primitives (the hoisted phone header is gone; the phone has its own shell) |
| `phone.js` | 215 | THE PHONE SHELL — an iPhone-class screen never boots the workbench: Coworks → Agents → the stage, hash-routed (`#/m/…`) |
| `keysrow.js` | 61 | `buildKeysRow` — Esc/^C/Tab/arrows/⤓ docked on every coarse tile's composer |
| `tilemacros.js` | 231 | `buildTileMacros` — the ⚡ button on a tile head; the `preview:` macros as teaching cards, prefills `+name: `, never runs |
| `tilementions.js` | — | `buildTileMentions` — the @ button on a tile head; click or drag a live session name into the composer |
| `tilemore.js` | 158 | DESKTOP ONLY — `buildTileMore`: メ on a tile head and the controls it drops in one strip; `fitDropToTile`, shared by every drop off that header |
| `team-arrange.js` | 95 | `parseDraft`, `createArranger` — the team page's one controller: a draft (what changes; the rest stays) from a button or from an agent's `tejun-teampage`, run through the page's own verbs |
| `team-members.js` | 65 | `buildTeamMembers`, `agentTitle`, `configSignature` — the member list shared by the commons configuration tab and the league surfaces, and the changed-only fingerprint that keeps the configuration off the five-second clock |
| `voice.js` | 181 | dictation: `makeClipRecorder` + `wireDictation` (the 🎤 on the tile's compose box) |
| `panels.js` | 248 | `buildNotePanel` 📝 (on `ui.sheet`), `toClipboard` |
| `macros.js` | 103 | `buildSessionPicker` — the pad key's session switcher (on `ui.sheet`) |
| `pad.js` | 246 | keypad — bindings, chords, firing |
| `padpanel.js` | 533 | keypad — the ▦ panel and ask-on-press (both on `ui.sheet`) |
| `weblink.js` | 198 | keypad — WebHID programming of the device |
| `layout.js` | 420 | `build`, `buildDrawers` — assembling the page |
| `main.js` | 72 | `init` and the boot call |
| `tips.js` | 289 | system-wide tooltip suppression; title text survives only as accessible labels while the house help panel is disabled |
| `mika.js` | 81 | `askMika` — the way to the house assistant |
| `provenance.js` | 74 | the ◆/◈ marks — a catalog entry that is yours |

The rule is nothing over 700 lines — and it is MECHANICAL now (`check-modules` fails the
build), because the written-only version was crossed within a week of being written.
`tile.js` was, at 1,270, and was split on 2026-08-13 to
the shape the owner ruled: a tile is one CELL of the coworkspace — header, dials, a mount
point — that composes Locked or one of five record-fed Outputs, with the socket beside them.

That split was not about the line count. The tape half of `tile.js` was **RIREKI's
client-side render squatting in the coworkspace**: KOTOBA has RIREKI covering "capture,
storage, render and the consumers", the server half honours it (`src/services/rireki/`,
`libexec/rireki/`), and the client half did not. `tapeview.js` is that half, in its own module
at last; `termview.js` is the locked mirror; `tilewire.js` is the socket that feeds
whichever view is showing. Read `tile.js` and you should see composition, not machinery.

The server has the same rule with a gate behind it (`scripts/check-src.mjs`, 700 lines and
a ratchet). The client's gate is `check-modules` — the same 700, mechanically enforced
since 2026-08-16.

The three keypad modules are described in one place and nowhere else:
[`co-working/user_repo/README/KEYPAD_README.md`](../../co-working/user_repo/README/KEYPAD_README.md).

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
`ui.sheet`; one-shot outcomes use `ui.toast`. The contract is `docs/ui.md`.

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
npm run stage           # copy this client to public-staging/, served at /staging/
```

`npm run stage` is therefore the real tool here: it puts a candidate at `/staging/` against
the same server and sessions so **Glen** can look at it on his Mac and iPhone while his
working UI stays up. That human look is currently the only render check that exists.

The phone surface is the one that matters most for a client change: its compact Output
selector can choose the live terminal or any record-fed view supplied by Ronin Services.
It is where 2026-08-08 went dark first. Nothing on this box exercises it.

`npm run smoke` is the *other* test — it checks the pipe with no browser. It passed the
entire time the screen was blank on 2026-08-08, so it is necessary and not sufficient.
Never conclude the UI works from it alone.
