# New Team — current README

## Purpose

New Team defines **one durable Team** and hands the workspace to it. It is a Surface of
the Cowork space (the `New Team` card in the campaign selector), not a destination of its
own: the owner fills in seven roster fields, presses **Create Team**, and lands in the
Team that was just made, with the form left empty behind them.

An empty Team is valid. Objective, root, repositories, branch and wipeboard
may all be blank. Only a valid Team name is required.

## Non-goals

New Team does not:

- raise sessions, propose seats, or run a launch transaction — **New Agent does that**,
  and its launcher already names the Team a session is born onto;
- render a terminal Tile or own a Channel service;
- copy members or leads into `team_roster`;
- create another resolver, form system, router, state store, or launch API;
- require or infer a lead;
- manage membership separately from live session tags.

## Why staffing is not here (owner, 2026-08-29)

The retired second stage let the owner propose seats, preflight them, and launch them in
order as part of creating the Team. It was a second, worse copy of the New Agent launcher
— which has a team selector, including `＋ new team…` — and its "Edit session" button
navigated the whole workspace out of the campaign space into a standalone Agent
Configuration destination. Worse, its transaction pinned itself to the first Team it
committed: a re-typed name was accepted by the form and then ignored, so a browser-tab
reload was the only way back to an empty New Team.

The KISS shape replaces all of it: **create the Team, land in it, staff it from inside
with New Agent.** Membership was always derived from the tags live sessions carry, so
nothing about the model changed — only the number of ways to write one.

## The flow

The Surface edits the durable roster fields: `name`, `objective`,
`project_root`, `repos`, `branch` and `wipeboard`. The name is sanitized while typing
(the caret never jumps) and settled on blur, because a trailing separator is legal to type
and wrong to create. Team roles come from `GET /api/team-roles`, with free text valid when
the catalog is empty — it usually is, by design. Roots come from `GET /api/project-roots`.

**Create Team** writes once, through `POST /api/team-rosters`. The store's word is the
answer: a name that already has a roster comes back as its refusal, shown under the form,
rather than being guessed at in the browser. The button follows exactly one condition — a
valid name — because that is the only thing the server enforces at creation.

On success the draft is **spent**: it is replaced by an empty one and the host is told the
new Team's name. In the Cowork space that means the workspace holding New Team is handed
to the Team's own surface, exactly as clicking its Cowork card would. Press `New Team`
again and the form is empty, ready for the next one.

## Session-defined Team membership

The model is deliberately small:

```text
session name + zero/one/many Team tags
```

A session's birth Team is its first tag; the rest are additional memberships. After birth,
live session tags are the membership record.

`team_roster` stores Team identity, purpose, defaults, wipeboard, and lifecycle only. It
never stores members or leads. Changing Team membership changes session tags and never
kills the session. A session with no Team tags is an ordinary rōnin under Unassigned.

A Team created here arrives already staffed when live sessions already carry its name as a
tag — membership is derived, so giving a tag-only team a roster adopts it. Those adopted
members were tagged, not born onto the Team, so their birth reading is unchanged:
that reading happens at birth only.

## Owned files

New Team owns:

- `public/js/new-team-form.js` — the Surface: the drawn steps, the one write;
- `public/js/new-team-draft.js` — the team-name rules the surface shares with New Agent;
- `public/css/launch-forms.css` — governed feature styling, never Kit geometry;
- this README.

**The seven-field card is gone** (owner, 2026-08-31, "the old new team and the old new
agent workspaces have been made obsolete by yours"): its surface and its stylesheet are
deleted — Git holds them — and the drawn form is the only New Team. One behaviour did not
come across: the retired card persisted a half-typed draft through the typed view state,
and the drawn form's draft lives in the surface for as long as the workspace holds it.

`public/js/cowork-view.js` composes the Surface into the Cowork space and owns where the
owner lands after a create; `public/js/launch-view.js` does the same in the Launch
workbench, where a Team | Agent toggle chooses between this form and New Agent. Both are
registration seams, not feature ownership.

## Workspace Kit and CSS contracts

New Team consumes only the hardened Kit: `createSurface`, `createAction`,
`createActionBar`, `createForm`, `createField`, `createNotice`, `createNewTeamLayout`,
`viewState('new-team')` and `patchViewState('new-team', ...)`.

If a required contract is absent, stop; do not build a local substitute. Workspace Kit
owns geometry, responsive behavior, shared controls, Surface padding, tokens, and skins.
`public/css/launch-forms.css` styles feature meaning only: it does not redefine Kit
geometry or reconstruct `wk-*` classes.

## Lifecycle and persistence

On `enter(context)`, New Team restores `viewState('new-team').draft`, fills the controls
from it, and loads root and Team-role choices. Every authored change is stored with
`patchViewState('new-team', { draft })`, so a half-typed definition survives leaving the
Surface and coming back. State is per browser tab: two tabs hold two independent drafts.

New Team owns no socket, Tile host, resize observer, poll, global key binding, or Channel
service. Leaving needs no terminal parking or resource teardown.

## Known limits

- Draft persistence is per browser tab.
- A refusal from the roster store is the only collision reading; there is no dry run.
- The Team-role catalog may be empty; free-text and blank roles remain valid.
- Post-birth membership editing belongs to the Team and Cowork surfaces.

## Exact resume checklist

1. Work at your repo desk (`ronin_session_boot/routine/ronin_worktrees/WORKTREES.md`), never on `master`.
2. Read this file and `docs/workspace-kit.md` completely.
3. Inspect status, current history, and every owned file; trust the tree over handoffs.
4. Preserve unrelated dirty work.
5. Confirm required Kit contracts exist; stop rather than substitute.
6. Keep one write and one draft; a second staffing path belongs to New Agent, not here.
7. Keep members derived from session tags and out of `team_roster`.
8. Use direct dogfood and scoped diagnostic evidence; do not run BYOIN for the dev leg.
9. Stage owned exact hunks and inspect the staged path list before committing.

## Exact dogfood checklist

1. Open a Cowork space and drop the `New Team` card into a workspace.
2. Enter a unique valid name; leave every other field blank. Press **Create Team**.
3. Confirm that workspace now holds the new Team, and that its card is in the selector.
4. Press `New Team` again and confirm the form is empty.
5. Create a Team whose name an existing roster already has; confirm the store's refusal
   is shown and nothing is created.
6. Type a name, leave the Surface, come back, and confirm the typed draft is still there.
7. From inside the new Team, raise an Agent with **New Agent** and confirm it joins the
   Team by tag and appears in the roster.
