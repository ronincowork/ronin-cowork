# TEJUN — action list (the primitive operations macros are recipes of)

Each action is one small capability with exact steps. Macros (see MACROS.md) compose
each other sparingly; actions never reference macros. Learned from live runs.

## control-check
`action_kind: mechanical` — read the stored coordination preference.
Sessions carry a three-position value:
```bash
tmux show-option -t <name> -qv @ronin-control    # → user | read | write | (empty)
```
- `user` → 👤
- `read` → 👁
- `write` / empty → 🤖

The value is shown to people and tools. It does not restrict an action.

## control-set
`action_kind: mechanical` — store `user`, `read`, or `write` on the session. The tile is
the ordinary surface for changing it.

## repository-initialize
`action_kind: mechanical` — run it, don't deliberate.

When a Project Root allows Ronin Worktrees but has no Git repository, run
`ronin-repo-init <project-root>`. It initializes a local repository in that existing
directory. It never creates a directory, adds a remote, signs into a forge, or guesses
where the work should be published. An existing repository is an ordinary successful
answer.

## session-create
`action_kind: mechanical` — run it, don't deliberate.
Create a detached named tmux session in a working directory.
```bash
tmux new-session -d -s <name> -c <dir>
tmux set-option -t <name> @ronin-tags '<team>[,<team>…]'   # optional, see team-roster
```
Fails if `<name>` exists — check first with `tmux has-session -t <name> 2>/dev/null`.

The owner sets a session max at the top of the ⌂ Roster tab. Agent launches use the
Node session-creation path as the single place that applies it.
Stamp the TEAM at birth whenever the macro knows it: a session tagged when it is
created is addressable (`tejun-team <team>`) from its first breath, and nobody has to
remember to label it later. Use a team that already exists — `tejun-team` lists them —
rather than coining a near-duplicate.

## session-launch — born on all three axes, through the one door
`action_kind: mechanical` — run it, don't deliberate.

**Use this, not `session-create`, whenever the new session runs an AGENT.** It is the
same door the ＋ New board presses (`POST /api/launch`), and it does create, tag, dial,
CLI launch and brief delivery in ONE call — so there is nothing to type at a pane and
nothing to wait for a prompt to appear.

It is also the ONLY way a new session gets a **`role_family`**. The role is stamped at birth
and immutable afterwards, so a session hand-rolled with `tmux new-session` has a blank
role for its entire life and no tool can repair it. That was measured: forks made the old
way carried no role at all and could only ever self-set a task.

```bash
curl -sS -X POST http://127.0.0.1:${PORT:-3006}/api/launch \
  -H 'content-type: application/json' \
  -d '{"role_family":"<role>","session_role":"<task>","name":"<name>",
       "project_root":"<root>","tags":["<team>"],"prompt":"<what it is told>"}'
```

**The axes, and what each may be left out of.** `project_root` is required and omitting it
selects the top active root. `role_family` and `session_role` may each be blank, and blank is
a real launch — but **an agent-launching fork must RESOLVE them deliberately rather than
omit them by accident**. The receipt names what was actually resolved;
read it back and report it.

**THE MODEL — leave it out unless the owner named one.** Omit `cmd` and the launch is born
on the owner's own session default (⚙ Configuration, `agents.sessions.default`); a
`session_role` states no model and biases none, so nothing sits between that default and
an explicit pick. Passing `cmd` is the explicit pick and beats it.

**Naming a VENDOR without naming a model is its own field: `provider`.** *"Give me
Anthropic"* is `provider: anthropic` and nothing else — the model comes from that
provider's preferred model in ⚙ Configuration, falling back to its first column in the
launch table. Use it when the owner names a vendor rather than a model; `model` still
wins when they name one, and naming `provider` beside `cmd` is refused. It must be
a real `session_launch_spec` cell from the launch table (`ronin_catalogs/PROJECT_ROOTS.md`),
never a command you composed — a hand-typed command matches no table row, so the launch
cannot honor an MCP-off choice for it.

**IT DELIVERS THE WHOLE BUILD BRIEF, which is the other half of why this is the door.** A
launch composes the posture, the reading list — `all/` + `root/<project_root>/` +
Team + `role/<session_role>/`, plus any connected level when the brain is on
— the task's opening template with your prompt in it, and the acknowledgement rule. A
session made with `tmux new-session` gets NONE of that: no reading list, no posture, no
letter, and no role, ever.

The response carries `receipt` — `session_role`, Team, `project_root`, `dial`,
`cmd`, `mcp`. A launch that refuses answers 400 with the reason written for the owner (an
unknown axis, a locked `mcp:` contradicted, an agentless launch handed a command); report
the reason, do not retry around it.

**No `run-command`, no `wait-ready`, no `send-prompt` after this.** The brief rode in on
the CLI's own command line. Adding a typed prompt on top double-briefs the session.

## run-command
`action_kind: mechanical` — run it, don't deliberate.
Type a command into a session and run it.
```bash
tmux send-keys -t <name> '<command>' Enter
```

## wait-ready
`action_kind: mechanical` — run it, don't deliberate.
Poll until an agent CLI in the session is ready for input.
```bash
tmux capture-pane -p -t <name> | tail -8
```
Repeat every ~3s until the readiness pattern shows. Patterns: claude → a `❯` prompt
line with the status bar below; codex → its input prompt. Fallback if pattern unknown:
pane text unchanged for 2 consecutive polls.

## send-prompt
`action_kind: mechanical` — run it, don't deliberate.
Send an inbound message through the durable queue:
```bash
tejun-send <name> '<text>'
```
`DELIVERED` and `QUEUED` are both accepted outcomes. Never hand-roll pane writes; the
shared delivery engine owns prompt recognition, literal typing, Enter, and retention.

## confirm-started
`action_kind: mechanical` — run it, don't deliberate.
Confirmation belongs to the shared delivery engine. Immediate success removes the
message; uncertainty leaves it visible under Team Commons → Agent Message Queue. Try Again makes one safe
attempt. Owner-only Force types once and presses Enter while checking for at most ten
seconds; failure remains visible.

## pre-send-check
`action_kind: mechanical` — run it, don't deliberate.
Before safe delivery to an existing session, the shared engine inspects an ANSI-aware
window around the prompt rather than assuming a fixed number of footer rows.
**GHOST-TEXT RULE (learned the hard way):** agent CLIs show
grey context-generated input SUGGESTIONS at an idle prompt. In a plain capture they
look exactly like typed text; with `-e` they carry the dim SGR code (`\x1b[2m`).
Dim text = placeholder = the input is EMPTY — proceed as empty, never "append" to it,
and NEVER treat it as a message from the_owner (a ghost once fabricated a merge approval).
- Input line empty (or ghost-only) → proceed.
- Real (non-dim) pending text → a human's draft: do not submit or overwrite it —
  report and wait.
- Agent mid-task (spinner) → retain the message and retry safely later.

## write-handoff-doc
`action_kind: judgement` — this one needs your reasoning; no tool can do it for you.
- **library:** documents
Distill the current conversation's task context into a spec file a fresh agent can
execute from.
- Location: per the documents library page — inlined when this compiles; reading this directly,
  it is `ronin_library/documents.md`, or the owner's own copy in the library store. A handoff
  is wip: it expires, and it is deleted when its work lands.
- Header must include a death condition: `> expires: when <event>`.
- Content: the goal in the owner's words, constraints/conventions to follow
  (point at CLAUDE.md files), verification steps the new agent can run, definition
  of done. Write for an agent with ZERO shared context.
- **Then `list-doc` it.** A handoff nobody can find is a handoff nobody reads.

## read-letter — read the ladder a session is keeping
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `read_tegami`** (TOOLS.md)
Your own letter — objective, role_family, session_role, the ladder, and where on it you are.
```bash
read_tegami                     # your letter, as written
read_tegami --json              # just the block, for a machine
read_tegami --rungs             # the positions a marker can point at, current one flagged
read_tegami --session <name>    # another session's — DENIED at dial 👤
```
**No paths, ever** — it resolves the pane's own session and is viewer-safe. Exit 3 =
no letter yet, which is the ordinary state of a session that has not written one.

## write-letter — set your ladder, or point at the rung being worked
`action_kind: judgement` — this one needs your reasoning; no tool can do it for you.
> **Tool: `write_tegami`** (TOOLS.md)
Your letter is the one file that outlives your pane, so it is written for whoever
reads it next — the owner in the tile, or the session that inherits the work.
```bash
write_tegami <<'JSON'           # replaces YOUR ladder; the block and nothing else
{ "objective": "...", "role_family": "...", "session_role": "...", "ladder": [ … ] }
JSON
write_tegami --session <name> --at 2.3    # another session's position, ONLY the position
```
- **Bring it in line with what you have actually done** — a ladder that flatters is
  worse than none, because the owner steers by it.
- **An undetermined rung is not rendered.** A short honest ladder beats an invented one.
- The tool validates the SHAPE, never your claims; exit 3 = bad block, letter untouched.
- `--at` carries no dial check by owner law: pointing at a rung is not driving a session.

## list-doc — put a document on your session's list so the owner can open it
`action_kind: mechanical` — run it, don't deliberate.
```bash
write_tegami --doc <path>      # list it
write_tegami --undoc <path>    # take it off
```
The owner opens listed documents from the **▧ Docs** tab in commons, and that list is the
only thing that puts one there. **A doc nobody listed is a doc the owner cannot reach
without asking you for the path** — so list one the moment you create it, and never make
them hunt.

- Relative paths are fine; the tool resolves them against your cwd.
- Adding the same path twice is a no-op, and a doc you deleted or renamed drops off by
  itself the next time the list is touched.
- It is NOT part of your TEGAMI block: rewriting your ladder cannot lose it, and the two
  verbs above are the only way to change it.
- Tell the owner where to look: *"it is on the ▧ Docs tab in commons, under this session."*

## session-catchup
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-peek <session> [lines]`** (TOOLS.md)
Read-only: get up to speed on what a session has been doing.
```bash
tmux capture-pane -p -e -t <name> -S -300
```
Skim for: current task, last agent report, pending questions, errors. Combine with
status-probe for current state. Requires dial ≥ `read`.

## team-roster
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-team [team]`** (TOOLS.md)
Resolve a TEAM NAME to the sessions on it — so work can be addressed to a set
("the kojinsa team") instead of member sessions named one by one, and so a
coordinator picks up a member born after it was briefed. A team is nothing but
the sessions carrying the same tag in `@ronin-tags`; there is no team object.
```bash
tejun-team kojinsa      # members of one team, one session per line + dial
tejun-team              # every team in play, with counts
```
Use it BEFORE fanning out over "a team" — never work from a remembered list, the
membership changes when sessions are born, tagged, or die. Each member still needs
its own control-check before you touch it (the roster reports the dial; it does not
grant anything). Tagging is the OWNER's job in the Ronin UI, or a macro's at birth
(`session-create`); do not re-tag other people's sessions to suit your task.

## session-upsert — one session by name: read it, raise it, or change its facts
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-session-set <name> […]`** (TOOLS.md)
The pair of `team-upsert`, keyed the same way. A bare LIVE name reads it; a name nobody
holds is BORN through the one launch mechanism (`POST /api/session` — a second door onto
`/api/launch`, never a second path); a live name with flags is UPDATED in what you name.
```bash
tejun-session-set wg_review                                   # read: role, teams, 人, dial, root
tejun-session-set wg_review --prompt "Review leg 3" --role review   # born onto YOUR team
tejun-session-set wg_review --prompt "Review leg 3" --model fable  # "open a fable session"
tejun-session-set wg_review --team other-team --lead          # a live one: add a team, make it 人
```
With no `--team` a newborn joins the FIRST team you are on; on no team it is a rōnin.
**Neither is a refusal, and you never create the team first** — the nag this removes is
an agent flip-flopping between "create the team" and "add the member". One line, one
verdict: `BORN …` / `UPDATED …` / one `REFUSED: <why>`. `--model <name>` picks a row of
the launch table by its model column; an unknown name is refused with the names the box
has. Birth-only flags (`--prompt`, `--model`,
`--cmd`, `--mode`, `--mcp`, `--seed`) are refused by name on a live session.

## team-upsert — make a team, or change its facts
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-team-set <team> […]`** (TOOLS.md)
The rare door. A team with no roster is CREATED from the fields you name; one with a
roster is UPDATED in those fields and untouched elsewhere. `--add` tags live sessions
onto it (additive; a name not live is reported, the rest go through).
```bash
tejun-team-set wipeboard-groups --objective "Groups on the wipeboard" --role development --root ronin-cowork
tejun-team-set wipeboard-groups --add wg_lead,wg_review
```
You rarely need this: `tejun-session-set` births onto your team with no team named. Come
here to create a team, or to give one a brief worth inheriting. Membership is never
stored on the roster — it is the sessions' tags, and `--add` writes those.

## team-page-read — what the team page is showing, and where you are on it
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-teampage`** (TOOLS.md)
The team page is two workspaces around the roster; each holds a member's terminal or the
team commons (chat · wipeboard · docs · configuration). The bare form prints the roster
(who is on your team, who is 人, which is you) and, for each browser tab showing the
team, which workspace the owner is typing in, which shows YOU, and what each holds.
```bash
tejun-teampage              # the view
```
`NO-PAGE` means no tab is on the team page right now — nothing to arrange, say so and
stop. `NO-TEAM` means you are on no team. Read this BEFORE a draft: the workspace the
owner is typing in is the one to leave alone.

## team-page-draft — arrange the team page you are on
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-teampage <key=value …>`** (TOOLS.md)
A draft names only what should change; **what you omit stays as it is.** The page
applies it through the same control the owner's own buttons use, so you can do exactly
what they can by hand — put a session or the commons in a workspace, open the commons
on a tab or on a document, reorder or hide columns — and nothing else.
```bash
tejun-teampage workspace1=commons:docs:<path>          # the doc, open, beside the owner
tejun-teampage workspace2=me                           # your own tile there
tejun-teampage order=workspace2,roster,workspace1 hidden=roster
tejun-teampage hidden=none
```
Two tabs may show one team: the draft goes to the tab that shows you, else to every tab
on your team. The dial applies as for send-to-session (`REFUSED`, exit 4). The roster
header on the page says who arranged it. You are free to arrange the page any way you
judge useful — including taking yourself off it.

## wipeboard-check
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-wipeboard`** (TOOLS.md)
Find out what has been said to you. One command, no arguments:

```bash
tejun-wipeboard
```

It resolves which session you are, which team you are on, and prints everything on your
team's board that you have not read — oldest first — then records that you have read it.
**You never manage ids, timestamps, cursors, pages or files.** Run it when a notice tells
you something landed, and run it when you want to know whether anything did.

- **Nothing unread** answers in one line, and costs almost nothing. Run it freely.
- **On no wipeboard** is an ordinary answer, not a problem.
- Your own posts are never handed back to you.
- Your read is recorded **mechanically**. There is nothing to acknowledge and nothing to
  confirm — see the rule against "got it" posts below.
- If the tool says `CURSOR-FAILED`, those posts will simply arrive again next time. Nothing
  was lost; do not try to re-read them by hand.

History is a different, explicit command, and it changes nothing:
`tejun-wipeboard <wipeboard> read [n]` · `tejun-wipeboard <wipeboard> find <text>` ·
`tejun-wipeboard boards`.

## wipeboard-post
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-wipeboard post [--to …] <text>`** (TOOLS.md)
Say something on YOUR TEAM'S BOARD — where the team talks to itself instead of routing
every message through the owner. **No board name**: the tool knows your team, and a name
(`tejun-wipeboard <board> post …`) is only for a board that is not your team's. Posting
also **interrupts**, so what you say is heard instead of waiting for someone to look.

```bash
tejun-wipeboard post "…"                    # interrupts THE LEAD ALONE — the default
tejun-wipeboard post --to @alpha,@beta "…"  # those two, plus the lead
tejun-wipeboard post --to all "…"           # everyone — said on purpose
tejun-wipeboard post --to none "…"          # nobody — it lands and waits to be found
```

**Quiet by default**: most posts do not need the whole team pulled out
of its work, so a bare post interrupts only the lead — the board stays efficient instead
of becoming a spam machine. Widening is deliberate: name who has to act, or say
`--to all` and mean it. The lead sees everything that hits the board; a leaderless team
has nobody always-on.

**A WIPEBOARD IS NOT A RECORD.** A post lives 48 hours, whoever has read it, then
clears. Never put something there you will need
later: that belongs in your TEGAMI, a `docs/` page, or a commit message.

**Interrupt whoever has to act on it; `--to all` only when everyone genuinely does.** That
choice is the whole difference between a board that stays useful and one nobody reads.
But be clear what addressing does: it decides **who is interrupted, not who may read.**
Everyone on the board still receives the post when they next check, so an addressed post
is not private — and the lead is interrupted besides, always (except `--to none`).

What the interruption is, so you can predict it:
- A **pointer, not a copy** — one line naming the wipeboard and you, telling the reader to
  run `tejun-wipeboard`. The thread stays in one place.
- It never goes to you. Each target receives or queues the notice regardless of its stored
  Control preference.
- **The post is the post.** Notification happens after, and a delivery that fails is
  reported per-session and is not a failed post. Do not re-post to "make it land": that
  duplicates it. Report the line the tool printed.
- Nobody else on the wipeboard = nothing sent, and that is not an error.
- The tool tells you who it did **not** interrupt. Read that line; it is how you learn what
  your posts are doing to other people's attention.

Rules, all of them about not trampling other people's writing:
- **Never rewrite, reorder or delete another agent's post.** Several agents write at once.
  Clearing posts is the machine's job on a rule, and it is the only thing that removes one.
- **Never edit the `## Brief`.** It is the owner's statement of what the wipeboard is for.
- **You do not enrol anyone**, including yourself. A board's membership IS the team —
  there is nothing to enrol, and no other kind of board to enrol onto (custom boards are
- **Read before posting** (`tejun-wipeboard`) so you answer what is there instead of
  talking past it.
- Being on a wipeboard is not permission to touch a member: control-check as always.
- **A notice in your pane is the wipeboard speaking, not the owner.** It says so on its
  face. Read; answer if it concerns you. **Never post just to acknowledge** — your read is
  already recorded, and five "got it"s costs five agents an interruption each and tells
  them nothing.
- **Be brief.** Everything you write is something several agents must read. There is no
  length limit, which is exactly why this is a rule and not a check.

## send-to-session  (compound action — was wrongly listed as a "steer" macro)
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-send <session> <message>` — use it instead of
> performing these steps by hand.** (TOOLS.md)
The safe procedure for delivering a message into an EXISTING session (from R2/R4).
Not user-invocable — it is HOW any action-following agent sends, whatever the reason.
The tool first writes one `queued_message`, then the shared delivery engine checks the
dial and prompt. A recognized empty prompt receives literal text and bounded Enter
confirmation. Every other condition retains the message with its measured reason; the
operator checks it mechanically, and the coworkspace exposes Try Again and owner-only
Force. Never perform the queue or tmux steps separately.

## write-buildout-doc
`action_kind: judgement` — this one needs your reasoning; no tool can do it for you.
- **library:** documents
Draft the plan for a piece of work so the owner can read, edit and riff on it BEFORE
any code is cut. **Agree the goal in plain language with the owner first**; only then
write the plan.
- Location: per the documents library page — inlined when this compiles. **Transient by
  design**: it holds only what is still TO DO. No changelog, no "done" section, no
  history (git holds history), and it is DELETED when the work lands.
- Content: goal in the owner's words, the legs (ordered chunks that can each be
  finished and reviewed), constraints/conventions, how to verify, definition of done.
- **Then `list-doc` it**, before you hand it over — the owner is about to read it, and the
  ▧ Docs tab is where they open it without you pasting a path.
- Then STOP and hand it to the owner for review. Planning is not building.

## cut-code
`action_kind: judgement` — this one needs your reasoning; no tool can do it for you.
Implement from a buildout doc. Two independent dials, both stated by the owner:
- **Scope:** `leg` = finish ONE leg, report, stop (owner riffs between legs) ·
  `finish` = work all legs to done without stopping.
- **Coordination:** `dev` = no sequencing concerns, just build ·
  `live` = other work/agents/services depend on this, so sequence deliberately and
  say what must land in what order.
Rules: **delete each item from the buildout doc as it is completed** (the doc shrinks
to nothing; it is never a log). **Work in your assignment's desks** — the repo desks in
your brief and on your letter (`repos[]`); never edit `dev` or a team line, which are
funnel points. **Commit** coherent checkpoints privately as you go. At each DONE leg,
**offer a hand-in** — `tejun-desk hand-in` when the work is coherent for the team; a leg
may prompt it, never perform it for you, and it is not `git push`. Run no repository-wide verification at a
commit or a hand-in. An accepted hand-in, or a conflict, tells your team's lead by itself,
regardless of the lead's dial — reviewing the team line and promoting it is the lead's
primary job — so you never need to `tejun-send` the lead about a
hand-in, and a watch-only lead is not a reason to stop. If the team has no lead, the
hand-in tells you: “this didn't work for promotion: team <team> has no lead; ask the owner
to mark one on the Team page.” A conflict at hand-in is still yours to
resolve (`tejun-desk sync`, fix, hand in).
If your brief lists no desk (manual launch, plain terminal, a
repository under direct publishing) you have none: ordinary Git in the named checkout is
correct; follow the repository and owner instructions and invent no desk state. Verify per the doc, with
scoped evidence, before reporting.

## open-pr
`action_kind: mechanical` — run it, don't deliberate.
**Release-only.** Open the one pull request from the repository's declared working line
to its declared stable line — `dev → master` for Ronin's product repositories, read from
`RONIN_REPO`, never assumed to be `main`. Only those two lines ever reach the remote: a
desk branch or a team line is **never** pushed, and an ordinary session never opens a PR
for its own work (that is a hand-in, `tejun-desk hand-in`). The head SHA must carry a
complete team-promotion receipt, and **the PR body carries that receipt** as a fenced
block (```` ```ronin-promotion-receipt ```` … ```` ``` ````) — CI verifies the exact SHA
against it and a PR without one FAILS; the PR consumes the proof, it is not the first
full check. **Never merge.** Merging is the owner's gate (same principle as the control dial:
the approval must be his hand).
```bash
bin/ronin-promote pr <team>
```
That is the whole action. It reads the arrangement, takes the team's last complete
promotion receipt, warns if the working line's head is not that receipt's candidate,
pushes the working line, writes the body in the template's shape with
the receipt fenced, and creates the PR — or updates the one already open, never a second.
It finds `gh` itself. Report the URL it prints. Under direct publishing there is no working
line and no PR: this action does not apply.

## land-work
`action_kind: judgement` — this one needs your reasoning; no tool can do it for you.
> **The finish line is the documents library page's three questions** — which wip docs does this
> delete, did the facts change enough for a standing doc, is there a manifest line.
Close out finished work so nothing transient survives.
1. Write/refresh a **persistent README** where the code lives (not in wip/) —
   what it is, how to run it, the decisions worth keeping.
2. **Delete** the build-out doc — it has served its purpose (the documents library page's first landing question).
3. **Close every finished desk explicitly.** Hand in the assignment (`tejun-desk hand-in
   --assignment`), then close each finished desk. Hand-in does not close a desk, and the
   live session remains ready at the project root for a later fresh desk. No desk (direct
   publishing, shared checkout): commit and push the declared line instead.

## land-manifest — ONE LINE. READ THIS TWICE.
`action_kind: judgement` — this one needs your reasoning; no tool can do it for you.
- **library:** documents
Append a single pointer line to the project_repo's manifest — location per the
documents SOP. **The manifest is an index, not a history.** Git commits and READMEs
hold the story; this is the signpost that tells someone where to look.

Format — exactly one line, nothing else:
```
YYYY-MM-DD · <what happened, ≤12 words> · <commit> or <path>
```
**Hard rules (agents pad; do not):**
- ONE line per landed thing. Never two. Never a paragraph.
- No sub-bullets, no "changes included", no rationale, no before/after, no lists of
  files, no test results, no emoji decoration.
- Do not explain HOW. If it needs explaining, it belongs in the README or the commit.
- Never edit or "improve" earlier lines. Append only.
If your line exceeds one screen-width, cut words until it doesn't.

## step-through — run a macro step by step, checking each one in
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-step`** (TOOLS.md). `start <macro>` → do the step →
> `done` → next step → … → COMPLETE.
The default way to RUN a macro. You still do the work and make every judgement; the
tracker just holds your position (on the tmux session, so it dies with you) and hands
back the next step when you check the last one in. It exists because a step you forgot
looks exactly like a step you finished — most of all the last one. Each click forward
cannot slip back, and the run isn't COMPLETE until every step is checked in.

## compile-macro
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun <macro>`** (TOOLS.md) — always use it.
Resolve a macro into one self-contained blob: its recipe, the full text of every
action it names, in order, plus any tool implementing those actions — **and start
step tracking** on this session at step 1. Drafting the run and preparing to walk it are one
motion: compiling a macro leaves you already in the check-in loop, so no macro gets
run untracked. This is how you
RUN a macro — one call, no hunting through docs, nothing to narrate. A macro naming
an action that does not exist **does not compile** (exit 3), so an undefined step is
impossible by construction rather than caught by review.

## desk-open — get a worktree from current local dev
`action_kind: mechanical` — run it, don't deliberate.
A desk is one repository's branch and worktree opened together (`team/<team>/<session>`,
mounted under the `worktrees` store), cut from the repository's current local working
line (`dev` for Ronin) and recorded with its exact base, review line, owner and dependency
location. It opens at once — no clock or approval. Funnel-point requests are reported and
replaced with a private branch. A coding launch opens every desk in the
assignment before the CLI starts; a session opens one by hand only for a repository its
brief did not list.
> Tool: `tejun-desk open <repo[:branch]> [--team t]`

## desk-status — what is true about each desk, now
`action_kind: mechanical` — run it, don't deliberate.
Per desk, derived from git at the moment of asking and never from prose: clean or dirty
(and which files), distance from both local `dev` and the team line, a 20-commit update
notice that never blocks, a
pending team update (who moved the line, which of your unsaved files it overlaps), the
last accepted hand-in, and a standing block (a conflict awaiting the lead). Parked desks
show as such. Remote publication is not desk cleanliness and does not appear here.
> Tool: `tejun-desk status [<repo[:branch]>] [--session s | --team t | --repo r]`

## desk-sync — update a desk from current local dev
`action_kind: mechanical` — run it, don't deliberate.
Merge what local `dev` has accepted into the desk. On a dirty desk it records the update
as pending and touches nothing. An empty update is an ordinary success; a conflict is
reported with the files. The Agent chooses when to update.
> Tool: `tejun-desk sync [<repo[:branch]>]`

## hand-in — hand your committed range in to the team line
`action_kind: mechanical` — run it, don't deliberate.
Mechanical admission, serialized per line: a throwaway candidate is built from current
local `dev`, then accepted team delta and desk delta are merged, and the line advances by compare-and-swap to the
candidate — or not at all. A conflict is contained in the candidate; the hand-in is
rejected with the two sides and the files, your desk is marked blocked, and the lead
adjudicates. No repository-wide verification runs here and nothing reaches the remote: that is team
promotion, the lead's act. One receipt is appended per attempt, accepted or not. After an
accepted hand-in every sibling desk on the line adopts it (clean) or is told (dirty).
`ACCEPTED` immediately reports the desk's level, excluded unsaved/untracked files, other
level idle desks, and whether promotion is due. Candidate scratch is removed on every
handled exit; the live desk is never consumed.
`--assignment` hands in every desk in your assignment, each to its own repo's line;
nothing cross-repo is checked here.
> Tool: `tejun-desk hand-in [<repo[:branch]>] [--assignment]`

## desk-close — close a finished desk independently of its session
`action_kind: mechanical` — run it, don't deliberate.
Close removes a clean desk whose tip is already on its line. Dirty files or commits not on
the line remain in the live desk and are named; close never turns them into an automatic
WIP commit. `handoff` transfers explicit ownership without moving the branch or worktree.
Intentional discard alone deletes unresolved work and requires the exact confirmation;
its durable receipt names the commits and files before deletion.
> Tool: `tejun-desk close [<repo[:branch]>]` · `tejun-desk handoff <repo[:branch]> --to <session[,session]>` · `tejun-desk discard <repo[:branch]> --confirm "DISCARD repo:branch"`

## check-clean
`action_kind: mechanical` — run it, don't deliberate.
Before ending a session, verify nothing of value would vanish with it — **at every desk
of your assignment**, not just the one your shell is in.
```bash
tejun-desk status                    # per desk: dirty · ahead (not handed in) · pending update · blocked
git status --short && git log --oneline -3   # no desk: the checkout you are in
```
Every desk saved, handed in, accepted and closed → the ending proceeds directly. Unsaved
files, commits ahead of the team line, a pending transaction, or an artifact the owner
would want kept are named in the ending preflight. Choose **Prompt Agent(s)** to queue the
exact closeout work and refresh the warning, or **Ignore** to proceed with visible quarantine
custody. Intentional discard is separate and requires its exact receipt confirmation.
Remote publication is not session cleanliness — "pushed" is not the question at a desk. Judgement, not just git: a written doc or finding that exists
only in your pane also counts as unsaved.

## read-work-record
`action_kind: judgement` — this one needs your reasoning; no tool can do it for you.
Read the durable record of a piece of work — reads only, no writes anywhere.
Sources, in order: the buildout/handoff doc it names (in the wip house dir, per the
documents SOP), the README where the code lives, `git log`/`git diff` for its
commits, and the manifest. Use for evaluation and catch-up; never infer from a pane
what a document can tell you.

## recall-memories — what earlier sessions learned that applies to this one
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-recall`** (TOOLS.md)
Sessions are mortal; what they learned is not. This hands you the memories matched to
what this session IS — its `project_root`, its `role_family` and its `session_role`, read off the session
itself — ordered universal-first, then this project, then cross-project.
```bash
tejun-recall            # one file path per line, deduped
tejun-recall --list     # kind + scope + summary per match, to choose from
tejun-recall --inline   # the composed text, for a boot brief (budget-guarded)
```
- **An empty answer is the ordinary answer** on a fresh install — silence, never an
  error. Do not treat it as a fault or go looking for a store.
- A memory missing an axis is reported MALFORMED on stderr and never silently matched.
- Read what it hands you before you start; that is the whole point of the action.

## remember-lesson — leave something behind that outlives this session
`action_kind: judgement` — this one needs your reasoning; no tool can do it for you.
> **Tool: `tejun-remember`** (TOOLS.md)
```bash
tejun-remember "<the thing>" [--tags a,b] [--kind rule|fact|pointer] [--summary "…"]
```
The judgement is **what is worth keeping**, and the bar is high: something a later
session would get wrong without it. Not a diary, not what you did today, not anything
the code or git already says — those are `wip/`, `docs/` and the commit log (the
documents SOP). One lesson per memory, in the fewest words that survive without you.
- **Scope is inherited, never widened by accident.** The axes come from this session;
  `--any <axis>` widens on purpose and says so in the verdict.
- **A memory that matches every session is the system prompt, and it is the_owner's
  alone** — the tool REFUSES both axes wildcard (exit 4). Propose it and let them write it.
- Exit 3 = the tool cannot tell what this session is; name an axis rather than guessing.

## propose-and-confirm — show the change, wait for the yes
`action_kind: judgement` — this one needs your reasoning; no tool can do it for you.
**The whole of MIKA's licence to touch the owner's catalogs and settings** (see
`MIKA_MACROS.md`), and available to any macro that changes something the owner did not
spell out themselves.

1. **Show it as what it will become** — the markdown block, the filled form, `old → new`.
   Not a description of the change: the change.
2. **Say what you inferred and from where.** "`remit` is the README's first line" lets a
   wrong guess be corrected in one word instead of discovered next week.
3. **Wait.** A yes is a yes; silence is not, and neither is "sounds good" to a different
   question.
4. **Then perform it through the machinery that already exists** — the endpoint, the
   catalog write, the launch route. Never a second write path of your own, and never a
   file edited by hand where an endpoint exists.

**A refusal from that machinery is an ANSWER, not a fault.** `POST /api/project-roots`
leaves the file exactly as it was when the result would not parse back. Report it and
stop; do not retry with the block reshaped until something sticks.

**Do not batch.** One change, one confirmation. Three proposals in one message get one
"yes" that meant the first of them.

## schedule-request — put a request on the team's clock
`action_kind: judgement` — this one needs your reasoning; no tool can do it for you.
> Tool: `tejun-jikan add --when "<timing>" [--to lead|<session>] <request...>` → `SCHEDULED <id> …`
A Cron job (JIKAN) is one request delivered to one session of your team — by name, or
`lead` — at a moment or on a rhythm, by Ronin's own clock, through the ordinary message
door. It commits the owner's machine to future action, so it is a **propose-and-confirm**:
say the request, who gets it and when, in the tile, and add it only on the owner's yes —
never on your own initiative, and never for another team. `tejun-jikan when "<timing>"`
proves the timing words before you propose them; `tejun-jikan` lists what is already
there so you do not schedule a thing twice. A job is a ping: a missed beat is missed, and
nothing on the clock births a session or a team — a job whose session is gone is refused
and left standing for the owner to see.

## report-outcome
`action_kind: judgement` — this one needs your reasoning; no tool can do it for you.
Close every macro by telling the owner what happened — outcome first, in plain
sentences: what changed, where it lives (paths, session names, PR links), and what
needs him. **A macro's result must be shown, not just performed.** No preamble, no
narration of steps you took, no restating the recipe. If a session is about to end
(`harakiri`), this comes BEFORE it — nothing of value may exist only in a pane.

## harakiri — end your own session
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-harakiri`** (TOOLS.md) — run it. Don't hand-roll it.
The final act of `land` / `delete`: the session that finished the work ends itself.
Sessions are disposable; the record lives in git, the README and the manifest —
never in a pane.

**It takes no arguments and you do not name a session.** `tejun-harakiri`, nothing else.
The tool hands your pane to Ronin; Ronin works out which session that is, checks the
dial, and ends it. How a session is actually killed is Ronin's business, not yours —
you are meant to be blind to it, the same way spawning from the commons is mechanical Ronin
code rather than an agent running tmux steps. Passing a name is refused.

**RUN THE COMMAND. Saying "session ended" is not ending the session.** There is no
success message to print: the proof is that the session is gone. If you are still
able to type after this step, you did not perform it. Never claim a landing is
complete while your pane still exists.

This is the LAST step, after the README, the manifest line, every desk handed in or
parked, and your report to the owner. Nothing of value may exist only in your pane — or
only in a desk nobody has been told about — when you do this. Never perform harakiri on
another session.

If Ronin is unreachable the tool reports `STUCK` and your session stays. That is the
correct outcome: say so to the owner. Do NOT reach for `tmux kill-session` — the whole
point is that one implementation does the killing.

### Ending someone else's session (NOT harakiri, not an action)
Harakiri is self-inflicted, by construction. Ending a session that is not yours — a
test session you spun up in a previous life, a leftover scratch pane — is a separate,
deliberate act, done knowingly and named as itself:

Use the trash button in the Ronin UI. It follows the authenticated operator connection
and the same viewer sweep as every other owner action; do not reconstruct the operator URL
or credentials with a raw `curl` command. Check the dial first (`@ronin-control: user` →
it is the owner's, ask), and tell the owner what you ended.

## status-probe
`action_kind: mechanical` — run it, don't deliberate.
Classify a session's state from pane text (for pickers, dashboards, notifications).
ready (`❯` + empty input) / thinking (spinner line) / awaiting-input (question or
pending dialog) / gone (`tmux has-session` fails).

## restart-ronin — pick up a change, without touching anyone's work
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-machine-restart`** (TOOLS.md)
Restart Ronin so it picks up a change you made to it — new code, a new catalog entry, a
setting that is read at boot. It takes no argument and can restart nothing else.

```bash
tejun-machine-restart
```

**This does not touch sessions.** Agents, shells and their scrollback live in the tmux
server, which is a different service; Ronin is the grid, the API and the launcher in
front of it. Browser tiles blink and reconnect. Nobody loses work.

**The service that DOES own the sessions is never yours to restart.** Stopping it ends
every session on the machine simultaneously — every agent mid-task, including you, with
no undo and nothing in the log that looks like a kill. There is no action for it here and
no tool that can reach it, deliberately. If you believe the session engine is unhealthy,
you cannot repair it from inside it: name what you saw on the board and stop.

Exit 4 = you passed an argument. Exit 2 = Ronin is not run as a service on this box, so
restarting it is the owner's. Exit 5 = it did not come back; report it rather than
retrying in a loop.

## survey-machine — what this box has, measured now
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-survey [path]`** (TOOLS.md)
Measure the machine before advising on anything its capacity decides — where a pile of
data should live, whether a database belongs on this box, whether a checkout will fit.
Reports cores, RAM, the disk **on the filesystem holding the path you name** (not `/`,
which on many hosts is a different device from the home tree), and every Ronin store
with its size.
```bash
tejun-survey                 # the working directory's filesystem
tejun-survey /srv/incoming   # the filesystem a proposed home is actually on
```
Read-only; it touches no session, so no control-check applies.

**Its output is never copied into a document.** A machine's capacity is a fact about a
box on a day — true when written, false after a resize or a move, and dangerous in both
directions, because a written number reads as authority long after it stopped being
true. Documents cite this action; the numbers live in a terminal.
`ronin_sops/data.md` names the tool for exactly this reason and carries no figures.

Exit 3 = the path does not exist. A store that has never been used prints `not yet`
rather than a zero — "empty" and "never created" are different answers.

**Report the KIND before the numbers.** On a virtual machine the survey is the whole
picture — one rented volume, nothing anyone forgot about. On a physical box it is not,
which is why every mount is listed and not just the one under the working directory.

## survey-secrets — what keys a project holds, and whether git can see them
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-secrets [path]`** (TOOLS.md)
Establish the state of a project's keys before advising on any of it: which env files
exist, the key **names** in each, whether git tracks them, whether `.gitignore` covers
them, and **which provider credential a launched agent would actually use**.
```bash
tejun-secrets                # the working directory
tejun-secrets ~/src/someapp  # another project
```
**Names, never values.** A name (`STRIPE_SECRET_KEY`) is what the conversation needs; a
value is the thing itself, and echoing one puts it in a pane, a tape, a scrollback and a
log in a single breath. There is no flag to print values, deliberately — and the same
rule binds you: never paste a key into a session to check it.

A `*.example` / `*.sample` / `*.template` file is reported as a **template**, not an
alarm: it is supposed to be tracked, and a check that cries wolf gets turned off, taking
the real alarm with it.

**The provider-auth section resolves; it never guesses.** Credentials resolve in a fixed
order — `ANTHROPIC_API_KEY` → `ANTHROPIC_AUTH_TOKEN` → an OAuth profile → the default
profile on disk — and a set `ANTHROPIC_API_KEY` outranks a subscription login **even when
it is empty**, which is how a box quietly moves onto per-token billing with no symptom but
the invoice. The tool names the winner, never a value, and says plainly when the answer
lives somewhere it cannot see. It reads the **calling shell's** environment; a pane Ronin
spawns inherits the service's, and a disagreement between those two is BYOKI.

Exit 4 = something is `EXPOSED` (tracked by git), which means the key is already public
— the response is to rotate it, not to rewrite history (`ronin_sops/secrets.md`).
Exit 3 = the path does not exist. Read-only: it never stages, writes, or edits
`.gitignore` — it reports, and a person decides.

## survey-account — who this install is for, and what it is entitled to
`action_kind: mechanical` — run it, don't deliberate.
> **Tool: `tejun-account`** (TOOLS.md)
Establish what the install already knows about its owner before asking them anything:
the display name (or that it is falling back to the login), the entitlement, the limits
they set, and the config file's location.
```bash
tejun-account                # no arguments — it resolves the store itself
```
SETTEI's half of the question. `survey-secrets` answers which **credential** is in force;
this answers who the install is **for**. Different questions, different failure modes —
run both before a setup conversation.

**A fallback is not an answer.** Nothing shipped may name a person, so an unset owner name
falls back to the login; the tool reports that as `NOT SET` rather than printing the
guess as though the owner had given it. A fresh install with no config file at all is the
ordinary first-run state and exits 0, not an error.

Read-only, and it prints no credential — `ronin.json` is served whole over HTTP by design
and holds none, which is exactly why one must never be put there.
