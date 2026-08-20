# ronin_sops — how this house goes about things

An **SOP** is the standard way this install approaches an area of work: source control,
data, getting a thing deployed. **Not the only way and not the right way** — the way, so
every session goes about it the same, and the_owner has one file to change when they want
it done differently.

## SOP or library — the one question

Both shelves are markdown, both are shadowed file-for-file by a store, and neither is
prescriptive. **The difference is who fetches it:**

| | fetched by | arrives | written for |
|---|---|---|---|
| **`ronin_sops/`** | the **situation** — nothing names it until one arises | when someone goes looking | a person, relayed by the agent |
| **`ronin_library/`** | the **machinery** — an action names it, `ronin_bin/tejun` inlines it at compile | mid-task, unasked | the agent, mid-step |

**An action never leads to an SOP.** An SOP may point at an action — its `> Tool:` header
does — and the arrow runs that way only (owner, 2026-08-15). The test when you are
unsure: **if you can name the action that would cite it, it is library.** If the only
answer is "someone would look it up when the topic came up", it is an SOP.

**Cut what is blindingly obvious.** The test is not length — it is whether a competent
agent already knows the step. If a procedure has ten steps and eight of them are obvious,
write the two. An SOP is not there to replace the agent's judgment with a checklist; it is
there to say **which of several workable ways this house picks**, and to point at the
actions that do the work. Length is a symptom: a file that keeps growing is usually one
that has started explaining rather than deciding.

The obvious step and the house preference can look alike, so the discriminator is: could
somebody competent land somewhere else and still be right? If yes it is a preference and
it belongs here (where a document lives, which database by default, what counts as done).
If no, it is instruction and the agent already has it.

**No facts about a machine.** An SOP says where to look and what to establish first. It
never says what is installed, what is running, or where anything currently sits — those
are resolved (`bin/ronin-doctor`, `bin/ronin-store --all`), never written down. A written
fact about a box is wrong the day the box changes, and nobody notices.

**Where a domain has a measurable, name the tool — at the top.** An SOP carries a
`> Tool:` line in its header, the same form `ronin_catalogs/ACTIONS.md` uses, so the eye
finds it in the same place everywhere. `data.md` names `tejun-survey`; `secrets.md` names
`tejun-secrets`; `github.md` names nothing, because git is git. The pointer is always to a
**cataloged action's tool**, never a loose script.

This is the shelf's sharpest edge, and it is not really about discovery. **A capable agent
will reason well about a domain and skip the step of finding out what is actually true
here** — it will advise on where 30GB should go without ever asking how big the disk is,
because the advice sounds right either way. The `> Tool:` line puts information-gathering
before the conversation instead of after it, and it costs one run. The numbers stay in a
terminal, where they are true, and never in the file, where they would rot.

## One voice: relay

An SOP is **written for the agent to relay** — a walkthrough for a person who does not
know the domain, delivered by the agent, and each one says so in its header. Getting this
wrong means the agent silently follows a walkthrough itself instead of walking the_owner
through it.

There used to be a second voice, *written at the agent*, and it had exactly one file:
`documents.md`. That file is now `ronin_library/documents.md`, because a rule the agent
applies itself is fetched by the machinery, not by a situation. The voice split and the
shelf split turned out to be the same split — which is the best evidence the boundary is
real.

**Who they are for.** The_owner may know an area cold or may never have had a repo.
Nothing here is pushed at either of them — an SOP costs nothing until a situation calls
for it, and the situation is what selects the reader. That is the whole gate; there
is no other.

## How one reaches a session

**One route, and it never pastes an SOP at a session that did not ask.** An SOP is
**found by name**: `docs/SHELVES.md` says the shelf is there, and every session is handed
that map at birth through `ronin_session_boot/all/`. Nothing else fetches one — no macro
compile, no action, no boot paste of the SOPs themselves.

That is the point, not a gap. A shelf that arrived unasked would be pushing a GitHub
walkthrough at someone who has used git for fifteen years, every session, forever.

**Yours beats ours, file for file.** Your own SOPs live in the `sops` store
(`ronin-store sops` — never spell the path): a file there with the same name as a shipped
one replaces it whole, a new name sits beside stock, and an upgrade never touches your
store. Redefining one is how your sessions inherit *your* process instead of ours.

**Deliberately near-empty.** Stock SOPs are screened in one at a time, exactly like the
library.
