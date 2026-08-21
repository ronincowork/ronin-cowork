# ronin_methodology — Ronin's method of development

> Stock SOP. Your own copy in the sops store (`ronin-store sops` →
> `ronin_methodology.md`) replaces this file whole — a default, not law.
> **Voice: agent.** How a session itself operates: a common methodology to use in the
> absence of other instruction, and the process to name when the owner asks how the
> work is being run.

Ronin sessions are disposable; the work is not. The method is to give every active piece
of work a small set of shared artifacts that Claude, Codex, or another agent can enter and
leave without asking one provider to imitate another.

glen: we should list macros (preferred actionc here where appropriate)

## The lifecycle

### 1. Open the session in public

Set the ladder (tegami) before work begins: one objective in the owner's words, a short ladder,
one active rung, and the session job. Keep it current whenever the active rung or the
shape of the work changes, and list every live working document with
`write_tegami --doc`. Tegami is the visible status of the session; it is not the plan,
a transcript, or a second build-out document.

### 2. Give unfinished thinking one mortal document

Put iteration in `wip/`: normally `wip/buildouts/<topic>.md`, or
`wip/handoffs/<topic>.md` when another session needs the context. A build-out holds the
goal, remaining legs, constraints, verification and definition of done. It is the place
where the owner and agents riff on the work before and during implementation.

Do not turn it into history. Remove completed items as they land, and do not preserve a
"done" section. Git records what changed; the working document says only what remains.
The exact document contract lives in `ronin_library/documents.md` and arrives through the
build-out and landing actions.

### 3. Coordinate through shared edges

glen: lets include more on the core cordination macros/actions 
+forkit: new ronin session different from Spawn (when an agent creates its own internal sub agent...not viewable to the user)
+tell: speaks directly another session
+wipeboard: wipeboard-post (needs a mechanical addtion that posts to all agents in group that msg was posted, now goes unheard) (read/write/new/add)
+readwrite: session-catchup + read-letter + session-transcript (new action required here)


Use a handoff document for context another session must inherit. Use `tejun-send` for one
targeted message and a wipeboard when several sessions need a moving, shared thread. A
wipeboard is append-only: read before posting, never edit its Brief or another agent's
post, and do not treat membership as permission to control another tile.

The session control dial is always checked first. An agent never flips it, works around a
refusal, or routes messages through the owner when the sessions can speak directly.
Tegami answers *where that session is*; the build-out answers *what remains*; the
wipeboard answers *what the group just learned*.

### 4. Integrate continuously on `dev`

Ronin project repositories have two persistent remote branches:

```text
dev       current integrated development work
master    reviewed/released line
```

Verified work is committed and pushed to `dev` as it becomes usable. Coordinate before
updating it when several agents are writing. Temporary local branches or worktrees are
fine for isolation, but they are folded into `dev` and removed; they do not become a
garden of remote feature branches.

The final review is one `dev → master` pull request. The agent reports the gate and does
not merge it for the owner. `master` is the release line, not the place where sessions
develop. This is the Ronin-project exception already named in `github.md`; that file's
single-working-branch advice remains the default for the owner's other repositories.

### 5. Land the state, then retire the session

Finished work leaves no essential knowledge in a pane or in `wip/`:

- delete the work's build-out and handoff documents, and remove them from tegami;
- write or update a state-as-is page in `docs/`, or the README beside the thing, saying
  what exists and how it works now;
- add the single manifest pointer when the project uses a manifest;
- verify, commit and push before ending the session.

The standing document is not a retrospective. Decisions that still constrain the system
belong there; conversation, abandoned options and a chronology do not. A scratch session
that produced nothing worth retaining may simply be deleted, but a session with an
artifact, finding, uncommitted change or unpushed commit must land instead.

## The provider boundary

Ronin owns the shared edges, not the agent's mind. Claude continues to follow the
repository's `CLAUDE.md` and `CLAUDE.local.md`; Codex continues to follow `AGENTS.md`, its
active plan, skills and native session conventions. Other providers keep their own
equivalents. Provider-native memory and planning may help that session execute, but they
do not replace the cross-session record above.

When the two layers overlap:

- repository instructions and the owner's current direction govern the implementation;
- explicit Ronin macros are compiled and run as Ronin macros, never translated into a
  similarly named native feature;
- an ordinary request to delegate or plan may use the provider's native capability;
- durable project truth goes to code, `docs/` or README; a reusable lesson may go through
  Ronin's scoped memory tools; neither belongs only in a provider transcript.

This keeps the protocol common without flattening Claude into Codex or Codex into Claude:
each may reason in its own way, while either can recover the work from the same files,
branches and session surfaces.
