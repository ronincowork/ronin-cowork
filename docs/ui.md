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
before first paint. **Terminal surfaces stay dark in both shells** — the `--term-*`
tokens are deliberately absent from the light block. One resolved palette feeds CSS,
xterm and the browser's `theme-color`; `check-css` holds `theme.js`'s token reads and
the stylesheet to the same list. The browser gates pin `colorScheme: 'dark'` so the
baselines are a choice, not the headless engine's default.

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
  Tags, the session switcher. The pad's panel and ask-prompt predate the primitive and
  keep their bespoke sheets until they next change behaviour.
- **Popover/menu** — `ui.popover`: `aria-expanded` on the button, outside click and
  Escape close, focus returns. Consumer: the き Commons menu. The job menu and the
  touch drops (`tiledrop.js`) carry the same dismissal rules in their own code, which
  their comments justify.
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
strip (`commons.js`) and the き menu (`layout.js`). A row carries a full label, an
optional compact label for the 402px strip, and a hint. A new room is one registry row
plus one feature module; service gating stays `serviceOff()` in `state.js`.

`commons.js` is the control-plane shell only; the roster and the launcher are rooms
(`roster.js`, `launcher.js`) like Wipeboard and Docs.

⚙ System is deliberately NOT a room: install-level facts (release, updates,
appearance, log out) are page-level, so ONE gear in the bar opens one sheet
(`system.js`) — a room meant four copies, one per tile (owner's ruling 2026-08-16).
On touch the gear relocates into the ニ sheet like the other bar verbs. The Commons
tab strip scrolls at every width — a 4-up desktop tile is narrower than the row of
rooms, and clipping the tail is how a tab goes quietly missing.

## Keyboard and focus

- One `:focus-visible` ring, universal, in foundations. Pointer users never see it.
- Inert-but-explaining controls use `setInert` (`widgets.js`) — dimmed, hoverable,
  `aria-disabled`, the reason in the help text. `disabled` is for controls whose
  explanation is unnecessary.
- Every `title` becomes the help box (`tips.js`), which also serves keyboard focus and
  supplies `aria-label` to icon-only buttons. Labels are gated by `check-tips`.
- Escape closes the topmost transient surface, everywhere.

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
`bin/ronin-passwd`; the mechanics are `src/auth.ts`. Passkeys are the planned upgrade
and reuse the same cookie/session half when they land.
