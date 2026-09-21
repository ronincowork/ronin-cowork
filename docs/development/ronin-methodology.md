# ronin_methodology — Ronin's method of development

> **Voice: agent.** How a session itself operates: a common methodology to use in the
> absence of other instruction, and the process to name when the owner asks how the
> work is being run.

Ronin sessions are disposable; the work is not. The method is to give every active piece
of work a small set of shared artifacts that Claude, Codex, or another agent can enter and
leave without asking one provider to imitate another.

Each stage below names the shared record or capability involved. Selected capability
documents teach the concrete tools; this method keeps the durable cross-session choices
without duplicating executable instructions.

A capability document is a teaching layer, not an authority layer. Capability selection changes
what the Build Brief teaches and emphasizes; it never grants, withholds, authorizes, or
forbids an installed tool or its `--help`.

## The lifecycle

### 1. Open the session in public

Set the ladder with `work-record update_record`: one objective in the owner's words, a
short ladder, one active rung, and the session job. Keep it current whenever the active
rung or shape changes, and list every live document with `work-record document add` so the
owner can open it without asking for a path. `work-record read` returns the visible status;
the work record is not the plan, a transcript, or a second build-out document.

A gate is how you ask for the owner. Put one wherever the work genuinely stops and needs a
person, and wait at it — that is the mechanism, and it is better than a question in prose
that scrolls away.

### 2. Give unfinished thinking one mortal document

A mandate of reach `plan` produces a document the owner can read and edit, and then
waits — no code is cut from it until they have been through it. The `buildout` behaviour
says how the house writes one. Ronin creators keep iteration in the creators' Lab,
normally `wip/buildouts/<topic>.md`, or `wip/handoffs/<topic>.md` when another session
needs the context. Do not put creator WIP in the Cowork product repository. A build-out holds the goal, remaining legs, constraints, verification
and definition of done. It is where the owner and agents riff on the work before and
during implementation.

Do not turn it into history. Remove completed items as they land, and do not preserve a
"done" section. Git records what changed; the working document says only what remains.
The exact document contract lives in `ronin_library/documents.md`.

### 3. Coordinate through shared edges

**Visible delegation — give the work its own session. AN OWNER ASKING FOR AN AGENT ALWAYS
MEANS `session_create`; IT NEVER MEANS SPAWN A CLI-INTERNAL SUB-AGENT.** “Agent,” “new
agent,” “fork,” and “fork it” do not request or authorize spawning. They mean a visible
**Ronin session** on the roster, with its own tile, ladder, and life, addressable by name
after this conversation ends. Internal spawning is the CLI's own implementation choice
only when independently allowed; the owner's wording does not provoke it.

`session_create <name> --prompt` carries the visible session's explicit purpose. The
newborn receives resolved Campaign/Team context—not this conversation—reads its own birth
packet, and leaves the caller unchanged. The command has no dial option.

**`edges send` — one message to one session.** Use the durable message queue and read its
result. Safe delivery waits for a usable prompt and does not overwrite an unsent draft.
A retained message is already queued; do not duplicate it or bypass its reported blocker.
The reply remains in the target's session unless that Agent sends a response.

**`edges wipeboard` — the group's shared thread.** Use it when several sessions are working one
problem and the record should be common rather than routed through the owner.
`edges wipeboard post` is append-only: read before posting so you answer what is there, never
rewrite another agent's words, never edit the Brief, and never enrol anyone — membership
is the owner's hand. A post notifies every other member, so it is heard rather than waited
on — which is exactly why you never post merely to acknowledge. Five "got it"s is how a
board turns into noise. A notice arriving in your own pane is the board speaking, not the
owner. When you need one particular session to *act*, use `edges send`.

**Reading another Agent's work.** `work-record read --session <name>` reads its authored
work and evidence. `edges read` is available when the installation supplies readable
recording; the recording part is currently parked, so never promise transcript coverage.
A live terminal capture is a current screen, not a durable history. Message delivery and
its retained states are described by [the queue contract](../architecture/message-queue.md).

### 4. Commit privately, hand in deliberately, let the lead promote

Keep preservation, review and publication distinct. A commit preserves coherent work in
the Agent's own working context. A hand-in offers that work to the Team for review; it
does not end the Agent, close its desk or imply acceptance. Promotion is a separate Team
lead boundary that moves reviewed Team work toward the repository's shared state.

The repository's declared arrangement determines the concrete path. Capability documents,
conditional Behaviors and tool help teach those mechanics; this methodology does not
duplicate their commands or branch choreography. At every boundary, the Agent reads the
tool's acknowledgement and chooses the next act rather than treating one successful act
as permission to cascade into another.

### 5. Leave durable state before the session ends

Finishing the work of a session, before it ends, leaves no essential knowledge in a pane
or in `wip/`:

- delete the work's build-out and handoff documents, and remove them with
  `work-record document remove`;
- write or update a state-as-is page in `docs/`, or the README beside the thing, saying
  what exists and how it works now;
- add the single manifest pointer when the project uses a manifest — one line, an index
  entry and not a history;
- leave the work record and standing documents truthful enough that another Agent can
  resume without reconstructing decisions from a terminal;
- treat ending the Agent as its own explicit lifecycle decision, separate from preserving
  or handing in work.

The standing document is not a retrospective. Decisions that still constrain the system
belong there; conversation, abandoned options and a chronology do not. A scratch session
that produced nothing worth retaining may simply be deleted, but a session with an
artifact, finding, uncommitted change or commit not yet handed in must land instead.

## The provider boundary

Ronin owns the shared edges, not the agent's mind. Claude continues to follow the
repository's `CLAUDE.md` and `CLAUDE.local.md`; Codex continues to follow `AGENTS.md`, its
active plan, skills and native session conventions. Other providers keep their own
equivalents. Provider-native context, planning and delegation may help that session
execute, and none of it is Ronin's to redesign — but none of it replaces the cross-session
record above, because none of it is visible to anyone outside that session.

When the two layers overlap:

- repository instructions and the owner's current direction govern the implementation;
- an ordinary request to delegate or plan may use the provider's native capability;
- durable project truth goes to code, `docs/`, README, or the Work Record's project
  read/write tools; it does not belong only in a provider transcript.

This keeps the protocol common without flattening Claude into Codex or Codex into Claude:
each may reason in its own way, while either can recover the work from the same files,
branches and session surfaces.
