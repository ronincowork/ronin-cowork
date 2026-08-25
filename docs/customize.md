# Customize Ronin — current operational README

## Status

**Shipped preview; owning session retiring.** This file is the durable restart point and
records the implementation audited against `dev` HEAD `b0663b2` on 2026-08-25. A fresh
successor must receive an explicit owner or `view_mgr` assignment before extending it.

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
| SOPs | Read-only | Unavailable: read route missing |
| Actions | Guided agent handoff | Unavailable: read route missing |
| Tools | Read-only | Unavailable: table parser and route missing |
| Role families | Direct editor for membership only | Read-only list; editor not moved |
| Session roles | Guided agent handoff | Reads `/api/session-roles`; directory guidance |
| Team roles | Guided agent handoff | Reads `/api/team-roles`; directory guidance |
| Saved launches | Read-only in the shipped preview | Reads `/api/saved-launches` |
| Skins | Read-only | Reads `/api/skins` |
| Session readings | Read-only | Unavailable: read route missing |

Four unavailable resources must never render an empty list: an absent route cannot prove
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

## Current verification

Established from the committed tree:

- The four modules are committed in `ef801cb`.
- Registration is committed in `d36b440`.
- Static inspection confirms three sections, ten resources, **six live reads, four
  unavailable resources, and no deferred resource**, plus the generation and repaint
  guards. Saved Launches now reads `/api/saved-launches` as read-only.
- `a0f30f4` established and checks the shared feature-CSS/skin contract, but its rendered
  skin evidence names League, Team, and New Team—not Customize.

Not established:

- No trustworthy browser gate has been recorded against this checkout's Customize code.
- Earlier `--ui` claims targeted the owner-facing live checkout and are not evidence here.
- There is no current Customize-specific visual acceptance.

On resumption, verification is governed only by `docs/test-protocols.md`: ordinary work uses
direct dogfood and scoped diagnostic evidence, not BYOIN. The designated integrator owns
the one exact-candidate verdict. Never repoint the owner-facing service or start another
Ronin against the live tmux server for UI evidence.

## Known limits and blocked decisions

1. SOPs, actions, tools, and session readings lack a complete read surface.
2. `TOOLS.md` is a table; the TypeScript reader lacks its keyed-table shadow rule.
3. Malformed definition files are logged and dropped server-side, so the owner cannot see the broken file here.
4. Role-family membership has a typed writer, but its editor has not moved from New Session.
5. Saved Launches is read-only here. Before granting its intended direct editor, re-audit
   the typed saved-launch contract and existing retired-axis data; do not infer edit safety
   from the read route.
6. Team roles correctly ship with zero stock definitions. An owner-authored role reaches only later sessions born onto a rostered team; it does not retrofit current or adopted members.
7. Session readings are not watched. Most levels are birth-only; role readings may re-resolve on a later session-role change. Never promise live propagation.
8. Stylesheet location is ruled (`public/css/*.css`); the shared-Kit versus `cz-*` ownership
   of each proposed visual fix still requires an explicit decision.
9. The preview lacks both planned direct editors, complete failure journeys, and a verified visual/responsive pass.

## Exact resume checklist

1. Obtain an explicit owner or `view_mgr` assignment for a fresh Customize successor.
2. Re-read this file, the latest `five-eyes` wipeboard Brief/posts, Workspace Kit ruling, `docs/test-protocols.md`, and current KOTOBA/session-boot contracts.
3. Confirm `dev`; inspect status, `origin/dev..HEAD`, and changes since `18d9b35`. Identify unrelated worktree edits.
4. Inspect the four owned modules and current Kit. Verify every claim here against the tree and update stale facts first.
5. Report committed state, remaining work, current visual verdict, one bounded next leg, requested shared seams, and non-touch scope to `view_mgr`; wait for acknowledgement.
6. Classify Surface spacing, control styling, and cross-surface layout changes as Kit or
   feature work. The stylesheet location itself is already ruled: `public/css/`.
7. Choose one bounded leg. Prefer the smallest missing read path assigned by `view_mgr`,
   or a visual hierarchy leg only after its Kit/feature ownership is explicit.
8. Obtain a named seam assignment before editing shared server or shell paths. Never bundle parser, route, malformed-data, or saved-launch policy work by assumption.
9. Edit only approved paths. Preserve the Sessions 1/2/4 raw Tile grid and every other destination.
10. Record direct dogfood and scoped diagnostic evidence; leave BYOIN to the designated release integrator.
11. Stage only owned/approved paths and inspect the staged path list. Commit and push verified work only to `dev`. Never touch `master`, merge a PR, enable auto-merge, repoint the service, or treat a PR as release authorization.
12. Delete completed work from this README, refresh verification, and leave the successor one bounded next action—not a historical diary.

## Retirement constraints

The retiring session owns no further feature action. A successor starts from this document,
not `wip/buildouts/`, and must preserve unrelated dirty work. `master`, PR decisions,
service pointers, and other sessions' files remain owner-controlled and out of scope.
