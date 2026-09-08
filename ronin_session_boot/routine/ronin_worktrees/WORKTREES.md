# RONIN WORKTREES — get, update, and hand in

**Your brief names no desk.** That means nobody has opened one for you yet — not that you
work without one. Run `tejun-desk open <repo>` before your first write: it resolves your
capability against the repository's profile and either hands you a desk or says this
repository works in the checkout, which is then the reason to work there, initializing
nothing. `NO-DESK` from `status` means none is recorded for this session, never that desks
are unavailable. Agents share one home checkout, so committing to the working line inside it
puts your work where everyone builds from with no hand-in, and two Agents in one file there
collide unnoticed.

**Your brief names a desk.** Work there, one desk per repository; open another
repository's with it. Before a write, compare `tejun-desk status --assignment`
with the brief. If they disagree, put the exact discrepancy on the team wipeboard and
wait for the corrected status; do not create the missing branch or worktree yourself — a
contradiction is the one case where you wait rather than open.

### The verbs live in the tool

**Run `tejun-desk --help` before your first desk command — every Agent, every time.** It
carries every verb, its flags, which one is destructive and what each does, and it stays
right when this page has aged. Three carry ordinary work: `tejun-desk open <repo>` gets the
desk, `tejun-desk sync <repo>` merges what `dev` has accepted, and `tejun-desk hand-in
<repo>` gives the committed delta to the team review line. Read `tejun-desk status` when
something surprises you; distance from `dev` is information, never a block. What follows is
the judgment the help does not carry.

### The four boundaries

- **Commit** is an ordinary checkpoint on the private desk. It publishes nothing.
- **Hand-in** admits committed work to the team review line. It is not repository-wide
  verification. Never `git push`.
- **Team promotion** is the lead's act: `bin/ronin-promote <team>` verifies the review line
  and admits it to local `dev`, writing the receipt the later `dev → master` PR must carry.
- **Git push** means remote publication only. Desk and team branches stay local.

Commit coherent checkpoints and run the smallest relevant test. A hand-in conflict stays in
its isolated candidate and names the files; the desk remains live for resolution. An empty
update and policy facts are ordinary output, not new gates.

**Leading changes what you may admit, not where you work.** The lead owns full repository
verification at promotion, and their own code still reaches the line by desk and hand-in
like every member's: you are the only Agent who *can* skip that, and being able to is not
permission. Work reaching `dev` outside the promotion door is in no receipt, and rides into
the release under one raised for another candidate. Made lead after birth? This part is
yours too.

Right after `ACCEPTED`, the tool says whether the called desk is level with its line and
names any unsaved or untracked files excluded from hand-in. `status` provides the same
facts on request.

### Finish the assignment

For ordinary close, keep the desk until promotion reports its hand-in on local `dev`; do
not poll. Corrections are another commit and hand-in on the same desk. A promoted desk may
close while its Agent stays live at the project root, ready to get a fresh desk later.

For final self-shutdown, run `tejun-harakiri`. It closes every clean desk whose tip is
contained in its Team line — an `ACCEPTED` hand-in is enough; promotion and manual close
are not required — then ends the Agent. Dirty, pending/rejected, unique, shared, or
occupied work keeps everything alive and returns exact next actions; nothing is discarded.

The house owns cleanup of candidates, locks, staging, temporary refs, and other managed
scratch state. It never consumes a live desk during hand-in, and cleanup is not an Agent
pruning chore.
