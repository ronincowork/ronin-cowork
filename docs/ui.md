# UI — the contract the frontend enforces

The client grew feature by feature, each solving markup, colour, fetch, failure and
focus for itself. This document is the set of decisions that are now made ONCE, and it
is written against enforcement, not aspiration: where a rule has a gate, the gate is
named. A new surface starts from these contracts; what is genuinely unique about a
feature is all a feature file should contain.

The style of the product is unchanged and deliberate: dense, dark-first, pro-tool,
Japanese marks as identity. This page is about how that style is CARRIED, not what it is.

## The cascade

`public/style.css` is one file in four `@layer`s — `vendor, foundations, ui, app` —
declared first:

- **vendor** — xterm.css, imported into the lowest layer.
- **foundations** — the design tokens (both themes), reset, page chrome, and the one
  universal `:focus-visible` ring.
- **ui** — the shared primitives: `.ui-sheet`/`.ui-card`, `#toast`, the help box.
- **app** — every composition and feature rule, in source order.

Later layers win, so the cascade guarantees exactly one direction: every Ronin rule
beats xterm.css by construction. `app` being strongest is what lets a feature size and
accent ITS OWN card (`.ns-card`, `.sp-card`) — and it means the rule "app does not
restyle a primitive's hooks (`.ui-*`, `#toast`, `.helpbox`) or shadow a foundation
token" is `check-css`'s to enforce (checks 4–5), not the cascade's. Splitting layers
into files is a mechanical move for the day a layer earns one.

## The look is spelled once — all of it

**Editing `@layer foundations` re-skins the whole app.** That is the promise (owner,
2026-08-19: *"if someone wanted to change how their co-work space looked entirely, they
could just change everything by giving a simple instruction to update the design tokens"*),
and it only holds while nothing carrying look is spelled anywhere else — so
`scripts/check-css.mjs` gates every family, not just colour. A raw `8px` radius in a
feature rule is the same defect as a raw `#131826`.

The census that prompted this (2026-08-19): **eleven** border-radius values, **twelve**
font-sizes including 10.5/11.5/12.5px, spacing on nearly every integer from 1 to 18, and
**seven** font stacks doing the work of three roles. An agent could not get a colour wrong
and could not get a radius right.

| Family | Tokens | What it governs |
|---|---|---|
| shape | `--radius-hair/xs/sm/md/lg/xl` + `--radius-pill` `--radius-round` | corners. `md` unless you have a reason. `pill`/`round` are shapes, so squaring the app leaves a dot a dot |
| space | `--space-1` … `--space-12` (2px ladder) | padding, margin, gap. `--space-4` (8px) is the house default |
| type | `--text-1` … `--text-10`, `--text-micro` | `--text-3` (12px) is this app's body, not a caption — Ronin is dense on purpose |
| voice | `--font-ui` `--font-mono` `--font-term` | **three roles, not two.** `--font-term` is what xterm renders (`js/termview.js` reads it via `termFace()`), and the tape, composer and jump button must match it glyph-for-glyph or a wrapped line stops lining up |
| edge | `--edge` `--edge-2` | border widths — a heavier-lined theme is one edit, not four hundred |
| motion | `--motion-quick/settle/slow/hint`, `--ease` `--ease-out` | four speeds; nothing animates for decoration |
| elevation | `--scrim` `--shadow-menu` `--shadow-sheet` | |

These are **theme-independent** and defined once: a square corner is square in both shells.
Only the colour roles are redefined under `:root[data-theme='light']`.

**Light and dark are Stock's two faces, and that is why they stay in CSS.** `:root` and
`:root[data-theme='light']` under `@layer foundations` are exactly what a skin spells as
`dark--x` and `light--x` — one mechanism, not two, and the owner's reading ("light/dark is
really just the first two skins") is already satisfied rather than pending. Stock is spelled
in the stylesheet because it is the **floor**: the page must paint correctly with no JS
having run, on a first visit or a flaky link, and a floor that has to be fetched is not one.
Moving it into `SKINS.md` would also put one palette in two places — and `check-css` reads
its contrast floor out of the stylesheet by selector and has never heard of `SKINS.md`, so
the copy that renders would go unmeasured while the copy that does not stayed green.

**The honest limit: a skin's colours are checked by nothing.** The gate measures
`@layer foundations`. Shipped skins are written to stay clear of the floor — `paper` moves
grounds and leaves the ink alone, which is the change that cannot make anything unreadable.
A skin of your own can do as it likes; nothing is measuring it for you.

**A skin is a set of these tokens, and nothing else** (`ronin_catalogs/SKINS.md`,
`js/skins.js`). It cannot add a rule, move a control or style one surface differently from
another — it can only answer questions `@layer foundations` already asks, which is the whole
safety story: there is no selector in a skin to get wrong, and a token spelled wrong is
inert. Shadowable like any catalog (`docs/shadowing.md`): shipped skins update with the
repo, a skin of yours is yours and an upgrade cannot touch it, and the picker says which is
which because only a skin of ours that you replaced can silently stop tracking an upgrade.
**A token a skin names is chosen for both shells** — light and dark are themes, a skin is a
skin — which is why the shipped skins stay off colour and compose with the flip instead of
competing with it. The whole feature is one catalog, one route and thirty lines of client;
it is the dividend of the token work above, not a second system.

**The escape hatch costs you a name.** A one-off MEASUREMENT is not a rung and must not
become one — `--tape-clearance` (the composer's height, so the last transcript line is not
hidden), `--ptr-len`/`--ptr-wide` (the dial needle's geometry, three numbers that must move
together), `--fr-gutter` (first-load is a document, not the app grid). A `--name:` line is
the one legal home for a raw value, so naming it satisfies the gate *and* says what the
number is. `0` is always legal: the absence of a value is not a value.

## Colour

Colour is spelled once, in tokens, and `scripts/check-css.mjs` fails the build on a raw
colour anywhere but a `--token:` definition (the allowlist is empty and stays empty).
The same gate holds a **contrast floor** for the named role pairs in both themes —
floors set from the measured palette, so a token edit that dims text fails the build.
`--dim` is excluded by design: it is the zero-state colour, decorative by definition.
The roles, defined in `public/style.css`:

- surfaces: `--bg` (canvas) · `--bg-2` (bar) · `--panel` · `--raise` · `--well` (inputs)
- edges: `--line` · `--line-2` · `--line-3` (three weights, hairline → emphasized)
- text: `--fg-strong` · `--fg` · `--muted` · `--muted-2` · `--muted-3` · `--dim` (zero-state)
- meaning: `--accent` (attention/identity) · `--accent-2` (reference) · `--ok`/`--ok-2` ·
  `--warn` (needs you) · the `--bad-*` family (wrong, in grades) · `--info` · `--action`
- house: `--kaki` (this session) · `--aiiro` (Ronin) — Kojin's fixed palette, borrowed
- elevation: `--scrim`, `--shadow-menu`, `--shadow-sheet` — the whole vocabulary
- terminal: the `--term-*` block — xterm's palette and the tape/composer surfaces,
  read back into JS by `termTheme()` (`public/js/theme.js`), never restated

Amber is attention and identity; `--warn` is "needs you"; red is only ever wrong.
`--bad` is never used categorically in charts (the `--k-*` job colours exist for that).

## Theme

Two shells, same roles: `:root` is dark, `:root[data-theme='light']` remaps. **The
default FOLLOWS THE DEVICE** (`prefers-color-scheme`, live — flip the Mac and Ronin
flips with it, owner's ruling 2026-08-16), and the one control is the flip button in
the ⚙ System sheet: flipping away from the device's mode pins the shell; flipping
back to match re-arms following — no third control exists (`theme.js setTheme`).
Per device (localStorage `tmuxgrid.theme`); `index.html` resolves the choice inline
before first paint. One resolved palette feeds CSS, xterm and the browser's
`theme-color`; `check-css` holds `theme.js`'s token reads and the stylesheet to the
same list. The browser gates pin `colorScheme: 'dark'` so the baselines are a choice,
not the headless engine's default.

**The terminal goes light with the shell** (2026-08-19). It used to stay dark on
purpose — a terminal is read against a dark ground by convention and every TUI palette
assumes it — and the owner overruled that: white-on-black is precisely what puts a
non-terminal person off, so a light shell around a black pane has not gone light. The
light block remaps every `--term-*` token; **`theme.js` needed no change at all**,
because `termTheme()` re-reads the tokens on each flip. Remapping them in CSS is the
whole mechanism, which is the token rule paying for itself.

The light set is **Tomorrow**, the day sibling of the dark set's Tomorrow Night — one
scheme, two grounds. Two departures from stock, both forced by the paper:

- **Every colour clears 3:1 on `--term-bg`.** Tomorrow's `#eab700` yellow is 1.7:1 on
  paper, so a TUI's warning line would read as blank. A light pane that is merely light
  is not legible.
- **ANSI white is not white.** Dark schemes map 7/15 to the foreground, so `\e[97m`
  gets the strongest ink. Map that literally on paper and the text disappears — the
  fault Solarized Light is known for. Here 7 is a mid grey and 15 is near-black, so
  bright white stays the strongest mark, which is the role the emitting code means.

What this cannot fix: a TUI that paints its own background dark, or hardcodes a colour
rather than asking for an ANSI slot, keeps its dark rectangle inside the light pane.
The palette is a set of answers to questions the program has to ask.

**"Bright white is the strongest mark" is now a CONTRACT, not a nicety, and it reaches
outside Ronin.** Claude Code — the agent in most of these panes — ships themes in two
shapes: `light`/`dark` hardcode RGB, and `light-ansi`/`dark-ansi` emit **slot names**
(`text: ansi:whiteBright`). Under an `-ansi` theme it never sends a colour, so xterm holds
the slot index and re-renders existing text the moment `applyTheme` pushes a new palette —
which is why **flipping Ronin's light/dark recolours the agent's output live**, with nothing
written to `~/.claude` and nothing for Ronin to reach into. Both halves are true at once:
Ronin cannot touch that program's settings, and that program follows Ronin's flip.

It only works because 15 is the strongest mark in BOTH shells. Measured on this palette:

| Claude Code theme | its `text` slot | on Ronin light | on Ronin dark |
|---|---|---|---|
| `light-ansi` | `ansi:black` | 15.57:1 | **1.17:1 — body text invisible** |
| `dark-ansi` | `ansi:whiteBright` | 17.29:1 | 16.06:1 |

So a pinned `-ansi` theme survives the flip only if it pins the one whose slot is legible on
both grounds, and on this palette that is `dark-ansi` in either shell. `light-ansi` looks
right until the first flip back and then loses the body text — caught on the owner's own box,
2026-08-19. **Change 7/15 in either shell and that table has to be recomputed**; the
consumer is a program this repo does not ship.

## Transport and failure

Every JSON call goes through `request()` (`public/js/request.js`) and gets one answer
shape: `{ok, status, data}` or `{ok:false, kind, message, retryable}`. It never throws
for a transport outcome, never toasts, never retries a mutation, and knows no Ronin
vocabulary. Documented exceptions: `voice.js` (audio blob), `stats.js` (beacon).

Where a failure LANDS is a product decision, by scope:

| Scope | Surface | Rule |
|---|---|---|
| field/form | the form's own notice line (`.ks-err`, `.ns-msg`, `.tg-msg`) | typed work survives; the sheet/form stays open |
| pane | the pane's empty/error line (`.pr-empty`, `.wb-empty`, …) | navigation survives; retry is re-entering |
| tile-scoped act | the toast (`ui.toast`) | an alert would steal the keyboard from a live pane |
| roster freshness | the stale line (`.home-stale`) | stale-and-labelled beats empty-and-silent |
| application fault | `#failbar` (`errors.js`) | unchanged: the last line of defence, technical, loud |

A failed save must never close the editor and look successful; a failed load must never
leave an enabled empty editor (Docs and Notes both enforce this); a failed refresh
keeps the last good data and says so.

Native dialogs: `confirm()` is the destructive-confirm primitive (kill session, discard
edits) — it is modal, keyboard-correct and honest. `prompt()` is tolerated for one-line
name entry only. `alert()` is not used.

## Update paths — what causes a surface to change

The one-answer table. `S.sessions` has ONE writer (`reconcileSessions`, `api.js`);
`homeData` and the catalogs have one owner (`home.js`); every timer below is written
next to a predicate that stops it costing anything while its surface is hidden.

| Fact | Written by | Arrives via |
|---|---|---|
| session set (`S.sessions`) | `reconcileSessions` (`api.js`) — the only writer | boot fetch (`main.js`) · `/events` push (`events.js`, which also owns births/deaths/chips) · visibilitychange + bfcache `pageshow` (`layout.js`) · post-mutation `fetchSessions()` calls |
| roster/status data (`homeData`) | `refreshHome` (`home.js`) — inflight-guarded, fault-keeping | 8s poll while a home pane is visible (`layout.js`) · visibilitychange · every `showHome` · post-mutation refreshes |
| catalogs (macros, projects, presets, saved launches) | their `load*` in `home.js` | boot, and the two panes that edit them re-load after a write |
| per-tile readings (ctx, tegami, control) | the tile's own `refresh*` | 30s poll for visible connected tiles (`layout.js`) · connect · post-write re-read |
| pane data (wipeboard, docs list, roots, koshi, stats) | the pane module | its own gated poll (2s/2s/15s) or `enter()` — each owner is the file the surface lives in |
| tile bytes | `TileWire` (`tilewire.js`) | the socket; reconnect/backoff lives there and nowhere else |

Lifecycle is deliberately simple: the page is the unit. Tiles, rooms and sheets are
built once at boot and live for the page — nothing unmounts, so there is no disposal
contract to forget; hidden surfaces cost nothing because their polls are gated on
visibility predicates, not torn down. If a surface ever becomes destroyable, it takes
a `destroy()` owner at that moment, not speculatively.

## Transient surfaces

- **Sheet/dialog** — `ui.sheet` (`public/js/ui.js`): scrim + card, `role=dialog`,
  focus enters the first field (never on touch — the iOS keyboard), Tab is contained,
  Escape and the backdrop dismiss, and focus RETURNS to the opener. Consumers: Notes,
  Tags, the session switcher, ⚙ System, and — since 2026-08-17, the last family to
  come across — the pad's ▦ panel and its ask-on-press prompt. The prompt is the one
  surface that overrides the touch rule and focuses its field anyway: it has nothing
  to read, it IS the field. Nothing hand-rolls a sheet any more.
  **"Returns to the opener" is VERIFIED, not attempted (2026-08-18).** It used to be a
  `.focus()` guarded on `isConnected`, and neither half was the question: `.focus()` is a
  silent no-op on an element that cannot take focus, and a node inside a `display: none`
  parent is `isConnected === true`. A sheet raised from a control that then went hidden —
  メ's tile-header drop used to shut itself behind exactly these two — closed with the
  keyboard on `<body>`, so the next Tab restarted the page, which is the failure this
  contract exists to prevent. The restore now checks that focus LANDED, and when the opener
  refuses it falls back to the nearest still-rendered ancestor of the opener, given
  `tabindex=-1`: not a guess at which control replaced it (a primitive knows no Ronin
  vocabulary and cannot know), a guess at the PLACE, so Tab continues from where the opener
  sat. `<body>` is never a destination; landing there is the failure.
  **Backdrop dismissal keeps focus too**, and that was broken for every consumer, not just
  the hidden-opener ones. The browser's own mousedown focus rule runs after the dismissal
  handler and moves focus to the nearest focusable ancestor of what was pressed — the scrim
  is a bare `div`, so that is `<body>`, arriving right after the restore and undoing it.
  Measured 2026-08-18: Escape returned the opener on every sheet on the page while a
  backdrop click returned `<body>` on every one of them, ⚙ System and the session switcher
  included. The pointer's default is cancelled, so the restore is the last word.
- **Popover/menu** — **retired 2026-08-17.** `ui.popover` had one consumer, the き
  Commons menu, and that menu is gone (see Navigation). A primitive with no consumer is
  a corpse `check-dead` fails the build on, and parked code is not kept alive by an
  exemption — the tape is in git. The dismissal grammar it held is not repealed: the job
  menu (`widgets.js`) and the touch drops (`tiledrop.js`) still carry it in their own
  code, and the day a bar control drops a menu again it comes back to `ui.js` rather
  than being hand-rolled at the call site for the fourth time.
  **Weighed again the same day and still not restored.** メ on the tile header now drops
  the six controls that used to end the row (`public/js/tilemore.js`, docs/tile.md); it
  follows ⚡'s grammar, and the reason is mechanical rather than taste. The drops that
  hang off a tile header close each other with a `.open` **class** sweep — ⚡'s own, and
  the phone's — while `popover()` hid with the `hidden` **attribute**, so a drop no sweep
  can see would open on top of the macro menu six pixels to its left. Restoring the
  primitive for one of two adjacent header dropdowns and not the other would be a third
  convention, not a shared one. What that call site DOES carry is the half of `popover()`
  that was about access: `aria-haspopup` / `aria-expanded` on the opener, and focus back
  on it when the drop closes under the keyboard. The paragraph above still stands, and it
  is about the BAR; a tile header is not the bar.
- **Toast** — `ui.toast`: one chip, `role=status`, errors hold longer than successes.
- **Field** — `ui.field`: a real accessible name and a message line for a control,
  `display: contents` so the layout it sits in does not move. Labels are
  screen-reader-only by default (the cockpit's density keeps placeholders as the
  visual); the message doubles as `aria-describedby`/`aria-invalid`. Consumers:
  launcher, hotwords, tags, notes, wipeboard.
- **Async status** — `ui.status`: the one spelling of loading…/saved/not-saved-and-why,
  `role=status`, hidden when empty, kinds `busy/ok/bad`. Consumers: launcher, hotwords,
  notes, tags, docs, koshi, roots, system.
- **Tabs** — `ui.tabs`: tablist/tab roles, `aria-selected`, roving tabindex, arrow keys
  over a strip that already exists; activation stays a click, because entering a room
  starts its fetches. Consumers: the Commons strip, the Stats windows.
- **Button** — `ui.button`: `type=button` + label + help in one call; sugar with a
  guarantee.

## Navigation

The Commons' rooms live in ONE registry — `public/js/panes.js` — consumed by the tab
strip (`commons.js`). A row carries a full label, an optional compact label for the
402px strip, and a hint. A new room is one registry row plus one feature module;
service gating stays `serviceOff()` in `state.js`.

**The bar is a DESTINATION, the strip is the choosing (owner's ruling 2026-08-17).**
⛩ Commons is one press and lands on ⌂ Roster — "the main tab in the Commons and first
port of call on hitting the Commons". It dropped a registry-fed popover of every room
until then; the menu is gone, glyph and all (き → ⛩, the house mark for "open the
Commons"). **The known cost, taken with eyes open: the bar no longer reaches a SPECIFIC
room in one press.** That is the trade, not an oversight — do not reinstate the menu as
a fallback. ONE surface reads the registry now: the tab strip. The registry still exists
as a registry because the drift it was written against — two hand-kept lists of rooms —
is what happens the moment a second surface needs them.

`commons.js` is the control-plane shell only; the roster and the launcher are rooms
(`roster.js`, `launcher.js`) like Wipeboard and Docs.

⚙ Account is deliberately NOT a room: install-level facts (release, updates,
appearance, log out) are page-level, so ONE control in the bar opens one sheet
(`system.js`) — a room meant four copies, one per tile (owner's ruling 2026-08-16).
It reads **Account** since 2026-08-17 and that is **a staging post, not the final
shape**: the owner wants an Accounts tab in the Commons eventually, backed by SETTEI.
Only the label moved — the fields such a room would hold (owner name, entitlement) are
exactly what SETTEI has not settled, and an empty room is four empty copies of the
ruling above. Build it when SETTEI lands and there is content for it.
On touch the control relocates into the ニ sheet like the other bar verbs. The Commons
tab strip scrolls at every width — a 4-up desktop tile is narrower than the row of
rooms, and clipping the tail is how a tab goes quietly missing.

**THE STRIP IS FOUR TABS (2026-08-18).** It held ten and two kinds of thing: four about
SESSIONS and six about the INSTALL. Ten measured 871px against a 609px tile, and the
⚙ Configuration rename (67px → 107px) pushed even a 1920 display 10px over — so it scrolled
at every width there was. Length was the symptom; the defect was that the six were drawn in
**every sessionless tile**, four copies of facts with one value. The house had already ruled
that line once, for the gear — *release, update, appearance and log out are the install's,
not a tile's* — and the six were on the wrong side of it.

They are the **`admin_desk`**'s now (`js/desk.js`), raised by ⚙ on the bar. The desk is a
TILE, not a page-level sheet (owner: *"page level surface? cant it just be a tile?"*): the
copies were never about a surface being able to live in a tile, they were about six rooms
being drawn in every empty one whether or not anyone wanted them. A tile is also a full
pane, which is why ⚙ Configuration became a room instead of staying in the gear's sheet — a
sheet would have re-lost that. It has **no tile header**: every control up there acts on a
session. Its own ✕ is **undo** — back to the terminal when the tile has a session, back to
the Commons when it does not, and the Commons is also the fallback if the session died while
the desk was up, because an empty tile has nothing behind its overlays. ⚙ toggles, the lesson
⛩ already learned. The rail is **glyphs + labels** with a collapse button: the
`@container tile` query says how a name lays out (beside its glyph, or stacked at 70px in a
4-up), the button says whether names show at all.

**One registry, two readers.** `js/panes.js` gives every row a `surface` — `commons` or
`desk` — and each surface filters to its own. That is the same file that exists because the
strip and the old き menu drifted; a row now states which surface owns it, so they cannot.

**How you know the strip has more on it: a fade, not a scrollbar** (owner, 2026-08-18:
"there is a scroll bar showing at times and it looks awful"). Ten rooms plus the ✕ is
831px against a 599px desktop tile, so a third of the strip is off-screen at any moment.
The bar used to be that signal on a mouse, drawn across the bottom edge of a 26px strip
on overflow, with a permanently reserved `scrollbar-gutter` behind it to stop the strip's
height flapping. It is off at every width now: each end of the strip fades out when there
are tabs behind it, `commons.js` writes `data-edge` from the scroll position, and the
stylesheet owns the look. Nothing draws, so the height is constant without reserving
anything. Selecting a pane also scrolls its tab back onto the strip — a room can be
entered from somewhere other than its own tab (⚙ Configuration from first-run, ▧ Docs from the
tile's 📄), and the strip must not disagree with the pane.

**The five bar verbs are one width** — New · Commons · Keypad · Mika Assist · Account,
`min-width` plus centred labels, so the row reads even rather than as five different
kinds of control. The grid count is exempt: it is a number, not a verb. At ≤680px the
words go and the width goes with them (a genuine shell change, so a `@media` query).

## Keyboard and focus

- One `:focus-visible` ring, universal, in foundations. Pointer users never see it.
- Inert-but-explaining controls use `setInert` (`widgets.js`) — dimmed, hoverable,
  `aria-disabled`, the reason in the help text. `disabled` is for controls whose
  explanation is unnecessary.
- Every `title` becomes the help box (`tips.js`), which also serves keyboard focus and
  supplies `aria-label` to icon-only buttons. Labels are gated by `check-tips`.
- **A control that names itself on its face gets no pop-up.** The Commons room tabs and the
  ⚡ macro cards both lost theirs on 2026-08-18. A macro card already prints its `label:` and
  `blurb:` in two always-visible lines, so the box repeated the answer and laid 300px of it
  over the cards underneath (owner: *"its dumb to have the hover description covering the
  button description"*). Where the text is still worth keeping it moves to `aria-label`,
  never back to `title` — `tips.js` takes over any `title` it finds, so a title **is** a
  pop-up here by definition. The macro invocation (`+name:`) lives there now; it stays off
  the face by the earlier ruling and out of a box by this one.
- **The Commons room tabs carry no hover help at all** (owner, 2026-08-18: "we don't need
  a pop-up. There doesn't need to be anything on hover. Just get rid of it"). A tab's label
  already says what its room is, so a panel restating it in a sentence was cost with no
  reader — and it was landing over the strip it described. The registry's `hint` column
  went with the line that read it, rather than staying unread (`panes.js`). A room that
  needs more than its label needs a better label. An `off` tab's reason is its
  `aria-label`, not a `title`: a title is a pop-up waiting to happen, and a disabled
  button was never hoverable anyway.
- The box hangs off **the nearest thing below the header that the control is inside, else
  the header** — メ's drop, or the Commons tab strip. Docking to the header put a 300px box
  across seven of the ten rooms, and since a tab is not in the header it also failed the
  side test and docked to the tile's far right, so the answer appeared at the opposite end
  of the strip from the question. The tabs have since lost their help outright (above), but
  the rule stands on the ✕, which is a bare glyph with no label of its own and would cover
  the tabs the same way. The side is read off whatever divides that anchor's two groups, in
  DOM order: the header's `.grow` spacer, or the strip's ✕, which carries `margin-left:
  auto` and so is the strip's own spacer.
- The help box's header — the line above the rule — carries a keyboard shortcut, a live
  reading, or nothing, and **exists only when it has content** (owner, 2026-08-17: an
  empty header over every macro row buried the text under a blank block). A shortcut
  reaches it by being written at the FRONT of the label, `⌃⇧C — the CoWorking Commons: …`;
  `tips.js` lifts it into the header and takes it off the front of the explanation. There
  is no shortcut registry and deliberately isn't one — the chords stay owned by the
  handler in `layout.js`.
- Escape closes the topmost transient surface, everywhere. A capture-phase Escape listener
  (the tile drops, the job menu) has to YIELD while a modal sheet is up over it, or being
  first in the propagation order quietly makes it topmost when it is not — メ's drop, which
  since 2026-08-18 stays open behind 🏷 and 📝, checks for an open `ui.sheet` and stands
  down (`public/js/tilemore.js`, docs/tile.md).

## Structure gates

`check-modules` (cycles across the whole graph, orphans, resolution, top-level import
use, the 700-line ceiling) · `check-css` (colour spelled once; app patches no
primitive and shadows no token; the contrast floor, both themes) · `check-dead`
(deletions leave no corpses) · `check-tips` (labels fit) · `smoke-ui` (desktop +
phone render, the journey probes, and an axe scan at three states — serious/critical
fail; color-contrast is excluded there because contrast policy is check-css's tiered
floor, including the documented sub-AA `--muted` secondary tier the density ruling
keeps until H2) · `visual-ui` (the composition fingerprint: chrome geometry and
resolved colours against a checked-in baseline, both themes; `--update` is the
reviewed way to accept an intended change) · `tests/` (the pure contracts:
`request-shape.test.js`, `auth.test.ts`, `dvr.test.js`, `tape-fold.test.js`).

## Agents are data, not branches

The launcher renders `session_launch_spec` cells; providers and agent CLIs arrive as
catalog rows (`ronin_catalogs/PROJECT_ROOTS.md` — each populated cell is a
provider/model/cmd triple; the standing write-up of that contract rides the owner's
model-providers doc, in flight beside this), never as UI branches. Future agent forms
(Hermes, gbrain and whatever "app" tiles become) enter the same way: the tile's view
kinds (terminal | tape) may grow a sibling, and nothing in the shell may assume which
agent is behind a pane.

## Login

`/login` (`public/login.html`) is the one pre-auth page: self-contained on purpose,
same visual language, same theme switch. The password is set on the host with
`bin/ronin-passwd`; the mechanics are `src/auth.ts`.

**Three doors, one session.** Passkey, password and recovery code all end by minting the
same HttpOnly `<expiry>.<hmac>` cookie, signed by the secret stored beside the scrypt
record — so changing the password still ends every session at once, whichever door it
was opened with. Basic auth (`GRID_USER`/`GRID_PASS`) is untouched and still satisfies
the same gate for scripts.

**Passkeys need HTTPS, and the page says so.** WebAuthn is only exposed in a secure
context, and an IP address is not a legal relying-party ID — so passkeys cannot work on
the plain-HTTP tailnet-IP address and can on the `tailscale serve` address `setup.sh`
prints as step 2. Rather than hiding a button that would do nothing,
`/api/passkey/options` reports why, and `src/passkey.ts`'s `secureUrl()` reads the live
`tailscale serve status` so the page can name the address that would work. The RP ID is
derived per request from `Host` (`RONIN_RP_ID` overrides it for a proxy that rewrites
Host), so one build serves every install.

**Registration is behind the gate, spending is in front.** A passkey is added from ⚙
System (`public/js/system.js`) after proving you are already the owner; the login page
can only use one. There is deliberately no unauthenticated registration route.
`bin/ronin-recovery` mints a one-shot code, valid 30 minutes, for the case where a
passkey will not offer itself and changing the password — which would log every other
device out — is too big a hammer. `src/passkey.ts` holds the verification and
`src/routes/passkey-api.ts` the routes; `tests/passkey.test.ts` signs real assertions
with a real P-256 key so the byte layout and the signature check are actually held.

No WebAuthn library was added: the browser hands back an already-decoded public key
(`getPublicKey()`), which is the only part that would have wanted a CBOR parser.

**WRITTEN BUT UNWITNESSED — read this before you touch any of it (2026-08-17).** The
server half is held by tests: 14 of them, signing real P-256 assertions, so tampered,
wrong-origin, cross-site, replayed and unverified assertions are each proven to fail.
**The browser ceremony has never run.** No line of this has met a real
`navigator.credentials` call, a real Touch ID prompt or a real device; it landed against
a server that was never restarted to pick it up. Two things are settled only by the owner
opening `https://<magicdns>:8443` and pressing the button once:

- **whether `tailscale serve` forwards the original `Host`.** The RP ID derives from it.
  It is built to refuse loudly rather than guess — if `Host` arrives as the IP the
  endpoint returns a plain-English refusal and the page shows it — and `RONIN_RP_ID` is
  the escape hatch. One glance at the first real attempt closes this.
- **whether registration from ⚙ System and login from `/login` actually complete.**

So: do not describe passkeys as working, and do not rebuild this because it looks
unfinished — it is finished and unproven, which is a different thing. The gap is one
restart and one press, not more code. If that first attempt fails, fix what it shows you;
the shape above is deliberate and every choice in it has its reason recorded either here
or in `src/passkey.ts`'s head comment.
