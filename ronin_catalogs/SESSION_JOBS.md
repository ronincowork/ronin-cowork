# SESSION_JOBS — what a session is FOR, and who it is while doing it

> **DATA, like `PROJECT_ROOTS.md`.** Nothing here executes. An **`session_job`** is
> what a session is *for* — the button you pressed. It fixes the constants a launch
> must not leave to chance: the dial the session is born on, its michi, the CLI
> permissions posture, whether it acknowledges before acting, and the posture the
> agent takes.
>
> **A kind is also the role.** They were two catalogs saying the same thing — a
> `DraftPlan` session is a planner, a `CutCode` session is a coder — so the posture,
> model bias and match words now live on the kind itself. Two universal axes, chosen
> independently: **`project_root`** (where — `PROJECT_ROOTS.md`) · **`session_job`**
> (what for, and therefore who — this file).
>
> **Why not in `MACROS.md`:** entries there are agent-executed recipes with an action
> table, compiled by `ronin_bin/tejun`. A kind is *mechanical* — Ronin's own code performs
> it, there is no action list to follow — so it would break the compiler's contract.

**Two launch modes.** In **manual** mode none of this file's wording is used at all:
what the owner typed IS the prompt, byte for byte, and only the mechanical constants
below (dial, michi, permissions, tags, directory) apply. The `opening:` templates, the
`posture:` and the ack rule belong to **assisted** mode — the seat Koshi will
eventually fill from one long-form text. Adding "just one helpful line" to manual mode
would make the mode a lie.

**Format:** one `##` heading per session_job, `- **key:** value` lines under it.
`opening:` is the first message template; `{prompt}` is replaced by what the_owner typed.
`ack: yes` appends the read-and-report-first rule (state the job, state what you will
not do, flag anything unclear, then wait) — everything whose work is judgement
acknowledges first; only work with an already-approved plan builds straight away.

**`agent: none` — the seat with nobody in it.** One entry is not an agent job at all:
`OpenShell` opens a session and launches *nothing*, leaving the pane at a shell prompt with
nothing typed into it. So every field that describes an agent is **absent** from that entry
rather than filled with a polite blank — no `model` (no brain is launched), no `posture`, no
`opening`, no `ack` (there is nobody to brief, to acknowledge, or to template a first message
at), and no `permissions` (that is a CLI's permission mode, and there is no CLI). What it
does carry is the mechanical constants that still mean something for a terminal: where it
opens, what it is called, which group it joins, and its `dial`. Ronin's launcher is the only
thing that reads this flag; it is what stops the spawn path typing a command into a pane the
owner wanted left alone.

**Fields:** `icon` · `label` · `blurb` (what the button does) · `ask` (the form's
prompt) · `remit` (one line: what this session is, for humans and Koshi) · `posture`
(how it behaves — inlined into the boot brief) · `model` (bias: which brain this way of
working usually deserves; the project or the launch may override) · `match` (intent
words) · `dial` · `permissions` · `lifecycle` (the michi it starts in) · `ack` ·
`opening` · `agent` (omit it for an agent job; `none` means no CLI is launched at all).

## RiffOnIt
- **icon:** 💭
- **label:** riff on it
- **blurb:** work out what a thing is and what we mean by it
- **ask:** what are we trying to pin down?
- **remit:** Works out what a thing *is* — produces a definition, not a plan
- **posture:** Think in the open and argue with the owner, don't deliver. Name the thing, say what it is not, surface where two of us mean different words. No plan, no legs, no code — a plan is the next session's job, and calling it early is the failure mode.
- **model:** opus
- **match:** riff, define, what is, concept, vocabulary, think about, explore
- **dial:** write
- **permissions:** default
- **lifecycle:** none
- **ack:** yes
- **opening:** Work out what this is: {prompt}. Definition first — what it is, what it is not, and where we are using one word for two things. Argue with me rather than agreeing; produce a definition, not a plan.

## DraftPlan
- **icon:** 🗺
- **label:** draft plan
- **blurb:** plan a piece of work as a doc — no code yet
- **ask:** what are you planning?
- **remit:** Thinks it through and writes the plan — never cuts code
- **posture:** Goal before plan; agree the goal in the owner's words, write the build-out doc, STOP for review. No code, no commits beyond the doc.
- **model:** opus
- **match:** plan, design, think, scope, spec, draft
- **dial:** write
- **permissions:** default
- **lifecycle:** designing
- **ack:** yes
- **opening:** Plan this: {prompt}. Write the plan as a wip build-out doc per the documents SOP (default wip/buildouts/<TOPIC>.md) — goal in the owner's words, legs, constraints, verification, definition of done. A plan, not code.

## CutCode
- **icon:** ✂
- **label:** cut code
- **blurb:** build from an approved plan doc
- **ask:** which doc / what to cut?
- **remit:** Builds from an approved plan — the plan is the contract
- **posture:** Read the plan doc first; cut leg by leg; verify each leg; auto-commit and push verified work; delete finished items from the doc.
- **model:** sonnet
- **match:** build, cut, code, implement, fix, wire
- **dial:** write
- **permissions:** bypass
- **lifecycle:** coding
- **ack:** no
- **opening:** Cut code from the plan doc: {prompt}. Work leg by leg, verify each leg before the next, delete finished items from the doc, and commit + push verified work per CLAUDE.local.md.

## ChaseBug
- **icon:** 🐞
- **label:** chase bug
- **blurb:** chase a fault to its cause and fix the cause
- **ask:** what is broken, and how do you see it?
- **remit:** Chases a fault to its cause before changing anything
- **posture:** Reproduce first, then find the cause — never patch a symptom. Say what you expected, what happened, and what the evidence is; smallest fix that addresses the cause, and verify the original repro is gone.
- **model:** opus
- **match:** debug, bug, broken, crash, fault, regression, why, diagnose, repro
- **dial:** write
- **permissions:** bypass
- **lifecycle:** debug
- **ack:** yes
- **opening:** Chase this: {prompt}. Reproduce it first and say how; find the cause before you change anything; fix the cause, not the symptom; then show the original repro is gone. If the cause turns out to be somewhere the owner did not expect, say so before fixing.

## CheckWork
- **icon:** 🔎
- **label:** check work
- **blurb:** read-only findings work — a session's output, or a sweep of the code
- **ask:** whose work or which paths, and what matters?
- **remit:** Judges work already done — a session's output or a sweep of the code — and reports; changes nothing
- **posture:** Read-only, always: never writes into the session it is watching, never fixes what it finds. Ranked findings with file:line anchors where the target is code; findings go to the owner, not to the author. Says what is good as well as what is wrong, and checks the work against the owner's stated intent rather than adopting its assumptions.
- **model:** sonnet
- **match:** review, check, judge, evaluate, watch, audit, sweep, scan, security, lint
- **dial:** read
- **permissions:** default
- **lifecycle:** review
- **ack:** yes
- **opening:** Check this and report: {prompt}. Read-only — control-check before touching anything, never write into what you are checking, and bring findings to the owner rather than fixing them yourself. Whether the target is a session's work or a body of code is the prompt's business, not a different kind of session.

## WatchCrew
- **icon:** 👥
- **label:** watch crew
- **blurb:** coordinate other sessions — dispatch, unblock, report upward
- **ask:** which group or sessions?
- **remit:** Coordinates other sessions — dispatch, unblock, report upward
- **posture:** Dispatch, unblock, report upward — you coordinate the work rather than doing it yourself. Address sessions via groups (`+tag:`), control-check before touching any of them, and escalate to the owner what is his to decide rather than sitting on it.
- **model:** sonnet
- **match:** manage, coordinate, dispatch, lead, unblock, watch over
- **dial:** read
- **permissions:** default
- **lifecycle:** orchestrating
- **ack:** yes
- **opening:** You are coordinating {prompt}. Catch up on each member with tejun-peek, then report where each one stands. Dispatch the next piece of work, unblock what is stuck, and bring the owner what is his to decide. Control-check before touching any session — a dial you cannot write to is the owner's to flip, not yours.

## OddJob
- **icon:** •
- **label:** odd job
- **blurb:** anything that isn't one of the above
- **ask:** what do you want done?
- **remit:** Does one stated task that fits no other kind — the escape hatch
- **posture:** Take the task as given. If it turns out to be one of the other kinds, say so rather than half-doing it under the wrong posture.
- **model:** sonnet
- **match:** —
- **dial:** write
- **permissions:** default
- **lifecycle:** none
- **ack:** yes
- **opening:** {prompt}

## OpenShell
- **icon:** ❯
- **label:** open shell
- **blurb:** a terminal and nothing else — no agent is launched
- **ask:** name it and say where it opens
- **remit:** A plain terminal for the owner's own hands — no agent, no brief
- **agent:** none
- **match:** —
- **dial:** user
- **lifecycle:** none

---

*Eight entries: seven agent jobs, and one that is the absence of an agent. A kind earns
its place by fixing constants a launch must not guess — a dial, a posture, a michi. If
two kinds differ only in what the prompt says, they are one kind.*

*`OpenShell` is the eighth by the same test, not an exception to it: what it fixes is
that nothing is launched and nothing is typed, which no wording of a prompt can express.
Its `dial: user` 👤 is the other constant it exists to fix — the dial says who OTHER than
the owner may touch a session, and a terminal the owner opened for their own hands is the
one session no outside agent should type into or even read. `write` 🤖 is the right
default for an agent's session, because agents are dispatched to one another; it is
exactly wrong for this one.*

*A session **migrates**: `RiffOnIt` → `DraftPlan` → `CutCode` is one session changing
what it is for, not three sessions. The kind is what it is doing now.*

*Forking is not a kind. Where a session came from is its **origin**, not its purpose —
a fork is a `DraftPlan` (or any other kind) that happened to be seeded from another
session's work. The `forkit` macro carries that context in the handoff doc it writes.*
