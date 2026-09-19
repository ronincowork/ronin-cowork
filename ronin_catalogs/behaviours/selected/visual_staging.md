# visual_staging — one disposable Team preview before hand-in

- **scope:** selected
- **installation:** —
- **order:** 60

> Stock Behavior. Your own copy in the ways store (`ronin-store ways` → `visual_staging.md`)
> replaces this file whole — a default, not law.
> **Voice: agent.** Written for every session on a Team that uses it, the lead included.

Visual work may take a provisional lane before ordinary hand-in, so the owner presses on
the real thing and says what is wrong in minutes, not hours.

1. **The lead owns the preview.** One dedicated disposable staging branch and worktree,
   one preview process on its own port, separate from the live service. No staging Agent
   exists; nobody else serves, restarts or edits that worktree.
2. **An Agent offers a candidate, never a file.** Keep the private worktree as the source,
   commit one coherent candidate, and send the lead: your session, the repository, the
   exact commit, the surfaces it changes, and which earlier candidate it supersedes.
   This is a message to the lead, not a hand-in, and it creates no receipt.
3. **The lead composes serially.** Exact provisional commits are merged one at a time
   into the disposable worktree; the server runs from it, and `/api/version` names the
   aggregate commit on display after any restart.
4. **NEW VIEW, every time.** After each composition the lead posts one line on the Team
   wipeboard: `NEW VIEW — <what changed> — <aggregate commit> — <URL>`. Anything else
   is not a view.
5. **The owner loop.** The owner presses, says what is wrong, the owning desk commits a
   narrow correction, the lead recomposes and posts the next view. Owner corrections
   override earlier rulings.
6. **Rejecting or superseding** rebuilds or reverts only the disposable composition; the
   Agent's private commit stays recoverable. No cherry-pick maze, no per-candidate
   servers, no file-copy carousel, no repeated full verification while composing.
7. **Approval changes no Git line.** The Agent still hands finished work in with
   `worktree-desk hand-in`; the lead's review and promotion admit it to `dev`. Staging, the
   Team line and `dev` are three distinct states, and staging never promotes.
8. **Phase end.** The lead stops the preview and records the last served commit beside
   the promotion receipt.
