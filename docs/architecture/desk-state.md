# Desk state — what the owner and the lead see, derived, never prose

> The visible half of the desk model is in `docs/architecture/worktrees.md`. The registry and hand-in have their own
> page (Track 1's); team promotion has its own (Track 2's). This page is only about what
> is SHOWN, where, and where each fact comes from.

## The rule

A **desk** is one repository's branch and the worktree on it; a session has one per repo
it is changing. Everything a person wants to know about a desk — which line it hands in
to, how far ahead, whether it is dirty, parked, pending an update, blocked, when it last
handed in — is a fact git or the desk registry already holds. **No agent is asked to keep
those in its letter.** The letter's `repos[]` says *which* desks (repo + branch, and a
tool may add `worktree` and `line`); the server derives the rest at the moment of asking.

## Where a fact comes from

`src/desk-state.ts` produces one shape (`DeskState`) from two sources:

| Source | When | Answers |
|---|---|---|
| the desk registry (`src/desks/registry.ts`, `listDesks`) | the desk was opened by a tool and has a row | everything, through its own `DeskStatus`: tip, mounted, dirty files, ahead/behind, **pending update, last hand-in, blocked, parked** |
| git, here | the letter lists a repo the registry has no row for — today's shared checkout, or a repo the session added by hand | worktree (from `git worktree list`), line (the upstream, else the name the branch path implies **if that ref exists**), ahead/behind, dirty files, parked (branch with no worktree). Registry-only facts are null — never invented |

`source: 'registry' | 'git'` says which answered. A plain checkout on `dev` is one desk
with no line: `1 desk`, nothing about hand-ins. A manual terminal or a direct repository
gets no invented desk state.

## The routes

| Route | Answers |
|---|---|
| `GET /api/desks?session=<name>` | that session's desks and roll-up, `{ <name>: { session, live, desks, rollup } }`, or `{}` when it is not live; a missing or invalid name is a 400. The browser asks it when a Work Record opens |

The roll-up: `{ desks, private, dirty, pending, parked, blocked, lined }` — `private` is
the sum of commits ahead of a line, i.e. what nobody else can see yet.

## The surfaces

Desks are read when they are shown. Ahead/behind and unsaved files are live git facts with
no write route to announce them, and one surface shows them, so the browser asks at the
moment it shows them.

| Surface | Shows |
|---|---|
| Work Record ladder (tile) | the **Worktrees** section: each desk's worktree, branch, and line, read at open, not held: `GET /api/desks?session=<name>` when the ladder opens (`openLadder` in `public/js/tile.js`, `readDesks` in `public/js/desks.js`); a session with no desk shows the repositories its record lists |

The API carries every path and SHA for anyone who asks.

## What this page does not cover

Opening, syncing, parking and handing in a desk are Track 1's tools (`worktree-desk`). The
notice a sibling gets when the line moves is delivered by the registry's adoption step;
here it only *shows*, as `pending` on the desk until the desk syncs.
