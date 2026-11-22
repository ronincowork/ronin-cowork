# The tile

A tile shows one session inside a workspace. Open an Agent from the workbench's discovery
column, or drag its card into the workspace where you want to see it.

## The header

| Control | What it does |
|---|---|
| Title / ⛩ | Edit the Agent's displayed title; its session name remains its identity |
| Item island | A pill for every work item the Agent holds (below) |
| ⚑ | Only while an item the Agent holds is flagged; hover for each flag's reason. One press unflags every flagged item it holds (comment "unflagged by owner") and the ⚑ goes. Also on the phone's bar |
| Term / Chat | When Terminal transcript is active, switch between the terminal and the Agent's conversation |
| メ | Open the menu for this Agent (below) |
| − | Close this view while the Agent keeps running |

## The item island

In the middle of the header sits a capsule with a pill for every work item the Agent
holds. A pill has no words: it shows the item's kind with Jira's symbol (Epic, Story, Task,
Bug, Feature, Subtask), a dot for its status, and ⚑ when the item is flagged. Hover a pill
to read its key, kind, status and title.

The island is the work still open: a Done item is not on it. A Subtask whose Task is on the
island is not a pill of its own: the Task's pill carries the Subtask mark and how many of its
Subtasks are open, and the Task's reading lists all of them, Done included, under **Subtasks**.
Press one to open it in the Task's place.

Press a pill and the item's reading opens over the tile, in the launch forms' format: its
Status (press it to move the item to any status), objective, details, comments and attachments
(docs/using-ronin/work-items.md, An item's reading), a Task's Subtasks with the Done ones
folded apart, and a box to comment, sent to the Agent holding it. Every row folds. Press the same pill again, or Close, or
Escape, to return to the terminal.

A press answers at once (w416): while the item is on its way (one read of it, about a tenth of
a second, most of it the server finding its Subtasks among every item) the pill, or its bar when
the island is down, greys out with a busy cursor, and pressing it again does nothing until the
item has opened.

The island stays in the header; it does not move when an item changes. Press the small bar
at its left to bring it down under the header, with the pills in a column, one item to a
row. Each row reads: the kind's symbol, the status in words (To Do, In Progress, In Review,
Done), its dot (grey, blue, amber, green), and the flag: solid when the item is flagged,
an outline when it is not. An item In Review also carries its latest signal, "handed in" or
"on dev", with how long ago, read from the item's own hand-ins: a hand-in leaves the item with its
Agent, so the island shows only what its Agent holds. Press the bar again, or a pill, to put it back in the header.

Down, **More detail** widens the list to the tile's width: a bar per item, only as tall as the
items need (past the tile's foot the bars scroll, and the bar above them and **Less detail** below stay in view). Each bar reads the pill's row (symbol, key, title,
status, flag, hand-in) and under it what the item is: its description (two lines), its last
comment (who, how long ago, the first line), and its facts: its kind in words (Task, Bug, Epic…), the Task it is under,
how many Subtasks are open, attachments, comments, and when it last moved. A Task's open
Subtasks follow it as slimmer bars. Press a bar to open the item's reading; **Less detail**
goes back to the column, and the bar or Escape puts it all back in the header.

On a Team lead, the island also shows what its Teams hold at the Epic and Task level, after
the items the lead holds itself. An Epic generally sits on the Team, and a Task the Team holds is
one no member has taken yet, so the lead's island is where unassigned work shows. Once a member
takes it, it leaves the lead's island. A Team's Subtasks, and anything only watched, appear only
when the lead holds them itself.

Left of the island's bar, a round mark says when the Agent needs you. It shows only three
things: **question** (kaki, a ?: a dialog or survey is open and waiting for your answer),
**your turn** (a soft kaki ›: the turn ended), and **stopped** (red, !: interrupted, or the
last tool failed). While the Agent is working, replying, or its state is unknown there is no
mark; the transcript's dots already say it is busy. An Agent holding no items still shows its
island when one of these is up. Down or wide, the first row says it in words, and its hover
names what this harness cannot report: not every CLI's log says every one of these, and a
mark its harness cannot supply never shows. The round mark is the Agent; the square ones are
its items.

A question shows for every CLI, whatever its log can say: Ronin reads it off the terminal,
including a prompt drawn before the Agent's first turn, such as Codex's *Update available*.
While it asks, the Agent is flagged: ⚑ in amber on its selector pill, and a ⚑ line on its
☰ Work record. Answer it and the ?, the pill's ⚑ and the line go.

The island follows the Agent's work record and its stance as they change; nothing needs refreshing.

## The menu

**メ** opens a menu over the tile, hung under the button. It is the same menu on a
computer, a tablet and a phone. Press outside it, press Escape, or press メ again to close
it; the arrow keys move through it.

| Item | What it does |
|---|---|
| 📎 Send a file | Send a file from Finder, or the photo library on a phone — see [Share a file with an Agent](share-a-file.md) |
| @ Mention a session | Choose a session; its name goes into the message box |
| Output | **Terminal Mirror** — the live terminal — or **Locked**, the same terminal to watch without typing into it. Not shown when this Agent has no Ronin Services |
| ☰ Work record | Opens over the whole tile, leaving the terminal untouched beneath it: the open work items it holds first, each with its status, flag and attachments, Done ones waiting for the archive counted on one line ("Done, not yet archived: N (ids)"), then its task at hand, worktrees and Teams. Press an attachment to open it over the tile; Close or Escape returns to the terminal |
| ⚙ Configuration | Opens over the whole tile in three sections. **Agent** shows the work-record objective, title, Workspace, role, and Team. **Mandate** shows Reach, Recruit, and Output. **Behaviors** opens every behavior as ERABI choices; always-on and conditional guidance is fixed and says why, while optional guidance can be chosen. **Send** is the only configuration act, and highlights after a change. Pressed, it turns green and says Sending… until it is done. It writes the changed fields, rebuilds the brief from the Agent's work record with them, sends the Agent only what changed (nothing, when nothing did), then refreshes the surface. Defaults changed elsewhere since the Agent was born don't reach it. Closing without sending discards the draft. |
| 📄 Docs | The documents on this Agent's work record (files dropped on the tile, and those it added holding no item) and the attachments of the work items it holds, with how many; press one to open it over the tile |
| × Delete or archive… | Open the archive/delete choices; it stays at the foot of the menu |

The context gauge appears when Ronin has a reading from the session. An empty workspace
has no Agent for session-specific actions to operate on.

New Agents start read/write. There is no Control choice in the current tile header.

## Read aloud

In a hosted office, 🔊 reads the Agent's last reply aloud. On a desk it sits beside the
message box, between Stop and Enter; on a phone it is in the keys row, right after Tab. It
shows … while fetching and ■ while playing; press it again to stop. A failure shows in one line.
The button after it shows the playback speed (1×, 1.25×, 1.5×, 2×): each press moves to the
next and changes what is playing at once. This device remembers the choice.

## Type, copy, and paste

Use the terminal to interact directly with the provider CLI, or write a message in the
composer under it. Enter sends the composer message; Shift+Enter (Option+Enter on a Mac)
adds a line. The composer keeps the draft when delivery fails so you can recover it.

For terminal text selection, hold **Option** on a Mac or **Shift** on Windows/Linux while
dragging, then use the normal copy shortcut. Without the modifier, the running terminal
application may receive the drag as mouse input.

Use [Terminal controls](terminal-controls.md) for Stop, Clear, Copy, and Close, including
provider differences and mobile controls. Close and hide view have different consequences;
see [Archived sessions](archived-sessions.md).

## Share a file with an Agent

Drag a file onto the tile, paste an image or file on it, or choose **📎 Send a file** in メ: the file is saved
in the session's `drop/` folder, listed in the Agent's Documents, and its path typed into the Agent's input
without Enter. A work item dragged onto the tile types its reference (id and title) the
same way. See [Share a file with an Agent](share-a-file.md).

## Output availability

The separate **Transcript** button appears when Ronin Services has loaded Terminal
transcript. It switches **Term → Chat → Term**; the button always names where you are
now. Only an Agent's tile opens on Chat; every other tile (a provider sign-in, a Terminal session, a Bare Metal Agent, a shell) opens on Term. That holds on a desk as on a phone, a new Agent's too: a new Agent's
Chat is an empty conversation with *Working* at its end, and its first words start there as
it writes them, with no reload. Chat is the conversation alone, as the CLI itself wrote it. The button is opaque when this Agent has nothing to show — born before Ronin
recorded launch identity, started outside Ronin, or
simply nothing written yet; pressing it says which. Switching the service on later, or a restart, does not lose
an Agent whose identity was recorded. **Term** returns to the normal interactive terminal.

While you are reading any of the readings, the message box stays with you: the record
itself is read-only, but the Agent is live, and the box below it talks to the Agent the
same way it does over the terminal. In Chat the conversation ends where the box begins, so
nothing is ever hidden under it. If you are at the end you stay at the end: a new line, the
dots, a draft growing to several lines or the tile changing size never push the last line
out of view. Scroll up and it leaves you where you are, and fetches earlier lines as you
go; a long conversation is never loaded whole.

Chat is made for reading, not a second terminal. The Agent's words are in the same type as the
rest of Ronin, larger than the terminal's, with bold, lists, headings and tables drawn; commands, paths
and code stay in the terminal's own type so they line up as they do there. **Markdown** on the
メ menu (shown while Chat is open) turns the drawing off, to see exactly what the Agent wrote,
marks and all, in the terminal's type; the choice is for that Agent and kept in this browser.

A link in Chat to a file on the Ronin machine opens that file in Docs, on a desk as on a phone and
in the Helpful Assistant's chat (Irasshai) too, however the Agent wrote it: a full path, `~/…`, `file:///…`, a path relative
to where it works, or `path:line` (the file opens; the line is not jumped to). Web links open in the browser.

What a message names is a link when Ronin knows it, and plain text otherwise:

- **A work item's id** (KAN-680, w806): the item opens over the tile, as from the tile's item
  pills; Close returns to the chat where you were.
- **An Agent's name** (@system_lead, or the bare name): that Agent's tile opens over the work
  surface, as from an item's Agent; Close gives it back. On a phone, that Agent's screen.
- **A document** (`~/ronin/office/ABOUT_USER.md`, `docs/a.md`, `samurai_lab/ronin_cloud/X.md`, or
  just `ABOUT_USER.md`): it opens in Docs, when it is a file in the Agent's folders, its drop, the
  Workspace folders (or the folder holding them) or `~/ronin/office/`.
- **A commit** (`db709a8`, or `dev@7e2b28b` as a hand-in says it): when it is a commit in one of the
  Agent's repos, `git show --stat -p` of it opens in Docs, to read.

The Helpful Assistant's chat does the same over her chat. A document link shows the file's name;
its whole path is its tooltip.

Any of these links can also be dragged onto a workspace of a Team's workbench, as a selector pill
can, and it opens there: an item on Find item, an Agent's tile, a document or a commit on a
Document surface.

The short lines an Agent prints between steps, its working aloud, show in a lighter shade and in
italic, set apart from its replies.

What you send leaves the box at once and shows at the end of Chat in a lighter shade. When the
Agent's CLI takes it, it shows in the normal shade where the conversation puts it, after
anything the Agent wrote in between. A busy Agent takes a message at the end of what it is
doing, so a light message is one still waiting. A message that could not be sent comes back
into the box with the reason.

On a phone the button sits in the bar at the top, because the tile's own header is not on
screen there, and it is a two-state toggle: **Term** or **Chat**. The fuller readings are a
desk thing; a thumb wants the conversation or the terminal.

Output, a row on the tile's メ menu, is a different question — whether this tile's terminal takes
your typing — and it offers Terminal Mirror or Locked. It once listed Detailed, Condensed,
Cherry Pick and Agent Summary as well: those were views of a recording Ronin no longer
makes, so choosing one showed an empty tile. They have left the list, not the source; if
Agent Summary returns it will be written from the conversation, like everything else here.

## What an Agent is doing

A long conversation opens at its end: the last thing said appears immediately and the rest
fills in under it, rather than the whole record being fetched before anything shows.
Scrolling to the top asks for what came before.

While you are reading the conversation, the end of it shows what the Agent is doing now:
three dots on the Agent's side, where its next line will appear, while it is working or
writing one. When it is your turn the end is simply empty — that is how a conversation says
it is waiting for you. If it is stopped at a question it says so in words instead, because
that one needs you to do something and a decoration would not say it. If the dots are
unwelcome, a system "reduce motion" setting leaves them still.


Each Agent's row says its **stance**: *working…*, *awaiting you*, or *asking you*; before
Ronin has read anything from it the row says nothing there (w452). It is the
newest line of what the Agent has done: a tool going out, a finished turn, a question on its
screen. While it works, the end of the conversation names the tool it is in (for example
*Bash · npm test*). Every Agent gets this, whichever provider it runs on: a CLI that keeps a
log is read from its log, and one that keeps none is read from its terminal, less fully.

For Claude Code and Codex all of this comes from the CLI itself, through its hooks: *working…*
from the moment your message goes in, thinking included, *asking you* when it stops at a
question, a permission or a plan, *awaiting you* when its turn ends. Where a CLI tells nothing
(another provider, a first-run menu), Ronin reads the log or the numbered choices off the
terminal.

**Answer in Chat.** A question shows at the end of Chat with its choices: Claude's and Codex's
multiple-choice questions (one press answers a single question; several questions, or
checkboxes, go with **Send**), a plan with **Approve** and **Keep planning**, a permission
with the exact command and **Yes** and **No**. The press answers it in the terminal for you,
and the tile stays on Chat.

**Stopped.** If an Agent's CLI exits on its own (a crash, a killed process), Chat ends with
*Stopped: exit N at HH:MM* and a **Resume** button, which starts it again on the same
conversation. Its Team's lead is told once, with the items it holds. **Close Tile** beside it
closes the tile, as its − does: the Agent stays stopped and its card keeps Resume. On a phone it
goes back to the Team.

An Agent that reads *working…* with nothing new in its conversation for 12 minutes is flagged
*no progress for 12 min*, the same way: Chat ends with that sentence and an **Open in
Terminal** button in place of the dots. Anything new from the Agent clears it.

A question Chat cannot answer (free text, an MCP form, a menu no hook names) is answered in
Terminal. Chat then ends with *Waiting for your answer in Terminal* and an **Answer in
Terminal** button (also under a multiple-choice question, for typing your own answer); the press
switches the tile to Terminal, as **Term** would. Once the Agent is no longer asking, a tile
that went there by that button (or by **Open in Terminal**) comes back to Chat by itself. Until then a **Continue in Chat**
button sits at the foot of the terminal, for when the answer does not end the asking. If you switched yourself, or
switched again after the press, the tile stays where you put it. Nothing switches without a
press.

See [Work record](work-record.md) for authored work and [Workbench](workbench.md) for
arrangement and navigation. Contributors can find the implementation in the
[UI ownership index](../../public/js/README.md) and [contributor map](../contributor-map.md#user-interface).
