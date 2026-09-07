# RONIN WORKTREES — get, update, and hand in

This Routine equips an Agent for managed worktrees when both the repository and the Agent
choose them. It does not turn every checkout into a managed desk.

**Your brief names no desk.** Work in the named checkout under the repository and owner's
ordinary Git instructions. There is no lease, selected branch, hand-in target, or managed
lifecycle record, and the absence of a desk is not an error. Do not initialize a repository
or invent managed machinery merely because this Routine is present.

**Your brief names a desk.** Work there. A multi-repository assignment may have one desk
per repository. If work takes you to another managed repository, get its desk with
`tejun-desk open <repo>`. Before a write, compare `tejun-desk status --assignment` with
the brief. If they disagree, put the exact discrepancy on the team wipeboard and wait for
the corrected status; do not create the missing branch or worktree yourself.

### The three verbs

| Verb | Tool | Meaning |
|---|---|---|
| **get a worktree** | `tejun-desk open <repo[:branch]> [--source dev\|team]` | A new assignment defaults to current local `dev`. When joining a Team already mid-work, explicitly choose `team`. The tool reports the exact resolved source SHA separately from the unchanged hand-in line. |
| **update it** | `tejun-desk sync <repo[:branch]>` | Merge what local `dev` has accepted. `status` reports distance from `dev`; 20 commits behind is information, never a block. |
| **hand it in** | `tejun-desk hand-in <repo[:branch]>` | Give the committed desk delta to the team's review line. The isolated candidate includes current local `dev`, accepted team delta, then desk delta. |

`tejun-desk status` reports saved and unsaved files, distance from local `dev` and the team
line, pending updates, the last receipt, exact source choice and SHA, base, and dependency location. Read it when
something surprises you; `tejun-desk receipts` shows what hand-in recorded.

The source choice is deliberately simple guidance. Start a fresh assignment from `dev`;
join ongoing Team work from `team`. If those descriptions do not make the right source
obvious, ask the team lead. The lead can choose centrally with `tejun-desk assign
<repo[:branch]> --session <name> --team <team> [--source dev|team]`. Neither choice grants
permission or changes where the desk hands in.

### The four boundaries

- **Commit** is an ordinary checkpoint on the private desk. It publishes nothing.
- **Hand-in** admits committed work to the team review line. It is not repository-wide
  verification. Never `git push`.
- **Team promotion** is the lead's act: verify the review line and admit it to local `dev`.
- **Git push** means remote publication only. Desk and team branches stay local.

Commit coherent checkpoints and run the smallest relevant test. The Team Lead owns full
repository verification at promotion. A hand-in conflict stays in its isolated candidate
and names the files; the desk remains live for resolution. An empty update and policy
facts are ordinary output, not new gates.

Right after `ACCEPTED`, the tool says whether the called desk is level with its line and
names any unsaved or untracked files excluded from hand-in. `status` provides the same
facts on request.

### Finish the assignment

Closing a desk and ending a session are separate acts. A desk is finished when its
hand-in has been promoted, not when it has been accepted. At final handoff, hand in the
assignment and keep the desk until promotion tells you the hand-in is on local `dev`;
then close it. Promotion tells you itself, in your tile and on the team wipeboard; you
do not ask and you do not poll. While a hand-in waits on the review line, a correction
the lead asks for is a commit and a second hand-in on the same desk. Do not retain a
promoted, level desk merely because the session may receive later work: the session
remains alive at the project root, and the next assignment gets a fresh desk from current
local `dev`. Hand-in itself does not close a desk.

The house owns cleanup of candidates, locks, staging, temporary refs, and other managed
scratch state. It never consumes a live desk during hand-in, and cleanup is not an Agent
pruning chore.
