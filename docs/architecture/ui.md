# UI — the contract the frontend enforces

The operator serves the client as native ES modules. `index.html` contains a generated
`modulepreload` for every module reachable from `js/main.js`, allowing the browser to
request the graph in parallel. Static JS and CSS use the running commit as their URL
prefix and cache immutable for a year; HTML keeps its ETag and revalidates so a new
commit supplies new asset URLs. Compressible static and API responses use Brotli or gzip.
`index.html` paints the desktop Workbench frame and its moving empty surfaces before any
script loads. The client replaces that shell with the live workspace, then fills each
surface as its own request returns; one slow or failed read does not hold the other
surfaces blank.

The client grew feature by feature, each solving markup, colour, fetch, failure and
focus for itself. This document is the set of decisions that are now made ONCE, and it
is written against enforcement, not aspiration: where a rule has a gate, the gate is
named. A new surface starts from these contracts; what is genuinely unique about a
feature is all a feature file should contain.

The style of the product is unchanged and deliberate: dense, dark-first, pro-tool,
Japanese marks as identity. This page is about how that style is CARRIED, not what it is.

Workbench surface construction, data ownership, restoration, and structured launches are
one contract: [Workbench construction](workbench.md). This page owns the shared visual,
interaction, transport, and failure rules those surfaces use.

## The cascade

`public/style.css` is one file in four `@layer`s — `vendor, foundations, ui, app` —
declared first:

- **vendor** — xterm.css, imported into the lowest layer.
- **foundations** — the design tokens (both themes), reset, page chrome, and the one
  universal `:focus-visible` ring.
- **ui** — the shared primitives: `.ui-sheet`/`.ui-card`, `#toast`, the central
  `#attention-flash`, and the help box.
- **ui** also owns the app-bar navigation set: `.ui-bar-nav` is a clickable label,
  `.ui-bar-value` is the plain loaded value beside it, and `.ui-bar-place` is the neutral
  island cut into the top edge that names which Workbench the doors led to. Its visible
  lower corners use the Workspace Kit surface radius (`--radius-large`). Native button
  chrome and feature-local bar styling are forbidden.
- **app** — every composition and feature rule, in source order.

Later layers win, so the cascade guarantees exactly one direction: every Ronin rule
beats xterm.css by construction. `app` being strongest is what lets a feature size and
accent ITS OWN card (`.ns-card`, `.sp-card`) — and it means the rule "app does not
restyle a primitive's hooks (`.ui-*`, `#toast`, `.helpbox`) or shadow a foundation
token" is `check-css`'s to enforce (checks 4–5), not the cascade's. Splitting layers
into files is a mechanical move for the day a layer earns one.

## The look is spelled once — all of it

**Editing `@layer foundations` re-skins the whole app.** That is the promise,
and it only holds while nothing carrying look is spelled anywhere else — so
`scripts/check-css.mjs` gates every family, not just colour. A raw `8px` radius in a
feature rule is the same defect as a raw `#131826`.

font-sizes including 10.5/11.5/12.5px, spacing on nearly every integer from 1 to 18, and
**seven** font stacks doing the work of three roles. An agent could not get a colour wrong
and could not get a radius right.

| Family | Tokens | What it governs |
|---|---|---|
| shape | `--radius-hair` · `--radius-small` (4) · `--radius-large` (8) · `--radius-pill` · `--radius-round` | small for controls, chips and fields; large for panels, cards and sheets; hair for a hairline frame. `pill`/`round` are shapes, so squaring the app leaves a dot a dot |
| type | `--text-small` 11 · `--text-body` 12 · `--text-label` 14 · `--text-heading` 16 · `--text-display` 20 | see the role table below. The form aliases read them: `--form-head`/`--form-key` → label, `--form-input` → body, `--form-note` → small. `--term-size` (13) is the terminal's own: xterm, the tape and the composer, glyph for glyph |
| weight | `--weight-regular` · `--weight-strong` · `--weight-bold` (400 600 700) | regular for text, strong for emphasis and names; **bold only for headers** (the Kit's header band, a page's title) |
| leading | `--leading-tight` (1.2) · `--leading-body` (1.45) · `--leading-none` (1) | line spacing INSIDE one paragraph or label, never the space between blocks: tight for labels and headings, body for running text, none only for a glyph's own box |
| space | `--space-row` 4 · `--space-paragraph` 8 · `--space-subsection` 16 · `--space-section` 24 · `--space-inline` 8 · `--space-inset` 12 · `--space-control` 10 | see the role table below |
| tracking | `--tracking-tight` `--tracking-wide` (em) | every letter-spacing reads one, or is `0` |
| voice | `--font-ui` `--font-mono` `--font-term` | **three roles, not two.** `--font-term` is what xterm renders (`js/termview.js` reads it via `termFace()`), and the tape, composer and jump button must match it glyph-for-glyph or a wrapped line stops lining up |
| edge | `--edge` `--edge-2` | border widths — a heavier-lined theme is one edit, not four hundred |
| control | `--control-height` (2.25rem) · `--control-height-small` (28px) | every button, input, select and menu item is one of these two heights, never its own. Small is the deliberate case: compact actions, header and tab-bar actions, menu items, the composer. `--row-head` is a small control plus its band, so header actions never move the phalanx. Exceptions keep their own size on purpose: the touch sizes under `pointer: coarse` and `#phone`, the top bar's chrome, square icon buttons (width and height together), and `--field-tall`, which matches the ask stone beside it. Small is a height, never a text size: every button's text is `--text-label` at either height, and `button, input, select, textarea` inherit the page's font in the base sheet, so no control falls back to the browser's own (13.33px Arial) |
| focus | `--focus-width` · `--focus-offset` (2px · 2px) | every `:focus-visible` ring; an inset ring (a clipped tab) offsets by `calc(-1 * var(--focus-width))`. Selection and drop outlines are states, not focus, and keep `--edge` |

**Roles, not rulers (owner, cut 10).** There is no numbered scale: a ruler of eleven sizes only
moves the arbitrary pick from the CSS into the token. Choose by what the thing IS. When a
surface has no heading or section structure to tell you, pick the nearest meaning and say so in
a comment. `body` is `--text-body`, so un-sized text is body; anything larger names its role
(the top bar names `--bar-nav-size`, a stone's launch mark `--text-heading`, since `1.25em` of it).

| You are spacing or sizing… | Token |
|---|---|
| lines inside one paragraph or label | `--leading-body` (running text) · `--leading-tight` (a label, a heading) |
| rows of a list or a fact table | `--space-row` |
| paragraphs; a heading and its text | `--space-paragraph` |
| subsections of a page (a group of fields, a step's parts) | `--space-subsection` |
| sections of a page (Model refresh's three steps, a form's parts) | `--space-section` |
| things on one line (a glyph and its word, buttons in a row, grid columns) | `--space-inline` |
| inside a panel or card | `--space-inset` |
| inside a button or input (beside its text) | `--space-control`; the height comes from `--control-height` |
| notes, ids, captions, meta | `--text-small` |
| running text, values, table cells | `--text-body` |
| names, keys, field labels, control text | `--text-label` |
| a section's heading | `--text-heading` |
| a page's title, a glyph | `--text-display` |
| text | `--fg-strong` (headings, names) · `--fg` (text) · `--muted` (everything secondary) · `--link` (a link, aiiro) |

A gap between a meter's bars, a map's slots or a mark and its word is geometry, not rhythm:
`--meter-gap`. Widths, offsets and grid columns are measurements: name them (below).
| motion | `--motion-quick/settle/slow/hint`, `--ease` | four speeds; nothing animates for decoration |
| elevation | `--scrim` `--shadow-menu` `--shadow-sheet` | |
| bar navigation | `--bar-nav-bg/fg/hover/focus` · `--bar-value-fg` | the shared clickable label and its non-clickable context value |
| header colour | `--head-admin-*` `--head-teams-*` `--head-team-*` · `--head-attention` | each workbench scope's header: `bg` `fg` `muted` `line` `edge` |

Each Workbench view uses `workbenchView()` to declare its appearance and shared header
capabilities to the outer ViewHost. `workspace-header.js`
applies that declaration once; workspace and selector headers inherit it, while individual
work surfaces remain ignorant of colour and the application bar's dynamic island stays
neutral. **Header colours are tokens, one set per scope:** `--head-admin-*` (graphite:
Campaign, Setup, New Project, Models, Workspaces, Help), `--head-teams-*` (aiiro: the Cowork
collection) and `--head-team-*` (kaki: Team and Agent Workbenches), each `bg` `fg` `muted`
`line` `edge`, plus `--head-attention`. Dark mode mixes 24% of collection colour into the
header ground; light mode uses a solid fill. The per-workbench switch sits in `@layer ui`
under internal names (`--current-head-*`): it only picks a scope, so a skin or a designer
edits the scope's token and never the switch. Routes and surface factories set no colour,
and the root landing clears the treatment.

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
inert. Shadowable like any catalog (`docs/architecture/shadowing.md`): shipped skins update with the
repo, a skin of yours is yours and an upgrade cannot touch it, and the picker says which is
which because only a skin of ours that you replaced can silently stop tracking an upgrade.
**A token a skin names is chosen for both shells** — light and dark are themes, a skin is a
skin — which is why the shipped skins stay off colour and compose with the flip instead of
competing with it. The whole feature is one catalog, one route and thirty lines of client;
it is the dividend of the token work above, not a second system. **A renamed token keeps
working in a skin of yours:** `skins.js` reads the old name as the new one (`RENAMED`), and
the new name wins where a skin spells both.

**The escape hatch costs you a name.** A one-off MEASUREMENT is not a rung and must not
become one — `--ptr-len`/`--ptr-wide` (the dial needle's geometry, numbers that must move
together). A `--name:` line is
the one legal home for a raw value, so naming it satisfies the gate *and* says what the
number is. A measurement more than one sheet reads, or one tuned per shell (`--row-head`,
`--gc-motif-*`, `--ch-horizon-opacity`, `--bar-brand-*`, `--setup-stone-size`, `--note-field-h`,
`--meter-gap`, `--tile-body-pad`), lives in
style.css's measurements block under `@layer ui`, never in `@layer foundations`: foundations
holds only tokens a designer may change. `0` is always legal: the absence of a value is not a value.

## Colour

Colour is spelled once, in tokens, and `scripts/check-css.mjs` fails the build on a raw
colour anywhere but a `--token:` definition (the allowlist is empty and stays empty).
The same gate holds a **contrast floor** for the named role pairs in both themes —
floors set from the measured palette, so a token edit that dims text fails the build.
The roles, defined in `public/style.css`:

- surfaces: **two, and nothing else neutral paints a background** (owner, cut 13: "if we
  can't explain why a colour is there, don't do it"). `--surface` is the one base: the top
  bar, the gutters, the selector, cards, Commons, collection pages, and every tile in every
  view (Term, Chat, Notes, Work, All, tape, keys, jump), so switching a tile's view never
  changes its ground. `--inset` is set INSIDE the base so it reads as inside: an input, a code
  block, an open document, a nested panel such as a kanban column or an ask tray. Lines and
  borders separate; shades do not. `--bg`, `--bg-2`, `--panel`, `--raise`, `--well` and the
  terminal's own surface copies are gone (`skins.js` reads `--panel` as `--surface` and
  `--well` as `--inset`).
  The main places keep their own token, each `var(--surface)` by default, so a designer
  changes one place or the base: `--bar-bg` (the top bar), `--workbench-bg` (the page behind
  the workspaces), `--selector-bg` (the selector column) and `--tile-bg` (every agent tile in
  every view; `--term-bg` reads it). No per-card or per-panel tokens beyond these: small
  parts read `--surface` or `--inset` directly.
- **Every other background says why, where it is set**, as a one-line comment: the scope
  headers (where you are), kaki fills (the action, or what needs you), status (ok, warn,
  bad), the scrim, and `--selected`, the one interaction fill: the row, stone or card you
  are on, have chosen, or are dropping onto (a kaki wash over `--surface`; hover, focus,
  pressed, current and drop targets all read it). One you cannot explain goes to
  `--surface` or transparent.
- edges: `--line` · `--line-2` · `--line-3` (three weights, hairline → emphasized)
- text: `--fg-strong` · `--fg` · `--muted` (one grey: `--muted-2` and `--dim` merged into it) · `--link` (aiiro, lifted on the dark shell)
- meaning: `--accent` (attention/identity) · `--accent-2` (reference) · `--ok`/`--ok-2` ·
  `--warn` (needs you) · the `--bad-*` family (wrong, in grades) · `--info` · work-item status
  `--ok-2` / `--status-yellow` / `--status-red`
- house: `--kaki` (the Ronin identity mark; this session; heightened access/visibility) ·
  `--aiiro` (Ronin navigation and selection) · `--graphite` (the admin header) — Kojin's fixed palette, borrowed. The kaki
  identity ruling is the open hexagonal **hito** mark, drawn in `--kaki` (`ninMark()`), so a
  skin that moves the brand moves the mark; using the same colour for heightened
  action connects “this needs you” to the house without making every Ronin surface kaki.
  Heightened surfaces read `--kaki`/`--kaki-lift` directly — the `--heighten-*` alias
  token audit deleted it rather than leave a dead semantic layer to mislead.
- elevation: `--scrim`, `--shadow-menu`, `--shadow-sheet` — the whole vocabulary
- terminal: the `--term-*` block — xterm's palette and the tape/composer surfaces,
  read back into JS by `termTheme()` (`public/js/theme.js`), never restated. **Every
  `--term-*` token is the designer's, the 16 ANSI slots and `--term-cube` included**; the
  rules below (bright white is the strongest mark; on paper every slot clears 3:1) are what a
  new value must keep, and `check-css` holds the terminal's text pairs to the floor in both
  themes. **The terminal's surfaces are the UI's, not copies** (owner, cut 11): `--term-bg`
  is `--surface` (xterm reads it), the composer's input is `--inset`, and the tape's lines,
  ink and muted read `--line`/`--line-2`, `--fg`/`--fg-strong` and `--muted` in both shells, so a retuned neutral moves the terminal with it. Only true
  terminal values keep a hex: the ANSI hues, the cursor, the selection, and bright black,
  the shading band an agent CLI draws behind the person's messages (a neutral grey, never
  warm)

**Kaki is the brand**: every primary and attention FILL reads
`--kaki`/`--on-strong`, or `--kaki-fill`/`--kaki-fill-ink` where a small mark must pass on
white. Amber (`--accent`, `--warn`) is the supporting
family — the band's derived shades, edges, rings and warning ink; red is only ever wrong.
`--bad` is never used categorically in charts: the Stats chart draws its series from the
meaning colours (`--accent-2`, `--accent`, `--ok`, `--warn`, `--muted`).

**Services Check status is kakiiro.** It is the owner's deliberate outbound check after
email confirmation, so its primary button uses `--kaki` with `--kaki-lift` on hover. The
static **Email confirmation required** header state is not filled kaki and does not spin:
colour and motion intensify only while the owner-triggered check or installation is active.

## Theme

Two shells, same roles: `:root` is dark, `:root[data-theme='light']` remaps. **The
default FOLLOWS THE DEVICE** (`prefers-color-scheme`, live — flip the Mac and Ronin
follows). The ◐/☀ toggle in the Home and Setup headers (`theme-toggle.js`) flips it:
flipping away from the device's mode pins the shell; flipping
back to match re-arms following — no third control exists (`theme.js setTheme`).
Per device (localStorage `tmuxgrid.theme`); `index.html` resolves the choice inline
before first paint. One resolved palette feeds CSS, xterm and the browser's
`theme-color`; `check-css` holds `theme.js`'s token reads and the stylesheet to the
same list. The browser gates pin `colorScheme: 'dark'` so the baselines are a choice,
not the headless engine's default.

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
  fault Solarized Light is known for. Here 7 is `--fg` and 15 is `--fg-strong`, so
  bright white stays the strongest mark, which is the role the emitting code means.
  Bright black (8) is the exception to 3:1: agent CLIs paint it as a BACKGROUND band, so
  in both shells it is a neutral near the surface (light grey on paper, a dark band near
  `--surface` on the dark shell) that `--term-fg` reads on at the 7:1 floor, which `check-css`
  holds. The cost is `\e[90m` dim text, which fades in both shells.

half a terminal palette; the other 240 are the xterm cube, and a program that addresses
those was left painting for a ground that had gone. `theme.js` generates all 240
arithmetically — no colour is spelled there — and pushes them as xterm's `extendedAnsi`,
read as written on the dark shell and mirrored in **CIE L\*** on paper. The transform
reverses MEANING rather than maximising legibility, because one palette serves both text
and fills: light ink becomes dark ink, and a dark rectangle becomes a light one. Clamping
every entry to 3:1 would turn every fill back into a dark rectangle. Which shell reads it
which way is a token, `--term-cube`.

What this cannot fix: a TUI that hardcodes an RGB value rather than asking for a slot or a
cube index keeps its own colours in either shell. The palette is a set of answers to
questions the program has to ask — and **`docs/using-ronin/ui-agents.md` is the record of what each
agent CLI actually asks**, with the measured numbers and the settings each one needs.

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
consumer is a program this repo does not ship.

## Transport and failure

Every JSON call goes through `request()` (`public/js/request.js`) and gets one answer
shape: `{ok, status, data}` or `{ok:false, kind, message, retryable}`. It never throws
for a transport outcome, never toasts, never retries a mutation, and knows no Ronin
vocabulary. Documented exceptions: `voice.js` (audio blob), `lexicon.js` (word catalogs),
`message-queue.js` (dismissal), `setup-surfaces.js` (an SVG mark).

The failure kinds are `network` (it never reached Ronin), `abort` (the caller cancelled),
`http` (Ronin answered with a failing status — the status is the story, whatever the body
looked like), and `malformed` (the status said success and the body was there but could not
be read; retryable, because the next read usually gets it).

**An empty body and an unreadable one are different answers.** A 200 or 204 that genuinely
said nothing decodes to `{}` and is success. A 200 whose body arrived in pieces is a
failure, and a feature that reads emptiness as a real state — no records, no documents, no
rows — must be able to tell the two apart. Folding them together is how a phone came to
report "No transcript output yet." while the server was sending 637 records.

Where a failure LANDS is a product decision, by scope:

| Scope | Surface | Rule |
|---|---|---|
| field/form | the form's own notice line | typed work survives; the sheet/form stays open |
| pane | the pane's empty/error line (`.pr-empty`, …) | navigation survives; retry is re-entering |
| tile-scoped act | the toast (`ui.toast`) | an alert would steal the keyboard from a live pane |
| roster freshness | the stale line (`.home-stale`) | stale-and-labelled beats empty-and-silent |
| application fault | `#failbar` (`errors.js`) | unchanged: the last line of defence, technical, loud |

A failed save must never close the editor and look successful; a failed load must never
leave an enabled empty editor (Docs enforces this); a failed refresh
keeps the last good data and says so.

Native dialogs: `confirm()` is the destructive-confirm primitive (kill session, discard
edits) — it is modal, keyboard-correct and honest. `prompt()` is tolerated for one-line
name entry only. `alert()` is not used.

## Work-surface ownership

A viewport has one surface owner and one named active tenant. `surface-host.js` holds the
catalog of sibling Tile tenants (`term`, `tape`, `chat`, `docs`) and writes the sole active
name to `data-surface`; the siblings render that decision and do not compete through
z-index or maintain a second visibility flag. Navigation chooses a tenant. It does not
construct another viewer for the same work.

The invariant is deliberately small: **one host, catalogued sibling tenants, one active
tenant**. Chat lays its tile out as a column, the log that scrolls and then the composer in
flow, so the log ends where the composer begins; Term and the tape still reserve
`--composer-clearance` under an overlaid composer. The log keeps a reader at its end through
one `following` flag read on scroll and a ResizeObserver on the log's own box
(`js/tile-transcript.js`). Because the composer is in flow there, any change to its height
re-lays out the whole log: the composer re-measures its height from auto only when the draft
can have shrunk, and a longer draft is only read (`js/composer.js`). The log draws a bounded
stretch, never the whole conversation: it opens on the last screenful, scrolling up fetches
the screenful before the oldest record drawn, and while the reader follows the end only the
newest `KEEP` (four screenfuls) stay drawn, so live records and a reconnect's catch-up walk
let the oldest go and nothing costs more the longer the Agent runs. A tenant owns its enter/leave boundary and may refuse departure (Docs does so for
unsaved edits). Focus, sizing and teardown follow the active tenant. Adding a work surface
means registering another sibling with the host, not adding another overlay condition to
the shell.

Phone consolidation follows the same rule: Team Docs and an Agent menu must enter one
page-owned Docs viewer/editor, never two controllers that happen to share a builder. Until
that routing is on the promoted tree, it remains an architectural gap rather than something
the CSS may disguise. The active phone Tile may be destroyed when another Agent is chosen;
its transcript listener and watch are disposed, while page-level transcript state may remain
bounded and later catch up from its committed cursor. Hidden or destroyed tenants must not
leave a socket, poll or focus target behind.

## Update paths — what causes a surface to change

[The data path](data-path.md) is the rule and the contract; this table is where each fact
lands on screen.

The one-answer table. `S.sessions` has ONE writer (`reconcileSessions`, `api.js`); the
server's resources have one holder, `store.js`, which owns the `/events` socket: the home
rows, the session list and the Team rosters arrive only by push, on connect and on change,
and the store reads nothing over REST. Desks are read when a surface opens and are not held.
The catalogs have one owner (`home.js`). The store hands a subscriber a resource when it
subscribes and again only when a field a surface paints changed; a surface paints when it
opens and on each change, and a write is answered by the push. Every timer below is
written next to a predicate that stops it costing anything while its surface is hidden.

| Fact | Written by | Arrives via |
|---|---|---|
| session set (`S.sessions`) | `reconcileSessions` (`api.js`) — the only writer, fed only by the store's reducer in `events.js` | `{t:'sessions', list}` only: pushed whole to every new connection and again when a painted field changed (not `activity`); `events.js` owns births, deaths and chips, and the page's first list raises no chip · while the socket is closed — it never opened, or it dropped after boot — the failure bar says "cannot reach Ronin", and the next open clears it (`sayWhenUnreachable`, called by `main.js` and `phone.js`) · a feed silent past the server's beat is replaced by the store · a write (title, membership, lead, launch, retire) is answered by the push |
| home rows | the store's `home` resource, read by `get('home')` or a subscription | `{t:'home', rows}` only: the server sends it whole to every new connection, a reconnect included, and again when a painted field changed (not `activity` or the stance's `at`) · a feed silent past the server's beat is replaced by the store (`store.js`) |
| desk readings | read at open, not held: `readDesks` in `desks.js` | not pushed · the work record in the tile's メ menu asks `GET /api/desks?session=<name>` when the work record opens and paints the answer (`openWorkRecord`, `tilehead.js`: a full overlay over the tile body) |
| Team rosters | the store's `teams` resource, projected by `team-controller.js`, which hears the store's `teams` and `sessions` and publishes once per change of either | `{t:'teams', rosters}` only, in the shape of `GET /api/team-rosters`, each row with the Team's `board` and `items`: pushed whole on connect and after a successful write under `/api/team-rosters`, `/api/team`, `/api/work-items` or a session's `teams` or `team_lead` · Team surfaces paint from the projection on entry and on each publish |
| catalogs (projects) | `loadProjects` in `home.js` | boot, and the panes that edit them re-load after a write |
| per-tile readings (gauge, work record) | the tile's `refreshCtx` / `refreshTegami`, reading its session's home row (`ctx`, `model`, `tegami`) | the tile subscribes to the store's `home` when it is made and unsubscribes when its host destroys it (`terminal-tile-host.js`) · connect repaints from the row the store holds |
| docs list (tracked shelf) | `docs.js`, reading the store's home rows | `enter` subscribes to the store's `home` and draws the snapshot; each push redraws; `close` unsubscribes, called by the seat that leaves it (tile docs view, phone docs screen, Team and Agent workbench tabs, the document seat) · the Plans and Docs shelves read `GET /api/docs` on demand |
| wipeboard thread, Cron jobs | the store's `wipeboard:<board>` and `jikan:<team>` (`jikan:*` for every team), painted by `team-wipeboard.js` and `team-jikan.js` | opening subscribes, which sends `{t:'want', resource, board}` or `{…, team}` on the socket; the server answers that connection with the message it broadcasts on every write (`{t:'wipeboard', board, posts, more}`, `{t:'jikan', team, jobs}`) · each reconnect says the wants again · a post, edit or removal is answered by that push · leaving unsubscribes |
| message queue, machine reading | the store's `messages` and `memory`, painted by `message-queue.js`, the memory gauge (`ramrpm.js`) and the desk's machine panel | `{t:'messages', list}` and `{t:'memory', reading}`, held and sent on connect like the home rows, then on change · a dismissal is answered by the push · `memory` carries `off`, which hides the gauge |
| pane data (roots, koshi, stats) | the pane module | its own read on `enter()` — each owner is the file the surface lives in |
| tile bytes | `TileWire` (`tilewire.js`) | the socket; reconnect/backoff lives there and nowhere else |

### Transcript reading transport

A transcript tab opens with a bounded tail, then registers its Agent and reading on
`/events`. Live records arrive only for that subscription. After the event socket closes,
the replacement socket repeats the watch and the tab makes one bounded `after=<committed>`
walk; every fetched or pushed record enters one sequence-keyed set, so overlap is harmless
and a record is rendered once in sequence order. The reading remains a server filter:
records excluded from Chat still advance the journal checkpoint but do not become Chat
rows.

The promoted phone acceptance on 2026-09-24 keeps these results separate:

- **Live phone Chat push passed:** one record went journal → event frame → DOM in 237ms
  (6ms frame → DOM), with no transcript GET, one DOM copy, no unrelated-Agent frame and
  no browser or network error.
- **Real reconnect transport passed:** closing the client event socket produced a new open
  socket after 3.086s and exactly one `after=1825` GET.
- **Outage reading filtering and duplicate prevention passed:** natural records 1826–1828
  were `act` records, so Chat correctly returned an empty page at checkpoint 1828; nothing
  appeared before reconnect and the DOM remained duplicate-free.
- **Missed phone Chat recovery under real traffic is unknown:** no `say` record existed in
  that outage, so there was no Chat-admitted record to recover. The deterministic recovery
  regression passes, but it is not relabelled as real-traffic evidence.
- **Post-promotion open passed on `19450aab`:** a fresh Binary phone tab began in Term with
  no Agent watch, then one Chat press registered `{session:"binary", reading:"chat"}` at
  the start of the bounded tail request. Under the established 400ms RTT / 50KB/s envelope,
  `tail=30` returned HTTP 200 with 26,370 bytes (916ms imposed transfer delay); the first
  entry was visible 1,443ms after the press and 30 entries rendered. The independent
  availability probe was `tail=1`, 1,282 bytes and 426ms. The check sent no message and
  changed no store.

Lifecycle has two explicit owners. Long-lived workspace rooms are page-owned and gate their
polls on visibility; a surface that reads a store resource subscribes when it opens and
unsubscribes when it closes, and the Team destination does exactly that for the home rows. Disposable phone Tiles are host-owned: destroying one closes its
transport, disposes its transcript handler/watch, observer, composer and timers, and removes
it from the Tile registry. A surface is never treated as page-lived merely because an older
desktop composition happened not to unmount it.

## Transient surfaces

- **Sheet/dialog** — `ui.sheet` (`public/js/ui.js`): scrim + card, `role=dialog`,
  focus enters the first field (never on touch — the iOS keyboard), Tab is contained,
  Escape and the backdrop dismiss, and focus RETURNS to the opener. Consumers: the
  session picker, session retirement, terminal copy, and the pad's ▦ panel and its
  ask-on-press prompt. The prompt is the one
  surface that overrides the touch rule and focuses its field anyway: it has nothing
  to read, it IS the field. Nothing hand-rolls a sheet any more.
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
  The pointer's default is cancelled, so the restore is the last word, for every consumer,
  the session picker included.
  A primitive with no consumer is deleted, not parked — the tape is in git. The dismissal
  grammar is not repealed: the menu (`menu.js`) carries it in its own code, and
  the day a bar control drops a menu again it comes back to `ui.js` rather than being
  hand-rolled at the call site.
  メ on the tile header drops its menu through `menu.js` (docs/using-ronin/tile.md), which
  carries `aria-haspopup` / `aria-expanded` on the opener and returns focus to it when the
  drop closes under the keyboard.
- **Toast** — `ui.toast`: one chip, `role=status`, errors hold longer than successes.
- **Attention flash** — `ui.attention`: one bounded, central kaki cue with `role=status`;
  it never steals focus and names the surface where the owner action is waiting.
- **Field** — `ui.field`: a real accessible name and a message line for a control,
  `display: contents` so the layout it sits in does not move. Labels are
  screen-reader-only by default (the cockpit's density keeps placeholders as the
  visual); the message doubles as `aria-describedby`/`aria-invalid`. Consumers:
  hotwords, machine settings, system, services card, campaign surfaces, team jikan.
- **Async status** — `ui.status`: the one spelling of loading…/saved/not-saved-and-why,
  `role=status`, hidden when empty, kinds `busy/ok/bad`. Consumers: hotwords, docs,
  koshi, roots, folder picker, machine panel and settings, services card, system.
- **Confirm** — `ui.confirmDialog`: a labelled confirm/cancel dialog. Consumers: roots,
  folder picker.
- **Tabs** — tab strips come from WorkspaceKit's `createTabbedSurface`; the Commons strip
  is one.
- **Button** — `ui.button`: `type=button` + label + help in one call; sugar with a
  guarantee.

## Navigation

### Workbench entry state

The precedence and ownership of first-open defaults, remembered refresh state, and
one-shot structured launches live in
[Workbench construction](workbench.md#entry-refresh-and-intentional-launch).

The Team destination's Commons (`cowork-view.js`: Roster, Docs, Wipeboard, Messages, Cron
jobs, Configuration) and the Campaign's Machine surface (`cowork-commons.js`: Themes, Desk,
Account, Archived, Messages, Help desk, Keypad) are workspace surfaces, never overlays, and
both draw their strip with WorkspaceKit's `createTabbedSurface`. Each tab builds its room on
first entry, because entering a room starts its fetches. Install-level facts — configuration,
release and update, hotwords, Koshi, log out and passkeys — are rows of the Account tab's
rail (`system.js` `buildSystemPanel`), drawn once rather than per tile.

**How you know the strip has more on it: a fade, not a scrollbar.** The strip scrolls at
every width; each end fades out when there are tabs behind it (`data-edge` on
`.wk-tabset-scroller`), and the stylesheet owns the look, so the height is constant without
reserving a gutter.

## Keyboard and focus

- One `:focus-visible` ring, universal, in foundations, `--focus-width` wide at `--focus-offset`; a component that draws its own ring reads the same two. Pointer users never see it.
- Inert-but-explaining controls use `setInert` (`widgets.js`) — dimmed, hoverable,
  `aria-disabled`, the reason in the help text. `disabled` is for controls whose
  explanation is unnecessary.
- Every `title` is seized by `tips.js`, which supplies `aria-label` to icon-only buttons.
  The house help box and native browser title bubbles are disabled system-wide; `check-tips`
  drives hover and focus to hold that absence.
- **A control that names itself on its face gets no pop-up.** The Commons room tabs and the
  `blurb:` in two always-visible lines, so the box repeated the answer and laid 300px of it
  over the cards underneath (owner: *"its dumb to have the hover description covering the
  button description"*). Where the text is still worth keeping it moves to `aria-label`,
  never back to `title` — `tips.js` takes over any `title` it finds, so a title **is** a
  pop-up here by definition.
- **The Commons room tabs carry no hover help at all**. A tab's label
  already says what its room is, so a panel restating it in a sentence was cost with no
  reader — and it was landing over the strip it described. The registry's `hint` column
  went with the line that read it rather than staying unread. A room that
  needs more than its label needs a better label. An `off` tab's reason is its
  `aria-label`, not a `title`: a title is a pop-up waiting to happen, and a disabled
  button was never hoverable anyway.
- The former fixed help box remains dormant in `tips.js` for now; it must not be wired back
  to hover or keyboard focus without a new owner ruling. Shortcuts remain owned by their
  handlers in `layout.js`, not by tooltip text.
- Escape closes the topmost transient surface, everywhere. A capture-phase Escape listener
  (the tile drops) has to YIELD while a modal sheet is up over it, or being first in the
  propagation order quietly makes it topmost when it is not.

## Structure gates

`check-modules` (cycles across the whole graph, orphans, resolution, top-level import
use, the 700-line ceiling) · `check-css` (colour spelled once; app patches no
primitive and shadows no token; the contrast floor, both themes) · `check-tips` (hover/focus help stays absent) · `smoke-ui` (the desktop
Team page renders its tiles, seats and paints the gate's own probe session, and opens
Configuration; the phone gets the mobile document's bar on its first paint) · `visual-ui` (the composition fingerprint: chrome geometry and
resolved colours against a checked-in baseline, both themes; `--update` is the
reviewed way to accept an intended change) · `tests/` (the pure contracts:
`request-shape.test.js`, `auth.test.ts`, `dvr.test.js`, `tape-fold.test.js`).

## Agents are data, not branches

Launches read session launch specs (`src/spawn.ts`); providers and agent CLIs arrive as
catalog rows (`ronin_catalogs/PROJECT_ROOTS.md` — each populated cell is a
provider/model/cmd triple; the standing write-up of that contract rides the owner's
model-providers doc, in flight beside this), never as UI branches. Future agent forms
(Hermes, gbrain and whatever "app" tiles become) enter the same way: the tile's view
kinds (terminal | tape) may grow a sibling, and nothing in the shell may assume which
agent is behind a pane.

## Login

`/login` (`public/login.html`) is the one pre-auth page: self-contained on purpose,
same visual language, same theme switch. It links `/style.css`, the one file served before
auth (it holds no secret), so it wears the same token values and keeps no copy. A skin does
not reach it. The shared Password work surface in Setup and
Settings enables, changes and disables the saved browser password; changing it replaces
the current browser's session while ending every other browser session. The host-side
`bin/ronin-passwd` remains an independent set/clear authority. Password fields do not echo.

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

**Registration is behind the gate, spending is in front.** A passkey is added from the
Account rail's Log out row (`public/js/system.js`) after proving you are already the owner; the login page
can only use one. There is deliberately no unauthenticated registration route.
`bin/ronin-recovery` calls the authenticated operator HTTP surface to mint a one-shot
code, valid 30 minutes, for the case where a
passkey will not offer itself and changing the password — which would log every other
device out — is too big a hammer. `src/passkey.ts` holds the verification and
`src/routes/passkey-api.ts` the routes; `tests/passkey.test.ts` signs real assertions
with a real P-256 key so the byte layout and the signature check are actually held.

No WebAuthn library was added: the browser hands back an already-decoded public key
(`getPublicKey()`), which is the only part that would have wanted a CBOR parser.

server half is held by tests: 14 of them, signing real P-256 assertions, so tampered,
wrong-origin, cross-site, replayed and unverified assertions are each proven to fail.
**The browser ceremony has never run.** No line of this has met a real
`navigator.credentials` call, a real Touch ID prompt or a real device; it landed against
a server that was never restarted to pick it up. Two things are settled only by the owner
opening `https://<magicdns>:4810` and pressing the button once:

- **whether `tailscale serve` forwards the original `Host`.** The RP ID derives from it.
  It is built to refuse loudly rather than guess — if `Host` arrives as the IP the
  endpoint returns a plain-English refusal and the page shows it — and `RONIN_RP_ID` is
  the escape hatch. One glance at the first real attempt closes this.
- **whether registration from the Account rail and login from `/login` actually complete.**

So: do not describe passkeys as working, and do not rebuild this because it looks
unfinished — it is finished and unproven, which is a different thing. The gap is one
restart and one press, not more code. If that first attempt fails, fix what it shows you;
the shape above is deliberate and every choice in it has its reason recorded either here
or in `src/passkey.ts`'s head comment.


## Asking a question — ERABI, `ask()`, is the one selector

Every place a form asks the owner to pick from a set of answers is drawn by
`public/js/ask.js`, from a spec, and by nothing else. This section owns the implemented
builder contract. The creators’ Lab retains the design decisions and exploratory benches;
contributors do not need that history to implement a question.

**The rule.** A field is a **reading stone** — 140 × 48 px, label over answer — that opens a
**tray** of stones under its group in one of two fixed shapes: the **square** (85 px, a glyph
and a ruled word) or the **rectangle** (140 wide, at least 48 tall: it grows to fit a two-line name, never clips it; a name and one short word). A stone carries
a name, never a sentence; the **caption** line under the tray carries the sentence, the
facts, and the reason a stone is greyed. A **switch** is the reading stone with a track. Fields
sit in named **groups** that keep together and stack as a group; nothing stretches with the
surface. Names break at their joints (`_` `-` `.`), never mid-word.

```js
import { ask } from './ask.js';
const form = ask([
  { group: t('new_agent.model_package', 'Model'), fields: [
    { key: 'provider', label: t('forms.provider', 'model provider'), blank: t('forms.default', 'default'), options: () => providerRows() },
    { key: 'model', label: t('forms.model', 'model'), blank: t('forms.default', 'default'), after: 'provider', options: (v) => modelRows(v.provider) },
  ] },
  { group: t('mandate', 'Mandate'), fields: [
    { key: 'reach', label: t('reach', 'Reach'), shape: 'square', options: REACH_ROWS },
    { key: 'output', label: t('output', 'Output'), shape: 'square', many: true, options: OUTPUT_ROWS },
  ] },
  { group: t('squad', 'Team'), fields: [{ key: 'lead', label: t('team.lead', 'Team lead'), switch: [t('yes', 'Yes'), t('no', 'No')] }] },
], { value: draft, onChange: (value, key) => { Object.assign(draft, value); paintFoot(); } });
host.append(form.el);   // form.value() · form.set(key, v) or set({…}) · form.options(key, rows) · form.show([keys]) or show(null) · form.open(key) · form.close()
```

| Spec key | Meaning |
|---|---|
| `group` · `fields` | a named group and the fields it keeps together |
| — | the consumer owns each stone's noun; ERABI preserves an explicit field label even when it equals the group heading (Team stays Team, Model stays Model) |
| `key` · `label` | the answer's name in the value; the label over the stone, through `t()` |
| `options` | rows `{ v, l, sub?, off?, glyph?, word? }` or a function of the current value — `sub` reads in the caption, `off` is why the stone is greyed (disabled, never hidden), `glyph` sits on a square, `word` is the rectangle's short line (tier, worktree) |
| `blank` | the empty answer's word, drawn as a stone; omit it and there is no blank |
| `many` | any-of: the tray stays open; the reading says the names or "n chosen" |
| `switch` | `[onWord, offWord]`: the field is a switch and opens nothing |
| `shape` | `square` for a ruled word with a glyph, `rect` (default) for a name; the glyph comes from `glyphs.js` (`ruledRows(axis, values, word)`), never an inline list, so one word wears one face product-wide |
| `density` | on the call: `'tight'` for the launch forms (less line spacing inside a group, a 40 px stone; the questions are optional and stay out of the owner's face), `'loose'` (default) for the commons where the question is the page's subject; widths never change |
| `show(keys)` | on the returned form: draw only these fields (a session type decides which questions exist — a Terminal asks only where it is born); `show(null)` draws all; hidden answers are kept, not cleared |
| `trayHost` | on the call: a wrapping row the consumer owns (flex-wrap or grid) holding this instance beside other controls; the open tray is placed at the end of that row so it spans the row's full width — a Team question on the right of Name still opens across the whole workspace |
| `required` · `invalid` | on an option beside its `row`: `required: true` makes the line refuse every dismissal of its tray (the stone, a press outside, Escape, `close()`) while the control is blank; `invalid: (option, value) → '' \| message` adds the consumer's own rule. Refused, the tray stays open, the control is focused and marked `aria-invalid`, and the message (default `t('forms.required')`) is announced in the line's live text; typing clears it. Choosing another layer-one answer still dismisses: the requirement belongs to the answer, not the tray |
| `then` | a second layer: `[{ when, key, label, options, many?, blank? }]` — nested questions, each revealed by the parent answer named in `when`; picking that answer keeps the tray open and draws the nested stones beneath the first layer, answering them closes it, the reading says the nested answer, and any other parent answer clears it. A nested question is a field in `value()`, `set()` and `onChange`, never a stone of its own. An option may also carry its own `row` (a control shown under the group when it is chosen) |
| `after` | the field this depends on; the answer clears and the options are re-asked when it changes |
| `row` | `(option, value) → node`: a control that belongs to a chosen option (a branch name, a new team's name), drawn as a full-width line in the tray beneath the stones — for a one-of after the click that chose it, for a many for every chosen option while the tray is open. A group holds stones and nothing else, so its geometry never changes; the consumer keeps the typed value and rebinds it when `row()` is asked again |

**Shapes, as ruled.** Reach, recruit and output are icon-free rectangles (owner, 2026-09-13).
A square with a glyph is used only where the glyph means something on its own — kind, and the
Control positions — and the glyph comes from `glyphs.js`.

**Beside a foreign control.** A form that wants one question next to a control that is not a
question (New Agent's Name beside Team and Team lead) makes two `ask()` instances — the Team
package, and the rest — and lays them out in its own flex row; both call the same `onChange`.
Team and Team lead are one group in one instance, so they move below Name as a pair when the
row narrows. The utility has no slot for foreign DOM and gains none.

**The commons' Configuration tab** is the first commons consumer, drawn in the launch forms'
own format: two numbered steps — Team (ID · Title · Kind, then Purpose) and New Agent
defaults (the groups) — at the forms' tight density. Its text entries are the kit's, beside
the stones, not inside them. Contract and file list: `docs/architecture/team-workspace.md` § Durable Team record.

**What is not an `ask()`.** The Phalanx surface (`phalanx.js`) is a page for
browsing a collection whose item is the content — Presets, Workspace Folders, Model
providers, Templates — and stays. Tabs, the Presets kind filter, and the
2 ⇄ 4 button are not selections from a list. The tile head owns its current Output and
mention controls; proposed migrations belong in the creators’ Lab.

**What enforces it.** `tests/ask.test.js` is the unit floor. The consumer guard — failing a
hand-drawn `select`, `Option`, checkbox or `aria-pressed` row outside `ask.js`, the tile head
and the stone work surface — lands with the launch-form migration, once those forms no
longer draw their own (the first consumer is New Agent).
