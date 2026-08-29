# Agent Configuration — current implementation README

Status: **shipped on `dev`, incomplete, and ready for a fresh successor**. The destination is
committed and wired, but remains preview-quality rather than release-ready. League, Team and
New Team have moved ahead; there is no remaining sequencing hold or unresolved Workspace Kit
foundation ruling. The remaining work below should still be cut as separate bounded legs.

This file is the current handoff. Historical planning, investigations and superseded resume
notes were removed so a successor has one answer rather than a chronology.

## Purpose

Agent Configuration edits **one proposed session seat** in New Team's canonical draft and
previews what that seat would be born with.

It has two Surfaces:

1. **Seat configuration** — eleven launch-time fields, with absence preserved.
2. **Preview** — the server-composed brief and dry-run resolved seat.

The route is `agent-config`. The intended entry is a seat selected from New Team. Agent
Configuration owns neither the Team draft nor the launch schema; it receives the draft and
`seat_id`, edits the matching seat, and hands the change back to the shared draft controller.

Agent Configuration **coexists with the Sessions 1 / 2 / 4 raw Tile grid**. It does not
replace, wrap or migrate that grid. `main.js` registers `sessions` against `#grid` and
registers Agent Configuration as a separate guarded workspace destination. A failure in this
preview destination must not take down the owner's working terminal Tiles.

## Non-goals and hard boundaries

- No terminal Tile, socket, listener or simulated terminal. A proposed seat has no session.
- No Channel service, chat, composer, session controls, macros, saved launch or live-session
  management.
- No second launch schema and no browser-side copy of the resolution cascade.
- No roster write, session creation or file write from Apply.
- No editing of `seat_id`, `presented_family`, `resolved`, `outcome`, seat order,
  `lead_seat_id`, or any Team-level definition field.
- No editable `agent` field. A plain terminal is selected through the existing `OpenShell`
  session role and resolves `agent: none` on the server.
- `role_family` is presentation/template grouping only and is not a launch field or
  precedence layer.

The ruled resolution order remains:

```text
system < team roster context < session_role < explicit launch fields
```

## Route and data flow

```text
New Team selects a seat
  -> team-draft-controller records draft + seat_id
  -> workspace enters agent-config
  -> Agent Configuration reads selectedDraftSeat()
  -> open(draft, seat_id) paints controls without emitting a change

Check
  -> new-team-preflight POSTs the whole canonical draft
  -> POST /api/launch/preflight runs the real server resolver
  -> matching seat verdict paints field reasons, composed brief and resolved rows

Apply
  -> replaces only the matching draft.seats entry
  -> preserves seat_id
  -> calls changedTeamDraft()
  -> creates no session and writes no roster or file

Revert
  -> restores the last applied seat held by this view
  -> does not restore defaults and does not materialize inherited values
```

The view does not fetch or independently persist a draft. New Team owns the draft lifetime
and stores the canonical object in per-tab workspace state. `enter()` reads the current shared
selection; `open()` may also be called directly with a draft and seat id. Apply calls
`changedTeamDraft()`, whose New Team subscriber persists the edited canonical object.

## Seat contract

The editable fields are exactly:

`session_role`, `name`, `mode`, `prompt`, `project_root`, `cmd`, `mcp`, `tags`,
`seed`, `inject`, `reference`.

`team` is not a seat field; one draft is one Team. `tags` means additional memberships.

Absence is data, not a UI placeholder:

- `mcp`, `cmd`, `project_root` and `name` use `null` for unset/inherit.
- `session_role: ""`, empty prompt/inject/reference strings and empty arrays are stated
  values, not absence.
- `mode` is always stated.
- Opening and applying an unchanged seat must not materialize a default.
- Nullable controls expose an explicit `inherit` path; `mcp` has inherit/on/off.

Preflight `reasons[]` are shown in the server's words. A reason whose `field` matches an
editor control appears beneath that field; an unmatched reason goes to the form notice.
Batch concerns remain New Team's responsibility.

## Server attribution contract

`resolveLaunchProfile()` records the winning system/session-role source while it resolves
the definition cascade. `resolveForm()` is the only layer allowed to complete that map with
Team roster context, project-root fallback, explicit launch choices, command resolution and
MCP deliverability. Its `Resolved.stated_by` is a map from resolved key to one or more
`{ layer, source }` records. `source` is the exact path when a file stated the value and a
named runtime input such as `launch request` or `proposed Team draft` otherwise.

`POST /api/launch/preflight` publishes that map unchanged through its pure
`previewResolved()` mapper. `agent-config-preview.js` formats only the returned records; it
does not inspect draft fields or reproduce precedence. Additive readings may name multiple
sources. A missing key is rendered as “source not reported”, never guessed.

The same payload carries the complete server-resolved launch-profile readings
(permissions, acknowledgement gate, opening template, posture, label and MCP default/lock),
durable Team context (objective, repositories, branch, wipeboard and state), and
`birth_reading`. `birth_reading` is the literal assisted-mode list passed into brief
construction after the server combines the boot shelf with explicit seeds; manual and
agentless births return an empty list. The browser renders that array unchanged and never
walks shelves or reconstructs reading precedence.

## Owned files

Agent Configuration owns:

- `public/js/agent-config.js` — view lifecycle, Check/Apply/Revert and draft integration.
- `public/js/agent-config-fields.js` — eleven controls, unset round-trip and field reasons.
- `public/js/agent-config-preview.js` — composed brief and resolved-value display.
- `public/css/agent-configuration.css` — governed feature hierarchy and meaning only.
- `docs/agent-configuration.md` — this persistent implementation and resume contract.

Committed foundation and integration seams consumed but **not owned** here:

- `public/js/new-team-draft.js`
- `public/js/new-team-preflight.js`
- `public/js/team-draft-controller.js`
- `public/js/workspace-kit.js`
- `public/js/workspace-primitives.js`
- `public/js/workspace-layouts.js`
- `public/js/main.js`
- `public/index.html`
- `public/style.css`

Canonical server seams consumed by this view are `src/launch-profile.ts`, `src/spawn.ts`,
`src/team-rosters.ts`, and `src/routes/launch-preflight.ts`. They are shared launch
architecture, not browser-feature ownership; attribution changes there must preserve the
one resolver used by both launch and preflight.

The initial feature implementation is commit `9294446`. Shared destination wiring landed in
`d36b440`. Later draft-controller integration is already present in the current tree; verify
history and live code again when resuming rather than treating those hashes as tip.

## Workspace Kit contract

The view reaches the Kit only through `WorkspaceKit`:

- `kit.layouts.createAgentConfigurationLayout(configuration, preview)` supplies the two
  named layout slots. It guarantees geometry, not feature behavior.
- `createSurface` supplies both Surface shells and standard Surface states.
- `createForm`, `createField` and `createNotice` supply the editor structure and validation
  presentation.

Check, Apply and Revert consume Kit `createAction` and `createActionBar`. Their bar lives in
the Kit form's `actions` slot, so keyboard order is the eleven seat controls followed by
Check, Apply and Revert. `.ac-actions[data-dirty]` remains the feature-owned dirty-state seam;
the Kit owns action construction, semantics and shared presentation.

`public/css/agent-configuration.css` is statically linked once from `public/index.html` and
contains one `@layer app` block. It uses only `ac-*` hooks and shared tokens for field rhythm,
dirty Apply emphasis, brief readability and resolved-row hierarchy. Workspace Kit still owns
the two-Surface columns, responsive stacking, Surface/form/action primitives and every
`wk-*` rule; the feature sheet reconstructs none of them.

## Lifecycle and state

- Construction creates both Surfaces, the form and the action bar once.
- `enter()` reads `selectedDraftSeat()`. With no selection it shows the empty editor state.
- `open(draft, seatId)` binds the supplied draft and seat, snapshots the last-applied value,
  paints fields without mutating the draft, and clears the preview to “Not resolved yet”.
- Editing marks the action bar dirty but does not preflight on every keystroke.
- Check sets the editor loading state, runs one whole-draft preflight and selects the current
  seat's verdict. Transport/tool failure is shown as `failed`; a refused draft is not
  misreported as a broken tool.
- Apply replaces only the selected seat, calls `changedTeamDraft()` and resets dirty state.
- Revert repaints the last-applied snapshot without emitting a draft change.
- `leave()` currently has no cleanup because this view owns no transport or subscription.

The view keeps `draft`, `seatId` and `applied` in module-instance memory while it is open.
The draft itself is durable per browser tab because New Team persists the shared canonical
object after `changedTeamDraft()`. A refresh restores the draft through New Team; the
selected Agent Configuration seat and this view's last-applied snapshot are not separately
persisted.

## Verification contract

Follow `docs/test-protocols.md`. Ordinary implementation legs use direct dogfood and scoped
diagnostic evidence and do not run BYOIN before commits or pushes. One designated integrator
runs the appropriate BYOIN mode once on the exact `dev → master` release candidate. A SKIP
in that verdict is unverified, not a pass.

Current evidence is deliberately narrow:

- `f84f908` added smoke coverage proving the Sessions 1/2/4 Tile layout, mapping and live
  paint survive round trips through League and Team. This supports the coexistence contract,
  but it does **not** enter Agent Configuration.
- No current scoped browser journey proves the Agent Configuration editor/preview itself.
- The action-convergence leg is guarded by `scripts/check-workspace-kit.mjs`, which requires
  the Kit actions, action bar and live form action slot and refuses raw feature-local action
  buttons. The visual-hierarchy leg extends that scoped contract over the feature hooks and
  stylesheet, while `scripts/check-css.mjs` enforces static loading, app-layer, tokens and
  namespace isolation. Focused launch tests cover explicit, Team roster, session-role and
  system attribution, the exact assisted/manual birth-reading contract, expanded profile
  and Team readings, and unchanged preflight publication. The static Kit check also requires
  the browser and preflight mapper to consume/publish `birth_reading`. Exact scoped results
  belong in the commit handoff. Release-candidate BYOIN remains the designated integrator's
  responsibility.

When feature work resumes, the acceptance proof must cover at least:

- unchanged open/apply round-trip for minimally and fully stated seats;
- `mcp` inherit/on/off and per-field return to inherit;
- blank role and OpenShell/agentless behavior;
- field-local and form-level refusal rendering without losing typed work;
- server-composed assisted brief and byte-preserved manual prompt;
- Apply and Revert boundaries;
- navigation into and out of Agent Configuration without affecting Sessions Tiles;
- keyboard order and desktop/tablet/phone composition.

## Known limits — not release-ready

1. The owner's current verdict is that the previews are visually awful and not
   release-ready.
2. The selected seat and last-applied snapshot are not separately restored on refresh,
   although the canonical New Team draft is persisted per tab.
3. There is no current, trustworthy scoped browser verdict against this destination, so the
   owner's earlier not-release-ready visual verdict has not been superseded by inspection.

## Exact resume checklist

Do these in order; stop rather than guessing when a required ruling is missing.

1. Read this file completely, then read `docs/workspace-kit.md`, `docs/new-team.md`, and the
   latest `five-eyes` wipeboard Brief/posts. Persistent docs win over `wip/buildouts`.
2. Confirm the owner has assigned a bounded Agent Configuration leg; do not infer release,
   master, service or PR authority from the assignment.
3. Work at your repo desk (`ronin_session_boot/assignment/DESK_CONTRACT.md`); inspect
   `git status`, `git branch -vv` (ahead of your team line), and history from
   `9294446..HEAD`. In a shared checkout, preserve every unrelated change.
4. Re-read the live versions of all four owned files and the consumed Kit/draft/controller
   seams listed above. Treat this README as a map, not evidence that the tree is unchanged.
5. State to `@view_mgr` the single bounded leg, touched paths and explicit exclusions before
   editing shared CSS or integration files.
6. Next bounded product leg, only when assigned: restore the selected Agent Configuration
   seat and this view's last-applied boundary after refresh. Persistence must extend the
   canonical draft/selection contract rather than create a feature-local draft store.
7. Keep Kit geometry in the Kit and feature meaning in `ac-*`; do not broaden a local leg
   into a five-surface foundation rewrite.
8. Never build a browser-side cascade or shelf walk as a persistence shortcut.
9. After each completed implementation leg, update this README by deleting the finished
   checklist item and stale limitation. Do not accumulate another historical diary.
10. Record scoped rendered evidence for the leg; the designated integrator owns the single
    release-candidate BYOIN verdict and reports every SKIP as unverified.
11. Stage only owned/explicitly authorized paths. Commit at your desk; hand in coherent
    work to your team line. Team promotion to `dev` is the lead's. Never merge or push
    `master`; a PR is not authorization to merge.
12. Keep this persistent README current. Transient buildouts are not the handoff and must not
    become the only place a decision survives.

## Successor boundary

The next concrete product leg is expanding the server-returned resolved readings and birth
reading list. Selected-seat restoration remains an independent behavior leg. A safe scoped
browser journey still owes visual acceptance for the styling and attribution already
shipped.
