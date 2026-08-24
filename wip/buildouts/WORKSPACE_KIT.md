# WORKSPACE KIT — current agent README

## Purpose and boundary

Workspace Kit is the one shared browser foundation for Team-oriented workspace views. It
keeps League, Team, Customize, New Team, Agent Configuration, Commons, and Configuration
on the same Surfaces, cards, controls, layouts, navigation, state, terminal hosting, and
service lifecycle instead of allowing separate UI kits.

The Kit is infrastructure, not a destination, workflow engine, data store, or visual
mockup. It does not own feature meaning, Team membership, New Team transactions, service
protocols, or product-specific validation. Visual similarity is not architectural
convergence: consumers must use the actual shared contracts.

**Sessions remains a first-class destination.** Its raw terminal Tile grid and 1, 2, and 4
Tile layouts remain supported product behavior. Workspace Kit views coexist with Sessions
in the shared `ViewHost`; they never replace, wrap, or reinterpret the Sessions grid.

## Canonical implementation map

| Contract | Canonical source | Owns |
|---|---|---|
| Kit facade | `public/js/workspace-kit.js` | The single `WorkspaceKit` namespace and Kit stylesheet loading |
| Primitives | `public/js/workspace-primitives.js` | Surface, Card, actions, metadata, forms, fields, notices, ExplorerRail, Channel Surface and standard states |
| Layouts | `public/js/workspace-layouts.js` | LeagueBoard, managed Workbench, SessionGrid, Explorer, Agent Configuration and New Team compositions |
| Adapters | `public/js/workspace-adapters.js` | Room workspace adapters and terminal Tile-host export |
| Terminal host | `public/js/terminal-tile-host.js` | The one Tile transport/render/focus/fit/composer lifecycle seam |
| Routing/state contract | `public/js/workspace-contract.js` | Destinations, typed navigation and Team workspace-state normalization |
| ViewHost/state | `public/js/workspace.js` | Registration, navigation, titles, history, per-tab state and lifecycle |
| Team projection | `public/js/team-controller.js` | Durable roster refresh and live session-derived membership selectors |
| New Team draft handoff | `public/js/team-draft-controller.js` | One draft shared with Agent Configuration |
| Foundation CSS | `public/style.css`, `public/workspace-kit.css` | Tokens, primitives, named geometry and responsive machinery |
| Feature CSS | `public/css/*.css` | Namespaced feature composition only |

Consume the facade where possible:

```js
const { createSurface, createCard, createAction } = WorkspaceKit.primitives;
const { createWorkbenchLayout } = WorkspaceKit.layouts;
const { createTerminalTileHost } = WorkspaceKit.adapters;
const { workspaceTarget, navigateWorkspace, teamWorkspaceState } = WorkspaceKit.contract;
```

Current load-bearing contracts:

- `createWorkbenchLayout(..., { managed: true, state, onStateChange })` returns `host` and
  owns collapse/expand rails, actions, bounded pointer/keyboard splitters, responsive
  stacking, snapshots, and `restore(state)`. Consumers append `host`, not only `el`.
- `createTerminalTileHost({ mode: 'full' | 'reduced' })` is the only terminal host. Full
  mode preserves the genuine existing Tile—including header, Torii, macros, controls,
  terminal, tape and composer—unchanged.
- `createChannelSurface({ services })` owns tabs and invocation. Services are
  `{ el, mount, enter, leave, destroy }`. Chat remains reserved and inert.
- `team-controller.js` is the only Team projection. Membership and leads are derived live
  from sessions; `team_roster` stores durable Team metadata/defaults, never membership.
- Programmatic ExplorerRail `setSections()` is silent. `onSelect` is for user selection.
- Navigation uses `workspaceTarget()` and `navigateWorkspace()`. Views use shell state,
  `viewState()` and `patchViewState()` rather than private history or storage engines.

## CSS and skin governance

There is no Tailwind or PostCSS pipeline. Ronin uses the design tokens in
`public/style.css` and cascade order `vendor, foundations, ui, app`.

Mandatory rules:

- Feature sheets live only under `public/css/` and are statically linked exactly once from
  `public/index.html`; runtime feature CSS loaders are forbidden.
- Each feature sheet contains one `@layer app` block.
- Visual values use existing tokens. No literal colors, pixel/rem/em look values,
  `var(..., fallback)` visual fallbacks, private font stacks, or feature skin selectors.
- Feature selectors use their own namespace. They must not select `.wk-*` internals or own
  Kit layout/responsive geometry.
- Skins remain token sets only. Never add feature-specific selectors or a second skin path.

`scripts/check-css.mjs` enforces location, static loading, layer, raw-value, token and
namespace rules across shipped non-vendor stylesheets. Staging browser evidence verifies
League, Team and New Team inherit shipped square/soft radius, tight/roomy spacing/type,
paper surface-color, and mono font tokens, then restore Stock.

## Lifecycle contract

```text
mount(host, context)   once: construct and acquire view-lifetime resources
enter(context)         each activation: restore state, refresh, resume services
leave()                each deactivation: park transports and stop active work
destroy()              once: release listeners, observers, timers, sockets and DOM
```

Hooks are optional when a view owns no corresponding resources; do not add fake hooks for
symmetry. Existing hooks must be idempotent. Repeated navigation must not multiply sockets,
subscriptions, listeners, observers, timers, keyboard handlers, terminal instances, or
composers.

Terminal views park the canonical host on `leave()` and destroy it on `destroy()`. Channel
services run through `createChannelSurface`; features do not build a second tab/service
lifecycle. Team-controller subscriptions are repaint signals; refresh has a clear view
boundary and selectors remain authoritative.

## Consumer rules

Every consumer must:

1. Compose the existing Kit; never mint a feature-local foundation substitute.
2. Use Kit actions, bars, metadata, forms, fields, notices, Surfaces and cards rather than
   hand-building generic equivalents.
3. Use named layouts and their responsive contracts. Feature CSS may express meaning, not
   rails, splitters, columns, breakpoints, collapse controls or `.wk-*` geometry.
4. Use typed shell navigation/state and shared Team/draft controllers.
5. Use the one terminal Tile host and preserve full Tile mode wholesale where required.
6. Preserve null, empty, zero-member and unclassified states. Do not invent workflow locks
   or validation the backend does not require.
7. Preserve unrelated dirty work and stage paths/hunks selectively.

If a needed primitive, layout, adapter, state field, lifecycle capability, or backend
contract is missing, **stop and ask the Workspace Kit/owner decision-maker**. Do not work
around the gap in a feature and do not create a parallel kit “temporarily.”

## Verification and evidence

The test contract is `docs/test-protocols.md`:

```sh
bin/ronin-byoin --gates   # repository checks; browser checks explicitly skip
bin/ronin-byoin --ui      # repository checks plus browser and visual evidence
bin/ronin-byoin           # installed-box verification and machine readouts
```

Run the one mode appropriate to the change; do not assemble hand-rolled sequences.
`scripts/check-workspace-kit.mjs` rejects feature-local Team projections, terminal hosts,
primitive copies and layout drift. `scripts/check-css.mjs` guards CSS. Staging
`scripts/smoke-ui.mjs` owns dev-only workspace/skin evidence; default live smoke must not
pretend unlanded routes exist. `scripts/visual-ui.mjs` measures declared compositions. A
SKIP is unverified, never a pass.

Accepted evidence includes League, Team and New Team consuming the hardened contracts;
Team managed Workbench and full Tile-host mode; Kit-owned League desktop/phone geometry;
all 12 view/skin assertions plus Stock restoration; and live UI verification including the
registry-derived five-room Commons.

## Known open seams

- Sessions continues to own its compatibility 1/2/4 raw Tile grid. Any future Team
  Sessions-mode composition must reuse genuine Tiles without weakening that destination.
- Commons and Configuration use room workspace adapters while compatibility builders still
  exist. Adapt those builders; do not rewrite their behavior under Kit work.
- Chat is intentionally empty and inert; there is no protocol to infer.
- Reduced terminal-host composition is supported, but proving it must not alter full Tile.
- Registration idioms may differ where reachability/lifecycle are correct. Normalize only
  for a demonstrated defect.
- Tiny DOM helpers and resource-free views are not foundation gaps.
- Agent Configuration action primitives remain pre-PR cleanup, not a separate kit.
- `../ronin-lab/concepts/five-eyes.html` at reviewed commit `f9510ef` is visual reference,
  not production code, state, or an alternate contract.

## Exact resume checklist

1. Confirm branch `dev`; never touch or merge `master` without explicit authority.
2. Read this file, `wip/buildouts/FIVE_EYES.md`, `docs/test-protocols.md`, and the target
   consumer/build-out completely.
3. Inspect `git status`, current diff, recent history, and the canonical files above.
4. Record unrelated dirty baseline. If exact hunk isolation is unsafe, stop.
5. State the smallest foundation leg and named consumers. If reviewed contracts do not
   determine it, ask the owner before coding.
6. Search existing primitives/layouts/adapters/controllers first. Create no second CSS,
   rendering, routing, state, socket, terminal or service-lifecycle system.
7. Implement shared foundation first; touch features only for explicitly authorized minimal
   compatibility proof.
8. Check CSS governance and prove Sessions remains reachable with 1/2/4 Tiles unchanged.
9. Run the one declared BYOIN mode. For unlanded views, populate the staging directory
   mounted by the running service and use declared staging smoke evidence.
10. Read the whole verdict. Stop on an owned red; identify unrelated baseline failures.
    Never report SKIP as verified.
11. Stage exact owned paths/hunks, inspect `git diff --cached --check` and the whole cached
    patch, then commit/push only when authorized.
12. Handoff hash or uncommitted state, verification verdict, exact paths, migration steps,
    unrelated failures, and anything not tested or done.
