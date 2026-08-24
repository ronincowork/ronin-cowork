# Agent Configuration — current implementation README

Status: **parked after this documentation-only refresh**. The destination is committed and
wired on `dev`, but it is a preview-quality implementation, not release-ready. Do not resume
feature work until the owner or `@view_mgr` explicitly un-parks it after League, Team and New
Team and supplies the shared Workspace Kit convergence ruling.

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

The view does not fetch or persist a draft. New Team owns the draft lifetime. `enter()` reads
the current shared selection; `open()` may also be called directly with a draft and seat id.

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

## Owned files

Agent Configuration owns:

- `public/js/agent-config.js` — view lifecycle, Check/Apply/Revert and draft integration.
- `public/js/agent-config-fields.js` — eleven controls, unset round-trip and field reasons.
- `public/js/agent-config-preview.js` — composed brief and resolved-value display.
- `wip/buildouts/AGENT_CONFIGURATION.md` — this handoff.

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

The initial feature implementation is commit `9294446`. Shared destination wiring landed in
`d36b440`. Later draft-controller integration is already present in the current tree; verify
history and live code again when resuming rather than treating those hashes as tip.

## Workspace Kit contract and known deviation

The view reaches the Kit only through `WorkspaceKit`:

- `kit.layouts.createAgentConfigurationLayout(configuration, preview)` supplies the two
  named layout slots. It guarantees geometry, not feature behavior.
- `createSurface` supplies both Surface shells and standard Surface states.
- `createForm`, `createField` and `createNotice` supply the editor structure and validation
  presentation.

The Kit now also supplies `createAction` and `createActionBar`. **Agent Configuration does
not consume them yet.** Its `.ac-actions` container and Check/Apply/Revert buttons are built
with raw DOM elements, and the bar is appended beside the Kit form instead of using the
Kit's action primitives / form action slot. This is the known action-bar deviation under
the pending five-surface convergence ruling. Do not silently normalize it before that
ruling; when authorized, move all three actions as one bounded convergence leg and preserve
their behavior, titles and dirty-state semantics.

There is no Agent Configuration feature stylesheet. Its two-column ratio currently comes
from shared Workspace Kit CSS. Visual quality and any shared geometry change remain parked
pending the foundation ruling.

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

The view keeps `draft`, `seatId` and `applied` in module-instance memory. A browser refresh
loses this local editing context; durable per-view draft persistence is not implemented.

## Verification contract

Use only the command declared by `docs/test-protocols.md`:

- `bin/ronin-byoin --gates` before landing ordinary repository work.
- `bin/ronin-byoin --ui` for this destination because it changes rendered UI, browser flow,
  layout and visual composition.

Run the appropriate BYOIN mode once after a finished implementation leg. Do not assemble a
hand-written sequence of checks. A SKIP is unverified, not a pass. The pre-push and PR tier
does not substitute for the required rendered proof.

No verification was run for this documentation-only refresh because the assignment
explicitly prohibited tests. No current rendered verdict is claimed here.

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
2. `stated_by` is absent. Resolved rows show values but not the layer and file that stated
   each value. That attribution belongs to the existing server resolver and
   `POST /api/launch/preflight` response contract; no Agent Configuration module owns it,
   and the browser must not infer it.
3. The action bar deviates from the current Kit action primitives as described above.
4. There is no feature styling, and shared layout geometry has not received the pending
   cross-surface ruling.
5. Draft/editing context is not durable across refresh.
6. The preview renders only the currently enumerated resolved rows, not the full ruled
   read-only answer and birth reading list.
7. There is no current, trustworthy `--ui` verdict against this destination.

## Exact resume checklist

Do these in order; stop rather than guessing when a required ruling is missing.

1. Confirm the owner has explicitly resumed Agent Configuration after League, Team and New
   Team.
2. Read this file completely, then read the latest `five-eyes` wipeboard Brief/posts and
   the shared Workspace Kit convergence ruling.
3. Confirm branch `dev`; inspect `git status`, `origin/dev..HEAD`, and history from
   `9294446..HEAD`. Preserve every unrelated worktree change.
4. Re-read the live versions of all four owned files and the consumed Kit/draft/controller
   seams listed above. Treat this README as a map, not evidence that the tree is unchanged.
5. State to `@view_mgr` the single bounded leg, touched paths and explicit exclusions before
   editing shared CSS or integration files.
6. First eligible leg: apply the shared action-primitive ruling to Check/Apply/Revert only,
   if that ruling names Agent Configuration. Preserve behavior and verify the leg before
   starting visual work.
7. Next eligible leg: implement only the ruled Agent Configuration geometry/feature styling.
   Do not broaden a local visual task into a five-surface foundation rewrite.
8. Keep `stated_by`, persistence and expanded resolved readings as separate legs requiring
   their own contracts; never build a browser-side cascade as a shortcut.
9. After each completed implementation leg, update this README by deleting the finished
   checklist item and stale limitation. Do not accumulate another historical diary.
10. When the final UI-affecting leg is complete, run the project-declared BYOIN mode only,
    read the single verdict, and report every SKIP as unverified.
11. Stage only owned/explicitly authorized paths. Commit and push verified work to `dev`
    only. Never merge or push `master`; a PR is not authorization to merge.
12. Once the whole destination meets its definition of done, delete this build-out file in
    the final verified commit.

## Parked boundary

After this documentation refresh, Agent Configuration is parked again. Until explicitly
resumed: no feature edits, tests, staging, commits, pushes, service changes, PR actions or
master operations.
