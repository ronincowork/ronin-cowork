# teams — how a lead builds and runs one

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `teams.md`) replaces
> this file whole — a default, not law.
> **Voice: agent.** Written for the session that leads, to follow itself.

You are reading this because you LEAD a team — either you were launched as a family's
`default_lead_role` (the pinned first button on a New Session shelf), or the owner
designated you `team_lead` on a live team. Leading is a designation, not a job title:
your `session_role` may be anything, and it may change while you go on leading.

## What a team is

A **team** is the organizing unit of this house. Its durable half is its **roster**
(`GET /api/team-rosters/<team>`): the team's `team_role`, its objective, and the
defaults a launch into it inherits — root, repos, branch. Its live half is the sessions
carrying its tag, derived fresh every time (`tejun-team <team>`, or
`GET /api/teams/<team>/live`). The roster never stores members or leads — each session
says whose team it is on — and a roster with zero live members is a normal state: the
plan without the execution, waiting for you.

Underneath the roster sits the team's **wipeboard** — one file the whole team reads and
appends to (`tejun-wipeboard <team>`). Post decisions and cross-session findings there,
not in your own ladder.

## Raising the team

**Nothing fans out automatically, and that is the design.** You raise supporting
sessions one at a time, as the work actually needs them — not a batch at birth.

1. **Read the roster first.** The objective is the team's brief; the root, repos and
   branch are the context your sessions inherit.
2. **Raise a session through the one launch mechanism** — `POST /api/launch` with a
   `session_role`, a prompt, and `team: <your team>` — or the `+forkit:` macro when the
   new session should inherit your own context. The New Session shelves are the menu:
   pick the `session_role` that fits the work (a `role_family` is a grouping to browse,
   nothing more). Born onto the team, the session is tagged into it, reads the team_role's own reading
   shelf, and finds the objective in its brief.
3. **Or place an EXISTING session onto the team** — its tags are its membership
   (`POST /api/sessions/<name>/tags`, or ask the owner from the tile). A session joining
   late is not re-briefed by ruling; hand it what it needs on the wipeboard.
4. **A team of your own choosing.** Name one and raise into it — a team that exists
   only as its tag is an ordinary team; the session is born tagged onto it, told it is
   tag-only, and inherits no root or objective. Give the team a roster
   (`POST /api/team-rosters` with a name, a `team_role`, an objective) when it has a
   brief worth inheriting. Name it the way tags are named: lowercase, boring, typeable.

## Running it

- **Catch up through the tape** — `tejun-rireki <member> since` — before touching any
  member; the durable record is authoritative. `tejun-peek` only when there is no tape.
- **Control-check before you type.** Every member keeps its dial: a 👤 session is the
  owner's own hands, a 👁 session is watch-only. A dial you cannot write to is the
  owner's to flip, not yours.
- **Address the team as one** with `+team:` and the wipeboard, instead of narrating to
  members one by one through the owner.
- **Escalate what is the owner's** — a ruling, a merge, a spend — rather than sitting on
  it. That is most of what leading is.
- **Membership is nobody's fortress.** Anyone may move a session between teams — you,
  the owner, the session itself. Keep the roster's objective current instead of policing
  the edges; a changed objective reaches every member on their next letter reread.
