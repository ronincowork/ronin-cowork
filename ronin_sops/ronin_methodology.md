# ronin_methodology — Ronin's method of development

> Stock SOP. Your own copy in the sops store (`ronin-store sops` →
> `ronin_methodology.md`) replaces this file whole — a default, not law.
> **Voice: agent.** How a session itself operates: a common methodology to use in the
> absence of other instruction, and the process to name when the owner asks how the
> work is being run.

Ronin sessions are disposable; the work is not. The method is to give every active piece
of work a small set of shared artifacts that Claude, Codex, or another agent can enter and
leave without asking one provider to imitate another.

Each stage below names the macro that performs it. The macro is the shared word — what the
owner says and what you compile — and inside it only the actions that carry a rule worth
knowing are named. The tools underneath belong to the actions and are not repeated here;
they move, and a method that spelled them would move with them.

## The lifecycle

### 1. Open the session in public

Set the ladder (tegami) before work begins: one objective in the owner's words, a short
ladder, one active rung, and the session job. Keep it current whenever the active rung or
the shape of the work changes, and list every live working document (`list-doc`) so the
owner can open it without asking you for a path. Tegami is the visible status of the
session; it is not the plan, a transcript, or a second build-out document.

A gate is how you ask for the owner. Put one wherever the work genuinely stops and needs a
person, and wait at it — that is the mechanism, and it is better than a question in prose
that scrolls away.

### 2. Give unfinished thinking one mortal document

**`+buildout`** plans a piece of work as a document the owner can read and edit, and then
waits — no code is cut from it until they have been through it. Iteration lives in `wip/`:
normally `wip/buildouts/<topic>.md`, or `wip/handoffs/<topic>.md` when another session
needs the context. A build-out holds the goal, remaining legs, constraints, verification
and definition of done. It is where the owner and agents riff on the work before and
during implementation.

Do not turn it into history. Remove completed items as they land, and do not preserve a
"done" section. Git records what changed; the working document says only what remains.
The exact document contract lives in `ronin_library/documents.md` and arrives through the
build-out and landing actions.

### 3. Coordinate through shared edges

**`+forkit` — give the work its own session.** Delegating inside a session is the
provider's own business and it is good at it: a native subagent is this session's
execution, invisible to everyone else, and it dies with the answer it hands back. Ronin
has no opinion on when you use one. A fork is a different request, and it is the one thing
here that no provider has natively — it opens a **Ronin session**: on the roster, its own
tile, its own ladder, its own life, addressable by name long after this conversation ends.
Spawning a subagent therefore does not answer a request to fork, and saying it did is the
failure this rule exists for — nothing appeared for anyone to watch, message, or land.

Fork when the work has a track of its own: it will outlive this conversation; someone will
want to look in on it or send it something; it deserves its own ladder rather than a rung
on yours; or carrying it here would pull this session off its objective. The handoff is
written first (`write-handoff-doc`), because a fork opens by proving it understood the
brief and then waiting, not by working. **Never fork on your own initiative** — propose
it and wait for the go-ahead.

**`+tell` — one message to one session.** `send-to-session` carries the rules: the dial on
the **target** governs, not yours; a refusal is an answer, never retried and never worked
around; a person's unsent draft is never typed over; and the message opens by saying who
it is from, or the other end answers the wrong person. It is one message and not a
conversation — the reply lands in that session's own tile, where the owner reads it.
Relaying it back through here makes this session a switchboard and hides which agent
said what.

**`+wipeboard` — the group's shared thread.** Use it when several sessions are working one
problem and the record should be common rather than routed through the owner.
`wipeboard-post` is append-only: read before posting so you answer what is there, never
rewrite another agent's words, never edit the Brief, and never enrol anyone — membership
is the owner's hand. A post notifies every other member, so it is heard rather than waited
on — which is exactly why you never post merely to acknowledge. Five "got it"s is how a
board turns into noise. A notice arriving in your own pane is the board speaking, not the
owner. When you need one particular session to *act*, `+tell` it.

**`+read` / `+readwrite` — catching up on another session.** Read its **transcript**, not
its pane. A pane is a window: it shows whatever happens to be on screen at the moment you
looked, so an agent polling one is watching, not reading, and everything that scrolled is
simply gone. The transcript is the record, and you take as much of it as the question
needs. `read-letter` answers the other question — where that session is on its ladder, in
its own words. `+read` needs the dial at read; `+readwrite` needs write; and an agent
never flips a dial to get either.

The dial is checked before any of this, and it is checked on the session you are reaching
for. Tegami answers *where that session is*; its transcript answers *what it has been
doing*; the build-out answers *what remains*; the wipeboard answers *what the group just
learned*.

### 4. Commit privately, hand in deliberately, let the lead promote

Under the reviewed arrangement (`github.md`, declared in each repository's `RONIN_REPO`),
Ronin's product repositories use:

```text
team/<team>/<session>   your desk — a private branch and its worktree, one per repo you change
team/<team>/dev         the team's line — a funnel point: handed in to, never edited
dev                     the repository-wide pool, and the live app — moves by team promotion
master                  reviewed/released line — moves by PR from dev
```

Three scopes, kept distinct. **Commit** preserves: a checkpoint on your desk, as often as
coherent, partial ones included; nothing propagates and no gate runs. **Hand-in**
publishes: `tejun-desk hand-in` admits your committed range to the team line by mechanical
admission (merge, conflict check, near-instant invariants) — a conflict is contained in a
candidate, the line is untouched, and the lead adjudicates. **Team promotion** is the
lead's or compiler's act: the team line admitted to `dev` on a candidate that passed the
first full repository BYOIN, with a receipt for the exact SHA; `dev` restarts. The second
full BYOIN runs at `dev → master`; neither runs at a commit or hand-in
(`docs/test-protocols.md`).

**`+cutcode`** builds from an agreed build-out, deleting each item from the doc as it
lands, working in the assignment's desks. At each DONE leg it *offers* a hand-in — the
session decides when its work is coherent for the team, and a tool never decides that for
it. It opens no pull request. A launch whose brief lists no desk (manual, plain terminal,
direct repository, non-code job) has none: it commits to the repository's declared line as
that repository's own instructions say, and invents no desk state.

Accepted team state flows back down: a clean sibling desk adopts it at once; a dirty one
is told — with the files and the diff when they overlap — and adopts at its next commit or
`tejun-desk sync`. Read the notice before you go on; it is the cross-purposes catch.

The final review is one pull request from `dev` to the stable line, opened by the release
process with the promotion receipt, never by an ordinary session, and never merged by an
agent. A Ronin repository under the direct arrangement instead publishes to its declared
`main` or `master`: no desk, no ordinary PR, and published history is not rewritten.

### 5. Land the state, then retire the session

**`+land`** finishes the work of this session and then ends it. Finished work leaves no
essential knowledge in a pane or in `wip/`:

- delete the work's build-out and handoff documents, and take them off the tegami list;
- write or update a state-as-is page in `docs/`, or the README beside the thing, saying
  what exists and how it works now (`land-work`);
- add the single manifest pointer when the project uses a manifest — `land-manifest` is
  one line, an index entry and not a history;
- close every desk explicitly: hand in what is coherent (`tejun-desk hand-in`), and park
  the rest (`tejun-desk park` — a `WIP:` commit, branch kept, listed for the lead to hand
  in, inspect, reassign or discard). Closing never publishes silently and never deletes;
  under direct publishing, commit and push instead;
- report the paths, what was handed in, what was parked, and the manifest line **before**
  `harakiri`, not after.

The standing document is not a retrospective. Decisions that still constrain the system
belong there; conversation, abandoned options and a chronology do not. A scratch session
that produced nothing worth retaining may simply be deleted, but a session with an
artifact, finding, uncommitted change or commit not yet handed in must land instead.

## The provider boundary

Ronin owns the shared edges, not the agent's mind. Claude continues to follow the
repository's `CLAUDE.md` and `CLAUDE.local.md`; Codex continues to follow `AGENTS.md`, its
active plan, skills and native session conventions. Other providers keep their own
equivalents. Provider-native memory, planning and delegation may help that session
execute, and none of it is Ronin's to redesign — but none of it replaces the cross-session
record above, because none of it is visible to anyone outside that session.

When the two layers overlap:

- repository instructions and the owner's current direction govern the implementation;
- explicit Ronin macros are compiled and run as Ronin macros, never translated into a
  similarly named native feature — `+forkit` is the standing example;
- an ordinary request to delegate or plan may use the provider's native capability;
- durable project truth goes to code, `docs/` or README; a reusable lesson may go through
  Ronin's scoped memory tools; neither belongs only in a provider transcript.

This keeps the protocol common without flattening Claude into Codex or Codex into Claude:
each may reason in its own way, while either can recover the work from the same files,
branches and session surfaces.
