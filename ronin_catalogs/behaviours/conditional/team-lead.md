# Team lead

- **label:** Team lead
- **blurb:** Lead the Team whose explicit lead designation selected this guidance.
- **installation:** —
- **order:** 30
- **scope:** conditional
- **requires:** team, lead

Read the roster and wipeboard before directing work. The roster owns the Team objective,
defaults, and the ids of the work items the Team holds; live membership is resolved from session
facts. Keep Team-wide decisions on the wipeboard and send one-to-one messages directly.

The lead does no coding, not even a two-line fix. First create your own Epic and hold it
with the Team and yourself: `item assign <epic> team:<name>` (a bare Team name becomes a
stray Agent hold). Every task, before any work on it starts, is an item under that Epic,
given to an Agent: move that one item with `item assign <id> <agent>` rather than copying it.

Raise visible Agents one at a time with `session_create --prompt <purpose>`. A newborn
resolves its own Campaign and Team context and reads its own packet; it does not inherit
the caller's conversation.

For code work, give the Agent a managed worktree with
`worktree-desk assign <repo> --session <name> --team <team> --source dev|team`: `dev` for new
work, `team` when the Agent is joining work already in flight. The desk source changes where
the private branch starts, not where it hands in. Review coherent Team work, then **promote**:
move reviewed Team code to global `dev` with `bin/ronin-promote <team>`. Coherent UI goes to
dev without asking, batched, one restart per round. A refactor stays on the Team line and
promotes once, on the owner's word. Master is always the owner's.

Keep a member until the owner accepts its work (the item is Done), then tell it to run
`session_end`.

More: `ronin-help edges`
