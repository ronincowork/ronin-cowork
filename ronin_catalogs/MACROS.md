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
  One command (`tejun-group`, `tejun-wipeboard`), no compile, no step tracking; sent
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
Owner wants to READ what you are working on: `+show_file`, or `+show_file: MDEDIT.md`.
Bring your document list up to date, then tell them where to look. **Do not paste the
document into the pane and do not summarise it** — the point is that they open the real
file and can edit it.

Params: `file` (optional — one document to make sure is listed. Bare `+show_file` means
"list everything you are working on").

| # | Action | With |
|---|---|---|
| 1 | list-doc | `write_tegami --doc <path>` for the named file, or for every document this session is working on — buildouts, handoffs, plans, notes. `--undoc` anything you have finished with |
| 2 | report-outcome | name what you listed, then send them to the tab (wording below) |

Report: the documents you listed, one per line by name, then **"open them from the ▧ Docs
tab in commons, under this session."** That sentence is the whole point of the macro —
without it they have a list they do not know exists.

Bare `+show_file` is the common case and it is a sweep: go through what you have actually
created or been editing this session and list all of it, not just the newest. Being
generous here costs one line each and is the difference between a tab that answers "what
is this session working on" and one that answers "what did it remember to mention".

## forkit
- **class:** session_macro.workflow
**Owner-invoked only — never fork on your own initiative.** If a fork seems right,
PROPOSE it ("I'd like to fork X into its own session") and wait for the go-ahead.
Unannounced sessions are untrackable for the human until the UI reveals them. Spin the current conversation's active topic out into its own agent
session, so the origin session stays on its track. (The breakout pattern, first performed manually 2026-08-05.)

Params: `topic` (short slug), `dir` (working directory for the new session; default:
current repo root), `group` (which group the new session joins; default: the origin
session's own groups, so a fork stays addressable with its parent — `tejun-group` lists
what exists. Ask the owner if the origin has none).

| # | Action | With |
|---|---|---|
| 1 | write-handoff-doc | a wip handoff doc (location per the documents SOP) — distill THIS conversation's context on the topic: goal in the owner's words, constraints, verification, definition of done |
| 2 | session-create | name `<topic>`, cwd `<dir>`, tags `<group>` |
| 3 | run-command | `claude` |
| 4 | wait-ready | claude pattern |
| 5 | send-prompt | **READ AND REPORT UNDERSTANDING FIRST — never "read this and execute it".** A fork starts by proving it understood, not by working: "Read <handoff path>. Then report back, in your own words: what the job is, what you will NOT do (in particular: NO code, NO builds, NO commits until the owner says go), and anything in the brief that is unclear or looks wrong. Do not act on it yet — wait for the owner. Follow CLAUDE.md and CLAUDE.local.md conventions strictly." Add, for planning topics, what the eventual deliverable is: "when the owner gives the go-ahead, the output is a wip build-out plan per the documents SOP — a plan, not code." |
| 6 | confirm-started | the fork has ACKNOWLEDGED — it reported its understanding and is waiting, not working |
| 7 | report-outcome | session name, topic, handoff doc path, how to open it |

Report: session name, one-line topic, where the handoff doc lives. **A macro's result
must be shown, not just performed** — until the UI auto-splits the panel on fork
(planned), the report must tell the owner explicitly that a new session now exists and
how to open it in the grid. The owner talks to the new session DIRECTLY in its tile
from here on — the origin session must not relay.

## buildout
- **class:** session_macro.workflow
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
Build from a buildout doc. "cutcode: <doc> leg" / "cutcode: <doc> finish"
(add `live` if sequencing matters; default is `dev`).

| # | Action | With |
|---|---|---|
| 1 | cut-code | scope `leg`\|`finish`, coordination `dev`\|`live`; delete each completed item from the doc as you go |
| 2 | open-pr | branch → PR for the owner's approval; never merge |
| 3 | report-outcome | what got cut, what remains in the doc, the PR link |

Report: what got cut, what remains in the doc, the PR link. On `leg`, stop and wait.

## land
- **class:** session_macro.workflow
**Land YOURSELF.** No args: finish the work of THIS session, leave the record, end
this session. The buildout doc you were working from is your own wip;
if you truly can't tell what you were building, ask — don't guess.
(Landing someone else's session would be a different macro — "land your neighbour" —
which does not exist yet. Don't improvise it.)

| # | Action | With |
|---|---|---|
| 1 | land-work | persistent README where the code lives; DELETE the wip buildout doc |
| 2 | open-pr | if anything is uncommitted |
| 3 | land-manifest | ONE line appended to the manifest (location per the documents SOP) — an index entry, not history |
| 4 | report-outcome | README path, PR link, manifest line — BEFORE you end |
| 5 | harakiri | end this session — last act, after everything is pushed and reported |

Report to the owner (before step 4): the README path, the PR link, the manifest line.
Sessions are disposable: nothing of value may live only in a pane.

## delete
- **class:** session_macro.workflow
**End THIS session quietly — nothing recorded.** For sessions that produced no
artifact worth keeping: evaluations, catch-ups, questions, scratch work. No README,
no manifest line, no PR. It just goes away.

| # | Action | With |
|---|---|---|
| 1 | check-clean | uncommitted work or an unsaved artifact → STOP: that is a `land`, not a `delete` |
| 2 | report-outcome | one line: what you were, that nothing was kept |
| 3 | harakiri | end this session |

Contrast with `land`: land RECORDS (README + manifest + PR) then dies; delete just dies.

## tag
- **class:** session_macro.lookup
Aliases: group
Owner names a GROUP and expects you to know who is in it: `+tag: ronin` — "the ronin
group" is now the set we are talking about. **Read-only: this NEVER tags anything.**
Tagging is the owner's hand in the Ronin UI (🏷 on the tile header), or a macro's at
birth; `+tag:` only resolves a name to its members.

Params: `group` (the tag name; bare `+tag` with no arg = list every group in play).

**Sent through Ronin, this arrives ALREADY ANSWERED.** The server resolves the group
at send time, so what lands in the pane is the roster itself ("→ resolved by Ronin (no
lookup needed): the ronin group is 3 sessions — …"). When you see that, the lookup is
DONE: report it and stop. Do not compile this macro, do not re-run the tool to confirm
it, do not go hunting the session list — that is exactly the busywork the expansion
exists to remove. The steps below are the FALLBACK, for a `+tag:` typed straight into a
pane (which Ronin never sees) or when the expansion is unavailable.

| # | Action | With |
|---|---|---|
| 1 | group-roster | `tejun-group <group>` — members + each one's dial. No arg: `tejun-group` lists the groups |
| 2 | report-outcome | the members with their dials, and that this set is now what "<group>" means in this conversation |

Report: the member sessions and their dials, in one short block — then STOP. `+tag:` on
its own is a lookup, not an instruction to go do something to them; wait for what the
owner wants done with the set.

**Re-resolve, never remember.** Membership changes when sessions are born, get tagged,
or die, so run `tejun-group` again at the start of any later fan-out over the group —
a list carried in your head goes stale silently, which is the whole failure this macro
exists to prevent. And each member still needs its own control-check before you touch
it: the roster reports the dial, it does not grant anything.

If the name matches nothing, say so and show what groups DO exist (`tejun-group`) —
never guess at a near-match, `kojin` and `kojinsa` are different groups.

## wipeboard
- **class:** session_macro.lookup
Owner names a WIPEBOARD and expects you to know what it is and who is on it:
`+wipeboard: parserwork`. A wipeboard is a shared text surface — one markdown file
several sessions all read and append to — so agents on the same problem talk to each
other instead of every message going through the owner. **Read-only: this NEVER enrols
anyone.** Membership is the owner's hand (the ▤ Wipeboard tab in Ronin), same as
tagging; `+wipeboard:` only resolves a name to its brief, its roster and its path.

Params: `wipeboard` (the wipeboard's name; bare `+wipeboard` with no arg = list every wipeboard in play).

**Sent through Ronin, this arrives ALREADY ANSWERED** — same as `+tag:`. The server
resolves the wipeboard at send time, so what lands in the pane is the brief, the roster and
the file path. When you see that, the lookup is DONE: read the thread if you are being
asked to join the conversation, and otherwise report and stop. The steps below are the
FALLBACK, for a `+wipeboard:` typed straight into a pane (which Ronin never sees).

| # | Action | With |
|---|---|---|
| 1 | wipeboard-post | `tejun-wipeboard <wipeboard>` — roster + path. `tejun-wipeboard <wipeboard> read` for the brief and the thread. No arg: `tejun-wipeboard` lists the wipeboards |
| 2 | report-outcome | what the wipeboard is for, who is on it, where the file is |

Report: the brief in a line, the members with their dials, and the path — then STOP.
Being pointed at a wipeboard is not an instruction to start posting on it; wait for what
the owner wants said. When you DO post, the rules are in the wipeboard-post action:
append only, never rewrite another agent's post, never edit the Brief.

## read
- **class:** session_macro.workflow
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
