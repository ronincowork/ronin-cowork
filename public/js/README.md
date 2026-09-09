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

`this.body.appendChild(...)` nineteen lines before `this.body` was assigned — threw in a
constructor, killed `build()`, and left a page that rendered its static header and did
nothing. It took hours to find and survived two reverts, because the bug was older than
the changes being reverted. A file that big is where a mistake like that hides.

See `co-working/user_repo/wip/buildouts/` history and `CLAUDE.md` for the full account.

## The map

The modules below are the client map.

professionalisation pass: transport, dialog behaviour, the pane registry and the theme
became shared contracts instead of per-feature re-inventions, and the retired Commons gave its
two resident rooms — the roster and the launcher — their own modules. `roster.js` is still
where a session is born now. `docs/ui.md` is the written contract those modules enforce.

| Module | What it owns |
|---|---|
| `state.js` | DOM handle, constants, `tiles`, the shared-state object `S`, save/load |
| `errors.js` | `showFailure`, `guard`, `deadTile` — the containment layer |
| `request.js` | the ONE transport contract — every JSON call's "what happened" |
| `ui.js` | the primitives: sheet, toast, field, status, button, tabs (docs/ui.md) |
| `theme.js` | dark/light: the saved choice, `termTheme()` read off the CSS tokens, the flip |
| `api.js` | the `/api/sessions` calls |
| `widgets.js` | `makeDial`, `makeGauge`, `setInert`, the job menu |
| `events.js` | the `/events` socket, birth/death chips, `openSessionSomewhere` |
| `home.js` | THE DATA CACHE — `refreshHome` + the catalog loaders, `homeFault` (the provider catalog is form-steps.js's) |
| `form-steps.js` | the drawn form idiom, and THE ONE PICKER — `providerModelPair`, `loadProviderCatalog`, `orderedCatalog` |
| `provider-surface.js` | THE ONE MODEL PROVIDERS SURFACE, seated by Ronin Setup and Ronin Settings — per provider, Yours (the steps and the sign-in tile) then The catalog |
| `provider-setup-session.js` | the native sign-in tile's one mount, handed to both workbench environments |
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
| `tilehead.js` | `buildTileHead` — the cell's chrome, one table and a loop: name, work-record door, output, ⛩ ⚡ メ, and the メ drops |
| `output.js` | the six Output names and the per-tile selector |
| `tapeview.js` | **RIREKI's client render** — the 🔓 view: transcript, folds, live frame, scroll anchoring, paging |
| `tapefold.js` | `groupRecs` — the fold rule, pure (tested: `tests/tape-fold.test.js`) |
| `termview.js` | the 🔒 view — the untouched `tmux attach` xterm mirror, and touch drag-scroll |
| `tilewire.js` | `TileWire` — the tile's socket: reconnect, the protocol split (keystroke · message · protocol reply), the drop rule, the message answered by id |
| `composer.js` | `buildComposer` — the tile's text entry (unlocked, and every coarse tile), its mic and its keyboard lift; clears only on the host's answer |
| `composer-rules.js` | `settleComposer` — the composer's send rule, pure (tested: `tests/composer-parcel.test.js`) |
| `dvr.js` | `dvrStep` — the unlocked input rule, pure (tested: `tests/dvr.test.js`) |
| `ansi.js` | `ANSI_RE` — its own module so the tape's pure logic loads outside a browser |
| `tiledrop.js` | `isCoarse`, `makeDrop` — the coarse-pointer sheet primitives (the hoisted phone header is gone; the phone has its own shell) |
| `phone.js` | THE MOBILE DOCUMENT's entry module — `mobile.html` boots it, never `main.js`: Teams → a Team (Agents \| Docs) → one Agent's tile, hash-routed (`#/t/…` `#/d/…` `#/s/…`); the server sends that document at `/m`, and at `/` to a phone |
| `keysrow.js` | `buildKeysRow` — Esc/^C/Tab/arrows/⤓ docked on every coarse tile's composer |
| `tilemacros.js` | `buildTileMacros` — the ⚡ button on a tile head; the `preview:` macros as teaching cards, prefills `+name: `, never runs |
| `tilementions.js` | `buildTileMentions` — the @ button on a tile head; click or drag a live session name into the composer |
| `tilemore.js` | DESKTOP ONLY — `buildTileMore`: メ on a tile head and the controls it drops in one strip; `fitDropToTile`, shared by every drop off that header |
| `team-arrange.js` | `parseDraft`, `createArranger` — the team page's one controller: a draft (what changes; the rest stays) from a button or from an agent's `tejun-teampage`, run through the page's own verbs |
| `team-members.js` | `buildTeamMembers`, `agentTitle`, `configSignature` — the member list shared by the commons configuration tab and the league surfaces, and the changed-only fingerprint that keeps the configuration off the five-second clock |
| `voice.js` | dictation: `makeClipRecorder` + `wireDictation` (the 🎤 on the tile's compose box) |
| `panels.js` | `buildNotePanel` 📝 (on `ui.sheet`), `toClipboard` |
| `macros.js` | `buildSessionPicker` — the pad key's session switcher (on `ui.sheet`) |
| `pad.js` | keypad — bindings, chords, firing |
| `padpanel.js` | keypad — the ▦ panel and ask-on-press (both on `ui.sheet`) |
| `weblink.js` | keypad — WebHID programming of the device |
| `layout.js` | `build`, `buildDrawers` — assembling the page |
| `main.js` | `init` and the boot call |
| `tips.js` | system-wide tooltip suppression; title text survives only as accessible labels while the house help panel is disabled |
| `mika.js` | `askMika` — the way to the house assistant |
| `provenance.js` | the ◆/◈ marks — a catalog entry that is yours |

The rule is nothing over 700 lines — and it is MECHANICAL now (`check-modules` fails the
build), because the written-only version was crossed within a week of being written.
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

`npm run smoke` is the *other* test — it checks the pipe with no browser. It passed the
Never conclude the UI works from it alone.
