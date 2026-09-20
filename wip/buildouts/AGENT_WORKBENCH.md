# Single-Agent Workbench — buildout

## Settled outcome

Ronin has a first-class `agent/:name` Workbench destination for one live session. It uses
the established Workbench frame, surface map, structured-entry precedence, terminal host,
Commons tabs, Team projection, Task Manager, Document and Feedback surfaces. Setup and
launch forms do not redirect through a private shortcut.

The discovery column offers Self, Commons, Team membership, one Task Manager per Team the
Agent belongs to, and the generic surfaces allowed by the Agent profile. Self is the
existing `session.terminal` surface fixed to the destination Agent. Team membership reads
live session tags and writes only through the canonical membership API.

## Cuts and ownership

1. Register `agent` in the shared route/state contract and ViewHost.
2. Add an `agent` Workbench profile and tenant using existing Workspace Kit primitives.
3. Reuse `session.terminal` for Self, `createTabbedSurface` for Commons,
   `createTeamKanban` for Task Manager, and `team-controller.js` for membership.
4. Record the destination and surface data boundaries in the visible-surface and
   Workbench construction maps.
5. Verify structured entry, restoration, profile contents, membership authority, and
   focused client syntax/tests.

`gbrain/6` owns the destination, profile, surfaces, maps, words, and destination tests.
`launch_triage` owns successful-result normalization and changes to `new-agent.js`,
`new-team-form.js`, the shared launch-handoff adapter, and launch-journey tests. Its agreed
standalone spec is `destination: "agent"`, `param: <authoritative name>`, `mode: "replace"`,
with workspace 1 `{ type: "session.terminal", key: <name> }`.

## Gates and finish condition

There is no owner approval gate beyond the authorized #101 WIP. The shared seam must remain
as agreed before either side edits the other's files. The buildout is finished when focused
tests pass, the committed work is handed into `team/gbrain/dev`, and the Project/Work Record
name the receipt and any remaining launch-handoff dependency truthfully.
