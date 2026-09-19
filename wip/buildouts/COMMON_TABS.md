# Buildout — one tab utility for the Workbench

## Settled outcome

The Workbench has **one** tab utility in the Workspace Kit. The Team Commons and the
Ronin Desk commons both run on it, its appearance and its CSS have a single owner, and a
new surface — the Task Manager — gets tabs by declaring a tab list, not by building a
second strip.

Nothing outside the Kit touches a tab node.

## What we have today

`createChannelSurface` (`public/js/workspace-primitives.js:149`) is the only tab strip in
the product, and it is used twice:

| Consumer | Tabs |
|---|---|
| `cowork-view.js:231` — Team Commons | Roster · Docs · Wipeboard · Messages · Task Manager · Cron jobs · Configuration |
| `cowork-commons.js:263` — Ronin Desk | Themes · Desk · Account · Desk profile · Workspace folders · Archived · Messages · Help desk · Keypad |

Two more tab engines exist beside it: `ui.js` `tabs()` (`public/js/ui.js:255`), a complete
tablist retrofit with **no consumers**, and `docs.js` `.dc-pills` (`public/js/docs.js:22`),
its own pill tabs rendered *inside* the Commons' Docs tab.

### Why it looks wrong

1. **The tabs are a segmented control, not tabs.** `.wk-channel-service-tab` is
   `flex: 1 0 auto` with a `border-right` divider (`public/style.css:6230`), so seven
   labels stretch into seven unequal hard-edged blocks across the whole width.
2. **Two selected-state signals fight.** The selected tab takes both a `--raise`
   background *and* a `--space-1` accent underline (`style.css:6231`) on a bar that is
   already `--cowork-head-bg`. The Kit's own pressed idiom
   (`.wk-action[aria-pressed='true']`) is neither.
3. **Actions sit in the tab row.** `options.actions` are `prepend`ed to the left of the
   tabs, and `workbench.js:214` appends the dismiss `−` into the same flex line. A tab
   strip and a close button share one row with no slot between them.
4. **Overflow is silent.** The bar is `overflow-x: auto` with no affordance. At seven
   tabs in a narrow workspace, tabs scroll off with nothing to say so.
5. **The badge is a stranger.** The Cron jobs count is
   `content: attr(data-count)` at `public/style.css:594` — 5,600 lines from the tab rules
   — written by `team-jikan.js` reaching out through
   `root.closest('.wk-channel-surface').querySelector('.wk-channel-service-tab[...]')`.
6. **Tab CSS has three owners.** `style.css:6228-6234` (strip), `style.css:594` (badge),
   `style.css:1326` (`.wk-surface-dismiss`), plus a dead
   `.wk-channel-service-grow` in `workspace-kit.css:116` that nothing uses. The Kit sheet
   is where `.wk-*` rules belong.
7. **Panels have no box.** `.wk-channel-service` sets fill and `min-height: 0` and
   stops. Every feature then re-invents padding and scrolling: `.tw-config` pads
   `--space-6 --space-7`, `.twb` scrolls its own thread, `.tw-docs` is flush, and
   `.tw-messages` has no rules at all.

### Why it is also wrong underneath

- **Click and `select()` are different paths.** `select()` does not run the incoming
  panel's `enter`. `cowork-commons.js:272-281` patches `surface.select` *and* adds a
  click listener on the strip to compensate; `cowork-view.js` does not, and leans on
  `enter()` instead.
- **`enter()` fans out to every panel.** `invoke('enter')` loops all ids, so hidden tabs
  do work on every entry. This is accidental, and it is also load-bearing: it is the
  only reason the Messages attention mark and the Cron jobs count are ever computed.
- **Panels are all built at page load.** `createTeamCommons` runs once per seat, so four
  seats × seven panels are constructed on the Team view — wipeboards, cron rooms, doc
  lists and kanbans for three workspaces nobody has opened.
  `cowork-commons.js` works around the same thing with a local `once()` helper.
- **Consumers reach into the DOM for tab state.** `channels.tabs.querySelector('[data-service="agent-message-queue"]')`
  and `[data-service="kanban"]` (`cowork-view.js:245-246`) to set `dataset.attention`,
  `disabled` and `title` by hand.
- **No keyboard.** Roles and roving `tabIndex` are set, but there is no arrow-key
  handler, and no `aria-controls` / `aria-labelledby` between tab and panel. The
  ExplorerRail beside it has both; `ui.js` `tabs()` has both and nothing calls it.
- **Stale defaults.** `CHANNEL_SERVICES = ['chat', 'wipeboard', 'docs', 'team-configuration']`
  and its reserved, inert `chat` panel are never used — both consumers pass `channels`.

## The utility

`createTabbedSurface` in a new Kit module `public/js/workspace-tabs.js`, re-exported
through `WorkspacePrimitives`. Class namespace `.wk-tabset-*`. `.wk-tab-name` stays what
it is: the browser-tab name field in the app bar, unrelated.

```js
createTabbedSurface({
  label,                 // the surface's word, at the bar's left
  className,
  tabs: [{ id, label, title, panel, hidden, disabled, flush }],
  selected,              // id; falls back to the first selectable tab
  actions: [],           // the bar's right slot — never mixed into the tab row
  onSelect: (id, previous) => {},
})
```

`panel` is a Node, a service `{ el, mount, enter, leave, destroy, watch }`, or a
**factory** `() => service` built the first time its tab is shown.

Returned: `{ el, bar, content, select, current, setLabel, setBadge, setAttention,
setAvailable, setHidden, mount, enter, leave, destroy }`.

### Lifecycle contract

- `mount(ctx)` — the surface only. A panel mounts the first time it is shown.
- `select(id)` — `leave()` the outgoing panel, build-if-needed and `enter(ctx)` the
  incoming. **Click and programmatic select take this one path**, which removes both
  compensations in `cowork-commons.js`.
- `enter(ctx)` — the current panel's `enter`, plus `watch(report)` on every tab that
  declares one.
- `leave()` — the current panel's `leave`; all watches stop.
- `destroy()` — every *built* panel; unbuilt panels were never built.

`watch` is the deliberate replacement for today's accidental fan-out: a tab that needs a
badge while it is not on screen says so, and reports through
`report({ badge, attention })` rather than the surface entering everything. This keeps the
Messages attention mark and the Cron jobs count working, and it is what the Task Manager
will want for a count of its own.

### Appearance

All of it in `public/workspace-kit.css`, tokens only, under the existing `@layer app`.

- Tabs size to their label (`flex: 0 0 auto`), no dividers; one `flex: 1 1 auto` spacer
  between the tab row and the actions slot.
- One selected signal, matching the Kit's pressed idiom rather than inventing a third.
- `.wk-tabset-badge` is a real element rendered by `setBadge`.
- Overflow scrolls with an edge mask so a cut-off tab reads as cut off.
- `.wk-tabset-panel` owns fill, `min-height: 0` and one scroll region, with
  `data-flush` for panels that own their own scrolling (Docs, Wipeboard, Task Manager).

## Cuts, in dependency order

1. **Kit — add the utility.** `public/js/workspace-tabs.js` + `.wk-tabset-*` rules in
   `workspace-kit.css` + `tests/workspace-tabs.test.js` (select path, lazy build,
   lifecycle, watch, keyboard). Nothing consumes it yet; `createChannelSurface` still
   stands. `npm run preloads` for the new module.
2. **Team Commons onto it** (`cowork-view.js`). Panels become factories, so a seat builds
   its panels when it shows them. `messageTab` / `kanbanTab` querySelectors give way to
   `setAttention` and `setAvailable`. Updates `tests/team-commons.test.js`, which asserts
   the current `channels: [ { id: 'roster'` shape and `commons.kanbanTab.disabled = false`.
3. **Desk commons onto it** (`cowork-commons.js`). Delete the `surface.select` patch, the
   strip click listener and the local `once()` — the utility owns all three.
4. **Cron jobs badge** (`team-jikan.js`). Report through `watch`; delete the
   `.closest('.wk-channel-surface')` reach-through and `public/style.css:594`.
5. **Workbench header slot** (`workbench.js:208-222`). Dismiss appends to
   `.wk-tabset-actions`; `header: 'channels'` becomes `header: 'tabs'` and its required
   selector follows. Updates `tests/workbench-dismiss.test.js`.
6. **Remove the old engines.** `createChannelSurface`, `CHANNEL_SERVICES`, `TEAM_LABELS`,
   the reserved `chat` panel, `ui.js` `tabs()`, `.wk-channel-service-grow`, and the tab
   rules left behind in `style.css`.
7. **Docs in the same hand-in.** `docs/architecture/workspace-kit.md` (lines 68, 74, 123),
   `docs/architecture/team-workspace.md` (139, 172, 206),
   `docs/architecture/cowork-space.md` (73).

Cut 1 lands alone and reviewable. Cuts 2–5 are independent of each other once 1 is in.
Cut 6 is only safe after 2–5.

**Out of scope, named:** `docs.js` `.dc-pills` — pills inside the Docs tab are a second
tab engine and should adopt the utility, but that is a Docs change, not this one. The
Task Manager's own tabs are the next surface, not a cut here.

## Ownership boundaries

- The Kit owns every `.wk-tabset-*` node and rule. Features style their panel's contents
  and nothing else — the workspace-kit contract's "feature selectors must not select
  `.wk-*` internals" already says so; this buildout is what makes it true for tabs.
- Tab state (label, badge, attention, availability, visibility) changes only through the
  returned API. No consumer queries a tab node.
- Features do not build a second tab/service lifecycle — the existing rule in
  `docs/architecture/workspace-kit.md`.

## Checks

Desk, per cut: `npm run check:css`, `npm run check:modules`, `npm run check:tests`,
`node --test tests/workspace-tabs.test.js tests/team-commons.test.js tests/workbench-dismiss.test.js`.

Lead's combined gate: `npm run verify`.

`npm run workbench:ui` and `npm run visual:ui` need Playwright, which is not installed on
this desk — they are the lead/staging gate, and browser evidence for the appearance cuts
has to come from there. `npm run byoin` does not apply: no installed box or user store
changes.

## Questions for the owner

1. **The word.** The bar's default label is `t('workspace.channels', 'Team channels')`.
   "Channels" is not in the glossary; the glossary word for one section of a commons is
   **tab**. Do the internal names go to `tabset`/`tab` as well, or does `channel` stay as
   an internal name?
2. **The selected tab** — accent underline, or a raised chip? One of the two, not both.
3. **Narrow width** — scroll the tab row with an edge mask, or wrap it to a second row?
   Wrapping changes the bar's height and so the Workbench's row geometry.

## Done when

Both commons run on the one utility; no feature reaches a `.wk-*` tab node; tab CSS lives
in exactly one sheet; `createChannelSurface`, `ui.js` `tabs()`,
`.wk-channel-service-grow` and the `style.css:594` badge rule are gone; the architecture
docs are updated in the same hand-in. This buildout is deleted when the last cut lands.
