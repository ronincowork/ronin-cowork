# TEJUN — macro list (a macro is a recipe of actions)

> **TEJUN** (手順, "procedure — the order of steps") is the umbrella name for Ronin's
> whole macro system: macros, the actions they compose, and the engine that runs them.

**A macro is addressed to the session it is invoked in** — it acts on that session's
own work (`land` lands yourself, `forkit` forks this conversation's topic). Macros
compose actions from ACTIONS.md; the action defines HOW, the macro defines
WHAT and in what order. To run one: resolve each step to its action, execute in
order, report the outcome (session name + how to watch it in the Ronin grid).
**Invocation: `+<name>: <args>`** — e.g. `+forkit: build the login page`.
The `+` marks the line as a MACRO, unmistakable to human and agent alike, and it is
typeable on every keyboard (including a phone) — buttons emit it and people can type
it. Also accepted: a bare `<name>: <args>`, a `ろ` prefix (legacy decoration), "run
the <name> macro", "/<name>". **Never require a marker** to recognise a macro.

**Every macro here is one of two classes, and its `class:` line says which** (KOTOBA):

- **`session_macro.lookup`** — a read-only question Ronin already holds the answer to.
  One command (`tejun-team`, `tejun-wipeboard`), no compile, no step tracking; sent
  through Ronin it arrives already resolved, so never re-run one to confirm.
- **`session_macro.workflow`** — a recipe of cataloged actions you perform: compile it
  (`ronin_bin/tejun <name>`) or step through it (`tejun-step start <name>`), execute in
  order, report the outcome.

**To run a macro: `tejun <name>`** (ronin_bin/ is on PATH) — the whole recipe, every
action it names and the tools that implement them, compiled as one blob. Read it, run
it, report the outcome. The recipe is the channel; how you move through it is yours.
Each action carries an `action_kind:` — **mechanical** (run it, don't deliberate) or
**judgement** (your reasoning is the work) — read it as the pace to take that step at.

**Delivery is the macro's own toggle: `- **run:** stepped` in an entry** makes the
compile arm the step tracker and hand you one step at a time (`tejun-step done` checks
each in). **No marking = the whole blob at once — the default.** A macro's author (or
your own shadow of it) picks; `tejun-step start <name>` steps ANY macro on demand when
you or the owner wants the check-ins.
**Never report a run complete with steps undone — especially the last one.**

**Preview is the macro's own toggle: `- **preview:** yes` in an entry** puts it on the ⚡
drop of every tile header. **No marking = not on the drop — the default**, and that is the
whole of it: the drop is a TEACHING surface rather than an index, four big buttons a person
who has never heard of a macro can read and go *"oh, I see, it does something I didn't know
this could do"* (owner, 2026-08-17 — *"If we have too many, people just don't get
educated"*). Opt-in, not opt-out, because this file holds a dozen entries and the drop holds
about four: under opt-out every macro added later would appear on the button until somebody
noticed it there.
**DISPLAY ONLY — an unpreviewed macro still runs**, typed by hand, bound to a keypad key, or
compiled with `tejun`. Nothing is hidden from an agent and nothing is deleted; the toggle
answers "is this on the button", not "does this exist".
The card is drawn from the entry's `label:` and `blurb:` — which every entry carries, previewed
or not, for the reason below.

**TWO AUDIENCES, AND NEITHER STANDS IN FOR THE OTHER** (owner, 2026-08-17 — *"we need to
split out the description and the agent instruction into two different things because they
don't overlap, and the macro should carry both"*). Every entry here is read by two readers
who need opposite things, so it carries two separate pieces of writing:

- **The prose under the heading is the AGENT'S INSTRUCTION** — what you read in order to RUN
  the macro. It opens with the rule the agent must not break (`forkit` starts *"Owner-invoked
  only — never fork on your own initiative"*), it names actions and params, and it assumes the
  house vocabulary. Served as `instruction` on `/api/macros`; the field was called
  `description` until 2026-08-17, and that name is what invited a human surface to render it.
- **`label:` and `blurb:` are what a PERSON reads** to decide whether they want the macro.
  Previewed macros use their executable `+name:` spelling as the concise button headline;
  the always-visible blurb explains what it does for somebody who has never heard of it. No
  jargon a newcomer would not have, and **true about what the macro actually does** rather
  than evocative — a destructive macro's blurb must say so plainly instead of sounding
  inviting. Same two keys, same job, as the launcher buttons in `ronin_catalogs/session_roles/`.

**Both are required on every entry** — `check:catalogs` fails a stock entry missing either —
and **no human surface may fall back to the instruction.** Showing *"Owner-invoked only —
never fork on your own initiative"* to a person who tapped a button to find out what it does
teaches them nothing; that fallback existed until 2026-08-17 and it was the exact overlap the
owner is splitting. Every macro carries the pair even though the drop shows four, because the
next surface is a library people browse to adopt macros from, and copy written for four
entries would have to be written again for all of them.

**RUN IT — DON'T NARRATE IT.** A macro invocation is a button press, not a
conversation. Do not announce what a macro is, that you are about to read TEJUN docs,
or what steps you plan to take. Read what you need silently, do the work, and report
only the OUTCOME (and any question that genuinely blocks you). "The evaluate:
shorthand is a TEJUN macro — I'll read the TEJUN docs first, then…" is exactly wrong.

**Referring to a session in text: `@<session>`** (e.g. `@page_capture`). Verified safe
to type into the claude CLI — it submits normally. Caveat: if the name matches a file
or directory in the cwd the CLI's file-completion popup may appear; pick the session
from Ronin's target picker in that case, or pass it as a macro arg.

## updateplan
- **class:** session_macro.workflow
- **label:** Ask it to update its plan
- **blurb:** Ronin types one line into the session asking the agent to bring its ladder up to date, so the steps shown under the tile header match what it has actually done. Nothing else happens — it fixes the list and carries on with what it was doing, without reporting back to you.
Ask this session to bring its TEGAMI up to date. **Ronin sends this one for you** —
the button does not prefill it, it types the line below and presses Enter, so the
session updates its ladder without you writing anything. Nothing else happens: the
agent rewrites its own letter and carries on with what it was doing.

Send: Update your TEGAMI now — read it, bring the ladder in line with what you have actually done since you last wrote it, and write it back with write_tegami. Do not report to me about it; just update it and carry on with what you were doing.

| # | Action | With |
|---|---|---|
| 1 | report-outcome | nothing to report — the letter IS the outcome; do not narrate the update |

## show_file
- **class:** session_macro.workflow
- **preview:** yes
- **label:** +show_file:
- **blurb:** Ask this session what it has open. It lists its documents on the ▧ Docs tab in commons — and, on a team page, opens the one you asked for in the workspace beside you — so you read and edit the real file instead of hunting your disk for it.
Owner wants to READ what you are working on: `+show_file`, or `+show_file: MDEDIT.md`.
Bring your document list up to date, then put the file in front of them. **Do not paste
the document into the pane and do not summarise it** — the point is that they open the
real file and can edit it.

Params: `file` (optional — one document to make sure is listed, and to reveal. Bare
`+show_file` means "list everything you are working on").

| # | Action | With |
|---|---|---|
| 1 | list-doc | `write_tegami --doc <path>` for the named file, or for every document this session is working on — buildouts, handoffs, plans, notes. `--undoc` anything you have finished with |
| 2 | team-page-read | `tejun-teampage` — if a tab is showing your team page, it tells you which workspace the owner is typing in and which shows you. `NO-PAGE` (they are not on the team page) or `NO-TEAM` (you are on no team) ends this step; the list is still on ▧ Docs |
| 3 | team-page-draft | with a named file: `tejun-teampage <other>=commons:docs:<path>` — the commons on ▧ Docs with that file open, in the workspace the owner is NOT typing in (`<other>` = workspace1 or workspace2, read off step 2). Bare `+show_file`: `tejun-teampage <other>=commons:docs` — the list, in that workspace |
| 4 | report-outcome | name what you listed, then say where it is (wording below) |

Report: the documents you listed, one per line by name, then — on a team page —
**"<file> is open in workspace <n>, on ▧ Docs."**; otherwise **"open them from the ▧ Docs
tab in commons, under this session."** That sentence is the whole point of the macro —
without it they have a list they do not know exists.

Bare `+show_file` is the common case and it is a sweep: go through what you have actually
created or been editing this session and list all of it, not just the newest. Being
generous here costs one line each and is the difference between a tab that answers "what
is this session working on" and one that answers "what did it remember to mention".

## forkit
- **class:** session_macro.workflow
- **preview:** yes
- **label:** +forkit:
- **blurb:** Tell this agent to fork itself — it writes down what you have been working on, opens a second session on that topic, and hands the context over. This one stays on its track.
**Owner-invoked only — never fork on your own initiative.** If a fork seems right,
PROPOSE it ("I'd like to fork X into its own session") and wait for the go-ahead.
Unannounced sessions are untrackable for the human until the UI reveals them. Spin the current conversation's active topic out into its own agent
session, so the origin session stays on its track. (The breakout pattern, first performed manually 2026-08-05.)

Every launch input is optional. `tejun-fork` accepts instructions plus optional `name`,
`team`, `session_role`, `provider`, `model`, and `dial`. With no Team it inherits the
origin session's first Team; with no Campaign override it inherits the origin's Campaign.
With neither it is still born. A blank role is valid. A blank name is generated. Control
falls back to read-and-write. Provider-only selects that provider's configured preferred
model, then its first launch-table entry; model-only resolves the named model; neither
uses the Campaign's Agent defaults, then the install defaults.

**Use `tejun-fork`; it uses the same launch contract as the ＋ New form.** Forks were
starting from a bare `tmux new-session` and then typing a CLI at it, which is a second,
bespoke launch path — and it arrives with **zero Build Brief**: no reading list, no
posture, no letter, and no role. `session-launch` is the canonical pipeline, and the fork
gets the whole compiled brief from it: all-session reading + the project_root's + the
Team's + the session_role's, and then any handoff instructions on top.

There is no immutable `role_family` launch axis and no mandatory role decision. Do not
invent one and do not stop to ask for one. Pass a role only when the owner supplied it or
the work itself needs that role's additional reading.

**THREE WAYS TO ASK, AND SAYING NOTHING IS THE FIRST ONE** (owner, 2026-08-29). Say
only as much as the owner actually said, and let the rest load lazily:

| The owner said | You pass | What is born on |
|---|---|---|
| *"give me an agent to do XYZ"* | neither field | the owner's session default — `agents.sessions.default` |
| *"give me an Anthropic agent"* | `provider: anthropic` | that provider's preferred model in ⚙ Configuration, else its first column |
| *"open a fable five session"* | `model: fable` | that model |

A `session_role` states no model and biases none, so there is no layer in between and
nothing a fork inherits about the model from the task it is given. **Never invent the
next field down** — passing a model because the owner named a vendor is you deciding
something they left open. A model must be a real cell from the launch table and a
provider a real row; never a command you composed, and never both a `cmd` and either.

State both resolved axes in the report. The owner is one glance from seeing a wrong
role and one kill from fixing it, which is only true if the report says what was chosen.

| # | Action | With |
|---|---|---|
| 1 | read-letter | your OWN letter — its Campaign and first Team are the launch defaults |
| 2 | write-handoff-doc | a wip handoff doc (location per the documents SOP) — distill THIS conversation's context on the topic: goal in the owner's words, constraints, verification, definition of done |
| 3 | launch | `tejun-fork` with only the values the owner actually supplied; give it the handoff instruction when a handoff was written |
| 4 | report-outcome | session name, resolved Team, Control and optional role/model, handoff doc path, how to open it |

**The prompt for step 4** — READ AND REPORT UNDERSTANDING FIRST, never "read this and
execute it". A fork starts by proving it understood, not by working: *"Read <handoff
path>. Then report back, in your own words: what the job is, what you will NOT do (in
particular: NO code, NO builds, NO commits until the owner says go), and anything in the
brief that is unclear or looks wrong. Do not act on it yet — wait for the owner. Follow
CLAUDE.md and CLAUDE.local.md conventions strictly."* Add, for planning topics, what the
eventual deliverable is: *"when the owner gives the go-ahead, the output is a wip build-out
plan per the documents SOP — a plan, not code."*

Do NOT type that prompt into the pane. It rides in through `tejun-fork` as part of the
compiled Build Brief, and the resolved task's own `ack:` rule adds the report-first
instruction on top of it.

**Afterwards the fork owns its own task.** When its work moves on — plan approved, cutting
begins — it re-marks itself with `write_tegami` and Ronin hands it that task's reading,
once.

Report: session name, one-line topic, where the handoff doc lives. **A macro's result
must be shown, not just performed** — until the UI auto-splits the panel on fork
(planned), the report must tell the owner explicitly that a new session now exists and
how to open it in the grid. The owner talks to the new session DIRECTLY in its tile
from here on — the origin session must not relay.

## buildout
- **class:** session_macro.workflow
- **label:** Plan it before any code
- **blurb:** Ask for the work written up as a plan first — what it is for, the steps it breaks into, how you will know it is finished. No code gets written: the agent hands you the document and waits while you read and change it.
Plan a piece of work as a document the owner can read, edit and riff on — no code yet.
"buildout: <what to build>".

| # | Action | With |
|---|---|---|
| 1 | write-buildout-doc | a wip build-out doc (location per the documents SOP) — goal, legs, constraints, verification, done |
| 2 | report-outcome | where the doc is and the legs proposed — then WAIT for the owner |

Report: where the doc is, and the legs proposed. Then WAIT — the owner reviews and
edits the doc before any cutting starts.

## cutcode
- **class:** session_macro.workflow
- **label:** Build what the plan says
- **blurb:** Point the agent at a plan you have already agreed and it builds from it — one step at a time, or all the way to the end. It works at its own desk, saves checkpoints privately, and hands finished work in to the team when a step is whole; it never opens a pull request or merges anything itself.
Build from a buildout doc. "cutcode: <doc> leg" / "cutcode: <doc> finish"
(add `live` if sequencing matters; default is `dev`).

| # | Action | With |
|---|---|---|
| 1 | cut-code | scope `leg`\|`finish`, coordination `dev`\|`live`; work in your desks; commit privately; delete each completed item from the doc as you go |
| 2 | report-outcome | what got cut, what remains in the doc, what was handed in and what is still private on the desk |

Report: what got cut, what remains in the doc, what was handed in (`tejun-desk hand-in`,
offered at each DONE leg — your call, never automatic) and what is still private on the
desk. No PR: that is the release process's, from `dev`. On `leg`, stop and wait.

## land
- **class:** session_macro.workflow
- **label:** Finish up, then close this session
- **blurb:** Writes the work down where it will last — a README beside the code, every desk handed in or parked, one line in the index of finished work — and then ends the session for good. Use it when the work is done: the pane closes and there is nothing to come back to.
**Land YOURSELF.** No args: finish the work of THIS session, leave the record, end
this session. The buildout doc you were working from is your own wip;
if you truly can't tell what you were building, ask — don't guess.
(Landing someone else's session would be a different macro — "land your neighbour" —
which does not exist yet. Don't improvise it.)

| # | Action | With |
|---|---|---|
| 1 | land-work | persistent README where the code lives; DELETE the wip buildout doc; close every desk — hand in what is coherent, park the rest |
| 2 | land-manifest | ONE line appended to the manifest (location per the documents SOP) — an index entry, not history |
| 3 | report-outcome | README path, what was handed in and what was parked, manifest line — BEFORE you end |
| 4 | harakiri | end this session — last act, after every desk is handed in or parked and reported |

Report to the owner (before step 4): the README path, the hand-in receipts and any parked
desk, the manifest line. No PR is opened here: `dev → master` belongs to the release process.
Sessions are disposable: nothing of value may live only in a pane.

## delete
- **class:** session_macro.workflow
- **label:** Throw this session away
- **blurb:** Ends the session and keeps nothing — no write-up, no pull request, no index entry, no way back. For sessions that produced nothing worth saving. It refuses and tells you if there is unsaved work, which is the case for finishing up properly instead.
**End THIS session quietly — nothing recorded.** For sessions that produced no
artifact worth keeping: evaluations, catch-ups, questions, scratch work. No README,
no manifest line, no PR. It just goes away.

| # | Action | With |
|---|---|---|
| 1 | check-clean | unsaved files, commits not handed in, or an unsaved artifact at any desk → STOP: that is a `land`, not a `delete` |
| 2 | report-outcome | one line: what you were, that nothing was kept |
| 3 | harakiri | end this session |

Contrast with `land`: land RECORDS (README + manifest + hand-in/park) then dies; delete just dies.

## team
- **class:** session_macro.lookup
- **label:** Who is on this team
- **blurb:** Name a team of sessions and get back who is on it right now, with each one's permission dial. It only looks the name up — it never tags anything, and it sends the members nothing.
Aliases: tag, group (retired spellings, read but never taught)
Owner names a TEAM and expects you to know who is on it: `+team: ronin` — "the ronin
team" is now the set we are talking about. **Read-only: this NEVER tags anything.**
Tagging is the owner's hand in the Ronin UI (🏷 on the tile header), or a macro's at
birth; `+team:` only resolves a name to its members.

Params: `team` (the team name; bare `+team` with no arg = list every team in play).

**Sent through Ronin, this arrives ALREADY ANSWERED.** The server resolves the team
at send time, so what lands in the pane is the roster itself ("→ resolved by Ronin (no
lookup needed): the ronin team is 3 sessions — …"). When you see that, the lookup is
DONE: report it and stop. Do not compile this macro, do not re-run the tool to confirm
it, do not go hunting the session list — that is exactly the busywork the expansion
exists to remove. The steps below are the FALLBACK, for a `+team:` typed straight into a
pane (which Ronin never sees) or when the expansion is unavailable.

| # | Action | With |
|---|---|---|
| 1 | team-roster | `tejun-team <team>` — members + each one's dial. No arg: `tejun-team` lists the teams |
| 2 | report-outcome | the members with their dials, and that this set is now what "<team>" means in this conversation |

Report: the member sessions and their dials, in one short block — then STOP. `+team:` on
its own is a lookup, not an instruction to go do something to them; wait for what the
owner wants done with the set.

**Re-resolve, never remember.** Membership changes when sessions are born, get tagged,
or die, so run `tejun-team` again at the start of any later fan-out over the team —
a list carried in your head goes stale silently, which is the whole failure this macro
exists to prevent. And each member still needs its own control-check before you touch
it: the roster reports the dial, it does not grant anything.

If the name matches nothing, say so and show what teams DO exist (`tejun-team`) —
never guess at a near-match, `kojin` and `kojinsa` are different teams.

## wipeboard
- **class:** session_macro.lookup
- **preview:** yes
- **label:** +wipeboard:
- **blurb:** A wipeboard is one file several sessions read and append to, so agents on one problem talk to each other instead of through you. Name one and this says what it is for, who is on it, and where it lives.
Owner names a WIPEBOARD and expects you to know what it is and who is on it:
`+wipeboard: parserwork`. A wipeboard is a shared text surface — one markdown file
several sessions all read and append to — so agents on the same problem talk to each
other instead of every message going through the owner. **Read-only: this NEVER enrols
anyone.** A TEAM wipeboard's membership is the team's — it follows the tags, and there
is no enrolment at all; a CUSTOM wipeboard's membership is the owner's hand (the
▤ Wipeboard tab in Ronin). `+wipeboard:` only resolves a name to its brief, its roster
and its path.

Params: `wipeboard` (the wipeboard's name; bare `+wipeboard` with no arg = list every wipeboard in play).

**Sent through Ronin, this arrives ALREADY ANSWERED** — same as `+tag:`. The server
resolves the wipeboard at send time, so what lands in the pane is the brief, the roster and
the file path. When you see that, the lookup is DONE: read the thread if you are being
asked to join the conversation, and otherwise report and stop. The steps below are the
FALLBACK, for a `+wipeboard:` typed straight into a pane (which Ronin never sees).

| # | Action | With |
|---|---|---|
| 1 | wipeboard-check | `tejun-wipeboard <board>` — the brief, who is on it, and where it lives. **Bare `tejun-wipeboard` is not a listing** — it hands the session whatever it has not read on its team's board; bare `tejun-wipeboard post <text>` says something there, no name needed. `tejun-wipeboard boards` is the listing |
| 2 | report-outcome | what the wipeboard is for, who is on it, where the file is |

Report: the brief in a line, the members with their dials, and the path — then STOP.
Being pointed at a wipeboard is not an instruction to start posting on it; wait for what
the owner wants said. When you DO post, the rules are in the wipeboard-post action:
append only, never rewrite another agent's post, never edit the Brief.

## tell
- **class:** session_macro.workflow
- **preview:** yes
- **label:** +tell:
- **blurb:** Hand this agent a line for another agent and it delivers it — checking that session's dial first, and never typing over a draft at its prompt. The reply lands in that session's own tile.
Owner wants THIS session to say something to ANOTHER one:
`+tell: page_capture the login work is on hold, stay off it for now`. The owner's words for
what it is: *"I can tell my agent to talk to another agent."* One message, one session,
delivered or refused — it is not a fan-out over a team and it is not a conversation.

Params: `session` (who to reach — the first word after the colon), `message` (everything
after that; send the owner's words unless he asks you to put it your own way).

| # | Action | With |
|---|---|---|
| 1 | control-check | needs `write` **on the target, not on you**. Dialed `user` or `read`: report the lock and ask the owner to flip THAT tile's dial to 🤖, then wait — NEVER flip it yourself |
| 2 | send-to-session | `tejun-send <session> <message>` — one call. It re-checks the dial, refuses to overwrite a real draft, sends the text and the Enter separately, and confirms the other agent started. Do not hand-roll the five steps |
| 3 | report-outcome | the tool's verdict as it gave it, and what you actually said |

**Say who it is from.** `tejun-send` puts no watermark on the message, so what lands at the
other prompt looks exactly like the owner typing — open with `from @<your session>:` or the
agent on the other end answers the wrong person.

Report: the verdict (`DELIVERED` / `DENIED` / `BLOCKED` / `STUCK` / `NO-SESSION`) and the
message you sent, in one short block. **Then stop, and do not wait for a reply** — the
answer appears in the OTHER session's tile, where the owner reads it himself. Relaying it
back through here makes this session a switchboard and hides which agent said what.

A refusal is an ANSWER, not an obstacle. `DENIED` means the dial forbids the write and only
the owner's hand changes that; `BLOCKED` means a human's unsent draft is at that prompt and
typing over it would destroy their words. Neither is retried, and neither is worked around
with a bare `tmux send-keys` — going around the shim is a deliberate, visible act and this
is not an occasion for one.

## read
- **class:** session_macro.workflow
- **label:** Catch up on another session
- **blurb:** Have this agent look in on another session and tell you what it is doing, how it is going, and anything that is waiting on you. It reads only, and stops rather than touching a session you have not opened up.
Owner asks for a catch-up on a session: "read <session>".

| # | Action | With |
|---|---|---|
| 1 | control-check | needs ≥ `read`. If dialed `user`: report the lock and ask the owner to flip the dial to 👁 in the UI, then wait — NEVER flip it yourself |
| 2 | session-catchup + status-probe | — |
| 3 | report-outcome | what it is doing, its state, anything needing the owner |

Report: what the session is doing, its state, anything needing the owner. Agent may
keep watching but MUST NOT write until the owner changes the dial.

## readwrite
- **class:** session_macro.workflow
- **label:** Have it work in another session
- **blurb:** The same catch-up as reading a session, and then this agent acts in that one for you — fixes the thing, answers the question. It only goes ahead if you have set that session's dial to let an agent write; it will never flip the dial itself.
Owner wants an agent acting in a session: "read-write <session>" / "check <session>
and fix …".

| # | Action | With |
|---|---|---|
| 1 | control-check | needs `write`. If dialed `user` or `read`: report the lock and ask the owner to flip the dial to 🤖 in the UI, then wait — NEVER flip it yourself |
| 2 | session-catchup + status-probe | — |
| 3 | report-outcome | state, then act |

Report state; then act per the owner's instruction (sends go via the send-to-session
action).

## evaluate
- **class:** session_macro.workflow
- **label:** Get a second opinion on it
- **blurb:** Have this agent read another session's work — its documents, its commits, the plan it is following — and tell you whether it holds up, what is missing and what looks risky. The verdict comes to you and is never written into the session being judged.
Owner asks for an independent read-only assessment of another session's work:
"evaluate <session>'s plan".

| # | Action | With |
|---|---|---|
| 1 | control-check | needs ≥ `read` — if `user`, ask the owner to grant read first |
| 2 | session-catchup | deeper: `-S -1000` |
| 3 | status-probe | — |
| 4 | read-work-record | the docs, README and commits behind the work — reads only |
| 5 | report-outcome | the assessment, to the OWNER — never written into the evaluated session |

Report an assessment: is the plan/work sound, gaps, risks, whether it matches the
owner's stated intent. NEVER write into the evaluated session — deliver the verdict
to the owner (or, on request, as a handoff doc). Evaluator stays independent: do not
adopt the session's assumptions uncritically; check them against the docs.

---

*(Add macros sparingly. Every macro must decompose into listed actions; if a step has
no action, add the action to ACTIONS.md first — separately, so other macros can
reuse it. If a "macro" is a single action the_owner would never say, it's an action.)*
