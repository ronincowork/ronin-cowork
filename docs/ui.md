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
declared first, so the order is enforced by the cascade itself:

- **vendor** — xterm.css, imported into the lowest layer.
- **foundations** — the design tokens (both themes), reset, page chrome, and the one
  universal `:focus-visible` ring.
- **ui** — the shared primitives: `.ui-sheet`/`.ui-card`, `#toast`, the help box.
- **app** — every composition and feature rule, in source order.

An app rule cannot out-cascade a primitive and nothing out-cascades the tokens. A
feature may size and accent ITS OWN card (`.ns-card`, `.sp-card`); it may not restyle
the primitive's chrome or behaviour classes. Splitting layers into files is a
mechanical move for the day a layer earns one.

## Colour

Colour is spelled once, in tokens, and `scripts/check-css.mjs` fails the build on a raw
colour anywhere but a `--token:` definition (the allowlist is empty and stays empty).
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

Two themes, same roles: `:root` is dark (the default), `:root[data-theme='light']`
remaps the shell. The owner flips it in ⚙ System (per device, localStorage
`tmuxgrid.theme`); `index.html` applies the saved value inline before first paint.
**Terminal surfaces stay dark in both themes** — the `--term-*` tokens are deliberately
absent from the light block. One resolved palette feeds CSS, xterm and the browser's
`theme-color`; `check-css` holds `theme.js`'s token reads and the stylesheet to the
same list.

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

## Navigation

The Commons' rooms live in ONE registry — `public/js/panes.js` — consumed by the tab
strip (`commons.js`) and the き menu (`layout.js`). A row carries a full label, an
optional compact label for the 402px strip, and a hint. A new room is one registry row
plus one feature module; service gating stays `serviceOff()` in `state.js`.

`commons.js` is the control-plane shell only; the roster and the launcher are rooms
(`roster.js`, `launcher.js`) like Wipeboard and Docs.

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
use, the 700-line ceiling) · `check-css` (colour, layer order, terminal tokens) ·
`check-dead` (deletions leave no corpses) · `check-tips` (labels fit) · `smoke-ui`
(desktop + phone render) · `tests/` (the pure contracts: `request-shape.test.js`,
`auth.test.ts`, `dvr.test.js`, `tape-fold.test.js`).

## Agents are data, not branches

The launcher renders `session_launch_spec` cells; providers and agent CLIs arrive as
catalog rows (`docs/model-providers.md`), never as UI branches. Future agent forms
(Hermes, gbrain and whatever "app" tiles become) enter the same way: the tile's view
kinds (terminal | tape) may grow a sibling, and nothing in the shell may assume which
agent is behind a pane.

## Login

`/login` (`public/login.html`) is the one pre-auth page: self-contained on purpose,
same visual language, same theme switch. The password is set on the host with
`bin/ronin-passwd`; the mechanics are `src/auth.ts`. Passkeys are the planned upgrade
and reuse the same cookie/session half when they land.
