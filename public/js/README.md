# `public/js/` — the client, in modules

Native ES modules. **No bundler, no build step, no TypeScript.** `index.html` loads
`js/main.js` with `type="module"`; the browser fetches the rest. `express.static` already
serves this directory, so a change here is live on reload — same as it always was.

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
became shared contracts instead of per-feature re-inventions, and `commons.js` gave its
two resident rooms (`roster.js`, `launcher.js`) their own modules. `docs/ui.md` is the
written contract those modules enforce.

| Module | Lines | What it owns |
|---|---|---|
| `state.js` | 153 | DOM handle, constants, `tiles`, the shared-state object `S`, save/load |
| `errors.js` | 115 | `showFailure`, `guard`, `deadTile` — the containment layer |
| `request.js` | 88 | the ONE transport contract — every JSON call's "what happened" |
| `ui.js` | 280 | the primitives: sheet, toast, field, status, button, tabs (docs/ui.md) |
| `panes.js` | 38 | the pane registry — the Commons' rooms, spelled once for its tab strip |
| `theme.js` | 107 | dark/light: the saved choice, `termTheme()` read off the CSS tokens, the flip |
| `viewport.js` | 41 | `setLayout` — its own module because three others need it |
| `api.js` | 44 | the `/api/sessions` calls |
| `widgets.js` | 225 | `makeDial`, `makeGauge`, `setInert`, the job menu |
| `events.js` | 96 | the `/events` socket, birth/death chips, `openSessionSomewhere` |
| `home.js` | 158 | THE DATA CACHE — `refreshHome` + the catalog loaders, `homeFault`, `showReceipt` |
| `commons.js` | 158 | `buildHome` — the control-plane SHELL: tab strip, panes, room mounting |
| `roster.js` | 258 | the ⌂ Roster room — the session list, the session max, the stale line |
| `launcher.js` | 480 | the ＋ New session room — the koshidashi board, form, saved launches |
| `wipeboard.js` | 292 | `buildWipeboard` — the ▤ Wipeboard pane |
| `projectroots.js` | 245 | `buildProjectRoots` — the ▣ Roots pane |
| `hotwords.js` | 132 | `buildHotwords` — the ▥ Hotwords pane, the dictation glossary |
| `stats.js` | 413 | `buildStats` — the ▦ Stats pane (TOMODACHI usage readout) |
| `koshi.js` | 185 | `buildKoshi` — the 目 Koshi pane, model per Koshi job |
| `gbrain.js` | commons_tab | local gbrain process, privacy, search and integration status |
| `system.js` | 187 | `buildSystem` — ⚙ System: release identity, updates, appearance, log out |
| `shingo.js` | 289 | SHINGO 信号 — the session ladder: header chip, unrolled ladder, the letter |
| `tile.js` | 674 | `class Tile` — one cell of the coworkspace: a header, a mount point, and the view it composes |
| `tilehead.js` | 307 | `buildTileHead` — the cell's chrome, one table and a loop: dot, picker, chip, mark, ⛩ ⚡ メ, and the six メ drops |
| `tapeview.js` | 305 | **RIREKI's client render** — the 🔓 view: transcript, folds, live frame, scroll anchoring, paging |
| `tapefold.js` | 98 | `groupRecs` — the fold rule, pure (tested: `tests/tape-fold.test.js`) |
| `termview.js` | 250 | the 🔒 view — the untouched `tmux attach` xterm mirror, and touch drag-scroll |
| `tilewire.js` | 133 | `TileWire` — the tile's socket: reconnect, the protocol split, the drop rule |
| `composer.js` | 183 | `buildComposer` — the unlocked tile's text entry, its mic and its keyboard lift |
| `dvr.js` | 37 | `dvrStep` — the unlocked input rule, pure (tested: `tests/dvr.test.js`) |
| `ansi.js` | 12 | `ANSI_RE` — its own module so the tape's pure logic loads outside a browser |
| `tiledrop.js` | 233 | TOUCH ONLY — `collapseTileHead`, `makeDrop`: the one-row phone header |
| `tilemacros.js` | 157 | `buildTileMacros` — the ⚡ button on a tile head; prefills `+name: `, never runs |
| `tilemore.js` | 127 | DESKTOP ONLY — `buildTileMore`: メ on a tile head, and the six controls it drops in one strip |
| `voice.js` | 181 | dictation: `makeClipRecorder` + `wireDictation` (the 🎤 on the tile's compose box) |
| `panels.js` | 248 | `buildNotePanel` 📝, `buildTagPanel` 🏷 (on `ui.sheet`), `toClipboard` |
| `macros.js` | 103 | `buildSessionPicker` — the pad key's session switcher (on `ui.sheet`) |
| `pad.js` | 246 | keypad — bindings, chords, firing |
| `padpanel.js` | 533 | keypad — the ▦ panel and ask-on-press (both on `ui.sheet`) |
| `weblink.js` | 198 | keypad — WebHID programming of the device |
| `layout.js` | 420 | `build`, `buildDrawers` — assembling the page |
| `main.js` | 72 | `init` and the boot call |
| `tips.js` | 289 | the help box — the one hover/focus explanation panel |
| `mika.js` | 81 | `askMika` — the way to the house assistant |
| `provenance.js` | 74 | the ◆/◈ marks — a catalog entry that is yours |

The rule is nothing over 700 lines — and it is MECHANICAL now (`check-modules` fails the
build), because the written-only version was crossed within a week of being written.
`tile.js` was, at 1,270, and was split on 2026-08-13 to
the shape the owner ruled: a tile is one CELL of the coworkspace — header, dials, a mount
point — that composes one of two views, with the socket beside both.

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
its own module for exactly this reason (`events`, `pad` and `layout` all need it);
`showReceipt` moved to `home.js` for the same reason.
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

**Run the render gate, and ask the machine whether it can.** `npm run smoke:ui` drives two
passes — desktop and phone — and `npm run verify` ends in it. Whether a browser exists here
today is a fact about the box, not about this file: `bin/ronin-doctor` answers it by
launching one, `bin/ronin-byoin` gives one verdict. This paragraph used to assert there was
no browser; that was true when written and false from 2026-08-13, which is exactly why the
question now goes to a tool.

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

The phone surface is the one that matters most for a client change: touch is fixed-unlocked
(`locked = !IS_TOUCH`), so it is the only one that renders through the tape view, and it is
where 2026-08-08 went dark first. Nothing on this box exercises it.

`npm run smoke` is the *other* test — it checks the pipe with no browser. It passed the
entire time the screen was blank on 2026-08-08, so it is necessary and not sufficient.
Never conclude the UI works from it alone.
