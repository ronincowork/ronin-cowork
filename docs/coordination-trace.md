# Coordination trace — objective to completion

This supports surface seven, [Work Record](contributor-map.md#work-record). Coordination
connects the authored record to Team custody and delivery evidence; it is not a replacement
surface or a new work-record store. Team Kanban derives a view of those authorities.

1. **Objective enters the Team.** The Team lead records an idea or Project in the Team roster.
   The Project has stable identity, outcome, stage, and provenance.
2. **Assignment is accepted.** A visible Agent is launched or assigned with the objective,
   Campaign/Team context, Workspace Folder handle, mandate, behaviors, capabilities, and repository
   placement resolved before birth.
3. **The Agent owns its work.** Assignment transfers a Team-held Project into the Agent's
   work record. `work-record project create` is the other entry when work arrives without
   a Team-held Project; `write` updates the held Project. Stable identity and provenance
   survive custody changes; there is no second shared mutable checklist.
4. **Work produces evidence.** The Agent keeps its record current and commits coherent desk
   checkpoints. Tests, documents, decisions, and exact commits become evidence.
5. **Hand-in publishes to Team review.** `worktree-desk hand-in` admits the committed candidate
   to the Team line or returns an isolated conflict. A private commit alone publishes nothing.
6. **Review and promotion remain distinct.** The Team lead reviews the exact candidate. Team
   promotion verifies and admits the Team line to global `dev`; release review later moves
   `dev` to the stable line.
7. **Team Kanban derives state.** Team Kanban combines Team-held and Agent-held Projects
   with hand-in, promotion, and Git-containment evidence. It never guesses from phase prose.
8. **Completion closes the right records.** The Project moves to Done only when its definition
   of completion is met. Standing truth lands in code/docs; finished temporary plans are
   removed; desk and session cleanup follow their own explicit lifecycle.

For a bounty, GitHub adds the public issue, pull request, and maintainer review around this
trace. GitHub does not replace the contributor's local work record, and Ronin does not expose
their private task progression merely to prove activity.

## Implementation trail

| Step / supporting mechanism | Entry and authority | Focused evidence |
|---|---|---|
| Team-held Project → Agent custody → return | [teams-api.ts](../src/routes/teams-api.ts) → [team-projects.ts](../src/team-projects.ts) → [team-rosters.ts](../src/team-rosters.ts) / [tegami.ts](../src/tegami.ts) | [projects.test.ts](../tests/projects.test.ts), Services `tests/kanban.test.mts` |
| Agent-authored work | [work-record](../ronin_bin/work-record) → [work-record-write](../libexec/work-record-write); [tegami-read.ts](../src/tegami-read.ts) reads the result | [work-record.test.ts](../tests/work-record.test.ts) |
| Messages / wipeboards / Cron jobs | Their writers and APIs in the [state inventory](state-inventory.md) | [message-queue.test.ts](../tests/message-queue.test.ts), [wipeboards.test.ts](../tests/wipeboards.test.ts), [team-jikan-client.test.js](../tests/team-jikan-client.test.js) |
| Private worktree → hand-in | [worktree-desk](../ronin_bin/worktree-desk) → [commands/desk.ts](../src/commands/desk.ts) → [hand-in.ts](../src/desks/hand-in.ts) | [desks.test.ts](../tests/desks.test.ts) |
| Team review → global dev | [promote.ts](../src/promotion/promote.ts), [receipts.ts](../src/promotion/receipts.ts) | [promotion.test.ts](../tests/promotion.test.ts) |
| Derived Team Kanban | Services `kanban/kanban-api.ts` and `kanban/team-kanban.ts` → [team-kanban.js](../public/js/team-kanban.js) | Services `tests/kanban.test.mts`, [team-kanban.test.js](../tests/team-kanban.test.js) |
