# Buildout — one tab utility for the whole coworkspace

Landed cuts are gone from this document. What follows is what remains.

## Settled outcome

One tab utility in the Workspace Kit, `createTabbedSurface`, reachable by any work
surface through `WorkspaceKit.primitives`. Every tab strip in the product runs on it, its
appearance and its CSS have a single owner, and a new surface — the Task Manager — gets
tabs by declaring a tab list.

## Owner rulings this carries

1. **"Channels" is outdated** — removed from the code, the class names, the lexicon keys
   and the architecture docs, not renamed.
2. **No underlines on a selected item, ever.** The selected tab takes the panel's own
   fill and covers the bar's rule with a `box-shadow`: it is the only tab with no line
   under it, which is structurally the opposite of an underline.
3. **No surface name in the bar.** You launch the Commons and what you get is its tabs.
   `label` survives as the tablist's accessible name and is never drawn.
4. **The look is the work** — selected, unselected, and both scrolling edges.
5. **A badge is information; attention is emphasis on it.** A tab that can count says the
   number and attention colours it. A bare corner mark is only for a tab with nothing to
   count. Neither ever changes a label's weight — the old strip's `font-weight: 700`
   widened the Messages label and shoved every tab to its right.
6. **The pad's dead route is deleted** — `S.showCoworkCommons` was assigned nowhere, so
   `S.padPanel.open`/`isOpen` pointed at a tab the pad could not reach. Gone, and the
   pad's own `open`/`isOpen` (js/padpanel.js) stand again.

## What remains

1. **Docs shelf onto the utility** (`docs.js`). Tracked · Plans · Docs are still
   `.dc-pill`, a second tab engine rendered *inside* the Commons' Docs tab. It is the
   clearest test that the utility reads well at a small width.
2. **The remaining strips take the look.** `.cv-pill` (Desk choices, Presets kinds) and
   `#phone .ph-seg-item` keep their own elements — they pick a value and route a screen
   rather than switching panels — and move onto the shared tokens, `--kaki` included.
   Today they use the amber `--accent` for a selected border while the Kit's pressed
   idiom uses `--kaki`.
3. **The orphaned `.home-tabs` block** (`public/style.css:4157`, ~130 lines). No module
   renders it; its scrolling treatment is where the tab set's edge masks come from.
   Deliberately left standing: its rules are interleaved with live `.home` rules inside
   shared `@container` and `@media` blocks, so removing it is per-rule surgery, not a
   slice, and it is not worth risking the Home view inside a wiring hand-in.
4. **Lazy panels for the Team Commons.** The tab set builds a panel from a factory on
   first show, but `cowork-view.js` still constructs all seven rooms for all four seats
   eagerly, because `setBoard`, `setTeam` and `setTeam` are pushed into the wipeboard,
   kanban and cron rooms on every roster refresh whether or not they are on screen.
   Making them lazy means giving those three rooms a `watch`, or replaying the last team
   reading when a panel is finally built. Neither is free, and neither belongs in the
   same cut as the wiring.

## Ownership boundaries

- The Kit owns every `.wk-tabset-*` node and rule. Features style their panel's contents
  and nothing else.
- Tab state — badge, attention, availability — changes only through the returned API. No
  consumer queries a tab node.
- Features do not build a second tab/panel lifecycle.

## Checks

Desk: `npm run check:css`, `npm run check:modules`, `npm run check:tests`. The first two
sit at the team line's own counts (38 and 10); neither names anything this work added.
`cowork-view.js` breaches the 700-line ceiling on the team line already.

`npm run workbench:ui` and `npm run visual:ui` need Playwright, which is **not installed
on this desk**. They are the lead/staging gate, and the browser evidence for the
appearance — selected and unselected at rest and on hover, both cut edges with their
masks and chevrons, a coarse-pointer flick, and a keyboard pass — has to come from there.

## Done when

Every tab strip in the product runs on the one utility; no feature reaches a `.wk-*` tab
node; nothing selected anywhere is marked with an underline.

This buildout is deleted when the last item above lands.
