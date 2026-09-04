# WORKSPACE KIT — current agent README

## Purpose and boundary

Workspace Kit is the one shared browser foundation for Team-oriented workspace views. It
keeps League, Team, Customize, New Team, Commons, and Configuration
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
| Layouts | `public/js/workspace-layouts.js` | LeagueBoard, managed Workbench, SessionGrid, Explorer and New Team compositions |
| Adapters | `public/js/workspace-adapters.js` | Room workspace adapters and terminal Tile-host export |
| Terminal host | `public/js/terminal-tile-host.js` | The one Tile transport/render/focus/fit/composer lifecycle seam |
| Routing/state contract | `public/js/workspace-contract.js` | Destinations, typed navigation and Team workspace-state normalization |
| ViewHost/state | `public/js/workspace.js` | Registration, navigation, titles, history, per-tab state and lifecycle |
| Team projection | `public/js/team-controller.js` | Durable roster refresh and live session-derived membership selectors |
| Foundation CSS | `public/style.css`, `public/workspace-kit.css` | Tokens, primitives, named geometry and responsive machinery |
| Feature CSS | `public/css/*.css` | Namespaced feature composition only |

Consume the facade where possible:

```js
const { createSurface, createCard, createAction } = WorkspaceKit.primitives;
const { library, profiles, create } = WorkspaceKit.workbench;
const { createTerminalTileHost } = WorkspaceKit.adapters;
const { workspaceTarget, navigateWorkspace, teamWorkspaceState } = WorkspaceKit.contract;
```

Current load-bearing contracts:

- `WorkspaceKit.workbench.create({ profile, tenant, environment, defaultNode })` is the
  only public Workbench constructor. Consumers register reusable surface types in the
  shared `library`, define a named profile as a list of type ids, and provide tenant
  context. They cannot declare slots, selector DOM, headers, cells or geometry. Internally
  the Workbench owns a slot ARRANGEMENT
  (`{ slots: [{ name, label, width, min, compact }] }`, `public/js/workspace-arrangement.js`)
  and hands one element per name; the Kit draws them in the arrangement's order and
  widths, hides what it hides, places one splitter between each visible pair, stacks on
  phones, and writes `data-width="compact" | "full"` on each slot wrapper from measurement.
  It returns `{ host, el, arrangement, restore, snapshot }`; consumers append `host` and
  persist the arrangement `{ order, hidden, widths }` through `patchViewState`. There are
  no collapse rails: the control is the **layout map** (`createLayoutMap(arrangement)`),
  which the ViewHost draws into the bar's `#viewmap` slot for any registered view that
  exposes `arrangement` — click shows/hides a slot, drag within the map reorders, keyboard
  works. Nothing in the frame, the map, or the ViewHost knows a slot's name or meaning.
  Beside it, the bar's `#viewname` slot takes the **tab name** (`createTabName`): a view
  that exposes `tabName` (`{ get, placeholder, set }`) gets one text field, and what is
  typed becomes the browser tab's title through the view's own `title()`; the Team page
  offers it, defaulting to the team and persisted per tab.
  **A workspace holds exactly one surface instance.** `place(type, workspace, detail)`
  resolves the type through the active profile and shared library. The library factory is
  called per workspace/resource; returning one node for two workspaces is refused. The
  selector and drag/drop both call this same placement path.
- `createTerminalTileHost({ mode, actions })` and `createChannelSurface({ actions })`
  take consumer actions for their own header row (a tile head, a tab strip) — the Team
  page's C/T flip rides there, so no feature reaches into a Tile.
- `createTerminalTileHost({ mode: 'full' | 'reduced' })` is the only terminal host. Full
  mode preserves the genuine existing Tile—including header, Torii, macros, controls,
  terminal, tape and composer—unchanged.
- `createChannelSurface({ services })` owns tabs and invocation. Services are
  `{ el, mount, enter, leave, destroy }`. Chat remains reserved and inert.
- `team-controller.js` is the only Team projection. Membership and leads are derived live
  from sessions; `team_roster` stores durable Team metadata/defaults, never membership.
- ExplorerRail currently routes both programmatic `setSections()` reconciliation and user
  selection through `select()`, so both invoke `onSelect`. This is a known contract defect,
  not permission for new consumers to add another rail or selection engine.
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
lifecycle. Team-controller selectors remain authoritative. Its subscribers currently
receive an unused deep-copied `snapshot()` carrying a revision counter after refresh;
consumers should not treat that payload as a second state source.

## Consumer rules

Every consumer must:

1. Compose the existing Kit; never mint a feature-local foundation substitute.
2. Treat the Surface header as permanent structure. `createSurface({ label, actions })`
   supplies the standard fixed-height, fixed-color header automatically. `header: false`
   is reserved for a specialized permanent head already supplied by the same composition:
   a terminal Tile head, channel tab strip, or discovery-column head.
3. Use Kit actions, bars, metadata, forms, fields, notices, Surfaces and cards rather than
   hand-building generic equivalents.
4. Use named layouts and their responsive contracts. Feature CSS may express meaning, not
   rails, splitters, columns, breakpoints, collapse controls or `.wk-*` geometry.
5. Use typed shell navigation/state and shared Team/draft controllers.
6. Use the one terminal Tile host and preserve full Tile mode wholesale where required.
7. Preserve null, empty, zero-member and unclassified states. Do not invent workflow locks
   or validation the backend does not require.
8. Preserve unrelated dirty work and stage paths/hunks selectively.
9. Read every string a person sees through `t('room.key', 'literal')` (`public/js/lexicon.js`)
   and land the key in `ronin_catalogs/lexicons/professional_en.md` in the same commit —
   `docs/kokugo.md` is the whole instruction; `scripts/check-lexicon.mjs` fails the gate
   otherwise. Kit primitives take the already-translated word; they never translate.

If a needed primitive, layout, adapter, state field, lifecycle capability, or backend
contract is missing, **stop and ask the Workspace Kit/owner decision-maker**. Do not work
around the gap in a feature and do not create a parallel kit “temporarily.”

## Verification and evidence

The test contract is `docs/test-protocols.md`:

```sh
npm run byoin             # user-customization guard-rail check
```

Ordinary Kit legs use direct dogfood and scoped diagnostic evidence, not BYOIN. One
designated integrator runs the check once on the exact release candidate.
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
- ExplorerRail programmatic reconciliation is not yet silent: `setSections()` calls
  `select()`, which fires `onSelect`. The approved foundation cleanup is to notify only on
  real user selection and then remove any consumer suppression workaround after audit.
- `team-controller.js` still maintains `revision`, deep-copies state in `snapshot()`, and
  passes that snapshot to subscribers even though consumers re-read authoritative
  selectors. The approved KISS cleanup is a bare repaint notification and removal of the
  unused snapshot machinery; do not replace it with another cache or state source.
- `../ronin-lab/concepts/five-eyes.html` at reviewed commit `f9510ef` is visual reference,
  not production code, state, or an alternate contract.

## Exact resume checklist

1. Work at your repo desk, cut from your team line (`ronin_session_boot/routine/ronin_worktrees/WORKTREES.md`);
   never touch or merge `master` without explicit authority.
2. Read this file, `docs/test-protocols.md`, and the target consumer document completely.
3. Inspect `git status`, current diff, recent history, and the canonical files above.
4. Record unrelated dirty baseline. If exact hunk isolation is unsafe, stop.
5. State the smallest foundation leg and named consumers. If reviewed contracts do not
   determine it, ask the owner before coding.
6. Search existing primitives/layouts/adapters/controllers first. Create no second CSS,
   rendering, routing, state, socket, terminal or service-lifecycle system.
7. Implement shared foundation first; touch features only for explicitly authorized minimal
   compatibility proof.
8. Check CSS governance and prove Sessions remains reachable with 1/2/4 Tiles unchanged.
9. Use direct dogfood and scoped diagnostics. For unlanded views, use the declared staging
   target without turning that evidence into a per-leg BYOIN run.
10. Leave candidate-wide BYOIN to the designated integrator; never report a SKIP as proof.
11. Stage exact owned paths/hunks, inspect `git diff --cached --check` and the whole cached
    patch, then commit at your desk; hand in only when the work is coherent for the team.
12. Handoff hash or uncommitted state, verification verdict, exact paths, migration steps,
    unrelated failures, and anything not tested or done.
