# New Team — current README

## Purpose

`#/new-team` defines one durable Team and optionally raises zero, one, or many sessions
onto it. The flow is: define the Team, add/configure proposed seats, preflight the whole
draft, create or adopt the roster, launch accepted seats in order, optionally designate a
lead, then retain a receipt for review and retry.

An empty Team is valid. `team_role`, objective, root, repositories, branch, wipeboard,
seats, and lead may all be blank. Only a valid Team name is required at roster creation.

## Non-goals

New Team does not:

- replace the Sessions destination or its raw one/two/four terminal Tile grid;
- render a terminal Tile or own a Channel service;
- copy members or leads into `team_roster`;
- create another resolver, form system, router, state store, or launch API;
- roll back sessions successfully born before a later failure;
- require or infer a lead;
- send `role_family` as a session fact;
- manage membership separately from live session tags.

Sessions remains the general-purpose raw terminal workspace. New Team is a Team creation
workflow beside it, not its successor.

## The `#/new-team` flow

### Define the Team

The left Surface edits the seven durable roster fields: `name`, `team_role`, `objective`,
`project_root`, `repos`, `branch`, and `wipeboard`. The name is sanitized while typing and
settled on blur. The other fields may be blank. Team roles come from
`GET /api/team-roles`, with free text valid when the catalog is empty. Roots come from
`GET /api/project-roots`.

Preflight shows adoption before creation:

- sessions already carrying the Team tag become members because membership is derived;
- a custom wipeboard with the Team token is adopted because the Team wins its name;
- adopted sessions do not receive birth-only `team_role` reading retroactively.

### Build the proposed roster

The right Surface holds zero or more canonical seats. `Add proposed session` calls
`createSeat()`; no caller restates its defaults. Each seat opens Agent Configuration,
which edits the same object through `team-draft-controller.js` and uses New Team's real
preflight response. There is no second schema or launch body.

The four nullable fields—`name`, `cmd`, `project_root`, and `mcp`—preserve unset distinctly.
`null` means “let the server resolve it.” Empty strings, arrays, and `false` are stated
values. `bodyOf()` omits nulls rather than materializing browser defaults.

A seat may be selected as the optional lead. `lead_seat_id: null` is always valid.

### Check or create

`Check seats` calls `POST /api/launch/preflight`. It creates nothing. The server runs the
real `resolveForm`, including proposed roster defaults before commit, and returns adoption,
capacity, and per-seat readings or refusals.

One primary action serves every transaction shape:

- zero seats: **Create Team**;
- one or more seats: **Create Team and raise sessions**;
- unresolved seats after commit: **Retry unresolved sessions**.

All three call `launchDraft()` in `new-team-launch.js`.

## Session-defined Team membership

The model is deliberately small:

```text
session name + zero/one/many Team tags
```

A seat's `team` is its birth Team. Its `tags[]` are additional memberships. The launch
resolver puts the birth Team first and enforces the total tag cap. After birth, live
session tags are the membership record.

`team_roster` stores Team identity, purpose, defaults, wipeboard, and lifecycle only. It
never stores members or leads. Changing Team membership changes session tags and never
kills the session. A session with no Team tags is an ordinary rōnin under Unassigned.

## The single KISS create/raise transaction

`launchDraft()` is the only create/raise controller:

1. Preflight the whole canonical draft before irreversible creation.
2. If preflight is broken, create no Team.
3. If every seat in a non-empty draft is refused, create no Team.
4. Create the roster once through `POST /api/team-rosters`, or reuse the roster already
   committed by this transaction.
5. Record one identity scalar: `transaction.committed_team`.
6. Launch eligible seats sequentially through the one `POST /api/launch` door.
7. Continue after seat-local HTTP 400/409 failures.
8. On HTTP 429, record that seat and skip the remaining queue.
9. On other server/transport failures, halt the queue and preserve prior births.
10. If the optional lead seat was born, use the existing `team_lead` endpoint.
11. Persist outcomes after every material change for review and targeted retry.

There is no rollback. Born sessions remain alive. Retry selects only seats without a born
receipt and cannot recreate a born session.

Every side effect after roster commit uses `committedTeam(draft)`: retry preflight, every
launch body, lead designation, receipt, and Open Team navigation. Team-definition controls
are not locked. They cannot redirect the transaction because side effects use the scalar,
not mutable `draft.team.name`. There is no copied committed definition, drift controller,
pre-cutover migration, or membership registry.

## Receipt and retry

The persistent transaction Surface shows the committed Team, roster status, completion
time, transaction error, one seat row in draft order, every born launch receipt, exact
refusal/skip reasons, targeted retry actions, and optional lead delivery result. It does
not fade like a toast. Open Team navigates to `#/team/<committed Team>` through Workspace
Kit.

## Owned files

New Team owns:

- `public/js/new-team.js` — destination composition, fields, seats, receipt, lifecycle;
- `public/js/new-team-draft.js` — canonical draft, null semantics, request bodies;
- `public/js/new-team-preflight.js` — preflight client and presentation helpers;
- `public/js/new-team-launch.js` — ordered create/raise/retry controller;
- `public/js/team-draft-controller.js` — canonical draft handoff to Agent Configuration;
- `public/css/new-team.css` — governed feature styling, never Kit geometry;
- `src/routes/launch-preflight.ts` — real whole-draft dry run;
- this README.

Assigned registration seams are not feature ownership: `src/index.ts` registers the route,
`public/js/main.js` registers the destination, and `public/index.html` supplies the root
and stylesheet. Agent Configuration owns its editor/preview modules; New Team supplies the
shared draft and preflight contracts.

## Workspace Kit and CSS contracts

New Team consumes only the hardened Kit: `createSurface`, `createCard`, `createAction`,
`createActionBar`, `createMetadata`, `createForm`, `createField`, `createNotice`,
`createNewTeamLayout`, `workspaceTarget`, `navigateWorkspace`, `viewState('new-team')`, and
`patchViewState('new-team', ...)`.

If a required contract is absent, stop; do not build a local substitute. Workspace Kit
owns geometry, responsive behavior, shared controls, Surface padding, tokens, and skins.
`public/css/new-team.css` styles feature meaning only: it does not redefine Kit geometry
or reconstruct `wk-*` classes. Notices, actions, and metadata use their Kit primitives.

Governed CSS inherits every shipped skin's radius, spacing/type, surface color, and font.
Strict skin assertions and Stock restoration are part of UI BYOIN.

## Lifecycle and persistence

On `enter(context)`, New Team restores `viewState('new-team').draft`, registers that same
object with `team-draft-controller.js`, restores controls/seats/receipts, loads root and
Team-role choices, and requests a fresh preflight reading.

Every authored change and transaction outcome is stored with
`patchViewState('new-team', { draft })`. State is per browser tab, so two tabs can hold two
drafts. Agent Configuration returns edits into the same persisted object.

New Team owns no socket, Tile host, resize observer, poll, global key binding, or Channel
service. Leaving needs no terminal parking or resource teardown. Re-entry reuses the view
and refreshes server readings.

## Verification evidence

The approved KISS deletion is local `dev` commit:

```text
1e98f3ea1f67e99240af2617d758f8ffb052ca67
New Team: keep one simple create transaction
```

It contains exactly `public/js/new-team-launch.js`, `public/js/new-team.js`, and this file.
Verification against repaired staging HEAD `52d81db` was:

```text
bin/ronin-byoin --ui
BYOIN: the repo is clean (19 ok, 0 skipped).
```

That includes parse, catalogs, governed CSS, dead exports, docs, vocabulary, boundaries,
tests, Workspace Kit, staging `smoke-ui`, `visual-ui`, stores map, and TypeScript. Strict
workspace-skin assertions and Stock restoration passed. The pre-push tier was not run and
the KISS commit was not pushed as part of that assignment.

## Known limits

- Draft and receipt persistence is per browser tab.
- Partial staffing is valid; no rollback exists.
- Preflight is advisory and launch re-resolves against the changing machine.
- Retry is for unresolved seats in the current committed transaction. Starting another
  Team requires a fresh canonical draft boundary; no automatic reset is claimed.
- Lead SOP delivery obeys Control. “Not delivered” is a receipt, not a failed birth.
- Adopted tag-only members do not receive birth-only reading retroactively.
- The Team-role catalog may be empty; free-text and blank roles remain valid.
- Post-birth membership editing belongs to Team and League.
- New Team does not replace or constrain the Sessions one/two/four raw Tile grid.

## Exact resume checklist

1. Work on `dev`, never `master`.
2. Read this file and `docs/workspace-kit.md` completely.
3. Inspect status, current history, and every owned file; trust the tree over handoffs.
4. Preserve unrelated dirty work.
5. Confirm required Kit contracts exist; stop rather than substitute.
6. Keep one canonical draft and one create/raise controller.
7. Keep members derived from session tags and out of `team_roster`.
8. Preserve null versus stated empty/false values.
9. Use only the named preflight, roster, launch, and lead API contracts.
10. Use direct dogfood and scoped diagnostic evidence; do not run BYOIN for the dev leg.
11. The designated integrator runs one appropriate BYOIN mode on the exact release
    candidate and treats every SKIP as unverified.
12. Stage owned exact hunks and inspect the staged path list before committing.

## Exact dogfood checklist

### Empty Team

1. Open `#/new-team` from League.
2. Enter a unique valid name; leave all other Team fields blank.
3. Leave the proposed roster empty and select **Create Team**.
4. Confirm preflight happens before creation.
5. Confirm the receipt reports the created roster.
6. Select **Open Team** and confirm the empty Team opens.

### One session

1. Enter a unique Team name and add one proposed session.
2. Open **Edit session** and use Agent Configuration.
3. Leave a nullable value inherited and confirm it stays `null` after Apply.
4. Return and select **Check seats**; inspect name, root, command, Control, MCP, and refusal.
5. Optionally select the seat as lead.
6. Select **Create Team and raise sessions**.
7. Confirm the session is born with the Team tag and the receipt uses committed identity.
8. Confirm lead designation/delivery is reported separately from birth.

### Many sessions and partial failure

1. Add at least three distinct seats and make the middle seat produce a 400/409.
2. Run **Create Team and raise sessions**.
3. Confirm seat one is born, seat two refused, and seat three still attempted.
4. Confirm no born session is killed or relaunched.
5. Correct seat two in Agent Configuration and select its targeted retry.
6. Confirm retry preflights again, uses `committed_team`, creates no second roster, and
   launches only the unresolved seat.
7. Confirm all prior outcomes remain in draft order.

### Membership and Sessions compatibility

1. Give a seat additional Team tags and launch it.
2. Confirm the birth Team plus additional tags live on the session.
3. Confirm no member list exists in `team_roster`.
4. Confirm League and Team derive membership from live tags.
5. Open Sessions and confirm the raw one/two/four Tile grid remains available unchanged.
