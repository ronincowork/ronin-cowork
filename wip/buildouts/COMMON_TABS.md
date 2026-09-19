# Buildout — one tab utility for the whole coworkspace

## Settled outcome

One tab utility in the Workspace Kit. **Every** tab strip in the product runs on it, its
appearance and its CSS have a single owner, and a new surface — the Task Manager — gets
tabs by declaring a tab list.

The word "channel" leaves the product. Nothing outside the Kit touches a tab node.

## Owner rulings carried by this buildout

1. **"Channels" is outdated — remove it.** Not renamed in the docs and left in the code:
   removed from the code, the class names, the lexicon keys and the architecture docs.
2. **No underlines on a selected item, ever.** The Commons strip is the only place in the
   product that underlines a selection, and it is the thing that reads wrong.
3. **The look is the work.** Selected, unselected, and the scrolling behaviour at both
   edges are the deliverable, not decoration on top of it.
4. **The utility is for everyone** — every strip in the inventory below, not the two
   commons.

## What we have today

### Every tab strip in the product

| Where | Class | Panels? | Selected state | Keyboard |
|---|---|---|---|---|
| Team Commons — 7 tabs (`cowork-view.js:231`) | `.wk-channel-service-tab` | yes | `--raise` + **accent underline** | none |
| Machine / Desk commons — 7 tabs (`cowork-commons.js:263`) | same | yes | same | none |
| Docs shelf — Tracked · Plans · Docs (`docs.js:20`) | `.dc-pill` | yes | `--raise` + `--accent` border | none |
| Desk choices and Presets kinds (`campaign-desk.js:21`, `presets.js:68`) | `.cv-pill` | no — picks a value | `--raise` + `--accent` border | none |
| Phone, one Team — Agents \| Docs (`phone.js:118`) | `.ph-seg-item` | routes | `--raise` + `--accent` border | n/a (links) |
| `ui.js` `tabs()` (`public/js/ui.js:255`) | — | retrofit | — | **arrows, Home/End** |
| `.home-tabs` (`public/style.css:4157`) | `.home-tabs button` | — | `--raise` + `--line-3` border | — |

Two of those are not live code. `ui.js` `tabs()` is a complete, correct tablist retrofit
with **no consumers**. `.home-tabs` is ~130 lines of orphaned CSS — no module renders it
— and it is the best-drawn strip in the repository: browser-tab shape, hidden scrollbar,
and sticky gradient masks at both cut edges driven by `data-edge`. The house has already
solved the scrolling problem and then lost the solution.

Four of the five live strips already agree on the selected state: **`--raise` fill with a
coloured border**. The Commons is the single outlier, and it is the one with the
underline.

### Why the Commons strip looks wrong

1. **It is a segmented control, not tabs.** `flex: 1 0 auto` with `border-right`
   dividers (`style.css:6230`) stretches seven labels into seven unequal hard-edged
   blocks across the full width.
2. **Two selected signals fight** — a `--raise` background *and* a `--space-1` accent
   underline (`style.css:6231`), on a bar already tinted `--cowork-head-bg`.
3. **Attention reflows the row.** `[data-attention='true']` sets `font-weight: 700`, so
   the Messages label widens and shoves every tab to its right sideways.
4. **Actions sit in the tab row.** `options.actions` `prepend` to the left and
   `workbench.js:214` appends the dismiss `−` into the same flex line.
5. **Overflow is silent.** `overflow-x: auto`, no mask, no affordance, scrollbar visible.
6. **The badge is a stranger.** The Cron jobs count is `content: attr(data-count)` at
   `style.css:594` — 5,600 lines from the tab rules — written by `team-jikan.js` reaching
   out through `root.closest('.wk-channel-surface').querySelector(...)`.
7. **Tab CSS has four owners:** `style.css:6228-6234`, `style.css:594`, `style.css:1326`
   (`.wk-surface-dismiss`), and a dead `.wk-channel-service-grow` in `workspace-kit.css:116`.
8. **Panels have no box.** `.wk-channel-service` sets fill and `min-height: 0` and stops,
   so `.tw-config` pads, `.twb` scrolls its own thread, `.tw-docs` is flush, and
   `.tw-messages` has no rules at all.

### Why the Machine surface is hard to find

The owner cannot see "the Ronin Desk". Traced:

- `coworkCommons()` has **exactly one call site**: `campaign-view.js:90`, registered as
  the **Machine** surface in the Settings workbench, under the "Machine Settings" group
  heading. `t('cowork.commons', 'Ronin Desk')` is a default that this one call site
  overrides — **the words "Ronin Desk" never reach the screen.**
- It builds **nine** tabs; `MACHINE_TABS` renders **seven**. `profile` (Desk profile) and
  `roots` (Workspace folders) are constructed on every call and filtered out at the only
  call site — they became surfaces of their own and their panes were never removed.
  Those are the outdated tabs.
- The card summary promises "Themes · Account · Archived · Messages · Help · Keypad ·
  Health", but the strip renders Themes · **Desk** · Account · Archived · Messages · Help
  desk · Keypad. `health` is labelled "Desk", and it renders second, not last.
- `S.showCoworkCommons` is **never assigned** anywhere in the codebase, so
  `S.padPanel.open = () => S.showCoworkCommons?.('keypad')` (`cowork-commons.js:232`) is a
  no-op: a bound pad key's route to the Keypad tab is dead. The comment beside it points
  at `team-view.js`, which does not exist.

### Why it is wrong underneath

- **Click and `select()` are different paths.** `select()` does not run the incoming
  panel's `enter`. `cowork-commons.js:272-281` patches `surface.select` *and* adds a click
  listener to compensate; `cowork-view.js` does not, and leans on `enter()` instead.
- **`enter()` fans out to every panel.** `invoke('enter')` loops all ids, so hidden tabs
  do work on every entry. Accidental — and load-bearing: it is the only reason the
  Messages attention mark and the Cron jobs count are ever computed.
- **Every panel is built at page load.** `createTeamCommons` runs once per seat, so four
  seats × seven panels are constructed on the Team view — wipeboards, cron rooms, doc
  lists and kanbans for three workspaces nobody opened. `cowork-commons.js` works around
  the same thing with a local `once()` helper.
- **Consumers reach into the DOM for tab state** — `querySelector('[data-service="…"]')`
  to set `dataset.attention`, `disabled` and `title` by hand (`cowork-view.js:245-246`).
- **No keyboard, and no wiring.** Roles and roving `tabIndex` are set; there is no arrow
  handler and no `aria-controls` / `aria-labelledby` between a tab and its panel.
- **Stale defaults** — `CHANNEL_SERVICES` and its reserved, inert `chat` panel are never
  used; both consumers pass their own list.

---

## The look

The form is the one the house already drew in `.home-tabs`, brought back into the Kit and
finished. Everything below is tokens only, in `public/workspace-kit.css`.

### The tab shape

Browser-style tabs: `--radius-md` on the **top** corners, square at the bottom, sitting on
the bar's baseline so the strip and the panel beneath it are one object. Tabs size to
their label (`flex: 0 0 auto`), `--space-2` between them, no dividers.

### Selected — without an underline

The selected tab takes `--raise`, **the same plane as the panel below it**, and drops its
bottom border entirely. The tab and its panel become one continuous surface; every other
tab keeps its bottom edge closed against the baseline.

The selection is read from the shape *joining* the panel. Structurally it is the opposite
of an underline: the selected tab is the only one with **no line under it**.

| | Fill | Text | Border |
|---|---|---|---|
| Unselected | `--well` | `--muted-2` | `--line-2`, bottom edge closed |
| Hover (unselected) | `--panel` | `--fg-strong` | `--line-3` |
| **Selected** | `--raise` | `--fg-strong` | `--kaki`, **bottom edge open** |
| Disabled | `--well`, `opacity: .5` | — | `--line-2`, `cursor: default` |

`--kaki` rather than `--accent`: kaki is the brand primary and the Kit's own pressed
idiom (`.wk-action[aria-pressed='true']`) already uses it. The amber `--accent` borders on
`.dc-pill` / `.cv-pill` / `.ph-seg-item` move to `--kaki` with them, which is the one
visual change those three strips take.

Transitions on `background-color`, `border-color` and `color` only, at
`var(--motion-quick) var(--ease)`. Never a transform or a size change — the row must not
reflow when a tab lights up.

### Attention and badges — without reflow

- **Attention** (Messages holding retained items) is a `--kaki` dot before the label. Its
  space is reserved whether or not it shows. Today's `font-weight: 700` widens the label
  and shoves every tab to its right, which is why the strip appears to twitch.
- **Badge** (the Cron jobs "3 / 1") is a real `.wk-tabset-badge` element after the label —
  `--radius-pill`, `--well` on `--muted`, `--text-1` — rendered by `setBadge`, with its
  space likewise reserved.

### Focus

`outline: var(--edge) solid var(--focus-ring); outline-offset: 1px` on `:focus-visible`,
the form the Kit already uses for `.wk-tab-name` and `.wk-layout-map-slot`. Keyboard only;
a click never draws a ring.

### The row

Three slots, left to right: the surface's word · the tabs · the actions.

- The word is plain text, not a bordered chip competing with the tabs (today it carries a
  `border-right` in a *different* line colour from the tabs beside it).
- A `flex: 1 1 auto` spacer separates tabs from actions.
- Actions — the dismiss `−`, the Team page's C/T flip — live in
  `.wk-tabset-actions`, sticky to the right edge so they stay reachable while the tabs
  scroll under them. Nothing is ever interleaved into the tab row again.

### Scrolling — both edges

The part the owner asked for, and the part `.home-tabs` already worked out:

- `flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-x: contain;
  scrollbar-width: none` plus `::-webkit-scrollbar { display: none }`. No scrollbar under
  the tabs.
- **Two sticky gradient masks**, one per edge: `position: sticky` at `left: 0` / `right: 0`
  with a negative margin so they occupy no layout width, fading the tabs into the bar's
  own background exactly where they are cut. `opacity` 0 → 1 on
  `data-edge='left' | 'right' | 'both'`, at `var(--motion-quick)`.
- `data-edge` is computed by the utility from `scrollLeft`, `scrollWidth` and
  `clientWidth`, on scroll **and** from a `ResizeObserver` on the row — so it is correct
  after a workspace splitter drag or a layout-map toggle, not only after a scroll.
- **Chevron buttons** at a cut edge, drawn inside the mask, shown only under
  `@media (hover: hover)`: a pointer device with no horizontal wheel otherwise has no way
  to reach a tab that is scrolled off. Touch keeps the flick and the masks alone. Each
  chevron scrolls by one `clientWidth * 0.8`, `behavior: 'smooth'`.
- `scroll-snap-type: x proximity` with `scroll-snap-align: start` on each tab, so a flick
  lands on a tab edge rather than mid-label.
- `select(id)` always calls `scrollIntoView({ block: 'nearest', inline: 'nearest' })` on
  the incoming tab. Choosing a tab by keyboard, by code, or by restoring a remembered
  workspace brings it into view every time.
- Arrow keys move focus through tabs that are scrolled off; focus scrolls them in.
- At `(pointer: coarse)` the tab band keeps the existing coarse min-height, and the masks
  stay — a flick needs the cue more, not less.

### Panels

`.wk-tabset-panel` owns fill, `min-height: 0` and **one** scroll region, with `data-flush`
for panels that own their own scrolling (Docs, Wipeboard, Task Manager). Panel padding
stops being seven different feature decisions.

---

## The backend

`createTabbedSurface` in a new Kit module `public/js/workspace-tabs.js`, re-exported
through `WorkspacePrimitives`. Class namespace `.wk-tabset-*`. `.wk-tab-name` keeps its
meaning: the browser-tab name field in the app bar, unrelated.

```js
createTabbedSurface({
  label,                 // the surface's own word, at the bar's left
  className,
  tabs: [{ id, label, title, panel, hidden, disabled, flush }],
  selected,              // id; falls back to the first selectable tab
  actions: [],           // the bar's right slot — never mixed into the tab row
  onSelect: (id, previous) => {},
})
```

`panel` is a Node, a service `{ el, mount, enter, leave, destroy, watch }`, or a
**factory** `() => service`, built the first time its tab is shown.

Returned: `{ el, bar, content, select, current, setLabel, setBadge, setAttention,
setAvailable, setHidden, mount, enter, leave, destroy }`.

### Lifecycle

- `mount(ctx)` — the surface only. A panel mounts the first time it is shown.
- `select(id)` — `leave()` the outgoing panel; build-if-needed and `enter(ctx)` the
  incoming; scroll it into view. **Click, keyboard and programmatic select take this one
  path**, which removes both compensations in `cowork-commons.js`.
- `enter(ctx)` — the current panel's `enter`, plus `watch(report)` on every tab that
  declares one.
- `leave()` — the current panel's `leave`; all watches stop.
- `destroy()` — every *built* panel; unbuilt panels were never built.

`watch` is the deliberate replacement for today's accidental fan-out. A tab that needs a
badge while it is off screen says so and reports through `report({ badge, attention })`;
the surface no longer enters everything to make two counters work. It is also what the
Task Manager will want for a count of its own.

### Behaviour that must hold in every situation

- Selecting a hidden, disabled or unknown id falls back to the first selectable tab
  rather than leaving the surface blank.
- Hiding or disabling the **current** tab moves selection to the nearest selectable
  neighbour and enters it.
- A tab that becomes available (Task Manager after install) keeps its place in the row, so
  the strip never re-orders under the pointer.
- `enter` → `enter` and `leave` → `leave` are idempotent, per the Kit's lifecycle
  contract; repeated navigation multiplies no timers, sockets or listeners.
- A panel factory that throws leaves the surface usable and the tab marked failed through
  `setSurfaceState`, rather than taking the workspace down.
- `destroy()` disconnects the `ResizeObserver` and the scroll listener.

### ARIA and keyboard

`role="tablist"` / `tab` / `tabpanel`, generated ids, `aria-controls` on each tab and
`aria-labelledby` on each panel, roving `tabIndex`. ArrowLeft/Right move focus,
Home/End jump to the ends, Enter and Space activate; focus never activates, because
entering a panel does work. These are exactly the semantics `ui.js` `tabs()` documents
and nothing calls — the utility absorbs them and that module's `tabs()` is deleted.

---

## Cuts, in dependency order

1. **Kit — the utility.** `public/js/workspace-tabs.js`, `.wk-tabset-*` in
   `workspace-kit.css`, `tests/workspace-tabs.test.js` (select path, lazy build,
   lifecycle, watch, fallback rules, keyboard, `data-edge`). Nothing consumes it yet;
   `createChannelSurface` still stands. `npm run preloads` for the new module.
2. **Team Commons onto it** (`cowork-view.js`). Panels become factories, so a seat builds
   what it shows. `messageTab` / `kanbanTab` querySelectors give way to `setAttention` and
   `setAvailable`. Updates `tests/team-commons.test.js`, which asserts both the
   `channels: [ { id: 'roster'` shape and `commons.kanbanTab.disabled = false`.
3. **Machine surface onto it** (`cowork-commons.js`, `campaign-view.js`). Delete the
   `surface.select` patch, the strip click listener and the local `once()` — the utility
   owns all three. **Delete the `profile` and `roots` panes**, which no call site renders.
   Correct the card summary to the tabs that exist, in the order they appear. Decide the
   dead `S.showCoworkCommons` hook: wire it, or delete it and the pad's `open`/`isOpen`
   with it.
4. **Cron jobs badge** (`team-jikan.js`). Report through `watch`; delete the
   `.closest('.wk-channel-surface')` reach-through and `public/style.css:594`.
5. **Workbench header slot** (`workbench.js:208-222`). Dismiss appends to
   `.wk-tabset-actions`; `header: 'channels'` becomes `header: 'tabs'` and its required
   selector follows. Updates `tests/workbench-dismiss.test.js`.
6. **Docs shelf onto it** (`docs.js`). Tracked · Plans · Docs stop being `.dc-pill` and
   become tabs — this is the strip nested *inside* the Commons' Docs tab, so it is the
   clearest test that the utility reads well at a small width.
7. **The remaining strips take the look.** `.cv-pill` (Desk choices, Presets kinds) and
   `#phone .ph-seg-item` keep their own elements — they pick a value and route a screen,
   they do not switch panels — and move onto the shared tokens, `--kaki` included.
8. **Remove the old engines and the word.** `createChannelSurface`, `CHANNEL_SERVICES`,
   `TEAM_LABELS`, the reserved `chat` panel, `ui.js` `tabs()`,
   `.wk-channel-service-grow`, the orphaned `.home-tabs` block, and the tab rules left in
   `style.css`. `t('workspace.channels', 'Team channels')` is **deleted**, not renamed:
   the bar's word is the surface's own name. `workspace.channel_*` keys become
   `workspace.tab_*`, matching the `cowork.tab_*` shape already in use.
9. **Docs in the same hand-in.** `docs/architecture/workspace-kit.md` (68, 74, 123),
   `docs/architecture/team-workspace.md` (139, 172, 206),
   `docs/architecture/cowork-space.md` (73, and 157's "message queue **channel**").

Cut 1 lands alone and reviewable. Cuts 2–7 are independent of each other once 1 is in.
Cut 8 is only safe after 2–7.

**Named and deferred:** the Task Manager's own tabs are the next surface, built on the
utility, not a cut here. `.desk-nav` inside the Account tab is a vertical rail — the
ExplorerRail's job, not tabs.

## Ownership boundaries

- The Kit owns every `.wk-tabset-*` node and rule. Features style their panel's contents
  and nothing else. The workspace-kit contract already forbids a feature selecting
  `.wk-*` internals; this buildout is what makes that true for tabs.
- Tab state — label, badge, attention, availability, visibility — changes only through
  the returned API. No consumer queries a tab node.
- Features do not build a second tab/service lifecycle, per
  `docs/architecture/workspace-kit.md`.

## Checks

Per cut, on the desk: `npm run check:css`, `npm run check:modules`, `npm run check:tests`,
and `node --test` over `tests/workspace-tabs.test.js`, `tests/team-commons.test.js`,
`tests/workbench-dismiss.test.js`.

Lead's combined gate: `npm run verify`.

`npm run workbench:ui` and `npm run visual:ui` need Playwright, which is **not installed
on this desk**. They are the lead/staging gate, and the browser evidence for the
appearance cuts — selected and unselected at rest and on hover, both cut edges with the
masks and chevrons, a coarse-pointer flick, and a keyboard pass — has to come from there.

`npm run byoin` does not apply: no installed box or user store changes.

## Done when

Every tab strip in the product runs on the one utility; no feature reaches a `.wk-*` tab
node; tab CSS lives in exactly one sheet; nothing selected anywhere is marked with an
underline; the word "channel" is gone from the code, the lexicon keys and the docs;
`createChannelSurface`, `ui.js` `tabs()`, `.wk-channel-service-grow`, the orphaned
`.home-tabs` block, the `style.css:594` badge rule and the unrendered `profile`/`roots`
panes are deleted; the architecture docs are updated in the same hand-in.

This buildout is deleted when the last cut lands.
