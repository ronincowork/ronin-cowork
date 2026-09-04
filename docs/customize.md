# Customize Ronin — current operational README

## Status

**Active product work on `dev`.** Retirement was cancelled by owner direction. This file
is the durable implementation and restart contract; each bounded leg updates it when the
shipped behavior changes.

The implementation is a registered, predominantly read-only preview on `dev`. It is useful
as an inventory, but it is not a complete authoring destination. No Customize-specific
visual acceptance or trustworthy browser verification is recorded.

Committed history:

- `ef801cb` — four Customize client modules and the original build-out document.
- `d36b440` — shared Five Eyes registration, including Customize.

The original plan called the files untracked and the destination inert. That is stale: the files are tracked, `public/js/main.js` installs the destination, and `#/customize` is registered.

## Purpose

Customize is the install-level destination where a person discovers the recipes and definitions that change how Ronin works. Its governing product line is:

> You set a setting; you write a recipe.

Settings belong on the Admin Desk. Recipes and authorable catalogs belong here. Customize must say what exists, whose entry it is, and whether v1 can edit it directly, guide an agent to edit it, or only read it.

Customize is one coworkspace **Surface** composed from Workspace Kit. Its rail and resource content are parts of that Surface, not additional Surfaces, Tiles, panes, or panels.

### Coexistence with the session grid

Customize does **not** replace or transform the Sessions 1/2/4 raw Tile grid. The raw terminal Tiles remain their own coworkspace destination and keep their one-, two-, and four-Tile layouts. Customize is a separate routed destination alongside that grid. Entering `#/customize` shows the resource explorer; returning to Sessions restores the raw Tile experience. No Customize module may reach into, restyle, or own the session grid.

## Non-goals and hard boundaries

- No raw generic disk editor; never call `PUT /api/file`.
- No direct editor without a typed, validating API that owns the file format.
- No cloning Admin Desk configuration, services, project roots, Hotwords, appearance, updates, or account surfaces.
- No moving the skin picker. Choosing a skin is a setting; Customize inventories the skin catalog.
- No editing a team's durable roster, objective, defaults, or wipeboard. Team-role definitions belong here; team instances belong to Team Configuration.
- No second foundation or local copies of Workspace Kit primitives.
- No feature module reaching into another destination's DOM.
- No repo-relative customization. Owner resources live in resolved Ronin stores and survive upgrades.
- No Japanese house vocabulary in user-facing copy.

## Route and flow

```text
public/js/main.js
  -> installCustomize(workspace)
  -> workspace.register('customize', view)
  -> #/customize

customize.js
  -> Workspace Kit ExplorerRail + ExplorerLayout + content Surface
  -> customize-rail.js: three sections and ten resources
  -> customize-resources.js: typed read or honest unavailable/deferred state
  -> cards: resolved entries and provenance
  -> customize-handoff.js: allowed write path or read-only explanation
  -> resolved count/provenance repaint the rail without reselecting
```

The selection generation counter prevents an older request painting over a newer selection. The rail repaint guard prevents `setSections()` recursively starting another read.

### Current resource matrix

This matrix is the v1 product authority. Completion may add a planned capability, but must not silently promote one.

| Resource | Intended v1 capability | Current preview |
|---|---|---|
| Macros | Guided agent handoff | Reads `/api/macros`; seed/path handoff |
| SOPs | Read-only | Reads `/api/sops`; resolved procedure text expands in place |
| Actions | Guided agent handoff | Reads `/api/actions`; resolved action text expands in place |
| Tools | Read-only | Unavailable: table parser and route missing |
| Role families | Direct editor for membership only | Kit toggle editor; typed writer; inline pinned-lead refusal |
| Session roles | Guided agent handoff | Reads `/api/session-roles`; directory guidance |
| Team roles | Guided agent handoff | Reads `/api/team-roles`; directory guidance |
| Saved launches | Read-only in the shipped preview | Reads `/api/saved-launches` |
| Skins | Read-only | Reads `/api/skins` |
| Session readings | Read-only | Reads `/api/session-readings`; resolved level/file text expands in place |

The unavailable Tools resource must never render an empty list: an absent route cannot prove
that the owner's shelf is empty. Saved Launches is now an ordinary read-only resource; the
earlier deferred/inert state was removed when its live read was wired.

### Provenance

`public/js/provenance.js` alone turns server provenance into marks:

- Stock: no mark.
- `◆`: the owner added the entry.
- `◈`: the owner shadows a shipped entry, so later stock improvements do not reach it.

Counts and section rollups come only from successful reads. They remain absent when a read cannot answer; they are never guessed or hard-coded.

## Owned files

- `public/js/customize.js` — mount, lifecycle, selection, stale-response and repaint guards.
- `public/js/customize-rail.js` — three-section, ten-resource matrix.
- `public/js/customize-resources.js` — reads, states, cards, counts, provenance.
- `public/js/customize-handoff.js` — guided handoff and read-only/deferred endings.
- `docs/customize.md` — this persistent implementation and resume contract.

Shared seams consumed but not owned:

- `public/js/main.js` and `public/index.html` — installation and shared host.
- `public/js/workspace-kit.js`, `workspace-primitives.js`, `workspace-layouts.js` — shared foundation.
- `public/style.css` — shared Kit geometry and tokens.
- `src/resources.ts`, `src/resource-adapters.ts`, and shared routes — catalog plumbing used elsewhere.

Do not edit a shared seam without `view_mgr` assigning the exact change. Preserve unrelated worktree changes.

## Workspace Kit contract

Customize consumes the frozen `WorkspaceKit` namespace, not bare primitives or forks. It currently uses `createExplorerRail`, `createSurface`, `createCard`, `createNotice`, and `createExplorerLayout`.

The Kit owns layout geometry, states, keyboard and narrow-screen behavior, cards, forms, fields, notices, focus treatment, and shared spacing. Customize supplies resource data and feature behavior.

Vocabulary is strict:

- **pane** means only the tmux object inside the tmux server.
- A terminal renders into a **Tile**.
- A larger coworkspace region is a **Surface**.
- Docs, Wipeboard, Agent Message Queue, and Team Configuration are **Channel services**, never panes or panels.

If a defect affects several destinations—Surface padding, control reset, common layout proportions—bring one foundation decision to `view_mgr`; do not hide it under `.cz-*` and make Customize diverge.

## Skin and styling contract

Customize ships no feature stylesheet today. Its markup exposes `cz-*` hooks. The shared
convention is now settled by `docs/workspace-kit.md` and enforced by
`scripts/check-css.mjs`: feature sheets live under `public/css/`, are statically linked
once from `public/index.html`, contain one `@layer app`, use existing tokens, and may not
select `.wk-*` internals or own Kit geometry.

When resumed:

- Use existing skin tokens; add no literal product colors.
- Preserve contrast, focus visibility, reduced motion, and narrow-screen use in every supported skin.
- Keep the skin chooser on the Admin Desk.
- Keep the skin catalog read-only with provenance.
- Separate shared Kit fixes from Customize-only hierarchy. If Customize earns a feature
  sheet, use `public/css/customize.css` [planned] under the governed feature-CSS contract and obtain
  approval for the shared `public/index.html` link seam.

The first bounded visual candidate is content hierarchy: deliberate spacing, readable
card flow, a separated handoff region, and phone-safe rhythm. First decide whether each
defect is Kit-owned or Customize-only; shared Surface spacing remains foundation work.

## Lifecycle and states

First entry selects the first resource. Later entries retain the selection for the life of the view object. The shell owns routing, history, and document title.

- `loading`: a valid read is pending.
- ordinary empty: a successful read returned no entries.
- `failed`: a valid route failed or returned the wrong shape.
- `unavailable`: the prerequisite read surface does not exist.
- `inert`: the capability is deliberately deferred.
- `stale`: previously valid content remains after refresh failure.

Read-only is a capability, not an error. It ends with an honest change path, never a disabled imitation editor.

Guided handoff is also first-class. Seedable catalogs create the owner's catalog and return its path. Definition directories explain the store location and point the agent at their README. The flow never invents a path or uses the generic file API.

After editing a shadow, run `bin/ronin-doctor`; its user-customization section reports any definition the reader would drop.

## Limits

1. Tools lacks a complete read surface.
2. `TOOLS.md` is a table; the TypeScript reader lacks its keyed-table shadow rule.
3. Malformed definition files are logged and dropped server-side, so the owner cannot see the broken file here.
4. Role-family membership is the one shipped direct editor. Creation, deletion, labels,
   ordering, and `default_lead_role` authoring remain guided agent work.
5. Saved Launches is read-only here. Before granting its intended direct editor, re-audit
   the typed saved-launch contract and existing retired-axis data; do not infer edit safety
   from the read route.
6. Team roles correctly ship with zero stock definitions. An owner-authored role reaches only later sessions born onto a rostered team; it does not retrofit current or adopted members.
7. Session readings are not watched. Most levels are birth-only; role readings may re-resolve on a later session-role change. Never promise live propagation.
8. Stylesheet location is ruled (`public/css/*.css`); the shared-Kit versus `cz-*` ownership
   of each proposed visual fix still requires an explicit decision.
9. The preview lacks the Saved Launches editor, complete failure journeys, and a verified visual/responsive pass.
