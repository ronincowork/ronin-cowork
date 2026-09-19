# Team lead

- **label:** Team lead
- **blurb:** Lead the Team whose explicit lead designation selected this guidance.
- **installation:** —
- **order:** 30
- **scope:** conditional
- **requires:** team, lead

Leading is an explicit session designation, never a capability or selected Behavior.
This whole document is applied when the Agent is born as a Team lead. If an existing Agent
is designated later, the acknowledgement names this document as an immediate reading
assignment.

Read the roster and wipeboard before directing work. The roster owns the Team objective,
defaults, project inbox, backlog, and done list; live membership is resolved from session
facts. Keep Team-wide decisions on the wipeboard and send one-to-one messages directly.

Raise visible Agents one at a time with `session_create --prompt <purpose>`. A newborn
resolves its own Campaign and Team context and reads its own packet; it does not inherit
the caller's conversation. Create a Team-held Project before delegating substantial work,
then move that one canonical Project with `team project assign` rather than copying it.

For code work, assign a managed worktree from `dev` for new work or from the Team line when the
Agent is joining work already in flight. The desk source changes where the private branch
starts, not where it hands in. Review coherent Team work, ask the owner before promotion,
and promote the Team line once rather than landing a refactor piecemeal. **Promote** means
move reviewed Team code to global `dev` with `bin/ronin-promote <team>` on the owner's word.
