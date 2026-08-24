# Customize Ronin — current operational README

## Status

**PARKED by owner priority after this documentation pass.** Do not resume feature work until the owner or `view_mgr` explicitly un-parks Customize after League, Team, and New Team. This file is the restart point; it records the tree inspected on 2026-08-24.

The current implementation is a registered, read-only preview on `dev`. It is useful as an inventory, but it is **not release-ready**. The owner's verdict on the Five Eyes previews is that they are awful. No visual acceptance or trustworthy browser verification has superseded that verdict.

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
| SOPs | Read-only | Unavailable: read route missing |
| Actions | Guided agent handoff | Unavailable: read route missing |
| Tools | Read-only | Unavailable: table parser and route missing |
| Role families | Direct editor for membership only | Read-only list; editor not moved |
| Session roles | Guided agent handoff | Reads `/api/session-roles`; directory guidance |
| Team roles | Guided agent handoff | Reads `/api/team-roles`; directory guidance |
| Saved launches | Direct editor | Deferred pending retired-axis ruling/sweep |
| Skins | Read-only | Reads `/api/skins` |
| Session readings | Read-only | Unavailable: read route missing |

Four unavailable resources must never render an empty list: an absent route cannot prove that the owner's shelf is empty. Saved launches must remain explicitly deferred.

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
- `src/catalog.ts`, `src/definitions.ts`, and shared routes — catalog plumbing used elsewhere.

Do not edit a shared seam without `view_mgr` assigning the exact change. Preserve unrelated worktree changes.

## Workspace Kit contract

Customize consumes the frozen `WorkspaceKit` namespace, not bare primitives or forks. It currently uses `createExplorerRail`, `createSurface`, `createCard`, `createNotice`, and `createExplorerLayout`.

The Kit owns layout geometry, states, keyboard and narrow-screen behavior, cards, forms, fields, notices, focus treatment, and shared spacing. Customize supplies resource data and feature behavior.

Vocabulary is strict:

- **pane** means only the tmux object inside the tmux server.
- A terminal renders into a **Tile**.
- A larger coworkspace region is a **Surface**.
- Chat, Wipeboard, Docs, and Team Configuration are **Channel services**, never panes or panels.

If a defect affects several destinations—Surface padding, control reset, common layout proportions—bring one foundation decision to `view_mgr`; do not hide it under `.cz-*` and make Customize diverge.

## Skin and styling contract

Customize ships no feature stylesheet today. Its markup exposes `cz-*` hooks, but the repository has no recorded final convention for destination CSS. That is a shared-foundation decision.

When resumed:

- Use existing skin tokens; add no literal product colors.
- Preserve contrast, focus visibility, reduced motion, and narrow-screen use in every supported skin.
- Keep the skin chooser on the Admin Desk.
- Keep the skin catalog read-only with provenance.
- Separate shared Kit fixes from Customize-only hierarchy and obtain the stylesheet-location ruling before adding or linking a stylesheet.

The first bounded visual candidate is content hierarchy: deliberate spacing, readable card flow, a separated handoff region, and phone-safe rhythm. It waits for the foundation ruling because missing Surface padding may affect all five destinations.

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

## Current verification

Established from the committed tree:

- The four modules are committed in `ef801cb`.
- Registration is committed in `d36b440`.
- Static inspection confirms three sections, ten resources, five live reads, four unavailable resources, one deferred resource, the generation guard, and repaint guard.

Not established:

- No trustworthy browser gate has been recorded against this checkout's Customize code.
- Earlier `--ui` claims targeted the owner-facing live checkout and are not evidence here.
- There is no current visual acceptance; the owner's “awful and not release-ready” verdict controls.
- No test was run for this documentation-only pass, by assignment.

On resumption, verification is governed only by `docs/test-protocols.md`: use the declared `bin/ronin-byoin` command in the mode the completed leg earns, capture one verdict, and run no hand-rolled sequence. A SKIP is unverified. Never repoint the owner-facing service or start another Ronin against the live tmux server for UI evidence.

## Known limits and blocked decisions

1. SOPs, actions, tools, and session readings lack a complete read surface.
2. `TOOLS.md` is a table; the TypeScript reader lacks its keyed-table shadow rule.
3. Malformed definition files are logged and dropped server-side, so the owner cannot see the broken file here.
4. Role-family membership has a typed writer, but its editor has not moved from New Session.
5. Saved launches still carry retired `role_family` data through type/read/filter/field/validation/route code. Existing data needs an owner ruling before the direct editor ships.
6. Team roles correctly ship with zero stock definitions. An owner-authored role reaches only later sessions born onto a rostered team; it does not retrofit current or adopted members.
7. Session readings are not watched. Most levels are birth-only; role readings may re-resolve on a later session-role change. Never promise live propagation.
8. Stylesheet location and the shared-Kit versus `cz-*` styling boundary remain unruled.
9. The preview lacks both planned direct editors, complete failure journeys, and a verified visual/responsive pass.

## Exact resume checklist

1. Obtain explicit owner or `view_mgr` instruction un-parking Customize after League, Team, and New Team.
2. Re-read this file, the latest `five-eyes` wipeboard Brief/posts, Workspace Kit ruling, `docs/test-protocols.md`, and current KOTOBA/session-boot contracts.
3. Confirm `dev`; inspect status, `origin/dev..HEAD`, and changes since `18d9b35`. Identify unrelated worktree edits.
4. Inspect the four owned modules and current Kit. Verify every claim here against the tree and update stale facts first.
5. Report committed state, remaining work, current visual verdict, one bounded next leg, requested shared seams, and non-touch scope to `view_mgr`; wait for acknowledgement.
6. Obtain the foundation ruling for Surface spacing, stylesheet location, control styling, and cross-surface layout changes.
7. Choose one bounded leg. Prefer visual hierarchy only if ownership is explicit; otherwise take the smallest read-path prerequisite assigned by `view_mgr`.
8. Obtain a named seam assignment before editing shared server or shell paths. Never bundle parser, route, malformed-data, or saved-launch policy work by assumption.
9. Edit only approved paths. Preserve the Sessions 1/2/4 raw Tile grid and every other destination.
10. Verify the completed leg with the declared BYOIN command; report its exact verdict and every SKIP.
11. Stage only owned/approved paths and inspect the staged path list. Commit and push verified work only to `dev`. Never touch `master`, merge a PR, enable auto-merge, repoint the service, or treat a PR as release authorization.
12. Delete completed work from this README, refresh verification, and leave the successor one bounded next action—not a historical diary.

## Parked constraints

Until explicitly resumed: no product edits, tests, staging, commits, pushes, service changes, PR activity, or work on `master`. Documentation was temporarily un-parked only for this rewrite; Customize now returns to **PARKED**.
