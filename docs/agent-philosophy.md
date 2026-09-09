# The Agent's philosophy of Ronin — a gas pedal and a brake pedal

> **TL;DR.** Ronin does not prohibit. It teaches an Agent where things are, gives it a
> tool for each job, tells it exactly what happened, and lets it choose its own path.
> Both pedals are the Agent's. Nothing here stops a dumb behaviour; everything here makes
> the consequence visible. (Owner, 2026-09-09.)

## The four parts

1. **Knowledge, not rules.** The birth packet says where things are, what the words mean,
   and which verb does what. An Agent that did not know it could ask for something was
   not told; it was never stopped. Fix the packet, not the Agent.
2. **A tool does one job.** It does not decide for the Agent, and it does not do the
   neighbouring job on the Agent's behalf. `open` opens; it does not take custody back.
   `hand-in` publishes to the line; it does not push. `harakiri` ends the Agent and its
   desks together; it does not ask whether the Agent is sure.
3. **An acknowledgement, every time.** What happened, who holds what, and the verb that
   gets the rest: `ACCEPTED … now <sha>`, `KEPT … <why>`, `custody: <holder> — not yours:
   … tejun-desk handoff …`. Failure is said in the tool's own words, never hidden behind
   a green line. When the box is the authority, it is *measured, never asked*.
4. **The Agent chooses.** Gas and brake are both under its foot. It may reopen a desk
   and forget to ask for custody, park forever, or end itself on a whim. Those are its
   mistakes to make, and the acknowledgement is how it learns.

## The one test for a new check

> Is this **completing an expected behaviour**, or **stopping a dumb one**?

Only the first ships. A refusal is allowed exactly where the job *cannot be done* — a
git conflict, a live process inside a worktree being removed, a foreign file on a unit
name, an occupied port — and then it says why and what to do next. Everything else is a
disclosure. *Honey, not sticks.*

The house keeps one brake of its own: nothing is discarded silently. The one destructive
verb, `tejun-desk discard`, wants the exact confirmation it prints; everything else keeps
the Agent's work and returns the next action.

## Where this already lives

The principle was written down piece by piece, in the place each piece bit. This page
is the one place; these are the pieces.

| Piece | Where |
|---|---|
| *Honey, not sticks* — no refusals beyond what git itself cannot do; a check tells, it does not block | [`worktrees.md`](worktrees.md), "Desk lifecycle and recovery" |
| *Measured, never asked* — tmux is the authority on whether tmux runs | `libexec/ronin-coexist.sh`, the existence probe |
| *Disclosed, not asked* — adoption of an existing tmux server reaches the terminal, and does not wait for a yes | `setup.sh`, the coexistence preflight |
| *Offered, never done* — setup detects a missing linger or swap and hands over the line; it holds no root | `setup.sh`, the closing paste |
| *A finding, never an action* — doctor reads and names the remedy; it touches nothing | `bin/ronin-doctor`, "the box" |
| *Never post to acknowledge* — the read cursor is the only acknowledgement on a wipeboard | [`wipeboards.md`](wipeboards.md) |
| *Stay or go* — the desk an Agent lives in is parked or ends with the Agent; nobody asks it to leave | the Worktrees Routine, "Finish the assignment" |
| What Ronin will and will not do to the machine | [`how-ronin-protects-you.md`](how-ronin-protects-you.md) |

When a new mechanism needs a sentence like these, write the sentence where the mechanism
is, and add a row here.
