# Tile control — a tab owns its tiles, and a URL can direct them

What decides which sessions the grid shows, per browser tab. Shipped 2026-08-20; the
code is `public/js/state.js` (`saveState`/`loadState`) and the ＋ button in
`public/js/layout.js`.

## One state, three scopes — first answer wins

1. **The `?tiles=` directive** — a one-shot instruction in the URL (below).
2. **sessionStorage** — the tab's own memory. Per tab, survives refresh.
3. **localStorage** — the seed a hand-opened new tab starts from: the most recent save,
   from any tab.

Every save writes both storages: sessionStorage as this tab's truth, localStorage as the
seed for future tabs. Before 2026-08-20 localStorage was the *whole* state, shared by
every tab — last writer won, and refreshing one tab loaded whatever another tab had saved.
That is the failure this design removes: **a refresh returns the same tab's own tiles.**

The browser's own duplicate-tab copies sessionStorage (spec behaviour), so a duplicate
starts as a copy and then diverges freely.

## The `?tiles=` directive

`/?tiles=a,b,c` — session names by tile, blank between commas for an empty tile —
optionally with `&layout=1|2|4`.

- Honored **above both storages**, written into the tab's sessionStorage, then stripped
  from the address (`history.replaceState`) — so a refresh keeps it and a bookmark never
  replays it. `cowork_setup` exits through this directive when it opens the workspace.
- **The comma structure declares the grid**: `?tiles=claude` is one tile, `?tiles=,` a
  blank two, `?tiles=,,,` a blank four. An explicit `&layout=` overrides.
- The device still rules how many tiles *show*: a phone forces a single tile regardless
  (main.js), exactly as it does over stored state.

This is the lever for opening Ronin onto a chosen view — and the setup flow uses it:
`firstrun`'s Save exits through `?tiles=`, naming the agent-install sessions first and the
setup seat after; only sessions that actually started are named, and an empty list is one
empty tile (the commons and its ＋ New). Any macro or doc can link a working set the same
way.

## The ＋ button opens blank

＋ opens a new tab with `?tiles=,` — **two empty tiles** (owner, 2026-08-20), not a copy
of the current tab. Without the directive the new tab would inherit the sessionStorage
copy and read as a clone.

## Deliberately not built

Named server-side layouts ("my review setup", synced across devices). A real later want;
not needed for either job above, and nothing here creates a foothold for it — both
mechanisms are client-only.
