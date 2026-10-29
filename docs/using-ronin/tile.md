# The tile

A tile shows one session inside a workspace. Open an Agent from the workbench's discovery
column, or drag its card into the workspace where you want to see it.

## The header

| Control | What it does |
|---|---|
| Title / ⛩ | Edit the Agent's displayed title; its session name remains its identity |
| Term / Chat | When Terminal transcript is active, switch between the terminal and the Agent's conversation |
| メ | Open the menu for this Agent (below) |
| − | Close this view while the Agent keeps running |

## The menu

**メ** opens a menu over the tile, hung under the button. It is the same menu on a
computer, a tablet and a phone. Press outside it, press Escape, or press メ again to close
it; the arrow keys move through it.

| Item | What it does |
|---|---|
| 📎 Send a file | Send a file from Finder, or the photo library on a phone — see [Share a file with an Agent](share-a-file.md) |
| @ Mention a session | Choose a session; its name goes into the message box |
| Output | **Terminal Mirror** — the live terminal — or **Locked**, the same terminal to watch without typing into it. Not shown when this Agent has no Ronin Services |
| ☰ Work record | Opens over the whole tile, leaving the terminal untouched beneath it: the work items it holds first, each with its status, flag and attachments, then its task at hand, worktrees and Teams. Press an attachment to open it over the tile; Close or Escape returns to the terminal |
| ⚙ Configuration | Opens over the whole tile in three sections. **Agent** shows the work-record objective, title, born Workspace Folder, role, and Team. **Mandate** shows Reach, Recruit, and Output. **Behaviors** opens every behavior as ERABI choices; always-on and conditional guidance is fixed and says why, while optional guidance can be chosen. **Send** is the only configuration act; it can always be pressed, to resend the brief unchanged, and highlights after a change. Pressed, it turns green and says Sending… until the brief is out. It writes the changed fields, rebuilds the brief from current facts and files, tells the Agent to read it, then refreshes the surface. Closing without sending discards the draft. |
| 📄 Docs | The attachments of the work items this Agent holds, with how many; press one to open it over the tile |
| × Delete or archive… | Open the archive/delete choices; it stays at the foot of the menu |

The context gauge appears when Ronin has a reading from the session. An empty workspace
has no Agent for session-specific actions to operate on.

New Agents start read/write. There is no Control choice in the current tile header.

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
now. Chat is the conversation alone, as the CLI itself wrote it. The button is opaque when this Agent has nothing to show — born before Ronin
recorded launch identity, started outside Ronin, on a CLI with no readable journal, or
simply nothing written yet; pressing it says which. Switching the service on later, or a restart, does not lose
an Agent whose identity was recorded. **Term** returns to the normal interactive terminal.

While you are reading any of the readings, the message box stays with you: the record
itself is read-only, but the Agent is live, and the box below it talks to the Agent the
same way it does over the terminal. In Chat the conversation ends where the box begins, so
nothing is ever hidden under it. If you are at the end you stay at the end: a new line, the
dots, a draft growing to several lines or the tile changing size never push the last line
out of view. Scroll up and it leaves you where you are.

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


Each Agent's row says its **stance**: *working…*, *replying…*, *awaiting you*, or *asking
you*. It is read from the conversation the CLI itself wrote — a tool going out is a record,
a finished reply is a record — so it does not depend on what happens to be drawn on the
terminal. An Agent whose CLI keeps no readable conversation says nothing rather than
guessing.

*Asking you* is the exception and the one that matters most: a permission prompt is drawn on
the screen and no CLI writes it down, so that one is read from the terminal, and it outranks
the rest. An Agent stopped at a question is busy as far as its own journal knows, and "busy"
is the wrong thing to tell the person whose answer it is waiting for.

See [Work record](work-record.md) for authored work and [Workbench](workbench.md) for
arrangement and navigation. Contributors can find the implementation in the
[UI ownership index](../../public/js/README.md) and [contributor map](../contributor-map.md#user-interface).
