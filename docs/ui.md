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
  Tags, the session switcher, ⚙ System, and — since 2026-08-17, the last family to
  come across — the pad's ▦ panel and its ask-on-press prompt. The prompt is the one
  surface that overrides the touch rule and focuses its field anyway: it has nothing
  to read, it IS the field. Nothing hand-rolls a sheet any more.
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
- The help box's header — the line above the rule — carries a keyboard shortcut, a live
  reading, or nothing, and **exists only when it has content** (owner, 2026-08-17: an
  empty header over every macro row buried the text under a blank block). A shortcut
  reaches it by being written at the FRONT of the label, `⌃⇧C — the CoWorking Commons: …`;
  `tips.js` lifts it into the header and takes it off the front of the explanation. There
  is no shortcut registry and deliberately isn't one — the chords stay owned by the
  handler in `layout.js`.
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
